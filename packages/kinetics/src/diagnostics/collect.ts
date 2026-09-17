import type { DancerId } from "../dialect/Dialect.js";
import type { CompiledCall } from "../lang/compile.js";
import type { Run, RunError, RunWarning } from "../pipeline.js";
import type { ScheduledCall } from "../schedule/schedule.js";
import type { Diagnostic, Fact, Stage } from "./Diagnostic.js";
import { floorChecks } from "./checks/index.js";

/**
 * Every complaint of a run as a {@link Diagnostic} with its trace: the
 * stages' errors and warnings, the executor's, the solver's and the proof's
 * violations. Deduplicated by code, message, beat and dancers, so eight
 * dancers saying the same thing at the same beat are one line with eight
 * names.
 */
export function collectDiagnostics(run: Run): Diagnostic[] {
  const out = new Map<string, Diagnostic>();
  const add = (d: Diagnostic): void => {
    const key = `${d.code}|${d.message.replace(/, worst at [\d.]+/, "")}|${String(d.span?.start ?? "")}`;
    const had = out.get(key);
    if (had === undefined) {
      out.set(key, d);
      return;
    }
    const dancers = [...new Set([...had.dancers, ...d.dancers])];
    out.set(key, { ...had, dancers });
  };

  for (const e of run.errors) add(fromError(run, e));
  for (const w of run.warnings) add(fromWarning(run, w));
  // The executor's, the solver's and the proof's violations come one per
  // sample and one per dancer; a report that lists them all is not read.
  // Consecutive samples fold into a stretch, and stretches of the same point
  // and kind across every dancer fold into one line: how many, the worst,
  // who — with the worst stretch's trace.
  const kept: (Stretch & { code: string; stage: Stage })[] = [];
  for (const v of foldViolations(run.executed?.violations ?? []))
    kept.push({ ...v, code: "K040", stage: "execute" });
  for (const v of foldViolations(run.solved?.violations ?? [])) {
    const isProof = v.kind === "speed" || v.kind === "accel" || v.kind === "jump";
    kept.push({ ...v, code: isProof ? "K060" : "K050", stage: isProof ? "proof" : "solve" });
  }
  const byPoint = new Map<string, (Stretch & { code: string; stage: Stage })[]>();
  for (const v of kept) {
    const key = `${v.code}|${v.point}|${v.kind}`;
    byPoint.set(key, [...(byPoint.get(key) ?? []), v]);
  }
  for (const group of byPoint.values()) {
    const worst = group.reduce((a, b) => (b.value / b.cap > a.value / a.cap ? b : a));
    const dancers = [...new Set(group.map((v) => v.dancer))];
    add({
      code: worst.code,
      severity: "error",
      stage: worst.stage,
      message: `${worst.point} ${worst.kind} over its cap in ${String(group.length)} stretch${group.length === 1 ? "" : "es"}; worst ×${(worst.value / worst.cap).toFixed(2)} at beat ${worst.beat.toFixed(2)} (${worst.dancer})`,
      beat: worst.beat,
      dancers,
      trace: traceAt(run, worst.dancer, worst.beat, {
        layer: worst.stage,
        what: stretchFact(worst),
      }),
    });
  }
  for (const d of floorChecks(run)) add(d);
  return [...out.values()].sort(
    (a, b) => (a.beat ?? -1) - (b.beat ?? -1) || a.code.localeCompare(b.code),
  );
}

/** A run of consecutive samples of one violation, at its worst. */
interface Stretch {
  dancer: DancerId;
  point: string;
  kind: string;
  /** The worst sample's beat. */
  beat: number;
  from: number;
  to: number;
  value: number;
  cap: number;
  samples: number;
}

interface SampleViolation {
  dancer: DancerId;
  point: string;
  kind: string;
  sample: number;
  beat: number;
  value: number;
  cap: number;
}

/** Consecutive samples of the same dancer, point and kind become one stretch. */
export function foldViolations(list: readonly SampleViolation[]): Stretch[] {
  const byKey = new Map<string, SampleViolation[]>();
  for (const v of list) {
    const key = `${v.dancer}|${String(v.point)}|${v.kind}`;
    byKey.set(key, [...(byKey.get(key) ?? []), v]);
  }
  const out: Stretch[] = [];
  for (const group of byKey.values()) {
    const sorted = [...group].sort((a, b) => a.sample - b.sample);
    let current: Stretch | undefined;
    let lastSample = -10;
    for (const v of sorted) {
      if (current === undefined || v.sample > lastSample + 1) {
        if (current !== undefined) out.push(current);
        current = {
          dancer: v.dancer,
          point: String(v.point),
          kind: v.kind,
          beat: v.beat,
          from: v.beat,
          to: v.beat,
          value: v.value,
          cap: v.cap,
          samples: 1,
        };
      } else {
        current.to = v.beat;
        current.samples += 1;
        if (v.value / v.cap > current.value / current.cap) {
          current.value = v.value;
          current.cap = v.cap;
          current.beat = v.beat;
        }
      }
      lastSample = v.sample;
    }
    if (current !== undefined) out.push(current);
  }
  return out.sort((a, b) => a.from - b.from);
}

