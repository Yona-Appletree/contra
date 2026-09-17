import type { DancerId, DancerState } from "../dialect/Dialect.js";
import { framePx } from "../dialect/tree/TreeDialect.js";
import type { FigureRegistry } from "../figures/registry.js";
import { figureNamed } from "../figures/registry.js";
import type { FigureIR, Params, Role } from "../ir/Figure.js";
import { beatsOf, defaultParams } from "../ir/Figure.js";
import type { Ctx } from "../tree/evaluate.js";
import { evalExpr, isEvalError, truthy } from "../tree/evaluate.js";
import type { Floor } from "../tree/floor.js";
import { floorOf } from "../tree/floor.js";
import { findFunction, providedNames, resolve, runFunction } from "../tree/relations.js";
import type { Assignment, Dancer, Dancers, Membership } from "../tree/state.js";
import { commit, membershipOf } from "../tree/state.js";
import type { Place } from "../tree/Tree.js";
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
  /** What each `$` variable the call read resolved to, for the debugger. */
  bindings: Readonly<Record<string, string>>;
  /** Which seating (`CompiledSequence.memberships`) was current. */
  membership: number;
}

/** Every dancer's script, compiled from the one dance they all share. */
export interface CompiledSequence {
  dialect: string;
  /** The first `card` the dance says, as its name. */
  title?: string;
  perDancer: Readonly<Record<DancerId, readonly CompiledCall[]>>;
  /** The seatings, in order: at beat 0, then after each commit. */
  memberships: readonly Membership[];
  /** `card` and `say` lines, at the beat each dancer reached them. */
  annotations: readonly Annotation[];
  /** Every reassignment committed, in order, with the beat it happened at. */
  events: readonly Assignment[];
}

/** A `card` or `say`, on the timeline: no beats, just a mark. */
export interface Annotation {
  kind: "card" | "say";
  text: string;
  beat: number;
  dancer: DancerId;
  span: Span;
}

/** Something the dance says that the compiler cannot make sense of. */
export interface CompileError {
  message: string;
  span?: Span;
  beat?: number;
  dancers?: string[];
}

export interface CompileInput {
  /** The dance file, and the name of the module to run (the first module with no `ir` by default). */
  dance: File;
  entry?: string;
  /** The moves the dance may call. */
  moves: File;
  registry: FigureRegistry;
  /**
   * The floor, when the dance does not declare its own. A dance that says
   * `group becket(…)` builds its floor from `library` and `resolve`.
   */
  floor?: Floor;
  /** The prelude and the couple: read with every floor a dance declares. */
  library?: readonly File[];
  /** The file that defines a module the dance's floor names (`becket` → `formations/becket.dance`). */
  resolve?: (moduleName: string) => File | undefined;
  /** `$` values the caller sets for the dance's space (`$minor-sets`). */
  dynamics?: Readonly<Record<string, number>>;
}

/** What one dancer's walk hands the driver: a call that takes beats, or a sync point (`progress()`). */
type Yielded = { kind: "call"; call: CompiledCall } | { kind: "sync" };

/**
 * Compile a dance in **lock-step** (round 2, P2). Every dancer walks the
 * same statements from their own place; the driver advances them together,
 * one beat at a time. Within a beat every dancer reads the same state — the
 * one the last commit left. `progress()` runs the formation's provided
 * function for the dancer, queues the reassignments it makes, and yields;
 * once every dancer at the beat has yielded, the queue **commits** as one
 * transaction, the invariants are checked, and the dancers at the sync
 * resume at the same beat with the new state. That is what the user's walk
 * asked for: *"all of those things happen at once. And the invariants
 * hold."*
 *
 * A call to a **move** binds the move's `$` parameters from the tree
 * unless the call passes them, maps the move's parameters onto its
 * figure's by name, and casts the first Place as the counterpart and the
 * first Group as the ring. A call to another module is inlined, with the
 * caller's block as its `children()`. Errors are data, never thrown.
 */
