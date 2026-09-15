import type { Beat } from "@caller/core";
import type { TraceDrawOptions } from "./traceSvg.js";
import {
  beatRules,
  facingMarks,
  facingReach,
  inkOf,
  inkRuns,
  label,
  phraseName,
  polyline,
  spreadOffset,
  TRACE_PEN_WIDTH,
  traceDraw,
  traceSvg,
} from "./traceSvg.js";
import type { TraceView } from "./TraceView.js";

/**
 * The march: the same pens, with the set sliding right as the beats pass.
 *
 * Every turn becomes a loop and every stretch of standing still becomes a flat
 * line, so a dance's rhythm — where it spins, where it waits, how long the
 * swing really is — reads straight off the page in a way the pen plot's
 * overdrawn knot never shows.
 */
export function marchSvg(trace: TraceView, options: MarchOptions = {}): string {
  const draw = traceDraw({
    ...options,
    wakePx: options.wakePx ?? (options.penWidth ?? TRACE_PEN_WIDTH) * MARCH_WAKE_PER_PEN_WIDTH,
  });
  const beatPx = options.beatPx ?? 9;
  const height = options.height ?? 120;
  const header = draw.labels ? MARCH_HEADER_PX : 0;
  const beats = trace.to - trace.from;

  const ey = Math.max(trace.extent.y, 1);
  const lane = height - header;
  // Every margin holds a facing mark as well as the ink: a tick, a wake band
  // or an arrowhead is drawn out of the path, so the widest thing on the page
  // is a sample at the edge of the set with its mark pointing further out
  // still. `facingReach` is how far the style being drawn reaches.
  const margin = MARCH_MARGIN_PX + facingReach(draw);
  const scale = Math.min(MARCH_MAX_SCALE, (lane / 2 - margin) / ey);
  const cy = header + lane / 2;
  // The set is drawn around the beat it is on, so the first beat's ink reaches
  // half a set-width to the left of the axis and the last beat's the same to
  // the right. The margins have to hold that, or the ink runs off the page.
  const overhang = Math.max(trace.extent.x, 1) * scale + margin;
  const padLeft = Math.max(options.padLeft ?? 0, overhang);
  const padRight = Math.max(options.padRight ?? 0, overhang);
  const width = options.width ?? padLeft + beats * beatPx + padRight;
  const x = (beat: Beat): number => padLeft + (beat - trace.from) * beatPx;

  const parts: string[] = [beatRules(trace, draw, x, header, height)];
  if (draw.labels) {
    for (let i = 0; trace.from + i * draw.phraseBeats < trace.to - 1e-9; i++) {
      const beat = trace.from + i * draw.phraseBeats;
      parts.push(label([x(beat) + 3, 9], phraseName(i), draw.palette.text, 9));
    }
  }
  trace.pens.forEach((pen, index) => {
    const ink = inkOf(pen);
    const [dx, dy] = spreadOffset(draw, index, trace.pens.length);
    const map = (sample: TraceView["pens"][number]["samples"][number]) =>
      [x(sample.beat) + sample.p[0] * scale + dx, cy + sample.p[1] * scale + dy] as [
        number,
        number,
      ];
    // The wake goes under the ink, a tick or an arrowhead over it: see
    // `penPlotSvg`, which orders the same three styles the same way.
    const facing = facingMarks(pen, index, map, draw, ink);
    if (draw.facing === "wake") parts.push(facing);
    for (const run of inkRuns(pen, map)) parts.push(polyline(run, ink, draw.penWidth));
    if (draw.facing !== "wake") parts.push(facing);
  });
  if (draw.title !== undefined) parts.push(label([4, 9], draw.title, draw.palette.text, 9));
  return traceSvg(width, height, parts.join(""), draw.palette.ground);
}

/** What a march takes on top of the shared options. */
export interface MarchOptions extends TraceDrawOptions {
  /** How far the set slides per beat, px. */
  beatPx?: number;
  height?: number;
  /** Overrides the width the beat axis would ask for. */
  width?: number;
  padLeft?: number;
  padRight?: number;
}

/**
 * How far a wake reaches out of the line on a march, as a multiple of the
 * pen's own stroke width — half what a pen plot uses.
 *
 * A march never magnifies the set by more than {@link MARCH_MAX_SCALE}, a
 * third of what a pen plot may use, so one dancer's own loop is drawn a third
 * the size here; the same reach in px would be three times as much of it, and
 * the loops of a swing would close up into a blur. Picked by eye against 2,
 * 3, 4.5 and 6 in `apps/web/e2e/screenshots/t5-wake-reach-march.png`.
 */
export const MARCH_WAKE_PER_PEN_WIDTH = 3;

/** The band across the top that the phrase letters sit in, px. */
export const MARCH_HEADER_PX = 12;

/** How much blank is kept beyond the widest the set reaches, px. */
export const MARCH_MARGIN_PX = 6;

/**
 * The most the set is ever magnified in a march.
 *
 * Without a cap a dance whose ink stays near the middle of the set would be
 * blown up until its across-the-set wobble swamped the marching, and two
 * marches side by side would be at different scales and unreadable together.
 */
export const MARCH_MAX_SCALE = 3;
