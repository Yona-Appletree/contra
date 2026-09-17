import type { ListingLine } from "./asm/listing.js";
import { listing } from "./asm/listing.js";
import type { DancerId, Dialect } from "./dialect/Dialect.js";
import { PAIR } from "./dialect/pair/Pair.js";
import type { Executed } from "./executor/execute.js";
import { execute } from "./executor/execute.js";
import { FIGURES } from "./figures/registry.js";
import type { SourceProgram, Span } from "./lang/ast.js";
import type { CompiledSequence } from "./lang/compile.js";
import { compile } from "./lang/compile.js";
import { isParseError, parse } from "./lang/parse.js";
import type { Schedule } from "./schedule/schedule.js";
import { schedule } from "./schedule/schedule.js";
import type { SolvedBodies } from "./solver/solveBody.js";
import { solveBodies } from "./solver/solveBody.js";
import type { Tempo } from "./units/Tempo.js";
import { tempo } from "./units/Tempo.js";

/**
 * The whole engine as one call: source text in, every layer's output out.
 *
 * `run` is the debugger's only entry point, and the only place the six stages
 * are wired to each other. A stage that fails leaves every later field
 * undefined and puts its complaint in `errors`, so the page always has
 * something to draw — a program with a parse error still shows its text, and a
 * program the scheduler cannot time still shows the calls it compiled.
 */
export function run(source: string, opts: RunOptions = {}): Run {
  const dialect = opts.dialect ?? PAIR;
  const t = opts.bpm === undefined ? tempo() : tempo(opts.bpm);
  const errors: RunError[] = [];
  const warnings: RunWarning[] = [];

  let program: SourceProgram | undefined;
  let parseFailure: RunError | undefined;
  try {
    program = parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parseFailure = { stage: "parse", message };
    if (isParseError(error)) {
      parseFailure.span = { start: error.offset, end: error.offset, line: error.line };
    }
    errors.push(parseFailure);
  }

  const empty: Run = {
    source,
    dialect,
    tempo: t,
    program,
    errors,
    warnings,
    listings: {},
    endBeat: 0,
  };
  if (!program) return parseFailure ? { ...empty, parseError: parseFailure } : empty;

  const compiled = compile(program, FIGURES, dialect);
  for (const e of compiled.errors) {
    errors.push(
      e.span === undefined
        ? { stage: "compile", message: e.message }
        : {
            stage: "compile",
            message: e.message,
            span: e.span,
          },
    );
  }
  const sequence: CompiledSequence = compiled.sequence;

  const scheduled = attempt("schedule", errors, () => schedule(sequence, dialect, t));
  if (!scheduled) return { ...empty, program, sequence };
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

  const base: Run = {
    source,
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

/** What to run the program for: who is on the floor, and how fast. */
export interface RunOptions {
  /** Defaults to the pair. */
  dialect?: Dialect;
  /** Defaults to `@caller/core`'s `DEFAULT_BPM`. */
  bpm?: number;
}

/** Every layer's output, and everything that went wrong on the way. */
export interface Run {
  source: string;
  dialect: Dialect;
  tempo: Tempo;
  program: SourceProgram | undefined;
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
}

/**
 * One complaint from any stage, in one shape: the debugger prints the list as
 * a single line and does not care which layer minded.
 */
export interface RunError {
  stage: "parse" | "compile" | "schedule" | "execute" | "solve";
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

export { FIXTURE_PROGRAM } from "./lang/fixture.js";
