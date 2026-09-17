import type { DancerId, Dialect } from "../dialect/Dialect.js";
import type { FigureRegistry } from "../figures/registry.js";
import { figureNamed } from "../figures/registry.js";
import type { FigureIR, Params, Role } from "../ir/Figure.js";
import { beatsOf, defaultParams } from "../ir/Figure.js";
import type { CallStmt, DefineStmt, SourceProgram, Span, Stmt } from "./ast.js";

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
  /** The debugger's breadcrumb: `bow`, `repeat[0]/dance/do-si-do`. */
  path: string;
  /** Of the call statement, so the Source pane can light it. */
  span: Span;
  /**
   * This dancer's view of the figure's roles. `partner: undefined` is nobody
   * — the select found no-one — and the scheduler makes that a stand (DA14).
   */
  cast: Readonly<Record<Role, DancerId | undefined>>;
  /** The whole group, in ring order from `self`, for a figure danced by a group. */
  group?: readonly DancerId[];
}

/** Every dancer's script, compiled from the one program they all share. */
export interface CompiledSequence {
  dialect: string;
  perDancer: Readonly<Record<DancerId, readonly CompiledCall[]>>;
}

/** Something the program says that the compiler cannot make sense of. */
export interface CompileError {
  message: string;
  span?: Span;
}

/**
 * What a `select` binds: one dancer, nobody, or — when the dialect knows the
 * word as a **group** — the dancers of that group in the order the figure is
 * danced in (P9's `hands-four`).
 *
 * `if (name)` branches on the binding being somebody, which for a group is the
 * group existing at all: a dancer at the end of a line is in no hands four.
 */
export type Binding = DancerId | undefined | readonly DancerId[];

/**
 * Compile a program **per dancer** (DA14): each dancer walks the same
 * statements with their own bindings, so one text is every dancer's script and
 * a binding that finds nobody is an end effect rather than a special case.
 *
 * A `select` binds a name to whoever the dialect finds from this dancer's
 * point of view, or to nobody — or, where the dialect knows the word as a
 * group (`four = select(hands-four)`), to the several dancers of that group in
 * ring order; an `if` branches on that binding being somebody; a `repeat` is unrolled; a definition is inlined where it is called
 * (it sees the bindings at the call, and calling itself is an error); a call's
 * positional arguments are mapped onto the figure's parameters and its beats
 * are laid end to end from beat 0.
 *
 * Errors are returned, never thrown, and a call that has one is dropped from
 * the sequence rather than guessed at. An error both dancers make is reported
 * once.
 */
export function compile(
  program: SourceProgram,
  registry: FigureRegistry,
  dialect: Dialect,
): { sequence: CompiledSequence; errors: CompileError[] } {
  const errors: CompileError[] = [];
  const reported = new Set<string>();
  const report = (message: string, span?: Span): void => {
    const key = `${message}@${span?.start ?? -1}`;
    if (reported.has(key)) return;
    reported.add(key);
    errors.push(span === undefined ? { message } : { message, span });
  };

  // The whole file is read before anything is compiled, so a definition may
  // be written after the statement that calls it.
  const definitions = new Map<string, DefineStmt>();
  collectDefinitions(program.statements, definitions, report);

  const perDancer: Record<DancerId, readonly CompiledCall[]> = {};
  for (const dancer of dialect.dancers) {
    // Each dancer walks the program from their own seat; a figure that
    // progresses moves the seating for everything that follows it.
    let state = dialect.initial();
    const bindings = new Map<string, Binding>();
    const calls: CompiledCall[] = [];
    let beat = 0;

    const walk = (stmts: readonly Stmt[], path: readonly string[], stack: readonly string[]) => {
      for (const stmt of stmts) {
        switch (stmt.kind) {
          case "define":
            break;
          case "select":
            try {
              // A group word and a selector word are bound the same way and
              // told apart by the dialect: `hands-four` binds the ring of
              // four, `neighbor` binds one dancer or nobody.
              bindings.set(
                stmt.name,
                isGroupWord(dialect, stmt.selector)
                  ? dialect.group?.(stmt.selector, dancer, state)
                  : dialect.select(stmt.selector, dancer, state),
              );
            } catch (error) {
              report(messageOf(error), stmt.span);
            }
            break;
          case "if":
            if (!bindings.has(stmt.name)) {
              report(`${stmt.name} is not bound`, stmt.span);
              break;
            }
            walk(isSomebody(bindings.get(stmt.name)) ? stmt.then : stmt.else, path, stack);
            break;
          case "repeat":
            if (stmt.times < 0) {
              report(`repeat needs a count of 0 or more, not ${stmt.times}`, stmt.span);
              break;
            }
            for (let i = 0; i < stmt.times; i += 1) {
              walk(stmt.body, [...path, `repeat[${i}]`], stack);
            }
            break;
          case "call": {
            const definition = definitions.get(stmt.name);
            if (definition !== undefined) {
              if (stack.includes(stmt.name)) {
                report(`${stmt.name} calls itself`, stmt.span);
                break;
              }
              if (stmt.args.length > 0) {
                report(`${stmt.name} is a definition and takes no arguments`, stmt.span);
              }
              walk(definition.body, [...path, stmt.name], [...stack, stmt.name]);
              break;
            }
            const figure = figureNamed(registry, stmt.name);
            if (figure === undefined) {
              report(`unknown figure ${stmt.name}`, stmt.span);
              break;
            }
            const bound = bindArguments(figure, stmt, bindings, report, dialect);
            if (bound === undefined) break;
            const beats = beatsOf(figure, bound.params);
            // A group is in ring order from `self`: left neighbour, opposite,
            // right neighbour (left = toward your left when facing the centre).
            const ring = bound.group;
            const cast: Record<Role, DancerId | undefined> = {
              self: dancer,
              partner: bound.partner,
              left: ring?.[1],
              opposite: ring?.[2],
              right: ring?.[3],
            };
            const call: CompiledCall = {
              id: calls.length,
              figure,
              params: bound.params,
              beats,
              start: beat,
              end: beat + beats,
              path: [...path, stmt.name].join("/"),
              span: stmt.span,
              cast,
            };
            if (ring) call.group = ring;
            calls.push(call);
            if (figure.progresses && dialect.progress) state = dialect.progress(state);
            beat += beats;
            break;
          }
        }
      }
    };

    walk(program.statements, [], []);
    perDancer[dancer] = calls;
  }

  return { sequence: { dialect: dialect.id, perDancer }, errors };
}

