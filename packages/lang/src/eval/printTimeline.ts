/**
 * A time through as text: who was in and who was out, the events by the beat
 * they committed on, and then a row of `[start-end] move(args)` per dancer.
 *
 * The events come first because they are the only thing that changes the tree,
 * and a reader checking a progression wants to read the commit, not hunt for
 * it between sixteen swings.
 */
import type { EveningResult } from "./runEvening.js";
import type { TimeResult } from "./timeline.js";

export function printTimeline(result: EveningResult | TimeResult | readonly TimeResult[]): string {
  const times: readonly TimeResult[] = Array.isArray(result)
    ? (result as readonly TimeResult[])
    : "times" in (result as EveningResult)
      ? (result as EveningResult).times
      : [result as TimeResult];
  return times.map(printTime).join("\n\n");
}

export function printTime(time: TimeResult): string {
  const out: string[] = [];
  const marks = [time.firstTime ? "first" : undefined, time.lastTime ? "last" : undefined].filter(
    (mark) => mark !== undefined,
  );
  out.push(
    `time ${String(time.time)} — ${String(time.length)} beats${marks.length > 0 ? ` — ${marks.join(", ")}` : ""}`,
  );
  for (const card of time.cards) out.push(`  card "${card.text}" at beat ${String(card.beat)}`);
  if (time.outDancers.length > 0) out.push(`  out: ${time.outDancers.join(" ")}`);

  if (time.events.length > 0) {
    out.push("  events");
    const beats = [...new Set(time.events.map((event) => event.beat))].sort((a, b) => a - b);
    for (const beat of beats) {
      out.push(`    beat ${String(beat)}`);
      for (const event of time.events.filter((e) => e.beat === beat))
        out.push(`      ${event.dancer}  ${event.from} -> ${event.to}`);
    }
  }

  const dancers = [...new Set(time.moves.map((move) => move.dancer))];
  for (const dancer of dancers) {
    out.push(`  ${dancer}`);
    for (const move of time.moves.filter((m) => m.dancer === dancer))
      out.push(
        `    [${String(move.start)}-${String(move.start + move.beats)}] ${move.ir}(${move.args
          .map((arg) => `${arg.name} = ${arg.value}`)
          .join(", ")})`,
      );
  }
  for (const complaint of time.diagnostics) out.push(`  ${complaint.code} ${complaint.message}`);
  return out.join("\n");
}
