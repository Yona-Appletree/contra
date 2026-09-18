import type { DancerId } from "../src/dialect/Dialect.js";
import type { Span } from "@caller/lang";
import type { Run } from "../src/pipeline.js";

/** One line of the errors strip: what minded, about whom, where, and why. */
export interface Complaint {
  bad: boolean;
  /** The stage, and its own kind of complaint where it has one. */
  tag: string;
  /** The dancer, the call and the beat — as much of the three as is known. */
  where: string;
  message: string;
  /** How many dancers said the same thing. */
  count: number;
  /** The beat the strip jumps to when this line is clicked, where there is one. */
  beat?: number;
  dancer?: DancerId;
}

/**
 * Every complaint in the run, **grouped**, each naming the dancer, the call
 * and the beat of the first of its kind.
 *
 * A stage that knows the dancer and the beat gets its call looked up in that
 * dancer's own compiled sequence; a compile error, which has neither, is named
 * by the text it is pointing at — `chain(Robin, to = partner, beats = 8)` is a
 * better answer to *which call* than a character offset.
 *
 * Grouping is by **what was said**, with the numbers in it standing in for
 * each other: a hall of sixteen dancing seven times through says the same
 * thing about the same call ninety-six times, at ninety-six different beats,
 * and a strip of ninety-six lines is a strip nobody reads. The count goes on
 * the line and clicking it takes the bar to the first one.
 */
export const complaintsOf = (run: Run): Complaint[] => {
  const seen = new Map<string, Complaint>();
  const add = (c: Omit<Complaint, "count">): void => {
    const key = `${c.tag}|${c.message.replace(/\d+(\.\d+)?/g, "#")}`;
    const had = seen.get(key);
    if (had) had.count += 1;
    else seen.set(key, { ...c, count: 1 });
  };
  for (const e of run.errors) {
    add({
      bad: true,
      tag: e.kind === undefined ? e.stage : `${e.stage} ${e.kind}`,
      where: whereOf(run, e.dancer, e.beat, e.span),
      message: e.message,
      ...(e.beat === undefined ? {} : { beat: e.beat }),
      ...(e.dancer === undefined ? {} : { dancer: e.dancer }),
    });
  }
  for (const w of run.warnings) {
    add({
      bad: false,
      tag: `${w.stage} ${w.kind}`,
      where: whereOf(run, w.dancer, w.beat, w.span),
      message: w.message,
      ...(w.beat === undefined ? {} : { beat: w.beat }),
      ...(w.dancer === undefined ? {} : { dancer: w.dancer }),
    });
  }
  // Two bodies through one point (K304): the executed motion's own finding.
  for (const c of run.clearance ?? []) {
    add({
      bad: false,
      tag: "execute clearance",
      where: whereOf(run, c.dancer, c.beat, undefined),
      message: `${c.dancer} and ${c.with} are ${c.value.toFixed(1)} px apart, under the ${c.cap.toFixed(1)} two bodies keep (${c.figures[0]}, ${c.figures[1]})`,
      beat: c.beat,
      dancer: c.dancer,
    });
  }
  return [...seen.values()];
};

/** What the run has to say when nothing went wrong. */
export const summaryOf = (run: Run): string => {
  const violations = (run.solved?.violations.length ?? 0) + (run.executed?.violations.length ?? 0);
  const dancers = run.dialect?.dancers.length ?? 0;
  return `${String(run.endBeat)} beats · ${String(dancers)} dancers · ${String(violations)} proof violations`;
};

const whereOf = (
  run: Run,
  dancer: DancerId | undefined,
  beat: number | undefined,
  span: Span | undefined,
): string => {
  const parts: string[] = [];
  if (dancer !== undefined) parts.push(dancer);
  const call = callAt(run, dancer, beat) ?? sourceAt(run, span);
  if (call !== undefined) parts.push(call);
  if (beat !== undefined) parts.push(`beat ${String(beat)}`);
  return parts.join(" · ");
};

/** The call this dancer is inside at this beat, by its breadcrumb. */
const callAt = (
  run: Run,
  dancer: DancerId | undefined,
  beat: number | undefined,
): string | undefined => {
  if (dancer === undefined || beat === undefined) return undefined;
  const calls = run.sequence?.perDancer[dancer] ?? [];
  const call =
    calls.find((c) => beat >= c.start && beat < c.end) ?? calls.find((c) => beat === c.end);
  return call?.path;
};

/** The text a span points at, in the file it names, as one line. */
const sourceAt = (run: Run, span: Span | undefined): string | undefined => {
  if (!span) return undefined;
  const source = run.sources.find((s) => s.name === span.file);
  if (source === undefined) return span.file;
  const text = source.text.slice(span.start, span.end).trim().split("\n")[0]?.trim();
  return text === undefined || text === "" ? span.file : text;
};
