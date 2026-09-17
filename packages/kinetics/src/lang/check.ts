import type { Arg, Expr, File, ModuleItem, Span, Stmt, Transform } from "./syntax.js";

/**
 * The light static pass (P1): enum members belong to their enums, `is` is
 * typed from its left side, calls name a module that exists with the
 * parameters it has, and transforms take what they take. The tree (P2) and
 * the compiler (P4) do the rest with values in hand; this pass is what lets
 * `$role is Right` fail before anybody is on the floor.
 *
 * Types are strings — the enum's name, or one of `BUILTIN_TYPES` — and an
 * expression whose type the checker cannot tell (a call to a built-in
 * relation, a path into a group) is `unknown`, which matches anything: the
 * checker reports what it knows is wrong, never what it cannot tell.
 */
export interface CheckError {
  message: string;
  span: Span;
}

export interface CheckOptions {
  /** `$` variables the tree provides, with their types (`{ role: "Role" }`). */
  dynamics?: Readonly<Record<string, string>>;
}

/** The relation and geometry functions the tree evaluates (P2). */
export const BUILTIN_FUNCTIONS: readonly string[] = [
  "along",
  "first",
  "last",
  "other-side",
  "other",
  "child",
  "index",
  "role",
  "opposite-role",
  "same-role",
  "at",
  "across",
  "midpoint",
  "point",
  "line",
  "direction",
  "centre",
  "group",
  "duple-progression",
  "triple-progression",
  "circle-progression",
  "none",
  "alternate",
  "all",
  "my-role",
];

/** The statement a dance may say that is not a module: `progress()`. */
export const BUILTIN_STATEMENTS: readonly string[] = ["progress"];

const UNKNOWN = "unknown";

export function check(files: readonly File[], options: CheckOptions = {}): CheckError[] {
  const errors: CheckError[] = [];
  const enums = new Map<string, readonly string[]>();
  const modules = new Map<string, ModuleItem>();
  for (const file of files) {
    for (const item of file.items) {
      if (item.kind === "enum") {
        if (enums.has(item.name))
          errors.push({ message: `enum ${item.name} is declared twice`, span: item.span });
        enums.set(item.name, item.members);
      } else {
        if (modules.has(item.name))
          errors.push({ message: `${item.name} is declared twice`, span: item.span });
        modules.set(item.name, item);
      }
    }
  }
  const memberEnum = (member: string): string[] =>
    [...enums].filter(([, members]) => members.includes(member)).map(([name]) => name);

  for (const file of files) {
    for (const item of file.items) {
      if (item.kind !== "enum")
        checkModule(item, { enums, modules, memberEnum, errors, dynamics: options.dynamics ?? {} });
    }
  }
  return errors;
}

interface Ctx {
  enums: ReadonlyMap<string, readonly string[]>;
  modules: ReadonlyMap<string, ModuleItem>;
  memberEnum(member: string): string[];
  errors: CheckError[];
  dynamics: Readonly<Record<string, string>>;
}

function checkModule(item: ModuleItem, ctx: Ctx): void {
  const env = new Map<string, string>();
  const dyn = new Map<string, string>(Object.entries(ctx.dynamics));
  dyn.set("time", "Int");
  dyn.set("times", "Int");
  dyn.set("beat", "Int");
  dyn.set("first-time", "Bool");
  dyn.set("last-time", "Bool");
  for (const p of item.params) {
    (p.dynamic ? dyn : env).set(p.name, p.type);
    if (p.default) typeOf(p.default, p.type, { ...ctx, env, dyn });
  }
  const scope: Scope = { ...ctx, env, dyn };
  const walk = (stmts: readonly Stmt[]): void => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case "place":
          if (stmt.role !== undefined && !(ctx.enums.get("Role") ?? []).includes(stmt.role)) {
            ctx.errors.push({ message: `${stmt.role} is not a Role`, span: stmt.span });
          }
          env.set(stmt.name, "Place");
          checkTransforms(stmt.at, scope);
          break;
        case "anchor":
          env.set(stmt.name, stmt.type ?? typeOf(stmt.value, stmt.type, scope));
          break;
        case "group":
          checkCall(stmt.module, stmt.args, stmt.span, scope);
          checkTransforms(stmt.at, scope);
          if (stmt.name !== undefined) env.set(stmt.name, "Group");
          else env.set(stmt.module, "Group");
          if (stmt.children) walk(stmt.children);
          break;
        case "provide-fn": {
          for (const p of stmt.params) env.set(p.name, p.type);
          walk(stmt.body);
          break;
        }
        case "dancers":
        case "children":
          break;
        case "assign":
          typeOf(stmt.value, scope.dyn.get(stmt.name), scope);
          break;
        case "assert":
          condition(stmt.condition, scope);
          break;
        case "card":
        case "say":
          break;
        case "for":
          typeOf(stmt.from, "Int", scope);
          typeOf(stmt.to, "Int", scope);
          env.set(stmt.binder, "Int");
          walk(stmt.body);
          break;
        case "match": {
          const subject = infer(stmt.subject, undefined, scope);
          const members = scope.enums.get(subject);
          const seen = new Set<string>();
          let wildcard = false;
          for (const arm of stmt.arms) {
            if (arm.pattern === undefined) wildcard = true;
            else if (members !== undefined && !members.includes(arm.pattern)) {
              ctx.errors.push({ message: `${arm.pattern} is not a ${subject}`, span: arm.span });
            } else seen.add(arm.pattern);
            walk(arm.body);
          }
          if (members !== undefined && !wildcard) {
            const missing = members.filter((m) => !seen.has(m));
            if (missing.length > 0)
              ctx.errors.push({
                message: `match does not cover ${missing.join(", ")}`,
                span: stmt.span,
              });
          }
          break;
        }
        case "provide":
          typeOf(stmt.value, stmt.type, scope);
          dyn.set(stmt.name, stmt.type);
          break;
        case "next":
        case "seat":
          typeOf(stmt.value, undefined, scope);
          break;
        case "let":
          env.set(stmt.name, typeOf(stmt.value, undefined, scope));
          break;
        case "ir":
          break;
        case "repeat":
          typeOf(stmt.count, "Int", scope);
          walk(stmt.body);
          break;
        case "if":
          condition(stmt.condition, scope);
          walk(stmt.then);
          walk(stmt.else);
          break;
        case "call":
          if (BUILTIN_STATEMENTS.includes(stmt.name)) {
            if (stmt.args.length > 0)
              ctx.errors.push({ message: `${stmt.name}() takes no arguments`, span: stmt.span });
            break;
          }
          checkCall(stmt.name, stmt.args, stmt.span, scope);
          if (stmt.children) walk(stmt.children);
          break;
      }
    }
  };
  walk(item.body);
}

