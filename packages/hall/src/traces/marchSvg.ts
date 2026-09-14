import type { Beat } from "@caller/core";
import type { TraceDrawOptions } from "./traceSvg.js";
import {
  beatRules,
  facingTicks,
  inkOf,
  inkRuns,
  label,
  phraseName,
  polyline,
  spreadOffset,
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
  const draw = traceDraw(options);
  const beatPx = options.beatPx ?? 9;
  const height = options.height ?? 120;
  const padLeft = options.padLeft ?? 24;
  const padRight = options.padRight ?? 12;
  const beats = trace.to - trace.from;
  const width = options.width ?? padLeft + beats * beatPx + padRight;

  const ey = Math.max(trace.extent.y, 1);
  const lane = height - (draw.labels ? 12 : 0);
  const scale = Math.min(MARCH_MAX_SCALE, (lane / 2 - 4) / ey);
  const cy = (draw.labels ? 12 : 0) + lane / 2;
  const x = (beat: Beat): number => padLeft + (beat - trace.from) * beatPx;

  const parts: string[] = [beatRules(trace, draw, x, draw.labels ? 12 : 0, height)];
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
    for (const run of inkRuns(pen, map)) parts.push(polyline(run, ink, draw.penWidth));
    parts.push(facingTicks(pen, map, draw, ink));
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
 * The most the set is ever magnified in a march.
 *
 * Without a cap a dance whose ink stays near the middle of the set would be
 * blown up until its across-the-set wobble swamped the marching, and two
 * marches side by side would be at different scales and unreadable together.
 */
export const MARCH_MAX_SCALE = 2.2;
