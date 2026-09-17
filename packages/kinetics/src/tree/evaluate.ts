import type { Arg, Expr, File, ModuleItem, Span, Stmt, Transform } from "../lang/syntax.js";
import { UNITS } from "../lang/syntax.js";
import type { Frame, Op } from "./Frame.js";
import { IDENTITY, applyAll, distance, facingOf, norm, tidy, unit } from "./Frame.js";
import type { Anchor, Group, Place, Provide, ProvidedFn } from "./Tree.js";
import { centreOf, isGroup, membersOf, placesOf } from "./Tree.js";
import type { Env, Value } from "./values.js";
import { NOBODY, bool, describe, isSomebody, len, num } from "./values.js";

/**
 * Evaluate a formation module into a tree (P2), and evaluate expressions —
 * the same evaluator at build time (numbers, lengths, places, anchors) and
 * at resolve time (a provide's `other(me)` with `me` bound).
 *
 * Frames are made in world coordinates from the start: a child module is
 * evaluated with the accumulated transform of its ancestors, so a place is
 * never made local and mapped later. That matters because a provide keeps
 * the environment it was written in, and that environment holds the very
 * place objects the tree does.
 */
export interface Modules {
  enums: ReadonlyMap<string, readonly string[]>;
  modules: ReadonlyMap<string, ModuleItem>;
}

/** Gather every enum and module of the files, later files winning nothing: a repeat is an error. */
export function collect(files: readonly File[]): Modules {
  const enums = new Map<string, readonly string[]>();
  const modules = new Map<string, ModuleItem>();
  for (const file of files) {
    for (const item of file.items) {
      if (item.kind === "enum") {
        if (enums.has(item.name)) throw evalError(`enum ${item.name} is declared twice`, item.span);
        enums.set(item.name, item.members);
      } else {
        if (modules.has(item.name)) throw evalError(`${item.name} is declared twice`, item.span);
        modules.set(item.name, item);
      }
    }
  }
  return { enums, modules };
}

/** Something a file says that cannot be evaluated; carries the span. */
export interface EvalError extends Error {
  name: "EvalError";
  span?: Span;
}

export const evalError = (message: string, span?: Span): EvalError =>
  Object.assign(new Error(message), {
    name: "EvalError" as const,
    ...(span === undefined ? {} : { span }),
  });

export const isEvalError = (error: unknown): error is EvalError =>
  error instanceof Error && error.name === "EvalError";

/**
 * Build the tree of the formation module `name`, called with `args`
 * (`{ "minor-sets": num(3) }`). The root group's frame is the world's.
 */
export function buildFormation(
  mods: Modules,
  name: string,
  args: Readonly<Record<string, Value>> = {},
): Group {
  const module = mods.modules.get(name);
  if (module === undefined) throw evalError(`unknown formation ${name}`);
  if (module.kind !== "module") throw evalError(`${name} is not a module`);
  const named: Arg[] = Object.entries(args).map(([key, value]) => ({
    name: key,
    dynamic: false,
    value: literal(value),
    span: module.span,
  }));
  return evalModule(mods, module, named, new Map(), name, name, (f) => f);
}

/** A value written back as an expression, so `buildFormation`'s args go through the one binder. */
const literal = (v: Value): Expr => {
  const span: Span = { start: 0, end: 0, line: 0 };
  switch (v.kind) {
    case "number":
      return { kind: "number", value: v.value, unit: "", span };
    case "length":
      return { kind: "number", value: v.m, unit: "m", span };
    case "string":
      return { kind: "string", value: v.value, span };
    case "bool":
      return { kind: "name", name: v.value ? "true" : "false", span };
    case "member":
      return v.enum === undefined
        ? { kind: "member", member: v.member, span }
        : { kind: "member", type: v.enum, member: v.member, span };
    default:
      throw evalError(`a ${v.kind} cannot be a formation argument`);
  }
};