interface Scope extends Ctx {
  env: Map<string, string>;
  dyn: Map<string, string>;
}

function checkTransforms(transforms: readonly Transform[], scope: Scope): void {
  for (const t of transforms) {
    switch (t.op) {
      case "translate":
        for (const a of t.args) {
          if (a.name !== "x" && a.name !== "y") {
            scope.errors.push({
              message: `translate takes x and y, not ${a.name ?? "a positional argument"}`,
              span: a.span,
            });
          } else typeOf(a.value, "Length", scope);
        }
        break;
      case "rotate":
        if (t.args.length !== 1 || t.args[0]?.name !== undefined) {
          scope.errors.push({ message: "rotate takes one angle in degrees", span: t.span });
        } else typeOf((t.args[0] as Arg).value, "Number", scope);
        break;
      case "mirror":
        if (t.args.length !== 1 || t.args[0]?.name !== undefined) {
          scope.errors.push({ message: "mirror takes an Axis, X or Y", span: t.span });
        } else typeOf((t.args[0] as Arg).value, "Axis", scope);
        break;
      case "fwd":
      case "back":
      case "left":
      case "right":
        if (t.args.length !== 1 || t.args[0]?.name !== undefined) {
          scope.errors.push({ message: `${t.op} takes one length`, span: t.span });
        } else typeOf((t.args[0] as Arg).value, "Length", scope);
        break;
    }
  }
}

/** A call to a module: the arguments against its parameters. */
function checkCall(
  name: string,
  args: readonly Arg[],
  span: Span,
  scope: Scope,
  expectKind?: ModuleItem["kind"],
): void {
  const module = scope.modules.get(name);
  if (module === undefined) {
    scope.errors.push({ message: `unknown ${expectKind ?? "module"} ${name}`, span });
    for (const a of args) typeOf(a.value, undefined, scope);
    return;
  }
  if (
    expectKind !== undefined &&
    module.kind !== expectKind &&
    !(expectKind === "move" && module.kind === "dance")
  ) {
    scope.errors.push({ message: `${name} is a ${module.kind}, not a ${expectKind}`, span });
  }
  const positional = module.params.filter((p) => !p.dynamic);
  let next = 0;
  const seen = new Set<string>();
  for (const a of args) {
    let param;
    if (a.name !== undefined) {
      param = module.params.find((p) => p.name === a.name && p.dynamic === a.dynamic);
      if (param === undefined) {
        scope.errors.push({
          message: `${name} has no parameter ${a.dynamic ? "$" : ""}${a.name}`,
          span: a.span,
        });
        typeOf(a.value, undefined, scope);
        continue;
      }
    } else {
      // Positional arguments fill the $ parameters first (a move's counterpart
      // comes first, as in bite A), then the plain ones.
      const dynamics = module.params.filter((p) => p.dynamic);
      const all = [...dynamics, ...positional];
      param = all[next];
      next += 1;
      if (param === undefined) {
        scope.errors.push({
          message: `${name} takes ${String(all.length)} arguments, not more`,
          span: a.span,
        });
        continue;
      }
    }
    if (seen.has(param.name))
      scope.errors.push({ message: `${param.name} is given twice`, span: a.span });
    seen.add(param.name);
    typeOf(a.value, param.type, scope);
  }
  for (const p of module.params) {
    if (!seen.has(p.name) && p.default === undefined && !p.dynamic) {
      scope.errors.push({ message: `${name} needs ${p.name}: ${p.type}`, span });
    }
  }
}

