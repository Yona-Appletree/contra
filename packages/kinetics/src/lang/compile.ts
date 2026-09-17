import type { DancerId, DancerState } from "../dialect/Dialect.js";
import { framePx } from "../dialect/tree/TreeDialect.js";
import type { FigureRegistry } from "../figures/registry.js";
import { figureNamed } from "../figures/registry.js";
import type { FigureIR, Params, Role } from "../ir/Figure.js";
import { beatsOf, defaultParams } from "../ir/Figure.js";
import type { Ctx } from "../tree/evaluate.js";
import { evalExpr, isEvalError, truthy } from "../tree/evaluate.js";
import type { Floor } from "../tree/floor.js";
import type { Membership } from "../tree/membership.js";
import { progress } from "../tree/membership.js";
import { providedNames, resolve } from "../tree/relations.js";
import type { Group, Place } from "../tree/Tree.js";
import { placeAt, placesOf } from "../tree/Tree.js";
import type { Value } from "../tree/values.js";
import { NOBODY, describe } from "../tree/values.js";
import type { Arg, Expr, File, ModuleItem, Param, Span, Stmt } from "./syntax.js";

/**
 * One call in one dancer's script, with the beats it owns and the people it
 * is dancing it with: the debugger's second layer, and everything the
 * scheduler needs to plan an entry and an exit.
 */
export interface CompiledCall {
  /** Position in this dancer's flat list. */
  id: number;
  figure: FigureIR;
  /** The call's arguments, defaults filled in. Dancers are in the cast. */
  params: Params;
  /** `params.beats` when the figure takes one, else the figure's nominal. */
  beats: number;
  start: number;
  end: number;
  /** The debugger's breadcrumb: `bow`, `repeat[0]/figure/do-si-do`. */
  path: string;
  /** Of the call statement, so the Source pane can light it. */
  span: Span;
  /**
   * This dancer's view of the figure's roles. `partner: undefined` is nobody
   * — the tree found no-one — and the scheduler makes that a stand (DA14).
   */
  cast: Readonly<Record<Role, DancerId | undefined>>;
  /** The whole group, in ring order from `self`, for a figure danced by a group. */
  group?: readonly DancerId[];
  /** This dancer's seat once the call has ended — moved, when a progression came before. */
  seatAfter: DancerState;
  /** What each `$` variable the call read resolved to, for the debugger (P5). */
  bindings: Readonly<Record<string, string>>;
  /** Which membership snapshot (`CompiledSequence.memberships`) was current. */
  membership: number;
}

/** Every dancer's script, compiled from the one dance they all share. */
export interface CompiledSequence {
  dialect: string;
  title?: string;
  perDancer: Readonly<Record<DancerId, readonly CompiledCall[]>>;
  /** The seatings, in order: at beat 0, then after each `progress()`. */
  memberships: readonly Membership[];
}

/** Something the dance says that the compiler cannot make sense of. */
export interface CompileError {
  message: string;
  span?: Span;
}

export interface CompileInput {
  /** The dance file, and the name of the dance module to run (the first dance in the file by default). */
  dance: File;
  entry?: string;
  /** The moves the dance may call. */
  moves: File;
  floor: Floor;
  registry: FigureRegistry;
}

/**
 * Compile a dance **per dancer** (DA14): each dancer walks the same
 * statements from their own place in the tree, so one text is every
 * dancer's script and a `$` variable that finds nobody is an end effect
 * rather than a special case.
 *
 * `$name` is resolved through the tree at the moment it is read (the
 * one-sigil rule), so after `progress()` the same word names the new
 * neighbour. A call to a **move** binds the move's `$` parameters from the
 * tree unless the call passes them, maps the move's parameters onto its
 * figure's by name, and casts the first Place as the counterpart and the
 * first Group as the ring. A call to another **dance** is inlined. `repeat`
 * unrolls and provides `$time` and `$times`. Errors are returned, never
 * thrown, and a call with one is dropped rather than guessed at.
 */
