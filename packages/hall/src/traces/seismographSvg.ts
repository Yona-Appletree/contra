import type { Beat } from "@caller/core";
import type { TraceDrawOptions } from "./traceSvg.js";
import {
  beatRules,
  inkOf,
  inkRuns,
  label,
  line,
  phraseName,
  polyline,
  traceDraw,
  traceSvg,
} from "./traceSvg.js";
import type { TraceView } from "./TraceView.js";

/**
 * The seismograph: each dancer's place across the set, then along it, against
 * time.
 *
 * Two lanes, one per axis, with the pens untangled — the view that answers
 * "who is where, when" rather than "what shape does this make". Crossings in
 * the top lane are passes across the set; the staircase in the bottom lane is
 * the progression walking down the hall.
 */
export function seismographSvg(trace: TraceView, options: SeismographOptions = {}): string {
  const draw = traceDraw(options);
  const beatPx = options.beatPx ?? 9;
  const height = options.height ?? 140;
  const padLeft = options.padLeft ?? 40;
  const padRight = options.padRight ?? 12;
  const beats = trace.to - trace.from;
  const width = options.width ?? padLeft + beats * beatPx + padRight;

  const header = draw.labels ? SEISMOGRAPH_HEADER_PX : 0;
  const laneHeight = (height - header) / 2;
  const x = (beat: Beat): number => padLeft + (beat - trace.from) * beatPx;
  const lanes: readonly Lane[] = [
    {
      name: "across",
      centre: header + laneHeight / 2,
      /** Across is drawn with `+x` up the page, so the two lines stay apart. */
      value: (p: readonly [number, number]) => -p[0],
      amplitude: Math.max(trace.extent.x, 1),
    },
    {
      name: "along",
      centre: header + laneHeight * 1.5,
      value: (p: readonly [number, number]) => p[1],
      amplitude: Math.max(trace.extent.y, 1),
    },
  ];

  const parts: string[] = [beatRules(trace, draw, x, header, height)];
  for (const lane of lanes) {
    parts.push(line([padLeft, lane.centre], [x(trace.to), lane.centre], draw.palette.grid, 1));
    if (draw.labels) {
      parts.push(label([4, lane.centre + 3], lane.name, draw.palette.text, 9));
    }
  }
  parts.push(
    line([padLeft, header + laneHeight], [x(trace.to), header + laneHeight], draw.palette.rule, 1),
  );

  if (draw.labels) {
    for (let i = 0; trace.from + i * draw.phraseBeats < trace.to - 1e-9; i++) {
      const beat = trace.from + i * draw.phraseBeats;
      parts.push(label([x(beat) + 3, 9], phraseName(i), draw.palette.text, 9));
    }
  }

  for (const lane of lanes) {
    const scale = (laneHeight / 2 - SEISMOGRAPH_LANE_PAD_PX) / lane.amplitude;
    trace.pens.forEach((pen, index) => {
      const ink = inkOf(pen);
      // The lanes have the same crowding problem the floor views do: two larks
      // on the same side of the set are the same line until one is nudged. Up
      // the page is the only free direction here, whatever the spread is set to.
      const dy = draw.spread === "none" ? 0 : (index - (trace.pens.length - 1) / 2) * draw.spreadPx;
      const map = (sample: TraceView["pens"][number]["samples"][number]) =>
        [x(sample.beat), lane.centre + lane.value(sample.p) * scale + dy] as [number, number];
      for (const run of inkRuns(pen, map)) parts.push(polyline(run, ink, draw.penWidth));
    });
  }
  if (draw.title !== undefined) parts.push(label([4, 9], draw.title, draw.palette.text, 9));
  return traceSvg(width, height, parts.join(""), draw.palette.ground);
}

/** What a seismograph takes on top of the shared options. */
export interface SeismographOptions extends TraceDrawOptions {
  beatPx?: number;
  height?: number;
  width?: number;
  padLeft?: number;
  padRight?: number;
}

/** The band across the top that the phrase letters sit in, px. */
export const SEISMOGRAPH_HEADER_PX = 12;

/** How much blank a lane keeps above and below its widest swing, px. */
export const SEISMOGRAPH_LANE_PAD_PX = 7;

/** One of the two lanes: which axis it reads, and where it sits. */
interface Lane {
  name: string;
  centre: number;
  value: (p: readonly [number, number]) => number;
  amplitude: number;
}