/** Bind a call's arguments onto a module's parameters, in the caller's environment. */
function bindParams(
  mods: Modules,
  module: ModuleItem,
  args: readonly Arg[],
  callerEnv: Env,
  span: Span,
): Map<string, Value> {
  const env = new Map<string, Value>();
  const plain = module.params.filter((p) => !p.dynamic);
  let next = 0;
  for (const arg of args) {
    const param =
      arg.name === undefined
        ? plain[next++]
        : module.params.find((p) => p.name === arg.name && p.dynamic === arg.dynamic);
    if (param === undefined) {
      throw evalError(
        `${module.name} has no parameter ${arg.name ?? `#${String(next)}`}`,
        arg.span,
      );
    }
    env.set(param.name, evalExpr(arg.value, { mods, env: callerEnv, world: (f) => f }));
  }
  for (const p of module.params) {
    if (env.has(p.name)) continue;
    if (p.default === undefined) {
      if (!p.dynamic) throw evalError(`${module.name} needs ${p.name}: ${p.type}`, span);
      continue;
    }
    env.set(p.name, evalExpr(p.default, { mods, env, world: (f) => f }));
  }
  return env;
}

function evalModule(
  mods: Modules,
  module: ModuleItem,
  args: readonly Arg[],
  callerEnv: Env,
  path: string,
  name: string,
  world: (local: Frame) => Frame,
): Group {
  const env = bindParams(mods, module, args, callerEnv, module.span);
  const places: Place[] = [];
  const children: Group[] = [];
  const anchors: Record<string, Anchor> = {};
  const provides: Provide[] = [];
  const functions: ProvidedFn[] = [];
  const group: Group = {
    path,
    kind: module.name,
    name,
    frame: tidy(world(IDENTITY)),
    places,
    children,
    anchors,
    provides,
    functions,
  };
  const ctx = (): Ctx => ({ mods, env, world });
  const walk = (stmts: readonly Stmt[]): void => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case "place": {
          const frame = tidy(world(applyAll(ops(stmt.at, ctx()), IDENTITY)));
          const place: Place = { path: `${path}/${stmt.name}`, name: stmt.name, frame };
          if (stmt.role !== undefined) place.role = stmt.role;
          places.push(place);
          env.set(stmt.name, { kind: "place", place });
          break;
        }
        case "anchor": {
          const anchor = toAnchor(evalExpr(stmt.value, ctx()), stmt.type, stmt.span);
          anchors[stmt.name] = anchor;
          env.set(stmt.name, { kind: "anchor", anchor });
          break;
        }
        case "group": {
          const child = mods.modules.get(stmt.module);
          if (child === undefined) throw evalError(`unknown formation ${stmt.module}`, stmt.span);
          const childName =
            stmt.name ??
            `${stmt.module}#${String(children.filter((c) => c.kind === stmt.module).length)}`;
          const localOps = ops(stmt.at, ctx());
          const built = evalModule(
            mods,
            child,
            stmt.args,
            env,
            `${path}/${childName}`,
            childName,
            (f) => world(applyAll(localOps, f)),
          );
          children.push(built);
          env.set(childName, { kind: "group", group: built });
          break;
        }
        case "provide":
          provides.push({
            name: stmt.name,
            type: stmt.type,
            deferred: { expr: stmt.value, env: new Map(env) },
          });
          break;
        case "next":
          group.next = { expr: stmt.value, env: new Map(env) };
          break;
        case "seat":
          group.seat = { expr: stmt.value, env: new Map(env) };
          break;
        case "let":
          env.set(stmt.name, evalExpr(stmt.value, ctx()));
          break;
        case "repeat": {
          const count = evalExpr(stmt.count, ctx());
          if (count.kind !== "number" || !Number.isInteger(count.value) || count.value < 0) {
            throw evalError(
              `repeat needs a whole number of times, not ${describe(count)}`,
              stmt.span,
            );
          }
          for (let i = 0; i < count.value; i += 1) walk(stmt.body);
          break;
        }
        case "for": {
          const from = evalExpr(stmt.from, ctx());
          const to = evalExpr(stmt.to, ctx());
          if (from.kind !== "number" || to.kind !== "number")
            throw evalError("for needs whole numbers", stmt.span);
          const end = stmt.inclusive ? to.value : to.value - 1;
          for (let i = from.value; i <= end; i += 1) {
            env.set(stmt.binder, num(i));
            walk(stmt.body);
          }
          break;
        }
        case "match": {
          const subject = evalExpr(stmt.subject, ctx());
          const arm =
            stmt.arms.find(
              (a) =>
                a.pattern !== undefined &&
                subject.kind === "member" &&
                subject.member === a.pattern,
            ) ?? stmt.arms.find((a) => a.pattern === undefined);
          if (arm) walk(arm.body);
          break;
        }
        case "provide-fn":
          functions.push({
            name: stmt.name,
            params: stmt.params,
            body: stmt.body,
            env: new Map(env),
          });
          break;
        case "dancers":
          // Round 2 P2: fills this group's places. Until then the seating is `seat`'s.
          break;
        case "children":
          // Round 2 P2.
          break;
        case "assign":
        case "assert":
        case "card":
        case "say":
        case "call":
          // Time statements: nobody's pass leaves them for the dancers.
          break;
        case "if": {
          const verdict = evalExpr(stmt.condition, ctx());
          walk(truthy(verdict) ? stmt.then : stmt.else);
          break;
        }
        case "ir":
          break;
      }
    }
  };
  walk(module.body);
  return group;
}

