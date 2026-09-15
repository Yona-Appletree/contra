import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Circle**, as data: take hands in a ring of four and walk it round.
 *
 * The first of the three ring walks, and the one the kind is named for. Its
 * whole geometry is now four numbers and a hold — how many places, which way,
 * how long the stepping in and out take — because the ring itself is the shape
 * kind's (`kinds/ringWalk.ts`), shared with the star and the petronella, and
 * the hands are the ring hold `balance-ring` already uses.
 */

/** Beats spent stepping in to the ring, and out of it again. */
export const CIRCLE_IN_BEATS = 1.5;
export const CIRCLE_OUT_BEATS = 1.5;

/**
 * How long the hands take to close, beats: the step in plus a little.
 *
 * The hands are joined by the time the ring is closed up rather than at the
 * same instant, so nobody is reaching for a point that is still coming toward
 * them.
 */
export const CIRCLE_TAKE_BEATS = CIRCLE_IN_BEATS + 0.4;

/** Circle, as a figure definition. */
export const circleDefinition: FigureDefinition = {
  id: "circle",
  call: "CIRCLE LEFT",
  describe:
    "All four join hands in a ring and walk round — circle left means the way your left hand is pointing, clockwise seen from above. Three quarters is the usual amount, which lands you one place back from where you started. Keep the hands joined and the ring the same size the whole way round.",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: { direction: "left", places: 3, holdDrop: 6, stackPx: 1 },
  },
  shape: {
    kind: "ringWalk",
    places: { param: "places" },
    // A circle left travels the way the ring's own order runs.
    sign: { number: "select", on: "direction", cases: { left: 1, right: -1 } },
    faceOffset: 180,
    inBeats: CIRCLE_IN_BEATS,
    outBeats: CIRCLE_OUT_BEATS,
    endFacing: { kind: "inward" },
    travel: { kind: "ring" },
    idleHands: { kind: "down" },
  },
  holds: [
    {
      kind: "ring",
      drop: { param: "holdDrop" },
      stackPx: { param: "stackPx" },
      // A circle's hands do not rise and fall: only the bodies travel.
      riseGain: 0,
      window: {
        kind: "holdWindow",
        take: CIRCLE_TAKE_BEATS,
        release: CIRCLE_OUT_BEATS,
      },
    },
  ],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  // A circle right *is* a circle left in a mirror, which is the whole reason
  // `direction` is a parameter rather than two figures.
  symmetry: {
    mirror: { kind: "parameters", words: { direction: { left: "right", right: "left" } } },
  },
};
