import type { Diagnostic, EveningResult, Source, Span } from "@caller/lang";
import {
  checkProgram,
  findDance,
  hallFacts,
  loadForEval,
  loadTexts,
  runEvening,
} from "@caller/lang";
import type { ListingLine } from "./asm/listing.js";
import { listing } from "./asm/listing.js";
import type { DancerId, Dialect } from "./dialect/Dialect.js";
import type { Executed } from "./executor/execute.js";
import { execute } from "./executor/execute.js";
import { FIGURES } from "./figures/registry.js";
import type { FigureRegistry } from "./figures/registry.js";
import type { Schedule } from "./schedule/schedule.js";
import { schedule } from "./schedule/schedule.js";
import type { DriftWarning } from "./schedule/drift.js";
import { driftOf } from "./schedule/drift.js";
import type { CompiledSequence } from "./sequence/CompiledSequence.js";
import { sequenceFromEvening } from "./sequence/fromLang.js";
import type { SolvedBodies } from "./solver/solveBody.js";
import { solveBodies } from "./solver/solveBody.js";
import type { Tempo } from "./units/Tempo.js";
import { tempo } from "./units/Tempo.js";

/**
 * The whole engine as one call: `.dance` text in, every layer's output out.
 *
 * Since M1 of the kinetics-on-lang plan the first three layers are
 * `@caller/lang`'s (notes D1): it loads the sources, checks them, builds the
 * floor and runs the evening, and `sequenceFromEvening` turns what it says
 * about motion into calls on figures. Everything from the scheduler down is
 * unchanged, and knows nothing about a language.
 *
 * `run` is the debugger's and the CLI's only entry point, and the only place
 * the stages are wired to each other. A stage that fails leaves every later
 * field undefined and puts its complaint in `errors`, so the page always has
 * something to draw — a dance with a parse error still shows its text, and a
 * dance the scheduler cannot time still shows the calls it made.
 */
