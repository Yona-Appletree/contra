import type { Fact } from "../diagnostics/Diagnostic.js";
import type { Arg, Expr, FnDecl, Pattern, Span, Stmt } from "../syntax/ast.js";
import type { FnInfo, GroupInfo } from "./resolution.js";

/**
 * Where the cursor is, read off the text.
 *
 * A move takes beats and advances the dancer's cursor (§6), and almost every
 * dance says its beats outright — so the checker can walk a dance the way a
 * dancer will and know, before anybody dances, what beat each figure starts
 * on. That is enough to keep `assert` honest: `phrase(A2)` asserts that the
 * cursor is at 16, and a first phrase that spends eighteen beats is a
 * diagnostic with the phrase in it, not a surprise at run time.
 *
 * It gives up rather than guess. A branch whose halves spend different beats,
 * a count that is not a literal, a loop that dances: the walk returns
 * "unknown" and the asserts below it are left to the evaluator. Butter's
 * `if (first-time)` is the case that matters, and both its halves spend eight.
 */
export function checkBeats(dance: FnInfo, world: BeatWorld, report: Report): void {
  const walking = new Set<FnDecl>();

  /** The groups a bare call may find a `fn` member on: the floor and all below it. */
  const path: GroupInfo[] = [];
  if (dance.floor !== undefined) {
    path.push(dance.floor);
    for (const shape of dance.floor.shapes) {
      for (const step of shape) if (!path.includes(step.group)) path.push(step.group);
    }
  }

  let done = false;

  const walk = (
    stmts: readonly Stmt[],
    env: Env,
    start: number,
    site: Span,
  ): number | undefined => {
    let cursor: number | undefined = start;
    for (const stmt of stmts) {
      if (done || cursor === undefined) return undefined;
      cursor = step(stmt, env, cursor, site);
    }
    return cursor;
  };

  const step = (stmt: Stmt, env: Env, cursor: number, site: Span): number | undefined => {
    switch (stmt.kind) {
      case "setup":
      case "ir":
      case "card":
      case "anchor":
      case "invoke":
        return cursor;
      case "modified":
        return step(stmt.stmt, env, cursor, site);
      case "for": {
        const body = walk(stmt.body, child(env, stmt.name, undefined), cursor, site);
        return body === cursor ? cursor : undefined;
      }
      case "if": {
        const then = walk(stmt.then, env, cursor, site);
        const otherwise = stmt.else === undefined ? cursor : walk(stmt.else, env, cursor, site);
        return then === otherwise ? then : undefined;
      }
      case "match": {
        let agreed: number | undefined;
        for (const arm of stmt.arms) {
          const end = walk(arm.body, env, cursor, site);
          if (end === undefined) return undefined;
          if (agreed === undefined) agreed = end;
          else if (agreed !== end) return undefined;
        }
        return agreed ?? cursor;
      }
      case "expr":
        return spend(stmt.expr, stmt.block, env, cursor, stmt.span, site);
    }
  };

  /** What one expression statement costs, and what it asserts on the way. */
  const spend = (
    expr: Expr,
    block: readonly Stmt[] | undefined,
    env: Env,
    cursor: number,
    span: Span,
    site: Span,
  ): number | undefined => {
    if (expr.kind === "binary") {
      const left = spend(expr.left, undefined, env, cursor, span, site);
      return left === undefined ? undefined : spend(expr.right, undefined, env, left, span, site);
    }
    if (expr.kind !== "call") return cursor;

    if (expr.callee === "assert") {
      const condition = expr.args[0]?.value;
      if (condition === undefined) return cursor;
      if (constant(condition, env, cursor) === false) {
        done = true;
        const named = subjectName(env);
        const due = assertedBeat(condition, env, cursor);
        report(
          "L031",
          due === undefined
            ? `${named} asserts something that is false at beat ${String(cursor)}`
            : `${named} starts at beat ${String(cursor)}, and asserts that it starts at ${String(due)}`,
          site,
          {
            beat: cursor,
            suggestion:
              due === undefined
                ? `the cursor is at beat ${String(cursor)} when this runs`
                : `count the beats of what comes before: they come to ${String(cursor)}, not ${String(due)}`,
            trace: [
              {
                layer: "check",
                what: `the assert is in ${condition.span.file}`,
                span: condition.span,
              },
            ],
          },
        );
      }
      return cursor;
    }

    const local = env.get(expr.callee);
    if (local !== undefined && typeof local === "object" && "block" in local) {
      return walk(local.block, local.env, cursor, site);
    }

    const fn = world.lookup(expr.module ?? dance.module, expr.callee, path);
    if (fn === undefined) return cursor; // a built-in, a transform: no beats
    if (walking.has(fn.decl)) return undefined;

    if (fn.role === "move") {
      const beats = argValue(fn, "beats", expr.args, env, cursor);
      return typeof beats === "number" ? cursor + beats : undefined;
    }

    const inner = bind(fn, expr.args, block, env, cursor);
    walking.add(fn.decl);
    // A dance called from a dance is its own time through: its phrases count
    // from its own beat 0, not from where the medley had got to.
    const from = fn.role === "dance" ? 0 : cursor;
    const end = walk(fn.decl.body, inner, from, span);
    walking.delete(fn.decl);
    if (end === undefined) return undefined;
    return fn.role === "dance" ? cursor + (end - from) : end;
  };

  const bind = (
    fn: FnInfo,
    args: readonly Arg[],
    block: readonly Stmt[] | undefined,
    env: Env,
    cursor: number,
  ): Env => {
    const inner: Env = new Map();
    let positional = 0;
    for (const param of fn.decl.params) {
      if (param.type.kind === "primitive" && param.type.name === "fn" && block !== undefined) {
        inner.set(param.name, { block, env });
        continue;
      }
      const named = args.find((arg) => arg.name === param.name);
      const arg = named ?? args.filter((a) => a.name === undefined)[positional];
      if (named === undefined && arg !== undefined) positional += 1;
      const value =
        arg === undefined
          ? param.default === undefined
            ? undefined
            : constant(param.default, inner, cursor)
          : constant(arg.value, env, cursor);
      inner.set(param.name, value);
    }
    return inner;
  };

  const argValue = (
    fn: FnInfo,
    name: string,
    args: readonly Arg[],
    env: Env,
    cursor: number,
  ): Value => {
    const named = args.find((arg) => arg.name === name);
    if (named !== undefined) return constant(named.value, env, cursor);
    const index = fn.decl.params.findIndex((param) => param.name === name);
    const positional = args.filter((arg) => arg.name === undefined)[index];
    if (positional !== undefined) return constant(positional.value, env, cursor);
    const param = fn.decl.params.find((p) => p.name === name);
    return param?.default === undefined ? undefined : constant(param.default, new Map(), cursor);
  };

  /** The value of an expression, when the text alone settles it. */
  const constant = (expr: Expr, env: Env, cursor: number): Value => {
    switch (expr.kind) {
      case "int":
        return expr.value;
      case "float":
        return expr.value;
      case "bool":
        return expr.value;
      case "name":
        if (expr.title) return { member: expr.name };
        if (expr.name === "beat") return cursor;
        return env.get(expr.name);
      case "qualified":
        return { member: expr.name };
      case "unary": {
        const operand = constant(expr.operand, env, cursor);
        if (expr.op === "-" && typeof operand === "number") return -operand;
        if (expr.op === "not" && typeof operand === "boolean") return !operand;
        return undefined;
      }
      case "binary": {
        const left = constant(expr.left, env, cursor);
        const right = constant(expr.right, env, cursor);
        return apply(expr.op, left, right);
      }
      case "if-expr": {
        const test = constant(expr.test, env, cursor);
        if (typeof test !== "boolean") return undefined;
        return constant(test ? expr.then : expr.else, env, cursor);
      }
      case "match-expr": {
        const subject = constant(expr.subject, env, cursor);
        if (subject === undefined) return undefined;
        for (const arm of expr.arms) {
          if (matches(arm.pattern, subject, env, cursor)) return constant(arm.value, env, cursor);
        }
        return undefined;
      }
      default:
        return undefined;
    }
  };

  const matches = (pattern: Pattern, value: Value, env: Env, cursor: number): boolean => {
    if (pattern.kind === "wildcard") return true;
    if (pattern.kind === "alt") {
      return pattern.options.some((option) => matches(option, value, env, cursor));
    }
    if (pattern.kind !== "expr-pattern") return false;
    return same(constant(pattern.expr, env, cursor), value);
  };

  /**
   * What the assert is about, as the reader wrote it: `phrase(A2)` binds
   * `which = A2`, so the diagnostic can say "A2" rather than "this assert".
   */
  const subjectName = (env: Env): string => {
    for (const value of env.values()) {
      if (value !== undefined && typeof value === "object" && "member" in value) {
        return `"${value.member}"`;
      }
    }
    return "this";
  };

  /** The beat an `assert(beat == …)` asks for, when it asks for one. */
  const assertedBeat = (condition: Expr, env: Env, cursor: number): number | undefined => {
    if (condition.kind !== "binary" || condition.op !== "==") return undefined;
    const left = constant(condition.left, env, cursor);
    const right = constant(condition.right, env, cursor);
    if (left === cursor && typeof right === "number") return right;
    if (right === cursor && typeof left === "number") return left;
    return undefined;
  };

  const end = walk(dance.decl.body, new Map(), 0, dance.decl.span);
  if (end !== undefined) (dance as { beats?: number }).beats = end;
}