/** `at translate(x = 1m) rotate(90)` as ops, numbers evaluated. */
function ops(transforms: readonly Transform[], ctx: Ctx): Op[] {
  return transforms.map((t): Op => {
    const named = (key: string): Value | undefined => {
      const arg = t.args.find((a) => a.name === key);
      return arg === undefined ? undefined : evalExpr(arg.value, ctx);
    };
    switch (t.op) {
      case "translate": {
        const x = named("x");
        const y = named("y");
        return {
          op: "translate",
          x: x === undefined ? 0 : metres(x, t.span),
          y: y === undefined ? 0 : metres(y, t.span),
        };
      }
      case "rotate": {
        const first = t.args[0];
        if (first === undefined) throw evalError("rotate needs an angle", t.span);
        const deg = evalExpr(first.value, ctx);
        if (deg.kind !== "number")
          throw evalError(`rotate takes degrees, not ${describe(deg)}`, t.span);
        return { op: "rotate", deg: deg.value };
      }
      case "mirror": {
        const axis = t.args[0] === undefined ? undefined : evalExpr(t.args[0].value, ctx);
        if (axis?.kind !== "member" || (axis.member !== "X" && axis.member !== "Y")) {
          throw evalError("mirror takes an Axis, X or Y", t.span);
        }
        return { op: "mirror", axis: axis.member === "X" ? "x" : "y" };
      }
      case "fwd":
      case "back":
      case "left":
      case "right": {
        const first = t.args[0];
        if (first === undefined) throw evalError(`${t.op} needs a length`, t.span);
        const d = metres(evalExpr(first.value, ctx), t.span);
        // In the frame's own terms: forward is local +x, right is local +y.
        return t.op === "fwd"
          ? { op: "translate", x: d, y: 0 }
          : t.op === "back"
            ? { op: "translate", x: -d, y: 0 }
            : t.op === "right"
              ? { op: "translate", x: 0, y: d }
              : { op: "translate", x: 0, y: -d };
      }
    }
  });
}

const metres = (v: Value, span: Span): number => {
  if (v.kind === "length") return v.m;
  if (v.kind === "number" && v.value === 0) return 0;
  throw evalError(`expected a length (0.8m), found ${describe(v)}`, span);
};

/** A place, a point value or a direction, as an anchor of the declared kind. */
function toAnchor(v: Value, type: string | undefined, span: Span): Anchor {
  const anchor: Anchor | undefined =
    v.kind === "anchor"
      ? v.anchor
      : v.kind === "place"
        ? { kind: "point", frame: v.place.frame }
        : v.kind === "direction"
          ? { kind: "direction", frame: v.frame }
          : undefined;
  if (anchor === undefined)
    throw evalError(`an anchor is a point, a line or a direction, not ${describe(v)}`, span);
  const wanted =
    type === "Point"
      ? "point"
      : type === "Line"
        ? "line"
        : type === "Direction"
          ? "direction"
          : undefined;
  if (wanted !== undefined && wanted !== anchor.kind)
    throw evalError(`anchor declared ${type ?? ""} is a ${anchor.kind}`, span);
  return anchor;
}

// ---- expressions -------------------------------------------------------------

export interface Ctx {
  mods: Modules;
  env: Env;
  /** Local geometry into the world: where `point`, `line` and `direction` are made. */
  world: (local: Frame) => Frame;
  /** Bound while a provide or `next` is evaluated for one dancer. */
  rel?: Relational;
}

