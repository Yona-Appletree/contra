import type { DancerId } from "../dialect/Dialect.js";
import type { CompiledCall } from "../lang/compile.js";
import type { Run, RunError, RunWarning } from "../pipeline.js";
import type { ScheduledCall } from "../schedule/schedule.js";
import type { Diagnostic, Fact } from "./Diagnostic.js";

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
    const key = `${d.code}|${d.message}|${String(d.beat ?? "")}|${String(d.span?.start ?? "")}`;
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
  for (const v of run.executed?.violations ?? []) {
    add({
      code: "K040",
      severity: "error",
      stage: "execute",
      message: `${v.point} ${v.kind} ${v.value.toFixed(1)} over ${v.cap.toFixed(1)} at beat ${v.beat.toFixed(2)}`,
      beat: v.beat,
      dancers: [v.dancer],
      trace: traceAt(run, v.dancer, v.beat, {
        layer: "execute",
        what: `${v.point}: ${v.kind} ${v.value.toFixed(2)} (cap ${v.cap.toFixed(2)}) at sample ${String(v.sample)}`,
      }),
    });
  }
  for (const v of run.solved?.violations ?? []) {
    const isProof = v.kind === "speed" || v.kind === "accel" || v.kind === "jump";
    add({
      code: isProof ? "K060" : "K050",
      severity: "error",
      stage: isProof ? "proof" : "solve",
      message: `${String(v.point)} ${v.kind} ${v.value.toFixed(1)} over ${v.cap.toFixed(1)} at beat ${v.beat.toFixed(2)}`,
      beat: v.beat,
      dancers: [v.dancer],
      trace: traceAt(run, v.dancer, v.beat, {
        layer: isProof ? "proof" : "solve",
        what: `${String(v.point)}: ${v.kind} ${v.value.toFixed(2)} (cap ${v.cap.toFixed(2)}) at sample ${String(v.sample)}`,
      }),
    });
  }
  return [...out.values()].sort(
    (a, b) => (a.beat ?? -1) - (b.beat ?? -1) || a.code.localeCompare(b.code),
  );
}

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
          ? compileCode(e.message)
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
    message: w.message,
    dancers,
    trace,
  };
  if (w.beat !== undefined) d.beat = w.beat;
  return d;
}

const compileCode = (message: string): string =>
  message.includes("does not provide $")
    ? "K011"
    : message.startsWith("assert failed")
      ? "K012"
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
