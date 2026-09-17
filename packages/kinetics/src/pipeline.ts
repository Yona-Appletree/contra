import type { ListingLine } from "./asm/listing.js";
import { listing } from "./asm/listing.js";
import type { DancerId, Dialect } from "./dialect/Dialect.js";
import { treeDialect } from "./dialect/tree/TreeDialect.js";
import type { Executed } from "./executor/execute.js";
import { execute } from "./executor/execute.js";
import { FIGURES } from "./figures/registry.js";
import type { FigureRegistry } from "./figures/registry.js";
import { check } from "./lang/check.js";
import type { Diagnostic } from "./diagnostics/Diagnostic.js";
import { collectDiagnostics } from "./diagnostics/collect.js";
import type { CompileInput, CompiledSequence } from "./lang/compile.js";
import { compile } from "./lang/compile.js";
import { isSyntaxError } from "./lang/lexer.js";
import { parse } from "./lang/parser.js";
import type { File, Span } from "./lang/syntax.js";
import type { Schedule } from "./schedule/schedule.js";
import { schedule } from "./schedule/schedule.js";
import type { SolvedBodies } from "./solver/solveBody.js";
import { solveBodies } from "./solver/solveBody.js";
import type { Floor } from "./tree/floor.js";
import { groupsOf } from "./tree/Tree.js";
import type { Tempo } from "./units/Tempo.js";
import { tempo } from "./units/Tempo.js";

/**
 * The whole engine as one call: a dance's text in, every layer's output out.
 *
 * `run` is the debugger's only entry point, and the only place the stages
 * are wired to each other. A stage that fails leaves every later field
 * undefined and puts its complaint in `errors`, so the page always has
 * something to draw — a dance with a syntax error still shows its text, and
 * a dance the scheduler cannot time still shows the calls it compiled.
 *
 * A dance that says `group becket(…)` owns its floor: the compiler builds it
 * from `library` (the prelude and the couple) and `resolve` (the file that
 * defines the formation named), with `dynamics` as the `$` values the hall
 * sets (`$minor-sets`). A dance that says nothing runs on `floor`.
 */
export function run(source: string, opts: RunOptions): Run {
  const done = stages(source, opts);
  return { ...done, diagnostics: collectDiagnostics({ ...done, diagnostics: [] }) };
}

/** Every stage, with `diagnostics` left for `run` to collect from the whole. */
function stages(source: string, opts: RunOptions): Omit<Run, "diagnostics"> {
  const { moves } = opts;
  const t = opts.bpm === undefined ? tempo() : tempo(opts.bpm);
  const errors: RunError[] = [];
  const warnings: RunWarning[] = [];

  let program: File | undefined;
  let parseFailure: RunError | undefined;
  try {
    program = parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parseFailure = { stage: "parse", message };
    if (isSyntaxError(error)) {
      parseFailure.span = { start: error.offset, end: error.offset, line: error.line };
    }
    errors.push(parseFailure);
  }

  const nobody: Dialect = {
    id: "?",
    dancers: [],
    roleOf: () => "lark",
    initial: () => ({ dancers: {} }),
  };
  const empty = (floor: Floor | undefined): Omit<Run, "diagnostics"> => ({
    source,
    ...(floor === undefined ? {} : { floor }),
    dialect: floor === undefined ? nobody : treeDialect(floor),
    tempo: t,
    program,
    errors,
    warnings,
    listings: {},
    endBeat: 0,
  });
  if (!program)
    return parseFailure ? { ...empty(opts.floor), parseError: parseFailure } : empty(opts.floor);

  const input: CompileInput = {
    dance: program,
    moves,
    registry: opts.registry ?? FIGURES,
    ...(opts.entry === undefined ? {} : { entry: opts.entry }),
    ...(opts.floor === undefined ? {} : { floor: opts.floor }),
    ...(opts.library === undefined ? {} : { library: opts.library }),
    ...(opts.resolve === undefined ? {} : { resolve: opts.resolve }),
    ...(opts.dynamics === undefined ? {} : { dynamics: opts.dynamics }),
  };
  const compiled = compile(input);
  for (const e of compiled.errors) {
    errors.push({
      stage: "compile",
      message: e.message,
      ...(e.span === undefined ? {} : { span: e.span }),
      ...(e.beat === undefined ? {} : { beat: e.beat }),
      ...(e.dancers?.[0] === undefined ? {} : { dancer: e.dancers[0] }),
    });
  }
  const floor = compiled.floor;
  if (floor === undefined) return empty(undefined);
  const dialect = treeDialect(floor);

  // The checker sees the prelude's enums through the floor's modules, and
  // the $ variables the formation provides with their declared types.
  const dynamics: Record<string, string> = {};
  for (const group of groupsOf(floor.root)) {
    dynamics[group.kind] = "Group";
    for (const p of group.provides) dynamics[p.name] = p.type;
  }
  for (const name of Object.keys(opts.dynamics ?? {})) dynamics[name] = "Int";
  const preludeItems: File = {
    items: [...floor.mods.enums].map(([name, members]) => ({
      kind: "enum" as const,
      name,
      members,
      span: { start: 0, end: 0, line: 0 },
    })),
    source: "",
  };
  const formationItems: File = {
    items: [...floor.mods.modules.values()].filter(
      (m) => !program.items.includes(m) && !moves.items.includes(m),
    ),
    source: "",
  };
  for (const e of check([preludeItems, formationItems, moves, program], { dynamics })) {
    errors.push({ stage: "check", message: e.message, span: e.span });
  }
  const sequence: CompiledSequence = compiled.sequence;

  const scheduled = attempt("schedule", errors, () => schedule(sequence, dialect, t));
  if (!scheduled) return { ...empty(floor), program, sequence };
  for (const e of scheduled.errors) {
    errors.push({
      stage: "schedule",
      kind: e.kind,
      message: e.message,
      ...(e.span === undefined ? {} : { span: e.span }),
      ...(e.dancer === undefined ? {} : { dancer: e.dancer }),
      ...(e.beat === undefined ? {} : { beat: e.beat }),
    });
  }
  for (const w of scheduled.warnings) {
    warnings.push({
      stage: "schedule",
      kind: w.kind,
      message: w.message,
      ...(w.dancer === undefined ? {} : { dancer: w.dancer }),
      ...(w.beat === undefined ? {} : { beat: w.beat }),
    });
  }

  const listings: Record<DancerId, readonly ListingLine[]> = {};
  for (const dancer of dialect.dancers) {
    const program2 = scheduled.programs[dancer];
    listings[dancer] = program2 ? listing(program2, dialect, sequence) : [];
  }

  const base: Omit<Run, "diagnostics"> = {
    source,
    floor,
    dialect,
    tempo: t,
    program,
    sequence,
    schedule: scheduled,
    errors,
    warnings,
    listings,
    endBeat: scheduled.endBeat,
  };

  const executed = attempt("execute", errors, () => execute(scheduled, dialect, t));
  if (!executed) return base;
  const solved = attempt("solve", errors, () => solveBodies(executed.input));
  return solved ? { ...base, executed, solved } : { ...base, executed };
}