/** What the relation built-ins need: who is asking, from where. */
export interface Relational {
  /** The group whose provide is being evaluated. */
  group: Group;
  /** The asking dancer's own place. */
  place: Place;
  /** The root of the tree. */
  root: Group;
  /** The child of `group` on the way down to `place` — what `me` means here. */
  me: Group | Place;
  /** `$name` lookups from a provide's expression, when the tree can answer them. */
  dyn?: (name: string) => Value | undefined;
}

export const truthy = (v: Value): boolean => (v.kind === "bool" ? v.value : isSomebody(v));

export function evalExpr(e: Expr, ctx: Ctx): Value {
  switch (e.kind) {
    case "number":
      return e.unit === "" ? num(e.value) : len(e.value * (UNITS[e.unit] ?? 1));
    case "string":
      return { kind: "string", value: e.value };
    case "member": {
      if (e.type !== undefined) {
        const members = ctx.mods.enums.get(e.type);
        if (members === undefined) throw evalError(`${e.type} is not an enum`, e.span);
        if (!members.includes(e.member)) throw evalError(`${e.member} is not a ${e.type}`, e.span);
        return { kind: "member", enum: e.type, member: e.member };
      }
      const owners = [...ctx.mods.enums]
        .filter(([, members]) => members.includes(e.member))
        .map(([name]) => name);
      const [only] = owners;
      return only !== undefined && owners.length === 1
        ? { kind: "member", enum: only, member: e.member }
        : { kind: "member", member: e.member };
    }
    case "dyn": {
      const found = ctx.rel?.dyn?.(e.name);
      if (found === undefined) throw evalError(`$${e.name} is not available here`, e.span);
      return found;
    }
    case "name": {
      const bound = ctx.env.get(e.name);
      if (bound !== undefined) return bound;
      if (e.name === "pi") return num(Math.PI);
      if (e.name === "true") return bool(true);
      if (e.name === "false") return bool(false);
      throw evalError(`${e.name} is not bound`, e.span);
    }
    case "me":
      if (ctx.rel === undefined)
        throw evalError('"me" means something only in a provide or a next', e.span);
      return isGroup(ctx.rel.me)
        ? { kind: "group", group: ctx.rel.me }
        : { kind: "place", place: ctx.rel.me };
    case "nobody":
      return NOBODY;
    case "call":
      return callBuiltin(e.name, e.args, e.span, ctx);
    case "path": {
      const of = evalExpr(e.of, ctx);
      if (of.kind === "group") {
        const anchor = of.group.anchors[e.name];
        if (anchor !== undefined) return { kind: "anchor", anchor };
        const member = membersOf(of.group).find((m) => m.name === e.name);
        if (member !== undefined)
          return isGroup(member)
            ? { kind: "group", group: member }
            : { kind: "place", place: member };
        throw evalError(`${of.group.name} has no ${e.name}`, e.span);
      }
      if (of.kind === "nobody") return NOBODY;
      throw evalError(`only a group has parts; ${describe(of)} has no ${e.name}`, e.span);
    }
    case "unary": {
      const of = evalExpr(e.of, ctx);
      if (e.op === "not") return bool(!truthy(of));
      if (of.kind === "number") return num(-of.value);
      if (of.kind === "length") return len(-of.m);
      if (of.kind === "direction")
        return { kind: "direction", frame: { ...of.frame, facing: norm(of.frame.facing + 180) } };
      throw evalError(`cannot negate ${describe(of)}`, e.span);
    }
    case "binary":
      return binary(e.op, e.left, e.right, e.span, ctx);
    case "cond":
      return truthy(evalExpr(e.condition, ctx)) ? evalExpr(e.then, ctx) : evalExpr(e.else, ctx);
  }
}

/** A local direction, taken into the world (rotation and mirror only — no translation). */
const worldDirection = (ctx: Ctx, facing: number): Frame => {
  const o = ctx.world(IDENTITY);
  const p = ctx.world({ ...unit(facing), facing: 0 });
  return { x: 0, y: 0, facing: facingOf(p.x - o.x, p.y - o.y) };
};