export function compile(input: CompileInput): {
  sequence: CompiledSequence;
  errors: CompileError[];
  floor?: Floor;
} {
  const errors: CompileError[] = [];
  const reported = new Set<string>();
  const report = (
    message: string,
    span?: Span,
    extra: { beat?: number; dancers?: string[] } = {},
  ): void => {
    const key = `${message}@${span?.start ?? -1}`;
    if (reported.has(key)) return;
    reported.add(key);
    errors.push({ message, ...(span === undefined ? {} : { span }), ...extra });
  };

  const { registry } = input;
  const modules = new Map<string, ModuleItem>();
  for (const file of [input.moves, input.dance]) {
    for (const item of file.items) {
      if (item.kind === "enum") continue;
      if (modules.has(item.name)) report(`${item.name} is declared twice`, item.span);
      modules.set(item.name, item);
    }
  }
  const isMoveModule = (m: ModuleItem): boolean => m.body.some((s) => s.kind === "ir");
  const dances = input.dance.items.filter(
    (i): i is ModuleItem => i.kind === "module" && !isMoveModule(i),
  );
  const entryFound =
    input.entry === undefined ? dances[0] : dances.find((d) => d.name === input.entry);
  const empty = (name: string): CompiledSequence => ({
    dialect: name,
    perDancer: {},
    memberships: [],
    annotations: [],
    events: [],
  });
  if (entryFound === undefined) {
    report(
      input.entry === undefined ? "the file has no dance" : `the file has no dance ${input.entry}`,
    );
    return { sequence: empty("?"), errors };
  }
  const entry: ModuleItem = entryFound;

  // The floor: the dance's own, when it declares one, else the one given.
  const floorFound = input.floor ?? ownFloor(input, entry, report);
  if (floorFound === undefined) return { sequence: empty(entry.name), errors };
  const floor: Floor = floorFound;
  const { root, mods } = floor;

  let dancers: Dancers = floor.dancers;
  const memberships: Membership[] = [floor.initial];
  const events: Assignment[] = [];
  const annotations: Annotation[] = [];
  const perDancer: Record<DancerId, CompiledCall[]> = {};
  let title: string | undefined;
  let membershipIndex = 0;

  // The static half of the one-sigil rule: every $ the dance reads must be
  // something this floor provides, or a cursor name.
  const provided = providedNames(root);
  const CURSOR = ["time", "times", "first-time", "last-time", "beat"];
  const known = (name: string): boolean => provided.has(name) || CURSOR.includes(name);

  // ---- one dancer's walk, as a generator the driver steps ----------------------

  function* walkDancer(dancer0: Dancer): Generator<Yielded, void, void> {
    const id = dancer0.id;
    const calls: CompiledCall[] = [];
    perDancer[id] = calls;
    let beat = 0;
    const loops: { i: number; n: number; startBeat: number }[] = [];
    const childrenStack: { body: readonly Stmt[]; env: Map<string, Value> }[] = [];
    const me = (): Dancer => dancers.byId(id) ?? dancer0;
    const placeOfMe = (): Place | undefined => placeAt(root, me().place);

    const dyn = (name: string, span: Span | undefined, reads: Record<string, string>): Value => {
      if (CURSOR.includes(name)) {
        const loop = loops[loops.length - 1];
        if (!loop) {
          if (name === "beat") return { kind: "number", value: beat };
          report(`$${name} means nothing outside a repeat`, span);
          return NOBODY;
        }
        switch (name) {
          case "time":
            return { kind: "number", value: loop.i + 1 };
          case "times":
            return { kind: "number", value: loop.n };
          case "first-time":
            return { kind: "bool", value: loop.i === 0 };
          case "last-time":
            return { kind: "bool", value: loop.i === loop.n - 1 };
          default:
            return { kind: "number", value: beat - loop.startBeat };
        }
      }
      if (!known(name)) {
        report(`${floor.name} does not provide $${name}`, span);
        return NOBODY;
      }
      const value = resolve(name, me(), root, mods, dancers).value;
      reads[name] = nameOf(value, dancers);
      return value;
    };

    const ctxFor = (env: Map<string, Value>, reads: Record<string, string>, span?: Span): Ctx => {
      const place = placeOfMe();
      const ctx: Ctx = { mods, env, world: (f) => f };
      if (place !== undefined) {
        const rel: NonNullable<Ctx["rel"]> = {
          group: root,
          place,
          root,
          me: place,
          dyn: (name) => dyn(name, span, reads),
          roleAt: (path) => dancers.at(path)?.role ?? placeAt(root, path)?.role,
        };
        const role = me().role;
        if (role !== undefined) rel.role = role;
        ctx.rel = rel;
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
        report(messageOf(error), isEvalError(error) && error.span ? error.span : e.span, {
          beat,
          dancers: [id],
        });
        return undefined;
      }
    };

    function* walk(
      stmts: readonly Stmt[],
      env: Map<string, Value>,
      path: readonly string[],
      stack: readonly string[],
    ): Generator<Yielded, void, void> {
      for (const stmt of stmts) {
        switch (stmt.kind) {
          case "card":
          case "say":
            annotations.push({
              kind: stmt.kind,
              text: stmt.text,
              beat,
              dancer: id,
              span: stmt.span,
            });
            if (stmt.kind === "card" && title === undefined) title = stmt.text;
            break;
          case "place":
          case "anchor":
          case "group":
          case "provide":
          case "provide-fn":
          case "dancers":
          case "ir":
            // Space: nobody's pass read it.
            break;
          case "children": {
            const passed = childrenStack[childrenStack.length - 1];
            if (passed === undefined) {
              report("children() outside a module called with a block", stmt.span);
              break;
            }
            childrenStack.pop();
            yield* walk(passed.body, passed.env, path, stack);
            childrenStack.push(passed);
            break;
          }
          case "assign": {
            // A reassignment in the dance itself: queued like one from a provided function.
            const reads: Record<string, string> = {};
            const value = evaluate(stmt.value, env, reads);
            if (value === undefined) break;
            const text =
              value.kind === "group"
                ? value.group.path
                : value.kind === "place"
                  ? value.place.path
                  : value.kind === "string"
                    ? value.value
                    : value.kind === "member"
                      ? value.member
                      : undefined;
            if (text === undefined) {
              report(
                `$${stmt.name} = ${describe(value)}: a group, a place, a name or a role is what a reassignment takes`,
                stmt.span,
                { beat, dancers: [id] },
              );
              break;
            }
            queue.push({ dancer: id, beat, property: stmt.name, value: text, span: stmt.span });
            yield { kind: "sync" };
            break;
          }
          case "assert": {
            const reads: Record<string, string> = {};
            const verdict = evaluate(stmt.condition, env, reads);
            if (verdict !== undefined && !truthy(verdict)) {
              report(
                `assert failed${stmt.message === undefined ? "" : `: ${stmt.message}`}`,
                stmt.span,
                { beat, dancers: [id] },
              );
            }
            break;
          }
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
            yield* walk(truthy(verdict) ? stmt.then : stmt.else, env, path, stack);
            break;
          }
          case "match": {
            const reads: Record<string, string> = {};
            const subject = evaluate(stmt.subject, env, reads);
            if (subject === undefined) break;
            const arm =
              stmt.arms.find(
                (a) =>
                  a.pattern !== undefined &&
                  subject.kind === "member" &&
                  subject.member === a.pattern,
              ) ?? stmt.arms.find((a) => a.pattern === undefined);
            if (arm) yield* walk(arm.body, env, path, stack);
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
              loops.push({ i, n: count.value, startBeat: beat });
              yield* walk(stmt.body, env, [...path, `repeat[${String(i)}]`], stack);
              loops.pop();
            }
            break;
          }
          case "for": {
            const reads: Record<string, string> = {};
            const from = evaluate(stmt.from, env, reads);
            const to = evaluate(stmt.to, env, reads);
            if (from === undefined || to === undefined) break;
            if (from.kind !== "number" || to.kind !== "number") {
              report("for needs whole numbers", stmt.span);
              break;
            }
            const end = stmt.inclusive ? to.value : to.value - 1;
            const n = Math.max(0, end - from.value + 1);
            for (let i = from.value; i <= end; i += 1) {
              env.set(stmt.binder, { kind: "number", value: i });
              loops.push({ i: i - from.value, n, startBeat: beat });
              yield* walk(stmt.body, env, [...path, `${stmt.binder}=${String(i)}`], stack);
              loops.pop();
            }
            break;
          }
          case "call": {
            if (stmt.name === "progress" && !modules.has("progress")) {
              // The formation's provided function, run for this dancer against
              // the state as it is; its reassignments commit with everybody's.
              if (stmt.args.length > 0) report("progress() takes no arguments", stmt.span);
              const found = findFunction("progress", me(), root);
              if (found === undefined) {
                report(`${floor.name} provides no progress() here`, stmt.span, {
                  beat,
                  dancers: [id],
                });
                break;
              }
              try {
                queue.push(...runFunction(found, me(), root, mods, dancers, beat));
              } catch (error) {
                report(
                  messageOf(error),
                  isEvalError(error) && error.span ? error.span : stmt.span,
                  { beat, dancers: [id] },
                );
              }
              yield { kind: "sync" };
              break;
            }
            const module = modules.get(stmt.name);
            if (module === undefined) {
              report(`unknown module ${stmt.name}`, stmt.span);
              break;
            }
            if (!isMoveModule(module)) {
              if (stack.includes(stmt.name)) {
                report(`${stmt.name} calls itself`, stmt.span);
                break;
              }
              const inner = new Map<string, Value>();
              const reads: Record<string, string> = {};
              bindPlain(module, stmt.args, env, inner, reads, evaluate, report, stmt.span);
              if (stmt.children) childrenStack.push({ body: stmt.children, env });
              yield* walk(module.body, inner, [...path, stmt.name], [...stack, stmt.name]);
              if (stmt.children) childrenStack.pop();
              break;
            }
            if (stmt.children) report(`${stmt.name} is a move and takes no block`, stmt.span);
            const call = compileMove(module, stmt, env, path);
            if (call !== undefined) {
              calls.push(call);
              beat += call.beats;
              yield { kind: "call", call };
            }
            break;
          }
        }
      }
    }

    /** A move call: bind its contract from the tree or the call, map onto the figure, cast. */
    const compileMove = (
      module: ModuleItem,
      stmt: Extract<Stmt, { kind: "call" }>,
      env: Map<string, Value>,
      path: readonly string[],
    ): CompiledCall | undefined => {
      const ir = module.body.find((s): s is Extract<Stmt, { kind: "ir" }> => s.kind === "ir");
      if (ir === undefined) return undefined;
      const figure = figureNamed(registry, ir.id);
      if (figure === undefined) {
        report(`${module.name} names a figure that does not exist: "${ir.id}"`, ir.span);
        return undefined;
      }
      const reads: Record<string, string> = {};
      const bound = new Map<string, Value>();
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

      const params: Record<string, string | number> = { ...defaultParams(figure) };
      let partner: DancerId | undefined;
      let group: readonly DancerId[] | undefined;
      const counterpart = module.params.find((p) => p.type === "Place");
      const ring = module.params.find((p) => p.type === "Group");
      for (const spec of figure.params) {
        if (spec.kind === "dancer") {
          if (counterpart === undefined) {
            report(`${module.name} names no Place for ${figure.id}'s ${spec.name}`, module.span);
            return undefined;
          }
          const who = bound.get(counterpart.name);
          partner = who === undefined ? undefined : dancerOf(who, dancers);
          continue;
        }
        if (spec.kind === "group") {
          if (ring === undefined) {
            report(`${module.name} names no Group for ${figure.id}'s ${spec.name}`, module.span);
            return undefined;
          }
          const what = bound.get(ring.name);
          group = what === undefined ? undefined : ringOf(what, id, dancers);
          continue;
        }
        const param = module.params.find((p) => p.name === spec.name && !p.dynamic);
        const value = param === undefined ? undefined : bound.get(param.name);
        if (value === undefined) {
          if (spec.default === undefined) {
            report(`${module.name} does not give ${figure.id} its ${spec.name}`, module.span);
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
        self: id,
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
      if (p.dynamic || p.default === undefined) continue;
      const value = evaluate(p.default, env, reads);
      if (value !== undefined) env.set(p.name, value);
    }
    yield* walk(entry.body, env, [], [entry.name]);
  }

  // ---- the driver: everybody together, a beat at a time --------------------------

  const queue: Assignment[] = [];
  interface Thread {
    dancer: Dancer;
    gen: Generator<Yielded, void, void>;
    cursor: number;
    done: boolean;
    atSync: boolean;
  }
  const threads: Thread[] = dancers.list.map((dancer) => ({
    dancer,
    gen: walkDancer(dancer),
    cursor: 0,
    done: false,
    atSync: false,
  }));
  const step = (t: Thread): void => {
    const r = t.gen.next();
    if (r.done) {
      t.done = true;
      return;
    }
    if (r.value.kind === "call") t.cursor = r.value.call.end;
    else t.atSync = true;
  };
  let guard = 0;
  while (threads.some((t) => !t.done)) {
    if (guard++ > 1_000_000) {
      report("the dance does not end");
      break;
    }
    const live = threads.filter((t) => !t.done);
    const beat = Math.min(...live.map((t) => t.cursor));
    const active = live.filter((t) => t.cursor === beat && !t.atSync);
    for (const t of active) step(t);
    const synced = threads.filter((t) => t.atSync && t.cursor === beat);
    // Everybody at this beat has yielded: commit what they queued, together.
    if (synced.length > 0 && !threads.some((t) => !t.done && t.cursor === beat && !t.atSync)) {
      const { after, violations } = commit(root, dancers, queue, beat);
      for (const v of violations) report(v.message, v.span, { beat: v.beat, dancers: v.dancers });
      events.push(...queue);
      queue.length = 0;
      dancers = after;
      memberships.push(membershipOf(dancers));
      membershipIndex += 1;
      for (const t of synced) t.atSync = false;
    }
  }

  const sequence: CompiledSequence = {
    dialect: floor.name,
    perDancer,
    memberships,
    annotations,
    events,
  };
  if (title !== undefined) sequence.title = title;
  return { sequence, errors, floor };
}

/**
 * The floor a dance declares: its own module evaluated for nobody, with the
 * files that define the formations it names, the prelude and the couple.
 */
function ownFloor(
  input: CompileInput,
  entry: ModuleItem,
  report: (message: string, span?: Span) => void,
): Floor | undefined {
  const named = entry.body
    .filter((s): s is Extract<Stmt, { kind: "group" }> => s.kind === "group")
    .map((s) => s.module);
  // Every formation any module of the file names is read, so the checker knows them all.
  const mentioned = input.dance.items.flatMap((i) =>
    i.kind === "module"
      ? i.body.filter((s): s is Extract<Stmt, { kind: "group" }> => s.kind === "group").map((s) => s.module)
      : [],
  );
  if (named.length === 0) {
    report(
      `${entry.name} declares no floor (no "group <formation>(…)") and none was given`,
      entry.span,
    );
    return undefined;
  }
  const files: File[] = [...(input.library ?? [])];
  for (const name of [...new Set([...named, ...mentioned])]) {
    if (files.some((f) => f.items.some((i) => i.kind === "module" && i.name === name))) continue;
    const file = input.resolve?.(name);
    if (file === undefined) {
      report(`no file defines the formation ${name}`, entry.span);
      return undefined;
    }
    files.push(file);
  }
  // The dance file itself, less the moves (their file is read separately).
  files.push({ items: input.dance.items, source: input.dance.source });
  try {
    return floorOf(files, entry.name, {}, input.dynamics ?? {});
  } catch (error) {
    report(messageOf(error), isEvalError(error) ? error.span : entry.span);
    return undefined;
  }
}

/** Bind a module's plain parameters from a call's arguments (its `$` ones are read from the tree). */
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
const dancerOf = (v: Value, dancers: Dancers): DancerId | undefined =>
  v.kind === "place" ? dancers.at(v.place.path)?.id : undefined;

/**
 * The dancers of a group **in ring order clockwise from `me`**: sorted by
 * bearing from the middle of them and rotated to start at the asking
 * dancer. A group with an empty place is nobody: a ring of three is not a
 * hands four.
 */
function ringOf(v: Value, me: DancerId, dancers: Dancers): readonly DancerId[] | undefined {
  if (v.kind !== "group") return undefined;
  const places = placesOf(v.group);
  if (places.length === 0) return undefined;
  const seated: { id: DancerId; place: Place }[] = [];
  for (const place of places) {
    const d = dancers.at(place.path);
    if (d === undefined) return undefined;
    seated.push({ id: d.id, place });
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
  return clockwise.map(
    (_, i) => (clockwise[(start + i) % clockwise.length] as { id: DancerId }).id,
  );
}

/** A value as the debugger shows a binding: the dancer on it, the group's kind, the member, or nobody. */
function nameOf(v: Value, dancers: Dancers): string {
  switch (v.kind) {
    case "place":
      return dancers.at(v.place.path)?.id ?? "nobody";
    case "group":
      return `${v.group.kind} [${placesOf(v.group)
        .map((p) => dancers.at(p.path)?.id ?? "·")
        .join(" ")}]`;
    case "member":
      return v.member;
    case "number":
      return String(v.value);
    case "bool":
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