const stretchFact = (s: Stretch): string =>
  `${s.point}: ${s.kind} ${s.value.toFixed(2)} against a cap of ${s.cap.toFixed(2)} over ${String(s.samples)} sample${s.samples === 1 ? "" : "s"}`;

const SCHEDULE_CODES: Readonly<Record<string, string>> = {
  TimingViolation: "K020",
  RateTooHigh: "K021",
  StepTooLong: "K022",
  PivotTooLarge: "K023",
  TakeOutOfReach: "K024",
  Unplannable: "K025",
  LongStride: "K030",
  IntrinsicTruncated: "K031",
};

function fromError(run: Run, e: RunError): Diagnostic {
  const code =
    e.stage === "parse"
      ? "K001"
      : e.stage === "check"
        ? "K002"
        : e.stage === "compile"
          ? compileCode(e.message, e.span === undefined ? "" : sourceLine(run, e.span))
          : e.stage === "schedule"
            ? (SCHEDULE_CODES[e.kind ?? ""] ?? "K025")
            : e.stage === "execute"
              ? "K040"
              : "K050";
  const { message, dancers } = splitDancer(run, e.message, e.dancer);
  // A trace needs a dancer and a beat; an error that knows only its span is
  // traced through the first dancer whose call the span is.
  const located =
    e.dancer !== undefined && e.beat !== undefined
      ? { dancer: e.dancer, beat: e.beat }
      : callBySpan(run, e.span);
  const trace =
    located !== undefined
      ? traceAt(run, located.dancer, located.beat)
      : e.span === undefined
        ? []
        : [{ layer: e.stage, what: sourceLine(run, e.span), span: e.span }];
  const d: Diagnostic = { code, severity: "error", stage: e.stage, message, dancers, trace };
  if (e.span !== undefined) d.span = e.span;
  if (e.beat !== undefined) d.beat = e.beat;
  const suggestion = suggestionFor(code);
  if (suggestion !== undefined) d.suggestion = suggestion;
  return d;
}

/** `1R: a 90 cm step…` → the message without the name, and the name as a dancer. */
function splitDancer(
  run: Run,
  message: string,
  dancer: DancerId | undefined,
): { message: string; dancers: DancerId[] } {
  const m = /^([^\s:]+): (.*)$/s.exec(message);
  if (m !== null && run.dialect.dancers.includes(m[1] as string)) {
    return {
      message: m[2] as string,
      dancers: [...new Set([m[1] as string, ...(dancer === undefined ? [] : [dancer])])],
    };
  }
  return { message, dancers: dancer === undefined ? [] : [dancer] };
}

/** The first dancer whose compiled call sits at this span, and its first beat. */
function callBySpan(
  run: Run,
  span: { start: number } | undefined,
): { dancer: DancerId; beat: number } | undefined {
  if (span === undefined || run.sequence === undefined) return undefined;
  for (const [dancer, calls] of Object.entries(run.sequence.perDancer)) {
    const call = calls.find((c) => c.span.start === span.start);
    if (call !== undefined) return { dancer, beat: call.start };
  }
  return undefined;
}

function fromWarning(run: Run, w: RunWarning): Diagnostic {
  const code = SCHEDULE_CODES[w.kind] ?? "K030";
  const { message, dancers } = splitDancer(run, w.message, w.dancer);
  const trace =
    w.dancer !== undefined && w.beat !== undefined ? traceAt(run, w.dancer, w.beat) : [];
  const d: Diagnostic = {
    code,
    severity: "warning",
    stage: "schedule",
    message,
    dancers,
    trace,
  };
  if (w.beat !== undefined) d.beat = w.beat;
  return d;
}

const compileCode = (message: string, source = ""): string =>
  message.includes("does not provide $")
    ? "K011"
    : message.startsWith("assert failed")
      ? /\$beat|\$time|\$first-time|\$last-time/.test(source)
        ? "K104"
        : "K012"
      : / are both on |is on a place that does not exist|no place for me/.test(message)
        ? "K013"
        : "K010";

