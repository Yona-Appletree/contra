import type { Expr, FileNode, InvokeStmt, Pattern, Span, Stmt } from "../syntax/ast.js";

/**
 * Walking the tree of `ast.ts`, for the passes that want everything of a kind
 * rather than a context — "every invocation under this body", "every module
 * this file names", "does this function have an `ir` in it".
 *
 * The checker's own walk is context-sensitive (a body is not a script, and an
 * arm of a `match` narrows the paths below it), so it does not use these; they
 * are for the flat questions, where the shape of the nesting does not matter.
 */
export function allStmts(stmts: readonly Stmt[]): Stmt[] {
  const out: Stmt[] = [];
  const push = (list: readonly Stmt[]): void => {
    for (const stmt of list) {
      out.push(stmt);
      push(childStmts(stmt));
    }
  };
  push(stmts);
  return out;
}

/** The statements directly inside one, blocks and arms and children alike. */
export function childStmts(stmt: Stmt): readonly Stmt[] {
  switch (stmt.kind) {
    case "setup":
      return stmt.body;
    case "for":
      return stmt.body;
    case "if":
      return [...stmt.then, ...(stmt.else ?? [])];
    case "match":
      return stmt.arms.flatMap((arm) => arm.body);
    case "modified":
      return [stmt.stmt];
    case "invoke":
      return stmt.children;
    case "expr":
      return stmt.block ?? [];
    default:
      return [];
  }
}

/** The expressions written directly in a statement, before any nesting. */
export function ownExprs(stmt: Stmt): readonly Expr[] {
  switch (stmt.kind) {
    case "anchor":
      return [stmt.value];
    case "for":
      return [stmt.range];
    case "if":
      return [stmt.test];
    case "match":
      return [stmt.subject, ...stmt.arms.flatMap((arm) => patternExprs(arm.pattern))];
    case "modified":
      return stmt.modifiers;
    case "invoke":
      return stmt.args.map((arg) => arg.value);
    case "expr":
      return [stmt.expr];
    default:
      return [];
  }
}

/** The expressions directly inside an expression. */
export function subExprs(expr: Expr): readonly Expr[] {
  switch (expr.kind) {
    case "call":
      return expr.args.map((arg) => arg.value);
    case "one":
      return [expr.arg];
    case "select":
    case "assign":
      return expr.args.flatMap((arg) => patternExprs(arg.pattern));
    case "unary":
      return [expr.operand];
    case "binary":
      return [expr.left, expr.right];
    case "is":
      return [expr.subject, ...patternExprs(expr.pattern)];
    case "if-expr":
      return [expr.test, expr.then, expr.else];
    case "match-expr":
      return [
        expr.subject,
        ...expr.arms.flatMap((arm) => [...patternExprs(arm.pattern), arm.value]),
      ];
    case "range":
      return [expr.from, expr.to];
    default:
      return [];
  }
}

/** The expressions a pattern holds — the computed ones, and the bare names. */
export function patternExprs(pattern: Pattern): readonly Expr[] {
  switch (pattern.kind) {
    case "alt":
      return pattern.options.flatMap(patternExprs);
    case "range-pattern":
      return [pattern.from, pattern.to];
    case "expr-pattern":
      return [pattern.expr];
    default:
      return [];
  }
}

/** Every expression under a list of statements, in no particular order. */
export function allExprs(stmts: readonly Stmt[]): Expr[] {
  const out: Expr[] = [];
  const pushExpr = (expr: Expr): void => {
    out.push(expr);
    if (expr.kind === "fn-expr") for (const inner of allExprs(expr.body)) out.push(inner);
    for (const sub of subExprs(expr)) pushExpr(sub);
  };
  for (const stmt of allStmts(stmts)) for (const expr of ownExprs(stmt)) pushExpr(expr);
  return out;
}

/**
 * The invocations that build the children of a node, read off a list of
 * statements: through `for`, `if`, `match` and the prefix transforms, which
 * change where a node lands but not what kinds are below it (§3, "path shapes
 * are lexical … loops do not change them").
 */
export function invocationsIn(stmts: readonly Stmt[]): InvokeStmt[] {
  const out: InvokeStmt[] = [];
  const visit = (list: readonly Stmt[]): void => {
    for (const stmt of list) {
      if (stmt.kind === "invoke") {
        out.push(stmt);
        continue; // its own children belong to it, not to this level
      }
      if (stmt.kind === "setup") continue; // a setup inside a body is not a thing
      visit(childStmts(stmt));
    }
  };
  visit(stmts);
  return out;
}

/** Every module named by a file: its imports, and every qualified name in it. */
export function moduleRefs(file: FileNode): ModuleRef[] {
  const out: ModuleRef[] = [];
  for (const use of file.uses) out.push({ module: use.module, span: use.span });
  const seeStmts = (stmts: readonly Stmt[]): void => {
    for (const stmt of allStmts(stmts)) {
      if (stmt.kind === "invoke" && stmt.module !== undefined) {
        out.push({ module: stmt.module, span: stmt.span });
      }
      for (const expr of allExprs([stmt])) {
        const module = expr.kind === "call" || expr.kind === "qualified" ? expr.module : undefined;
        if (module !== undefined) out.push({ module, span: expr.span });
      }
    }
  };
  for (const decl of file.decls) {
    if (decl.kind === "group") {
      seeStmts(decl.body);
      for (const member of decl.members) {
        if (member.kind === "fn") seeStmts(member.body);
        else seeStmts([{ kind: "expr", expr: member.value, tail: false, span: member.span }]);
      }
    }
    if (decl.kind === "fn") seeStmts(decl.body);
  }
  return out;
}

/** A module named by a file, and the text that named it. */
export interface ModuleRef {
  module: string;
  span: Span;
}
