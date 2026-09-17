import type { DancerId } from "../src/dialect/Dialect.js";
import type { Span } from "../src/lang/syntax.js";
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
}

/**
 * Every complaint in the run, deduplicated, each naming the dancer, the call
 * and the beat it is about.
 *
 * A stage that knows the dancer and the beat gets its call looked up in that
 * dancer's own compiled sequence; a compile error, which has neither, is named
 * by the text it is pointing at — `robins-chain(ring, robins, 8)` is a better
 * answer to *which call* than a character offset.
 */
export const complaintsOf = (run: Run): Complaint[] => {
  const seen = new Map<string, Complaint>();
  const add = (c: Omit<Complaint, "count">): void => {
    const key = `${c.tag}|${c.where}|${c.message}`;
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
    });
  }
  for (const w of run.warnings) {
    add({
      bad: false,
      tag: `${w.stage} ${w.kind}`,
      where: whereOf(run, w.dancer, w.beat, undefined),
      message: w.message,
    });
  }
  return [...seen.values()];
};

/** What the run has to say when nothing went wrong. */
export const summaryOf = (run: Run): string => {
  const violations = (run.solved?.violations.length ?? 0) + (run.executed?.violations.length ?? 0);
  return `${String(run.endBeat)} beats · ${String(run.dialect.dancers.length)} dancers · ${String(violations)} proof violations`;
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

/** The source text a span points at, as one line. */
const sourceAt = (run: Run, span: Span | undefined): string | undefined => {
  if (!span) return undefined;
  const text = run.source.slice(span.start, span.end).trim().split("\n")[0]?.trim();
  return text === undefined || text === "" ? `line ${String(span.line)}` : text;
};
