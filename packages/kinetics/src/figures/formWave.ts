import { HOLD_SPACING_PX, LINE_OFFSET_PX } from "@caller/core";
import type { FigureIR, HoldRef } from "../ir/Figure.js";

/**
 * How far forward of the line the centre of the hall is, px: half of what
 * the two lines are apart — a pair's hold spacing and the rendering
 * contract's line offset, 32 px, so 16 px, 0.64 m. A dancer on either line
 * facing across walks this far forward to stand on the centre line.
 */
export const WAVE_FORWARD_PX = (HOLD_SPACING_PX + LINE_OFFSET_PX) / 2;

/** The wave's two hands: right to `right`, left to `left`, either of them nobody. */
export const WAVE_HOLDS: readonly HoldRef[] = [
  { hold: "wave", hand: "right", with: "right" },
  { hold: "wave", hand: "left", with: "left" },
];

/**
 * **Form the long wave** (Robins on a Wire: "(2) Women walk forward; form
 * long wave in center"): a figure whose body is an **arrangement** rather
 * than a motion — be on the centre line, at your own place along the hall,
 * facing across as you were, with your right hand to `right` and your left
 * to `left` in the wave hold. The scheduler's entry walk *is* the "walk
 * forward"; the body is a stand in the hold for whatever is left of the two
 * beats. This is the figure that proves the engine can say "be here, holding
 * these" without a move of its own.
 *
 * `right` and `left` are each a figure-role of their own (`ParamSpec.role`):
 * the wave is every dancer of one role down the whole hall, so a dancer's
 * two mates are two different people, and at the ends one of them is
 * **nobody** — the language says so (notes D10) and the cast rule `free`
 * says what that means: that hand stays free, the figure goes on. The
 * instance is the whole line: every dancer whose casts join up (the
 * scheduler's connected component), so both sides of every hand come from
 * one piece of geometry.
 *
 * The wave hold is a placeholder like the ballroom hold: hands at shoulder
 * height, palm to palm, at the midpoint of the two. The `post` keeps both
 * hands, for the balance that follows.
 */
export const formWave: FigureIR = {
  id: "form-wave",
  params: [
    { name: "right", kind: "dancer", role: "right" },
    { name: "left", kind: "dancer", role: "left" },
    { name: "beats", kind: "number", default: 2 },
  ],
  // The body may be nothing at all: the entry walk is the figure.
  beats: { nominal: 2, min: 0 },
  pre: {
    arrangement: [{ kind: "forward", who: "self", distancePx: WAVE_FORWARD_PX }],
    holds: WAVE_HOLDS,
  },
  post: { arrangement: [], holds: WAVE_HOLDS },
  windows: [{ kind: "stand" }],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { right: "free", left: "free" },
};