export function compile(input: CompileInput): {
  sequence: CompiledSequence;
  errors: CompileError[];
} {
  const errors: CompileError[] = [];
  const reported = new Set<string>();
  const report = (message: string, span?: Span): void => {
    const key = `${message}@${span?.start ?? -1}`;
    if (reported.has(key)) return;
    reported.add(key);
    errors.push(span === undefined ? { message } : { message, span });
  };

  const { floor, registry } = input;
  const modules = new Map<string, ModuleItem>();
  for (const file of [input.moves, input.dance]) {
    for (const item of file.items) {
      if (item.kind === "enum") continue;
      if (modules.has(item.name)) report(`${item.name} is declared twice`, item.span);
      modules.set(item.name, item);
    }
  }
  const dances = input.dance.items.filter((i): i is ModuleItem => i.kind === "dance");
  const entry = input.entry === undefined ? dances[0] : dances.find((d) => d.name === input.entry);
  const memberships: Membership[] = [floor.initial];
  const perDancer: Record<DancerId, readonly CompiledCall[]> = {};
  let title: string | undefined;
  if (entry === undefined) {
    report(
      input.entry === undefined ? "the file has no dance" : `the file has no dance ${input.entry}`,
    );
    return { sequence: { dialect: floor.name, perDancer, memberships }, errors };
  }

  // The static half of the one-sigil rule: every $ the dance requires or
  // reads must be something this formation provides, before anybody dances.
  const provided = providedNames(floor.root);
  const known = (name: string): boolean =>
    provided.has(name) || name === "time" || name === "times";
  for (const p of entry.params) {
    if (p.dynamic && !known(p.name)) report(`${floor.name} does not provide $${p.name}`, p.span);
  }

  for (const dancer of floor.initial.placeOf.keys()) {
    const calls: CompiledCall[] = [];
    let membership = floor.initial;
    let membershipIndex = 0;
    let beat = 0;
    const loops: { i: number; n: number }[] = [];

    const placeOfMe = (): Place | undefined => {
      const path = membership.placeOf.get(dancer);
      return path === undefined ? undefined : placeAt(floor.root, path);
    };

    /** `$name` for this dancer now, with the static check done once per name. */
    const dyn = (name: string, span: Span | undefined, reads: Record<string, string>): Value => {
      if (name === "time" || name === "times") {
        const loop = loops[loops.length - 1];
        if (!loop) {
          report(`$${name} means nothing outside a repeat`, span);
          return NOBODY;
        }
        return { kind: "number", value: name === "time" ? loop.i + 1 : loop.n };
      }
      if (!known(name)) {
        report(`${floor.name} does not provide $${name}`, span);
        return NOBODY;
      }
      const path = membership.placeOf.get(dancer);
      if (path === undefined) return NOBODY;
      const value = resolve(name, path, floor.root, floor.mods, membership).value;
      reads[name] = nameOf(value, membership);
      return value;
    };

    const ctxFor = (env: Map<string, Value>, reads: Record<string, string>, span?: Span): Ctx => {
      const place = placeOfMe();
      const ctx: Ctx = { mods: floor.mods, env, world: (f) => f };
      if (place !== undefined) {
        ctx.rel = {
          group: floor.root,
          place,
          root: floor.root,
          me: place,
          dyn: (name) => dyn(name, span, reads),
        };
      }
      return ctx;
    };

    const evaluate = (
      e: Expr,
      env: Map<string, Value>,
      reads: Record<string, string>,
    ): Value | undefined => {
      try {
        return evalExpr(e, ctxFor(env, reads, e.span));
      } catch (error) {
        report(messageOf(error), isEvalError(error) && error.span ? error.span : e.span);
        return undefined;
      }
    };

    const walk = (
      stmts: readonly Stmt[],
      env: Map<string, Value>,
      path: readonly string[],
      stack: readonly string[],
    ): void => {
      for (const stmt of stmts) {
        switch (stmt.kind) {
          case "title":
            title = stmt.text;
            break;
          case "let": {
            const reads: Record<string, string> = {};
            const value = evaluate(stmt.value, env, reads);
            if (value !== undefined) env.set(stmt.name, value);
            break;
          }
          case "if": {
            const reads: Record<string, string> = {};
            const verdict = evaluate(stmt.condition, env, reads);
            if (verdict === undefined) break;
            walk(truthy(verdict) ? stmt.then : stmt.else, env, path, stack);
            break;
          }
          case "repeat": {
            const reads: Record<string, string> = {};
            const count = evaluate(stmt.count, env, reads);
            if (count === undefined) break;
            if (count.kind !== "number" || !Number.isInteger(count.value) || count.value < 0) {
              report(`repeat needs a whole number of times, not ${describe(count)}`, stmt.span);
              break;
            }
            for (let i = 0; i < count.value; i += 1) {
              loops.push({ i, n: count.value });
              if (stmt.binder !== undefined) env.set(stmt.binder, { kind: "number", value: i });
              walk(stmt.body, env, [...path, `repeat[${String(i)}]`], stack);
              loops.pop();
            }
            break;
          }
          case "call": {
            if (stmt.name === "progress") {
              // A statement, not a figure: it takes no beats, and every dancer
              // says it at the same point of the dance, so all of them see the
              // same seating.
              if (stmt.args.length > 0) report("progress() takes no arguments", stmt.span);
              try {
                membership = progress(floor.root, floor.mods, membership);
              } catch (error) {
                report(messageOf(error), stmt.span);
                break;
              }
              membershipIndex += 1;
              if (memberships[membershipIndex] === undefined)
                memberships[membershipIndex] = membership;
              break;
            }
            const module = modules.get(stmt.name);
            if (module === undefined) {
              report(`unknown move ${stmt.name}`, stmt.span);
              break;
            }
            if (module.kind === "dance") {
              if (stack.includes(stmt.name)) {
                report(`${stmt.name} calls itself`, stmt.span);
                break;
              }
              const inner = new Map<string, Value>();
              const reads: Record<string, string> = {};
              bindPlain(module, stmt.args, env, inner, reads, evaluate, report, stmt.span);
              walk(module.body, inner, [...path, stmt.name], [...stack, stmt.name]);
              break;
            }
            if (module.kind !== "move") {
              report(`${stmt.name} is a ${module.kind}, not a move`, stmt.span);
              break;
            }
            const call = compileMove(module, stmt, env, path);
            if (call !== undefined) {
              calls.push(call);
              beat += call.beats;
            }
            break;
          }
          default:
            report(`"${stmt.kind}" does not belong in a dance`, stmt.span);
        }
      }
    };

    /** A move call: bind its contract from the tree or the call, map onto the figure, cast. */
    const compileMove = (
      module: ModuleItem,
      stmt: Extract<Stmt, { kind: "call" }>,
      env: Map<string, Value>,
      path: readonly string[],
    ): CompiledCall | undefined => {
      const ir = module.body.find((s): s is Extract<Stmt, { kind: "ir" }> => s.kind === "ir");
      if (ir === undefined) {
        report(`move ${module.name} names no figure`, module.span);
        return undefined;
      }
      const figure = figureNamed(registry, ir.id);
      if (figure === undefined) {
        report(`move ${module.name} names a figure that does not exist: "${ir.id}"`, ir.span);
        return undefined;
      }
      const reads: Record<string, string> = {};
      const bound = new Map<string, Value>();
      // Positional arguments fill the $ parameters first, then the plain ones.
      const dynamics = module.params.filter((p) => p.dynamic);
      const plain = module.params.filter((p) => !p.dynamic);
      const order = [...dynamics, ...plain];
      let next = 0;
      let ok = true;
      for (const arg of stmt.args) {
        const param =
          arg.name === undefined
            ? order[next++]
            : module.params.find((p) => p.name === arg.name && p.dynamic === arg.dynamic);
        if (param === undefined) {
          report(`${module.name} has no parameter ${arg.name ?? `#${String(next)}`}`, arg.span);
          ok = false;
          continue;
        }
        const value = evaluate(arg.value, env, reads);
        if (value === undefined) {
          ok = false;
          continue;
        }
        bound.set(param.name, value);
      }
      for (const param of module.params) {
        if (bound.has(param.name)) continue;
        if (param.dynamic) {
          bound.set(param.name, dyn(param.name, stmt.span, reads));
          continue;
        }
        if (param.default === undefined) {
          report(`${module.name} needs ${param.name}: ${param.type}`, stmt.span);
          ok = false;
          continue;
        }
        const value = evaluate(param.default, env, reads);
        if (value === undefined) ok = false;
        else bound.set(param.name, value);
      }
      if (!ok) return undefined;

      // The figure's parameters, by name; the counterpart and the ring by type.
      const params: Record<string, string | number> = { ...defaultParams(figure) };
      let partner: DancerId | undefined;
      let group: readonly DancerId[] | undefined;
      const counterpart = module.params.find((p) => p.type === "Place");
      const ring = module.params.find((p) => p.type === "Group");
      for (const spec of figure.params) {
        if (spec.kind === "dancer") {
          const who = counterpart === undefined ? undefined : bound.get(counterpart.name);
          if (counterpart === undefined) {
            report(
              `move ${module.name} names no Place for ${figure.id}'s ${spec.name}`,
              module.span,
            );
            return undefined;
          }
          partner = who === undefined ? undefined : dancerOf(who, membership);
          continue;
        }
        if (spec.kind === "group") {
          const what = ring === undefined ? undefined : bound.get(ring.name);
          if (ring === undefined) {
            report(
              `move ${module.name} names no Group for ${figure.id}'s ${spec.name}`,
              module.span,
            );
            return undefined;
          }
          group = what === undefined ? undefined : ringOf(what, dancer, membership, floor.root);
          continue;
        }
        const param = module.params.find((p) => p.name === spec.name && !p.dynamic);
        const value = param === undefined ? undefined : bound.get(param.name);
        if (value === undefined) {
          if (spec.default === undefined) {
            report(`move ${module.name} does not give ${figure.id} its ${spec.name}`, module.span);
            return undefined;
          }
          continue;
        }
        if (spec.kind === "enum" || spec.kind === "role") {
          if (value.kind !== "member") {
            report(`${module.name}'s ${spec.name} is a choice, not ${describe(value)}`, stmt.span);
            return undefined;
          }
          const word = kebab(value.member);
          if (spec.kind === "enum" && !(spec.choices ?? []).includes(word)) {
            report(
              `${value.member} is not a ${spec.name} for ${figure.id}: ${(spec.choices ?? []).join(" | ")}`,
              stmt.span,
            );
            return undefined;
          }
          params[spec.name] = word;
          continue;
        }
        if (spec.kind === "string") {
          if (value.kind !== "string") {
            report(`${module.name}'s ${spec.name} is a string, not ${describe(value)}`, stmt.span);
            return undefined;
          }
          params[spec.name] = value.value;
          continue;
        }
        if (value.kind !== "number") {
          report(`${module.name}'s ${spec.name} is a number, not ${describe(value)}`, stmt.span);
          return undefined;
        }
        params[spec.name] = value.value;
      }

      const beats = beatsOf(figure, params);
      const cast: Record<Role, DancerId | undefined> = {
        self: dancer,
        partner,
        left: group?.[1],
        opposite: group?.[2],
        right: group?.[3],
      };
      const place = placeOfMe();
      const call: CompiledCall = {
        id: calls.length,
        figure,
        params,
        beats,
        start: beat,
        end: beat + beats,
        path: [...path, stmt.name].join("/"),
        span: stmt.span,
        cast,
        seatAfter: place === undefined ? { p: [0, 0], facing: 0 } : framePx(place.frame),
        bindings: reads,
        membership: membershipIndex,
      };
      if (group !== undefined) call.group = group;
      return call;
    };

    const env = new Map<string, Value>();
    const reads: Record<string, string> = {};
    for (const p of entry.params) {
      if (p.dynamic) continue;
      if (p.default !== undefined) {
        const value = evaluate(p.default, env, reads);
        if (value !== undefined) env.set(p.name, value);
      }
    }
    walk(entry.body, env, [], [entry.name]);
    perDancer[dancer] = calls;
  }

  const sequence: CompiledSequence = { dialect: floor.name, perDancer, memberships };
  if (title !== undefined) sequence.title = title;
  return { sequence, errors };
}

/** Bind a dance module's plain parameters from a call's arguments (its `$` ones are read from the tree). */
function bindPlain(
  module: ModuleItem,
  args: readonly Arg[],
  env: Map<string, Value>,
  into: Map<string, Value>,
  reads: Record<string, string>,
  evaluate: (e: Expr, env: Map<string, Value>, reads: Record<string, string>) => Value | undefined,
  report: (message: string, span?: Span) => void,
  span: Span,
): void {
  const plain: Param[] = module.params.filter((p) => !p.dynamic);
  let next = 0;
  for (const arg of args) {
    const param = arg.name === undefined ? plain[next++] : plain.find((p) => p.name === arg.name);
    if (param === undefined) {
      report(`${module.name} has no parameter ${arg.name ?? `#${String(next)}`}`, arg.span);
      continue;
    }
    const value = evaluate(arg.value, env, reads);
    if (value !== undefined) into.set(param.name, value);
  }
  for (const param of plain) {
    if (into.has(param.name)) continue;
    if (param.default === undefined) {
      report(`${module.name} needs ${param.name}: ${param.type}`, span);
      continue;
    }
    const value = evaluate(param.default, into, reads);
    if (value !== undefined) into.set(param.name, value);
  }
}

/** The dancer standing on a place value, or nobody. */
const dancerOf = (v: Value, membership: Membership): DancerId | undefined =>
  v.kind === "place" ? membership.dancerOf.get(v.place.path) : undefined;

/**
 * The dancers of a group **in ring order clockwise from `me`**: sorted by
 * bearing from the middle of them and rotated to start at the asking
 * dancer, so the second is the one they would circle left into and the
 * third is across. A group with an empty place is nobody: a ring of three
 * is not a hands four.
 */
function ringOf(
  v: Value,
  me: DancerId,
  membership: Membership,
  root: Group,
): readonly DancerId[] | undefined {
  if (v.kind !== "group") return undefined;
  const places = placesOf(v.group);
  if (places.length === 0) return undefined;
  const seated: { id: DancerId; place: Place }[] = [];
  for (const place of places) {
    const id = membership.dancerOf.get(place.path);
    if (id === undefined) return undefined;
    seated.push({ id, place });
  }
  if (!seated.some((s) => s.id === me)) return undefined;
  const cx = seated.reduce((s, m) => s + m.place.frame.x, 0) / seated.length;
  const cy = seated.reduce((s, m) => s + m.place.frame.y, 0) / seated.length;
  const clockwise = [...seated].sort(
    (a, b) =>
      Math.atan2(a.place.frame.y - cy, a.place.frame.x - cx) -
      Math.atan2(b.place.frame.y - cy, b.place.frame.x - cx),
  );
  const start = clockwise.findIndex((m) => m.id === me);
  void root;
  return clockwise.map(
    (_, i) => (clockwise[(start + i) % clockwise.length] as { id: DancerId }).id,
  );
}

/** A value as the debugger shows a binding: the dancer on it, the group's kind, the member, or nobody. */
function nameOf(v: Value, membership: Membership): string {
  switch (v.kind) {
    case "place":
      return membership.dancerOf.get(v.place.path) ?? "nobody";
    case "group": {
      const ids = placesOf(v.group).map((p) => membership.dancerOf.get(p.path) ?? "·");
      return `${v.group.kind} [${ids.join(" ")}]`;
    }
    case "member":
      return v.member;
    case "number":
      return String(v.value);
    case "nobody":
      return "nobody";
    default:
      return describe(v);
  }
}

/** `ReverseBecket` → `reverse-becket`: an enum member as the figure IR spells its choices. */
export const kebab = (member: string): string =>
  member.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