const suggestionFor = (code: string): string | undefined => {
  switch (code) {
    case "K011":
      return "provide it in the formation (`provide $name: Place = …;`) or pass it at the call (`move($name = …)`)";
    case "K020":
      return "give the figure more beats, or let the neighbouring figures overlap its take and drop";
    case "K022":
      return "the entry should bring the couple closer first; a longer step is not the fix";
    case "K013":
      return "the reassignments that commit at this beat send two dancers to one place; check the progress function's branches";
    default:
      return undefined;
  }
};

/**
 * The facts under a dancer at a beat, outermost first: the compiled call
 * (its text, its `$` bindings, the seating it was read at), the scheduled
 * window and the scheduler's notes, the assembly's instructions at that
 * slot, then whatever the caller adds.
 */
export function traceAt(run: Run, dancer: DancerId, beat: number, ...more: Fact[]): Fact[] {
  const facts: Fact[] = [];
  const calls = run.sequence?.perDancer[dancer] ?? [];
  const call =
    calls.find((c) => beat >= c.start && beat < c.end) ?? calls.find((c) => beat === c.end);
  if (call !== undefined) facts.push(...callFacts(run, call));
  const scheduled = (run.schedule?.calls[dancer] ?? []).find((c) => c.call.id === call?.id);
  if (scheduled !== undefined) facts.push(...scheduleFacts(scheduled, beat));
  const program = run.schedule?.programs[dancer];
  const slot = program?.slots.find((s) => s.beat === Math.floor(beat) && s.half === 0);
  if (slot !== undefined) {
    facts.push({
      layer: "assembly",
      what: `beat ${String(slot.beat)} · ${slot.window}: ${slot.instrs.map(instrText).join(" · ") || "nothing"}`,
      beat: slot.beat,
    });
  }
  facts.push(...more);
  return facts;
}

function callFacts(run: Run, call: CompiledCall): Fact[] {
  const facts: Fact[] = [
    {
      layer: "compile",
      what: `${call.path} · ${sourceLine(run, call.span)} · beats ${String(call.start)}–${String(call.end)}`,
      span: call.span,
      beat: call.start,
    },
  ];
  const bindings = Object.entries(call.bindings).map(([k, v]) => `$${k} = ${v}`);
  if (bindings.length > 0)
    facts.push({
      layer: "compile",
      what: `read at seating ${String(call.membership + 1)}: ${bindings.join(", ")}`,
    });
  if (call.cast.partner === undefined && call.group === undefined)
    facts.push({ layer: "compile", what: "nobody to dance it with: the figure stands" });
  return facts;
}

function scheduleFacts(c: ScheduledCall, beat: number): Fact[] {
  const window = beat < c.entry[1] ? "entry" : beat < c.body[1] ? "body" : "exit";
  const range = window === "entry" ? c.entry : window === "body" ? c.body : c.exit;
  const facts: Fact[] = [
    {
      layer: "schedule",
      what: `${c.call.figure.id}: ${window} ${String(range[0])}–${String(range[1])} (entry ${String(c.entry[1] - c.entry[0])}, body ${String(c.body[1] - c.body[0])}, exit ${String(c.exit[1] - c.exit[0])}; seams ${c.seamIn} → ${c.seamOut}${c.rate === undefined ? "" : `; ${c.rate.toFixed(3)} turns/beat`})`,
      beat: range[0],
    },
  ];
  for (const note of c.notes) facts.push({ layer: "schedule", what: note });
  return facts;
}

const instrText = (i: { op: string } & Record<string, unknown>): string => {
  switch (i.op) {
    case "step":
      return `step ${String(i["foot"])} ${(i["lengthCm"] as number).toFixed(0)} cm`;
    case "pivot":
      return `pivot ${(i["deg"] as number).toFixed(0)}°`;
    case "hold":
      return `take ${String(i["hand"])} with ${String(i["with"])} (${String(i["hold"])})`;
    case "drop":
      return `drop ${String(i["hand"])}`;
    case "lean":
      return `lean ${String(i["deg"])}°`;
    case "look":
      return "look";
    case "buzz":
      return `buzz ${i["on"] ? "on" : "off"}`;
    default:
      return i.op;
  }
};

const sourceLine = (run: Run, span: { start: number; end: number }): string =>
  run.source.slice(span.start, span.end).split("\n")[0]?.trim() ?? "";