export function run(opts: RunOptions): Run {
  const t = opts.bpm === undefined ? tempo() : tempo(opts.bpm);
  const errors: RunError[] = [];
  const warnings: RunWarning[] = [];
  const diagnostics: Diagnostic[] = [];
  const registry = opts.registry ?? FIGURES;

  const empty: Run = {
    sources: opts.sources,
    dance: opts.dance,
    tempo: t,
    errors,
    warnings,
    diagnostics,
    listings: {},
    endBeat: 0,
  };

  // Two loaders, both on the same texts, as the playground's `model.ts` has
  // it: `loadForEval` finds a dance **by name** among every file, and
  // `loadTexts` checks the dance's own module and the `use` lines it follows.
  // Checking every file at once would answer questions nobody asked — a
  // fixture nothing imported complaining about a dance nobody ran.
  const program = attempt("check", errors, () => loadForEval(opts.sources));
  if (program === undefined) return empty;
  for (const d of program.diagnostics) {
    diagnostics.push(d);
    errors.push(runErrorOf(d, "parse"));
  }

  const found = findDance(program, opts.dance, opts.module);
  if (found === undefined) {
    errors.push({ stage: "run", message: `there is no dance called "${opts.dance}"` });
    return { ...empty, program };
  }

  const checked = attempt("check", errors, () =>
    checkProgram(loadTexts(opts.sources, found.module.name)),
  );
  for (const d of checked?.diagnostics ?? []) {
    diagnostics.push(d);
    errors.push(runErrorOf(d, d.stage === "parse" ? "parse" : "check"));
  }
  if ((checked?.diagnostics ?? []).some((d) => d.severity === "error"))
    return { ...empty, program };

  const evening = attempt("run", errors, () =>
    runEvening(program, found, {
      ...(opts.times === undefined ? {} : { times: opts.times }),
      args: hallFacts(opts.args ?? {}),
    }),
  );
  if (evening === undefined) return { ...empty, program };

  const joined = sequenceFromEvening(evening, registry);
  errors.push(...joined.errors);
  diagnostics.push(...evening.diagnostics);
  const { sequence, dialect } = joined;
  const endBeat = evening.times.reduce((sum, time) => sum + time.length, 0);

  const base: Run = {
    ...empty,
    program,
    evening,
    dialect,
    sequence,
    endBeat,
  };

  const scheduled = attempt("schedule", errors, () => schedule(sequence, dialect, t));
  if (!scheduled) return base;
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
  for (const w of [...scheduled.warnings, ...driftOf(scheduled, sequence)]) {
    warnings.push({
      stage: "schedule",
      kind: w.kind,
      message: w.message,
      ...(w.dancer === undefined ? {} : { dancer: w.dancer }),
      ...(w.beat === undefined ? {} : { beat: w.beat }),
      ...("span" in w && w.span !== undefined ? { span: w.span } : {}),
    });
  }

  const listings: Record<DancerId, readonly ListingLine[]> = {};
  for (const dancer of dialect.dancers) {
    const program2 = scheduled.programs[dancer];
    listings[dancer] = program2 ? listing(program2, dialect, sequence) : [];
  }

  const withSchedule: Run = { ...base, schedule: scheduled, listings };

  const executed = attempt("execute", errors, () => execute(scheduled, dialect, t));
  if (!executed) return withSchedule;
  const solved = attempt("solve", errors, () => solveBodies(executed.input));
  return solved ? { ...withSchedule, executed, solved } : { ...withSchedule, executed };
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

/** One of the language's diagnostics as the run's own complaint. */
const runErrorOf = (d: Diagnostic, stage: RunError["stage"]): RunError => ({
  stage,
  kind: d.code,
  message: `${d.code}: ${d.message}`,
  ...(d.span === undefined ? {} : { span: d.span }),
  ...(d.beat === undefined ? {} : { beat: d.beat }),
  ...(d.dancers[0] === undefined ? {} : { dancer: d.dancers[0] }),
});

/** What to run, on what, how many times and how fast. */
export interface RunOptions {
  /** Every `.dance` file the dance may read; the loader finds its modules among them. */
  sources: readonly Source[];
  /** The `fn` with a `setup` to run. */
  dance: string;
  /** Which module it is in, when two modules have a dance of that name. */
  module?: string;
  /** The hall's facts, which arrive as the dance's parameters (`minor-sets`). */
  args?: Readonly<Record<string, number>>;
  /** How many times through; the language's own default when omitted. */
  times?: number;
  /** Defaults to `@caller/core`'s `DEFAULT_BPM`. */
  bpm?: number;
  registry?: FigureRegistry;
}

/** Every layer's output, and everything that went wrong on the way. */
export interface Run {
  sources: readonly Source[];
  dance: string;
  tempo: Tempo;
  /** The language's module index, for a pane that wants the text of a file. */
  program?: ReturnType<typeof loadForEval>;
  /** The floor, the times, the moves and the commits. */
  evening?: EveningResult;
  dialect?: Dialect;
  sequence?: CompiledSequence;
  schedule?: Schedule;
  executed?: Executed;
  solved?: SolvedBodies;
  errors: readonly RunError[];
  warnings: readonly RunWarning[];
  /** The language's own diagnostics, whole — traces, suggestions and all. */
  diagnostics: readonly Diagnostic[];
  listings: Readonly<Record<DancerId, readonly ListingLine[]>>;
  endBeat: number;
}

/**
 * One complaint from any stage, in one shape: a list the debugger prints as
 * single lines and the CLI prints with a caret, without caring which layer
 * minded.
 */
export interface RunError {
  stage: "parse" | "check" | "run" | "compile" | "schedule" | "execute" | "solve";
  /** The scheduler's `ScheduleErrorKind` or the language's code, where there is one. */
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
  span?: Span;
  dancer?: DancerId;
  beat?: number;
}

export type { DriftWarning };
