import type { Expr, File, ModuleItem, Param, Span, Stmt } from "./syntax.js";
import { BUILTIN_TYPES } from "./syntax.js";

/**
 * What a `.dance` file gets wrong without being unparseable (P1): a type
 * nobody declared, a binding nobody reads, a statement in the wrong kind of
 * module. Issues are data with spans, never exceptions, and every file in
 * the repo is held lint-clean by `fixtures.test.ts`.
 *
 * The three module kinds have three vocabularies. A **formation** places,
 * anchors, groups, provides and declares `next`; it never calls a move. A
 * **move** says `ir` once and otherwise only declares its contract. A
 * **dance** calls, binds, repeats, branches, progresses and may have a
 * title. Everything else is a lint issue naming the rule.
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
    if (item.kind === "enum") continue;
    lintModule(item, knownType, issues);
  }
  return issues;
}

const FORMATION_ONLY = new Set(["place", "anchor", "group", "provide", "next"]);
const DANCE_ONLY = new Set(["call", "title", "let", "repeat", "if"]);

function lintModule(
  item: ModuleItem,
  knownType: (name: string) => boolean,
  issues: LintIssue[],
): void {
  const reads = new Set<string>();
  const dynReads = new Set<string>();
  const bindings = new Map<string, Param | Stmt>();

  for (const p of item.params) {
    if (!knownType(p.type)) issues.push({ message: `"${p.type}" is not a type`, span: p.span });
    bindings.set((p.dynamic ? "$" : "") + p.name, p);
    if (p.default) readExpr(p.default, reads, dynReads);
  }

  let irCount = 0;
  const walk = (stmts: readonly Stmt[]): void => {
    for (const stmt of stmts) {
      const wrongKind =
        (item.kind !== "formation" && FORMATION_ONLY.has(stmt.kind)) ||
        (item.kind === "formation" &&
          DANCE_ONLY.has(stmt.kind) &&
          stmt.kind !== "let" &&
          stmt.kind !== "repeat" &&
          stmt.kind !== "if") ||
        (item.kind === "move" &&
          (DANCE_ONLY.has(stmt.kind) || stmt.kind === "ir") &&
          stmt.kind !== "ir") ||
        (stmt.kind === "ir" && item.kind !== "move") ||
        (stmt.kind === "title" && item.kind !== "dance");
      if (wrongKind) {
        issues.push({
          message:
            stmt.kind === "call" && item.kind === "formation"
              ? `a formation cannot call a move ("${stmt.name}"); groups are its only calls`
              : `"${stmt.kind}" does not belong in a ${item.kind}`,
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
          break;
        case "provide":
          if (!knownType(stmt.type))
            issues.push({ message: `"${stmt.type}" is not a type`, span: stmt.span });
          readExpr(stmt.value, reads, dynReads);
          break;
        case "next":
          readExpr(stmt.value, reads, dynReads);
          break;
        case "let":
          bindings.set(stmt.name, stmt);
          readExpr(stmt.value, reads, dynReads);
          break;
        case "title":
          break;
        case "ir":
          irCount += 1;
          break;
        case "repeat":
          if (stmt.binder !== undefined) bindings.set(stmt.binder, stmt);
          readExpr(stmt.count, reads, dynReads);
          walk(stmt.body);
          break;
        case "if":
          readExpr(stmt.condition, reads, dynReads);
          walk(stmt.then);
          walk(stmt.else);
          break;
        case "call":
          for (const a of stmt.args) readExpr(a.value, reads, dynReads);
          break;
      }
    }
  };
  walk(item.body);

  if (item.kind === "move" && irCount !== 1) {
    issues.push({
      message: `move ${item.name} must say which figure it is with one "ir" line`,
      span: item.span,
    });
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
    if (item.kind === "move" && !("kind" in node)) continue;
    issues.push({ message: `${name} is bound but never read`, span: node.span });
  }
}

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