/** Definitions are file-scoped wherever they are written, and hoisted. */
const collectDefinitions = (
  stmts: readonly Stmt[],
  into: Map<string, DefineStmt>,
  report: (message: string, span?: Span) => void,
): void => {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case "define":
        if (into.has(stmt.name)) report(`${stmt.name} is defined twice`, stmt.span);
        else into.set(stmt.name, stmt);
        collectDefinitions(stmt.body, into, report);
        break;
      case "repeat":
        collectDefinitions(stmt.body, into, report);
        break;
      case "if":
        collectDefinitions(stmt.then, into, report);
        collectDefinitions(stmt.else, into, report);
        break;
      default:
        break;
    }
  }
};

/**
 * Map a call's positional arguments onto a figure's parameters. The first
 * parameter is the counterpart and takes a bound name — nobody is allowed, and
 * becomes a cast with no partner; a word that is neither a binding nor one of
 * an enum's choices is an error naming what was expected.
 */
const bindArguments = (
  figure: FigureIR,
  stmt: CallStmt,
  bindings: ReadonlyMap<string, Binding>,
  report: (message: string, span?: Span) => void,
  dialect: Dialect,
): { params: Params; partner: DancerId | undefined; group?: readonly DancerId[] } | undefined => {
  const params: Record<string, string | number> = { ...defaultParams(figure) };
  let partner: DancerId | undefined;
  let group: readonly DancerId[] | undefined;
  let ok = true;

  if (stmt.args.length > figure.params.length) {
    report(
      `${figure.id} takes ${figure.params.length} arguments, not ${stmt.args.length}`,
      stmt.span,
    );
    ok = false;
  }

  figure.params.forEach((spec, i) => {
    const arg = stmt.args[i];
    const choices = spec.choices?.join(" | ") ?? "";
    if (spec.kind === "dancer") {
      if (arg === undefined) {
        report(`${figure.id} needs someone to ${figure.id} with`, stmt.span);
        ok = false;
      } else if (arg.kind !== "word") {
        report(`${figure.id}'s ${spec.name} is a bound name, not ${arg.value}`, arg.span);
        ok = false;
      } else if (!bindings.has(arg.value)) {
        report(`${arg.value} is not bound`, arg.span);
        ok = false;
      } else {
        const bound = bindings.get(arg.value);
        if (bound === undefined || typeof bound === "string") {
          partner = bound;
        } else {
          // A figure danced by a group — a circle, a balance the ring — is
          // P10's; until there is one, a group where a figure wants a dancer
          // is a mistake worth naming rather than a first-of-four.
          report(`${arg.value} is a group, and ${figure.id} takes one dancer`, arg.span);
          ok = false;
        }
      }
      return;
    }
    if (spec.kind === "group") {
      if (arg === undefined) {
        report(`${figure.id} needs a group to ${figure.id} with`, stmt.span);
        ok = false;
      } else if (arg.kind !== "word" || !bindings.has(arg.value)) {
        report(`${arg.value} is not bound`, arg.span);
        ok = false;
      } else {
        const bound = bindings.get(arg.value);
        if (typeof bound === "string") {
          report(`${arg.value} is one dancer, and ${figure.id} takes a group`, arg.span);
          ok = false;
        } else {
          // Nobody (a dancer at the end of a line is in no group) is allowed:
          // the cast has no partner and the scheduler stands the dancer.
          group = bound;
        }
      }
      return;
    }
    if (arg === undefined) {
      if (spec.default === undefined) {
        report(`${figure.id} needs a ${spec.name}: ${choices || "a number"}`, stmt.span);
        ok = false;
      }
      return;
    }
    if (spec.kind === "role") {
      const roles = dialect.roleNames ?? [];
      if (arg.kind !== "word" || !roles.includes(arg.value)) {
        report(`${arg.value} is not a role in ${dialect.id}: ${roles.join(" | ")}`, arg.span);
        ok = false;
        return;
      }
      params[spec.name] = arg.value;
      return;
    }
    if (spec.kind === "enum") {
      if (arg.kind !== "word" || !(spec.choices ?? []).includes(arg.value)) {
        report(`${arg.value} is not a ${spec.name} for ${figure.id}: ${choices}`, arg.span);
        ok = false;
        return;
      }
      params[spec.name] = arg.value;
      return;
    }
    if (arg.kind !== "number") {
      report(`${figure.id}'s ${spec.name} is a number, not ${arg.value}`, arg.span);
      ok = false;
      return;
    }
    params[spec.name] = arg.value;
  });

  return ok ? (group ? { params, partner, group } : { params, partner }) : undefined;
};

/** Whether a `select` found anybody: a dancer, or a group that exists. */
const isSomebody = (binding: Binding): boolean =>
  binding !== undefined && (typeof binding === "string" || binding.length > 0);

/** Whether this dialect reads the word as a group rather than as a selector. */
const isGroupWord = (dialect: Dialect, word: string): boolean =>
  dialect.group !== undefined && (dialect.groups ?? []).includes(word);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