function binary(op: string, l: Expr, r: Expr, span: Span, ctx: Ctx): Value {
  if (op === "and") return bool(truthy(evalExpr(l, ctx)) && truthy(evalExpr(r, ctx)));
  if (op === "or") return bool(truthy(evalExpr(l, ctx)) || truthy(evalExpr(r, ctx)));
  const left = evalExpr(l, ctx);
  const right = evalExpr(r, ctx);
  if (op === "is") {
    if (right.kind !== "member")
      throw evalError("the right side of is must be an enum member", span);
    return bool(left.kind === "member" && left.member === right.member);
  }
  if (op === "==" || op === "!=") {
    const same = equal(left, right);
    return bool(op === "==" ? same : !same);
  }
  if (op === "<" || op === "<=" || op === ">" || op === ">=") {
    const a = scalar(left, span);
    const b = scalar(right, span);
    return bool(op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b);
  }
  // arithmetic: numbers with numbers, lengths with lengths, a length scaled by a number
  if (left.kind === "number" && right.kind === "number") {
    return num(
      op === "+"
        ? left.value + right.value
        : op === "-"
          ? left.value - right.value
          : op === "*"
            ? left.value * right.value
            : left.value / right.value,
    );
  }
  if (left.kind === "length" && right.kind === "length" && (op === "+" || op === "-")) {
    return len(op === "+" ? left.m + right.m : left.m - right.m);
  }
  if (left.kind === "length" && right.kind === "length" && op === "/") return num(left.m / right.m);
  if (left.kind === "length" && right.kind === "number" && (op === "*" || op === "/")) {
    return len(op === "*" ? left.m * right.value : left.m / right.value);
  }
  if (left.kind === "number" && right.kind === "length" && op === "*")
    return len(left.value * right.m);
  throw evalError(`cannot ${op} ${describe(left)} and ${describe(right)}`, span);
}

const scalar = (v: Value, span: Span): number => {
  if (v.kind === "number") return v.value;
  if (v.kind === "length") return v.m;
  throw evalError(`cannot compare ${describe(v)}`, span);
};

const equal = (a: Value, b: Value): boolean => {
  if (a.kind === "number" && b.kind === "number") return a.value === b.value;
  if (a.kind === "length" && b.kind === "length") return Math.abs(a.m - b.m) < 1e-9;
  if (a.kind === "string" && b.kind === "string") return a.value === b.value;
  if (a.kind === "bool" && b.kind === "bool") return a.value === b.value;
  if (a.kind === "member" && b.kind === "member") return a.member === b.member;
  if (a.kind === "place" && b.kind === "place") return a.place.path === b.place.path;
  if (a.kind === "group" && b.kind === "group") return a.group.path === b.group.path;
  if (a.kind === "nobody" && b.kind === "nobody") return true;
  return false;
};

// ---- built-in functions ---------------------------------------------------------

