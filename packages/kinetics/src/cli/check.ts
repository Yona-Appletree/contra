import type { Diagnostic } from "@caller/lang";
import { renderJson, renderText } from "@caller/lang";
import { danceSources } from "../dances/load.js";
import type { Run, RunError, RunWarning } from "../pipeline.js";
import { run } from "../pipeline.js";
import { proveMotion } from "../motion/prove.js";

/**
 * `pnpm kinetics check <dance>` — the whole stack, headless, in one screen
 * (notes D12).
 *
 * The tool an agent runs before it opens a browser: it loads every `.dance`
 * file, checks it, runs the evening, joins it to the figures, schedules,
 * executes, solves and proves, and prints every layer's complaints in **one
 * shape** — rustc's, the language's own — with the `.dance` line and a caret
 * wherever a span survived the journey down. It exits non-zero the moment
 * anything is an error, so CI, an agent and a person read the same answer.
 *
 * The codes are banded like the language's: `L…` are the language's own, and
 * `K001–K099` are the join's, `K1xx` the scheduler's, `K2xx` its warnings,
 * `K3xx` the proof's — `K301` a cap, `K302` the executor's reach, `K303` the
 * solver's, `K304` two bodies closer than a body's clearance.
 */
export function checkCommand(argv: readonly string[]): number {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`kinetics: ${messageOf(error)}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (options.dance === undefined) {
    process.stderr.write(`kinetics: check wants the name of a dance\n\n${USAGE}`);
    return 2;
  }

  const sources = danceSources();
  const result = run({
    sources,
    dance: options.dance,
    args: { "minor-sets": options.minorSets },
    times: options.times,
    ...(options.module === undefined ? {} : { module: options.module }),
    ...(options.bpm === undefined ? {} : { bpm: options.bpm }),
  });

  const diagnostics = [...engineDiagnostics(result), ...proofDiagnostics(result)];
  const all = [...languageDiagnostics(result), ...diagnostics];

  if (options.json) {
    process.stdout.write(`${renderJson(all, sources)}\n`);
    return all.some((d) => d.severity === "error") ? 1 : 0;
  }

  process.stdout.write(`${summary(result, options)}\n\n`);
  process.stdout.write(renderText(all, sources));
  return all.some((d) => d.severity === "error") ? 1 : 0;
}

/** One line of what ran, before the complaints. */
function summary(result: Run, options: Options): string {
  const dancers = result.dialect?.dancers.length ?? 0;
  const calls = Object.values(result.sequence?.perDancer ?? {}).reduce(
    (sum, list) => sum + list.length,
    0,
  );
  return [
    `${options.dance ?? "?"} — ${String(result.evening?.times.length ?? 0)} times through,`,
    `${String(result.endBeat)} beats, ${String(dancers)} dancers, ${String(calls)} calls`,
    `(minor-sets ${String(options.minorSets)}, ${String(result.tempo.bpm)} bpm)`,
  ].join(" ");
}

/**
 * The language's own diagnostics, whole — trace, suggestion and all. They
 * arrive as `Diagnostic` objects and are printed as they were written.
 */
const languageDiagnostics = (result: Run): Diagnostic[] => [...result.diagnostics];

/** The join's and the scheduler's complaints, as the language's shape. */
function engineDiagnostics(result: Run): Diagnostic[] {
  const out: Diagnostic[] = [];
  const langCodes = new Set(result.diagnostics.map((d) => `${d.code}${String(d.span?.start)}`));
  for (const e of result.errors) {
    // The language's own, already printed above in their full shape.
    if (e.stage === "parse" || e.stage === "check" || e.stage === "run") {
      if (e.kind !== undefined && langCodes.has(`${e.kind}${String(e.span?.start)}`)) continue;
    }
    out.push(diagnosticOf(e, "error"));
  }
  for (const w of result.warnings) out.push(diagnosticOf(w, "warning"));
  return out;
}

const ERROR_CODES: Readonly<Record<string, string>> = {
  NoFigure: "K001",
  NoCast: "K002",
  NoRing: "K004",
  BadParam: "K003",
  TimingViolation: "K101",
  RateTooHigh: "K102",
  StepTooLong: "K103",
  PivotTooLarge: "K104",
  TakeOutOfReach: "K105",
  Unplannable: "K106",
  HandTaken: "K107",
  LongStride: "K201",
  IntrinsicTruncated: "K202",
  Drift: "K203",
};

function diagnosticOf(e: RunError | RunWarning, severity: "error" | "warning"): Diagnostic {
  const code = (e.kind === undefined ? undefined : ERROR_CODES[e.kind]) ?? "K000";
  return {
    code,
    severity,
    stage: "script",
    message: `${e.stage}${e.kind === undefined ? "" : ` ${e.kind}`}: ${e.message}`,
    ...(e.span === undefined ? {} : { span: e.span }),
    ...(e.beat === undefined ? {} : { beat: e.beat }),
    dancers: e.dancer === undefined ? [] : [e.dancer],
    trace: [],
  };
}

/**
 * The proof, per dancer: how many samples are over a cap and which point is
 * worst. One line each rather than one per sample — a shortfall is a ratio at
 * a beat, and the debugger's graphs are where the shape of it is read.
 *
 * It is the **executor's** trajectories that are proved, not the solver's:
 * the caps are on the effectors a dancer drives (hips, feet, hands), and a
 * shoulder or a head is solved from them (README, "proved once on the
 * executor"). What the solver minds it says itself, below.
 */
function proofDiagnostics(result: Run): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [dancer, trajectory] of Object.entries(result.executed?.trajectories ?? {})) {
    const violations = proveMotion(trajectory);
    if (violations.length === 0) continue;
    const worst = violations.reduce((a, b) => (ratio(b) > ratio(a) ? b : a));
    out.push({
      code: "K301",
      severity: "warning",
      stage: "script",
      message:
        `proof: ${String(violations.length)} samples over a cap; worst ${worst.point} ` +
        `${worst.kind} ×${ratio(worst).toFixed(2)} (${worst.value.toFixed(1)} of ${worst.cap.toFixed(1)})`,
      beat: worst.beat,
      dancers: [dancer],
      trace: [],
    });
  }
  // Two bodies through one point: one line per stretch, both dancers named,
  // and the figures each was dancing, which is the trace a fix starts from.
  for (const c of result.clearance ?? []) {
    out.push({
      code: "K304",
      severity: "warning",
      stage: "script",
      message:
        `clearance: ${c.dancer} and ${c.with} are ${c.value.toFixed(1)} px apart at beat ` +
        `${c.beat.toFixed(2)}, under the ${c.cap.toFixed(1)} two bodies keep ` +
        `(${c.figures[0]}, ${c.figures[1]})`,
      beat: c.beat,
      dancers: [c.dancer, c.with],
      trace: [],
    });
  }
  for (const [code, label, list] of [
    ["K302", "executor", result.executed?.violations ?? []],
    ["K303", "solver", result.solved?.violations ?? []],
  ] as const) {
    for (const [dancer, own] of groupBy(list)) {
      const worst = own.reduce((a, b) => (ratio(b) > ratio(a) ? b : a));
      out.push({
        code,
        severity: "warning",
        stage: "script",
        message:
          `${label}: ${String(own.length)} samples a body cannot do; worst ${worst.point} ` +
          `${worst.kind} ×${ratio(worst).toFixed(2)} (${worst.value.toFixed(1)} of ${worst.cap.toFixed(1)})`,
        beat: worst.beat,
        dancers: [dancer],
        trace: [],
      });
    }
  }
  return out;
}

const ratio = (v: { value: number; cap: number }): number => v.value / v.cap;

/** A violation list split by dancer, in the order they first appear. */
function groupBy<T extends { dancer: string }>(list: readonly T[]): [string, T[]][] {
  const byDancer = new Map<string, T[]>();
  for (const v of list) {
    const own = byDancer.get(v.dancer);
    if (own === undefined) byDancer.set(v.dancer, [v]);
    else own.push(v);
  }
  return [...byDancer];
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Options {
  dance?: string;
  module?: string;
  minorSets: number;
  times: number;
  bpm?: number;
  json: boolean;
  help: boolean;
}

const USAGE = `pnpm kinetics check <dance> [options]

  <dance>              the fn with a setup to run, from packages/lang/dances/
  --module <name>      which module it is in, when two have that name
  --minor-sets <n>     the hall's size (3)
  --times <n>          how many times through (1)
  --bpm <n>            the tempo the caps are converted at
  --json               the diagnostics as JSON, for an agent

Every layer's complaints, in one shape, with the .dance line where there is
one. Exits non-zero when anything is an error.
`;

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { minorSets: 3, times: 1, json: false, help: false };
  const rest = argv[0] === "check" ? argv.slice(1) : argv;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    const next = (): string => {
      const value = rest[i + 1];
      if (value === undefined) throw new Error(`${arg} wants a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--module":
        options.module = next();
        break;
      case "--minor-sets":
        options.minorSets = number(arg, next());
        break;
      case "--times":
        options.times = number(arg, next());
        break;
      case "--bpm":
        options.bpm = number(arg, next());
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
        if (options.dance !== undefined) throw new Error(`one dance at a time, not "${arg}"`);
        options.dance = arg;
    }
  }
  return options;
}

function number(flag: string, text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`${flag} wants a number, not "${text}"`);
  return value;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