/** What the beat walk needs of the rest of the checker. */
export interface BeatWorld {
  /** The function a name in a script calls: the module's own, or a member on the path. */
  lookup: (module: string, name: string, path: readonly GroupInfo[]) => FnInfo | undefined;
}

/** How the beat walk complains: the checker's own `report`. */
export type Report = (
  code: string,
  message: string,
  span: Span | undefined,
  rest?: { suggestion?: string; trace?: readonly Fact[]; beat?: number },
) => void;

type Value =
  number | boolean | { member: string } | { block: readonly Stmt[]; env: Env } | undefined;
type Env = Map<string, Value>;

const child = (env: Env, name: string, value: Value): Env => {
  const inner = new Map(env);
  inner.set(name, value);
  return inner;
};

const same = (a: Value, b: Value): boolean => {
  if (typeof a === "object" && a !== null && "member" in a) {
    return typeof b === "object" && b !== null && "member" in b && a.member === b.member;
  }
  return a === b;
};

function apply(op: string, left: Value, right: Value): Value {
  if (op === "==") return left === undefined || right === undefined ? undefined : same(left, right);
  if (op === "!=")
    return left === undefined || right === undefined ? undefined : !same(left, right);
  if (op === "and") {
    return typeof left === "boolean" && typeof right === "boolean" ? left && right : undefined;
  }
  if (op === "or") {
    return typeof left === "boolean" && typeof right === "boolean" ? left || right : undefined;
  }
  if (typeof left !== "number" || typeof right !== "number") return undefined;
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? undefined : left / right;
    case "%":
      return right === 0 ? undefined : left % right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    default:
      return undefined;
  }
}