const NUMERIC = new Set(["Int", "Number", "Length", "Beats"]);

/**
 * A condition is a Bool, or a **somebody test**: a bare `$neighbor`, a
 * `let` name or a path is true when it found someone (the user: *"if the
 * select returns no-one, then you just stay put"*), so those are inferred
 * and not held to Bool.
 */
const condition = (e: Expr, scope: Scope): void => {
  if (e.kind === "dyn" || e.kind === "name" || e.kind === "path" || e.kind === "call")
    infer(e, undefined, scope);
  else typeOf(e, "Bool", scope);
};

/** The type of an expression, checking it against `expected` when given. */
function typeOf(e: Expr, expected: string | undefined, scope: Scope): string {
  const found = infer(e, expected, scope);
  if (expected !== undefined && found !== UNKNOWN && !compatible(found, expected)) {
    scope.errors.push({ message: `expected ${expected}, found ${found}`, span: e.span });
  }
  return found;
}

const compatible = (found: string, expected: string): boolean =>
  found === expected ||
  (NUMERIC.has(found) && NUMERIC.has(expected) && found !== "Length" && expected !== "Length") ||
  (found === "Int" && expected === "Number");

function infer(e: Expr, expected: string | undefined, scope: Scope): string {
  switch (e.kind) {
    case "number":
      return e.unit === "" ? (Number.isInteger(e.value) ? "Int" : "Number") : "Length";
    case "string":
      return "String";
    case "member": {
      if (e.type !== undefined) {
        const members = scope.enums.get(e.type);
        if (members === undefined)
          scope.errors.push({ message: `${e.type} is not an enum`, span: e.span });
        else if (!members.includes(e.member))
          scope.errors.push({ message: `${e.member} is not a ${e.type}`, span: e.span });
        return e.type;
      }
      if (expected !== undefined && scope.enums.has(expected)) {
        if (!(scope.enums.get(expected) ?? []).includes(e.member)) {
          scope.errors.push({
            message: `${e.member} is not a ${expected}: ${(scope.enums.get(expected) ?? []).join(", ")}`,
            span: e.span,
          });
        }
        return expected;
      }
      const owners = scope.memberEnum(e.member);
      if (owners.length === 1) return owners[0] as string;
      scope.errors.push({
        message:
          owners.length === 0
            ? `${e.member} is not a member of any enum`
            : `${e.member} could be ${owners.join(" or ")}: write ${owners[0] as string}.${e.member}`,
        span: e.span,
      });
      return UNKNOWN;
    }
    case "dyn":
      return scope.dyn.get(e.name) ?? UNKNOWN;
    case "name":
      return scope.env.get(e.name) ?? UNKNOWN;
    case "me":
    case "nobody":
      return UNKNOWN;
    case "call":
      if (scope.modules.has(e.name)) {
        checkCall(e.name, e.args, e.span, scope);
        return "Group";
      }
      if (!BUILTIN_FUNCTIONS.includes(e.name)) {
        scope.errors.push({ message: `unknown function ${e.name}`, span: e.span });
      }
      for (const a of e.args) infer(a.value, undefined, scope);
      return e.name === "role"
        ? "Role"
        : e.name === "group"
          ? "Group"
          : e.name === "index"
            ? "Int"
            : UNKNOWN;
    case "path":
      infer(e.of, undefined, scope);
      return UNKNOWN;
    case "unary":
      if (e.op === "not") {
        condition(e.of, scope);
        return "Bool";
      }
      return infer(e.of, expected, scope);
    case "binary": {
      if (e.op === "is") {
        const left = infer(e.left, undefined, scope);
        if (left !== UNKNOWN && !scope.enums.has(left)) {
          scope.errors.push({
            message: `"is" tests an enum, and the left side is ${left}`,
            span: e.span,
          });
        } else if (left !== UNKNOWN) typeOf(e.right, left, scope);
        else infer(e.right, undefined, scope);
        return "Bool";
      }
      if (e.op === "and" || e.op === "or") {
        condition(e.left, scope);
        condition(e.right, scope);
        return "Bool";
      }
      if (e.op === "==" || e.op === "!=") {
        const left = infer(e.left, undefined, scope);
        typeOf(e.right, left === UNKNOWN ? undefined : left, scope);
        return "Bool";
      }
      if (e.op === "<" || e.op === "<=" || e.op === ">" || e.op === ">=") {
        infer(e.left, undefined, scope);
        infer(e.right, undefined, scope);
        return "Bool";
      }
      const left = infer(e.left, undefined, scope);
      const right = infer(e.right, undefined, scope);
      if (left === "Length" || right === "Length") return "Length";
      if (left === "Int" && right === "Int" && e.op !== "/") return "Int";
      if (e.op === "%") return "Int";
      if (left === UNKNOWN || right === UNKNOWN) return expected ?? UNKNOWN;
      return "Number";
    }
    case "cond": {
      condition(e.condition, scope);
      const then = infer(e.then, expected, scope);
      infer(e.else, then === UNKNOWN ? expected : then, scope);
      return then;
    }
  }
}