/** The arguments of a built-in, by name or position, with the names it declares. */
function argsOf(
  names: readonly string[],
  args: readonly Arg[],
  span: Span,
  ctx: Ctx,
  fn: string,
): Record<string, Value> {
  const out: Record<string, Value> = {};
  let next = 0;
  for (const a of args) {
    const key = a.name ?? names[next++];
    if (key === undefined || !names.includes(key))
      throw evalError(`${fn} has no parameter ${a.name ?? `#${String(next)}`}`, a.span);
    out[key] = evalExpr(a.value, ctx);
  }
  return out;
}

const need = (args: Record<string, Value>, key: string, fn: string, span: Span): Value => {
  const v = args[key];
  if (v === undefined) throw evalError(`${fn} needs ${key}`, span);
  return v;
};

const asGroup = (v: Value, fn: string, span: Span): Group | undefined => {
  if (v.kind === "group") return v.group;
  if (v.kind === "nobody") return undefined;
  throw evalError(`${fn} wants a group, not ${describe(v)}`, span);
};

const pointOf = (v: Value, fn: string, span: Span): Frame => {
  if (v.kind === "place") return v.place.frame;
  if (v.kind === "anchor" && v.anchor.kind === "point") return v.anchor.frame;
  if (v.kind === "group") return centreOf(v.group);
  throw evalError(`${fn} wants a point, not ${describe(v)}`, span);
};

/** `Up`/`Down`/`Left`/`Right` and `X`/`Y` as local facings, screen terms (Up = −y). */
const MEMBER_FACING: Readonly<Record<string, number>> = {
  Right: 0,
  X: 0,
  Down: 90,
  Y: 90,
  Left: 180,
  Up: 270,
};

const directionOf = (v: Value, fn: string, span: Span, ctx?: Ctx): number => {
  if (v.kind === "direction") return v.frame.facing;
  if (v.kind === "anchor" && (v.anchor.kind === "direction" || v.anchor.kind === "line"))
    return v.anchor.frame.facing;
  if (v.kind === "member" && v.member in MEMBER_FACING && ctx !== undefined) {
    return worldDirection(ctx, MEMBER_FACING[v.member] as number).facing;
  }
  throw evalError(
    `${fn} wants a direction (Up, Down, Left, Right, X, Y), not ${describe(v)}`,
    span,
  );
};

const placeValue = (p: Place | undefined): Value =>
  p === undefined ? NOBODY : { kind: "place", place: p };

/** The kind name an argument written as a bare name means (`alternate(minor-set)`). */
const kindArg = (args: readonly Arg[], fn: string, span: Span): string => {
  const first = args[0];
  if (first === undefined || first.value.kind !== "name")
    throw evalError(`${fn} takes the name of a kind of group`, span);
  return first.value.name;
};

function callBuiltin(name: string, args: readonly Arg[], span: Span, ctx: Ctx): Value {
  const rel = (): Relational => {
    if (ctx.rel === undefined)
      throw evalError(
        `${name}(…) is a relation: it is evaluated for one dancer, in a provide or a next`,
        span,
      );
    return ctx.rel;
  };
  switch (name) {
    // ---- geometry, at build time or later
    case "point": {
      const a = argsOf(["x", "y"], args, span, ctx, name);
      const local: Frame = {
        x: a["x"] === undefined ? 0 : metres(a["x"], span),
        y: a["y"] === undefined ? 0 : metres(a["y"], span),
        facing: 0,
      };
      return { kind: "anchor", anchor: { kind: "point", frame: tidy(ctx.world(local)) } };
    }
    case "midpoint": {
      const a = argsOf(["a", "b"], args, span, ctx, name);
      const p = pointOf(need(a, "a", name, span), name, span);
      const q = pointOf(need(a, "b", name, span), name, span);
      return {
        kind: "anchor",
        anchor: {
          kind: "point",
          frame: tidy({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, facing: 0 }),
        },
      };
    }
    case "line": {
      const a = argsOf(["through", "along"], args, span, ctx, name);
      const through = pointOf(need(a, "through", name, span), name, span);
      const along = directionOf(need(a, "along", name, span), name, span, ctx);
      return {
        kind: "anchor",
        anchor: { kind: "line", frame: tidy({ x: through.x, y: through.y, facing: along }) },
      };
    }
    case "direction": {
      const a = argsOf(["of"], args, span, ctx, name);
      const of = need(a, "of", name, span);
      const facing =
        of.kind === "number" ? worldDirection(ctx, of.value).facing : directionOf(of, name, span, ctx);
      return { kind: "anchor", anchor: { kind: "direction", frame: { x: 0, y: 0, facing } } };
    }
    case "centre": {
      const a = argsOf(["of"], args, span, ctx, name);
      const g = asGroup(need(a, "of", name, span), name, span);
      return g === undefined
        ? NOBODY
        : { kind: "anchor", anchor: { kind: "point", frame: tidy(centreOf(g)) } };
    }
    // ---- the progression and the seating: plans, run by progression.ts
    case "duple-progression":
    case "triple-progression":
      return {
        kind: "progression",
        name,
        args: argsOf(["along", "out-top", "out-bottom"], args, span, ctx, name),
      };
    case "circle-progression":
      return { kind: "progression", name, args: argsOf(["around"], args, span, ctx, name) };
    case "none":
      return { kind: "progression", name, args: {} };
    case "alternate":
    case "all": {
      const every = args.find((a) => a.name === "every");
      return {
        kind: "seating",
        name,
        args: {
          kind: { kind: "string", value: kindArg(args, name, span) },
          every: every === undefined ? num(2) : evalExpr(every.value, ctx),
        },
      };
    }
    // ---- relations: for one dancer
    case "other": {
      const r = rel();
      const members = membersOf(r.group);
      if (members.length !== 2) return NOBODY;
      const me = r.me;
      const other = members.find((m) => m.path !== me.path);
      if (other === undefined) return NOBODY;
      return isGroup(other) ? { kind: "group", group: other } : { kind: "place", place: other };
    }
    case "child": {
      const r = rel();
      const a = argsOf(["k"], args, span, ctx, name);
      const k = need(a, "k", name, span);
      if (k.kind !== "number") throw evalError(`child takes a number, not ${describe(k)}`, span);
      const n = r.group.children.length;
      if (n === 0) return NOBODY;
      const child = r.group.children[((Math.round(k.value) % n) + n) % n];
      return child === undefined ? NOBODY : { kind: "group", group: child };
    }
    case "index": {
      const r = rel();
      return num(membersOf(r.group).findIndex((m) => m.path === r.me.path));
    }
    case "role": {
      const r = rel();
      const a = argsOf(["of"], args, span, ctx, name);
      const of = a["of"] ?? (isGroup(r.me) ? NOBODY : { kind: "place", place: r.me });
      if (of.kind !== "place" || of.place.role === undefined) return NOBODY;
      return { kind: "member", enum: "Role", member: of.place.role };
    }
    case "my-role": {
      const r = rel();
      return r.place.role === undefined
        ? NOBODY
        : { kind: "member", enum: "Role", member: r.place.role };
    }
    case "opposite-role":
    case "same-role": {
      const r = rel();
      const a = argsOf(["in"], args, span, ctx, name);
      const g = need(a, "in", name, span);
      if (g.kind === "nobody") return NOBODY;
      const candidates = g.kind === "place" ? [g.place] : placesOf(asGroup(g, name, span) as Group);
      const mine = r.place.role;
      const wanted = candidates.filter(
        (p) =>
          p.path !== r.place.path && (name === "same-role" ? p.role === mine : p.role !== mine),
      );
      return placeValue(nearest(wanted, r.place.frame));
    }
    case "at": {
      const a = argsOf(["in", "name"], args, span, ctx, name);
      const g = asGroup(need(a, "in", name, span), name, span);
      const which = need(a, "name", name, span);
      if (which.kind !== "string")
        throw evalError(`at takes the name of a place in quotes, not ${describe(which)}`, span);
      if (g === undefined) return NOBODY;
      const found = membersOf(g).find((m) => m.name === which.value);
      if (found === undefined) return NOBODY;
      return isGroup(found) ? { kind: "group", group: found } : { kind: "place", place: found };
    }
    case "across": {
      const r = rel();
      const a = argsOf(["me", "line"], args, span, ctx, name);
      const line = need(a, "line", name, span);
      if (line.kind !== "anchor" || line.anchor.kind !== "line")
        throw evalError(`across wants a line anchor, not ${describe(line)}`, span);
      const mirrored = reflect(r.place.frame, line.anchor.frame);
      const candidates = placesOf(r.group).filter(
        (p) => p.path !== r.place.path && distance(p.frame, mirrored) < 0.3,
      );
      return placeValue(nearest(candidates, mirrored));
    }
    case "group": {
      // An on-the-fly group of places: a ring, a line of four. Its frame is the centroid.
      const items = args.map((arg) => evalExpr(arg.value, ctx));
      const places: Place[] = [];
      for (const item of items) {
        if (item.kind === "place") places.push(item.place);
        else if (item.kind === "group") places.push(...placesOf(item.group));
        else if (item.kind !== "nobody")
          throw evalError(`a group is made of places and groups, not ${describe(item)}`, span);
      }
      const formed: Group = {
        path: `group(${places.map((p) => p.path).join(",")})`,
        kind: "group",
        name: "group",
        frame: IDENTITY,
        places,
        children: [],
        anchors: {},
        provides: [],
        functions: [],
      };
      formed.frame = centreOf(formed);
      return { kind: "group", group: formed };
    }
    default:
      throw evalError(`unknown function ${name}`, span);
  }
}

const nearest = (places: readonly Place[], to: Frame): Place | undefined =>
  [...places].sort((a, b) => distance(a.frame, to) - distance(b.frame, to))[0];

/** `p` reflected across the line through `line`'s origin along its facing. */
function reflect(p: Frame, line: Frame): Frame {
  const d = unit(line.facing);
  const vx = p.x - line.x;
  const vy = p.y - line.y;
  const along = vx * d.x + vy * d.y;
  const px = line.x + along * d.x;
  const py = line.y + along * d.y;
  return { x: 2 * px - p.x, y: 2 * py - p.y, facing: p.facing };
}
