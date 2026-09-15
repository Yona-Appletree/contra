import type { Angle, Beat, Vec2 } from "@caller/core";
import { rankShade, roleColour } from "../appearance/roleColours.js";

/**
 * What the four trace drawings read: one pen per dancer, a window of beats, and
 * the figures that own each stretch of ink.
 *
 * These types are declared here rather than imported because `hall` may import
 * `core` and nothing else (AGENTS.md's dependency table, ruling DD17), and the
 * sampler that produces a trace lives in `@caller/choreo` — a layer this
 * package is not allowed to see. `@caller/choreo`'s `Trace` is structurally
 * assignable to {@link TraceView}, so the composition root hands one straight
 * to a renderer with no adapter; `apps/web/src/traces/traceViewShape.test.ts`
 * is the compile-time check that the two stay the same shape.
 */
export interface TraceView {
  from: Beat;
  to: Beat;
  step: Beat;
  pens: readonly TraceViewPen[];
  spans: readonly TraceViewSpan[];
  cells: readonly TraceViewCell[];
  extent: { x: number; y: number };
}

/** One dancer's path, in set-local px: `x` across the set, `y` along it. */
export interface TraceViewPen {
  dancer: string;
  station: string;
  role: string;
  /** 1 for contra's ones, 2 for its twos, 0 for a station that is not ranked. */
  rank: number;
  samples: readonly { beat: Beat; p: Vec2; facing: Angle; span: number; wrapped?: boolean }[];
}

/** One figure instance under the ink. */
export interface TraceViewSpan {
  figure: string;
  from: Beat;
  to: Beat;
  dancers: readonly string[];
}

/** One cell of the figure strip. */
export interface TraceViewCell {
  figure: string;
  from: Beat;
  to: Beat;
  family: string;
}

/**
 * The ink one pen draws in: its role's colour, the ones darker and the twos
 * lighter, exactly as the post's plates read ones and twos apart.
 *
 * The two colours themselves — larks gold, robins red — live in
 * `appearance/roleColours.ts`, where the dancers' clothes and their floor
 * trails read the same constant. A pen and the dancer who drew it are the same
 * colour on purpose.
 */
export function penColour(role: string, rank = 0): string {
  return rankShade(roleColour(role), rank);
}

/**
 * The boards a trace is drawn on: the hall's dark wood, quietened so that ink
 * is the only bright thing on the page.
 */
export interface TracePalette {
  ground: string;
  /** Hairlines: beat ticks, the set's own box. */
  grid: string;
  /** Heavier rules: phrase lines, lane centres. */
  rule: string;
  text: string;
  /** Station dots and the band's bar at the top of the set. */
  mark: string;
}

/** The default palette. */
export const TRACE_PALETTE: TracePalette = {
  ground: "#14110f",
  grid: "#2a221c",
  rule: "#4a3d31",
  text: "#a8977f",
  mark: "#6b5741",
};

/**
 * The strip's cell colours.
 *
 * Deliberately no gold and no red: those two now mean lark and robin, and a
 * cell wash that borrowed them would read as a role. No pink and no rose
 * either, for the same reason the roles left them behind.
 */
export const TRACE_FAMILY_COLOURS: readonly string[] = [
  "#7fae6a",
  "#6fb3a8",
  "#8aa6c8",
  "#a894c8",
  "#c0b070",
  "#88b8cf",
  "#b0a08c",
  "#9dc27a",
  "#7f9ec0",
  "#c2a9d8",
  "#6faf8f",
  "#a9b088",
];

/**
 * A stable colour for a strip cell.
 *
 * The workspace has no move-family taxonomy yet (that is a later UX spike), so
 * a cell's `family` is its figure id and this hashes it into the palette. The
 * property that matters for reading a strip survives either way: the same
 * figure is always the same colour, so a dance that repeats one shows it.
 */
export function familyColour(family: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < family.length; i++) {
    hash ^= family.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return TRACE_FAMILY_COLOURS[hash % TRACE_FAMILY_COLOURS.length]!;
}