/**
 * A stage's output, or nothing and a note of why. A layer that throws is a
 * bug, not a program's fault — but the debugger is where that bug is looked
 * at, so it belongs on the page rather than in the console.
 */
const attempt = <T>(stage: RunError["stage"], errors: RunError[], f: () => T): T | undefined => {
  try {
    return f();
  } catch (error) {
    errors.push({ stage, message: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
};

/** What to run the dance on: which floor (when the dance does not own one), which moves, how fast. */
export interface RunOptions {
  /** The floor, when the dance does not say `group <formation>(…)` itself. */
  floor?: Floor;
  /** The prelude and the couple, read with a floor the dance declares. */
  library?: readonly File[];
  /** The file that defines a formation the dance names. */
  resolve?: (moduleName: string) => File | undefined;
  /** `$` values for the dance's space (`{ "minor-sets": 2 }`). */
  dynamics?: Readonly<Record<string, number>>;
  /** The moves the dance may call: `dances/moves.dance`, parsed. */
  moves: File;
  /** The dance module to run; the file's first by default. */
  entry?: string;
  /** Defaults to `@caller/core`'s `DEFAULT_BPM`. */
  bpm?: number;
  registry?: FigureRegistry;
}

/** Every layer's output, and everything that went wrong on the way. */
export interface Run {
  source: string;
  /** The floor the dance ran on; absent when none could be built. */
  floor?: Floor;
  dialect: Dialect;
  tempo: Tempo;
  program: File | undefined;
  /** Set when the text does not parse; nothing after it is present. */
  parseError?: RunError;
  sequence?: CompiledSequence;
  schedule?: Schedule;
  executed?: Executed;
  solved?: SolvedBodies;
  errors: readonly RunError[];
  warnings: readonly RunWarning[];
  listings: Readonly<Record<DancerId, readonly ListingLine[]>>;
  endBeat: number;
  /** Every complaint, from every layer, with its trace — what the CLI prints and the debugger's strip lists. */
  diagnostics: readonly Diagnostic[];
}

/**
 * One complaint from any stage, in one shape: the debugger prints the list as
 * a single line and does not care which layer minded.
 */
export interface RunError {
  stage: "parse" | "check" | "compile" | "schedule" | "execute" | "solve";
  /** The scheduler's `ScheduleErrorKind`, where there is one. */
  kind?: string;
  message: string;
  span?: Span;
  dancer?: DancerId;
  beat?: number;
}

/** Something a stage could do, but would rather the program did not ask for. */
export interface RunWarning {
  stage: "schedule";
  kind: string;
  message: string;
  dancer?: DancerId;
  beat?: number;
}
