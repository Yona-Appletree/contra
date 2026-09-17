import type { Expr, File, ModuleItem, Param, Span, Stmt } from "./syntax.js";
import { BUILTIN_TYPES, SPACE_KINDS } from "./syntax.js";

/**
 * What a `.dance` file gets wrong without being unparseable (round 2): a
 * type nobody declared, a binding nobody reads, a space statement that
 * depends on a dancer, a transform on something that is not space.
 * Issues are data with spans, never exceptions, and every file in the
 * repo is held lint-clean by `fixtures.test.ts`.
 *
 * Modules are untyped; emissions are typed. The one rule that follows:
 * **space cannot depend on a dancer** — a `place`, `anchor`, `group`,
 * `provide` or `dancers` under a condition that reads `$` or `me` has no
 * meaning in nobody's pass. Provides are the exception, because they are
 * evaluated later, for a dancer.
 */
export interface LintIssue {
  message: string;
  span: Span;
}

export interface LintOptions {
  /** Enum names declared elsewhere (the prelude), so a type is not "unknown" for being in another file. */
  enums?: readonly string[];
}

export function lint(file: File, options: LintOptions = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const enums = new Set<string>(options.enums ?? []);
  for (const item of file.items) if (item.kind === "enum") enums.add(item.name);
  const knownType = (name: string): boolean => enums.has(name) || BUILTIN_TYPES.includes(name);
  for (const item of file.items) {
    if (item.kind === "module") lintModule(item, knownType, issues);
  }
  return issues;
}

function lintModule(
  item: ModuleItem,
  knownType: (name: string) => boolean,
  issues: LintIssue[],
): void {
  const reads = new Set<string>();
  const dynReads = new Set<string>();
  const bindings = new Map<string, Param | Stmt>();
  const isMove = item.body.some((s) => s.kind === "ir");
  for (const p of item.params) {
    if (!knownType(p.type)) issues.push({ message: `"${p.type}" is not a type`, span: p.span });
    bindings.set((p.dynamic ? "$" : "") + p.name, p);
    if (p.default) readExpr(p.default, reads, dynReads);
  }

  let irCount = 0;
  const walk = (stmts: readonly Stmt[], dancerDependent: boolean): void => {
    for (const stmt of stmts) {
      if (
        dancerDependent &&
        SPACE_KINDS.includes(stmt.kind) &&
        stmt.kind !== "provide" &&
        stmt.kind !== "provide-fn"
      ) {
        issues.push({
          message: `"${stmt.kind}" is space, and space cannot depend on a dancer: it is under a condition that reads a $ variable or me`,
          span: stmt.span,
        });
      }
      switch (stmt.kind) {
        case "place":
          bindings.set(stmt.name, stmt);
          for (const t of stmt.at) for (const a of t.args) readExpr(a.value, reads, dynReads);
          break;
        case "anchor":
          if (stmt.type !== undefined && !knownType(stmt.type)) {
            issues.push({ message: `"${stmt.type}" is not a type`, span: stmt.span });
          }
          bindings.set(stmt.name, stmt);
          readExpr(stmt.value, reads, dynReads);
          break;
        case "group":
          if (stmt.name !== undefined) bindings.set(stmt.name, stmt);
          for (const a of stmt.args) readExpr(a.value, reads, dynReads);
          for (const t of stmt.at) for (const a of t.args) readExpr(a.value, reads, dynReads);
          if (stmt.children) walk(stmt.children, dancerDependent);
          break;
        case "provide":
          if (!knownType(stmt.type))
            issues.push({ message: `"${stmt.type}" is not a type`, span: stmt.span });
          readExpr(stmt.value, reads, dynReads);
          break;
        case "provide-fn":
          for (const p of stmt.params)
            if (!knownType(p.type))
              issues.push({ message: `"${p.type}" is not a type`, span: p.span });
          walk(stmt.body, false);
          break;
        case "dancers":
        case "children":
          break;
        case "let":
          bindings.set(stmt.name, stmt);
          readExpr(stmt.value, reads, dynReads);
          break;
        case "assign":
          readExpr(stmt.value, reads, dynReads);
          break;
        case "assert":
          readExpr(stmt.condition, reads, dynReads);
          break;
        case "card":
        case "say":
          break;
        case "ir":
          irCount += 1;
          break;
        case "repeat":
          readExpr(stmt.count, reads, dynReads);
          walk(stmt.body, dancerDependent);
          break;
        case "for":
          bindings.set(stmt.binder, stmt);
          readExpr(stmt.from, reads, dynReads);
          readExpr(stmt.to, reads, dynReads);
          walk(stmt.body, dancerDependent);
          break;
        case "if": {
          readExpr(stmt.condition, reads, dynReads);
          const dependent = dancerDependent || readsDancer(stmt.condition);
          walk(stmt.then, dependent);
          walk(stmt.else, dependent);
          break;
        }
        case "match": {
          readExpr(stmt.subject, reads, dynReads);
          const dependent = dancerDependent || readsDancer(stmt.subject);
          for (const arm of stmt.arms) walk(arm.body, dependent);
          break;
        }
        case "call":
          for (const a of stmt.args) readExpr(a.value, reads, dynReads);
          if (stmt.children) walk(stmt.children, dancerDependent);
          break;
      }
    }
  };
  walk(item.body, false);

  if (irCount > 1) {
    issues.push({ message: `module ${item.name} names more than one figure`, span: item.span });
  }

  for (const [name, node] of bindings) {
    const dynamic = name.startsWith("$");
    const read = dynamic ? dynReads.has(name.slice(1)) : reads.has(name);
    if (read) continue;
    // Places, anchors and groups are read by the tree, not by the text; a
    // move's parameters are its contract and are read by the compiler.
    if (
      "kind" in node &&
      (node.kind === "place" || node.kind === "anchor" || node.kind === "group")
    )
      continue;
    if (isMove && !("kind" in node)) continue;
    issues.push({ message: `${name} is bound but never read`, span: node.span });
  }
}

/** Whether an expression reads a `$` variable or `me` — a dancer, not the tree. */
export function readsDancer(e: Expr): boolean {
  const reads = new Set<string>();
  const dyn = new Set<string>();
  readExpr(e, reads, dyn);
  return dyn.size > 0 || mentionsMe(e);
}

const mentionsMe = (e: Expr): boolean => {
  switch (e.kind) {
    case "me":
      return true;
    case "call":
      return e.args.some((a) => mentionsMe(a.value));
    case "path":
      return mentionsMe(e.of);
    case "unary":
      return mentionsMe(e.of);
    case "binary":
      return mentionsMe(e.left) || mentionsMe(e.right);
    case "cond":
      return mentionsMe(e.condition) || mentionsMe(e.then) || mentionsMe(e.else);
    default:
      return false;
  }
};

/** Every name and $name an expression reads. */
export function readExpr(e: Expr, reads: Set<string>, dynReads: Set<string>): void {
  switch (e.kind) {
    case "name":
      reads.add(e.name);
      return;
    case "dyn":
      dynReads.add(e.name);
      return;
    case "call":
      for (const a of e.args) readExpr(a.value, reads, dynReads);
      return;
    case "path":
      readExpr(e.of, reads, dynReads);
      return;
    case "unary":
      readExpr(e.of, reads, dynReads);
      return;
    case "binary":
      readExpr(e.left, reads, dynReads);
      readExpr(e.right, reads, dynReads);
      return;
    case "cond":
      readExpr(e.condition, reads, dynReads);
      readExpr(e.then, reads, dynReads);
      readExpr(e.else, reads, dynReads);
      return;
    default:
      return;
  }
}
