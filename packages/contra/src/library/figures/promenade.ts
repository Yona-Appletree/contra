import type { AngleExpr, FigureDefinition, NumberExpr } from "../FigureDefinition.js";
import { PLACE_PITCH_PX } from "../../formation/dupleImproper.js";

/**
 * **Promenade around the major set** (M8): two dancers as one unit, walking
 * round the whole set rather than across the minor one.
 *
 * Fatal Attraction's A1 and B1 — *"(8) Neighbor promenade counterclockwise
 * around the major set"* — and 156 duple dances in the corpus travel round the
 * major set this way. The unit kind is M7's and already carries `travel` and
 * `along`; what this figure supplies is **which way round the set is which way
 * along your own line**.
 *
 * ## Clockwise is a fact about the set, not an angle
 *
 * Going round the major set, the two lines travel in **opposite** directions —
 * that is what going round an oval looks like from inside one of its sides. So
 * "counterclockwise" cannot be a bearing written down once: it is a bearing per
 * line. What it *is* is the direction the dancer already progresses in, which
 * the lattice answers for both lines at once: the bearing from my own place to
 * the place one along the way I travel. `direction` then picks which of the two
 * ways round that is.
 *
 * ## What is not built, and is measured rather than assumed
 *
 * **The ends of the set do not bend.** A couple that would walk past the top of
 * the line has, in a hall, gone round the end of the oval and come back down the
 * other side; here it walks straight on and `pnpm dance`'s end-effects table is
 * what says so. M7's report names the two things a bending lane needs — an
 * anchor that is a trajectory and a lane frame that bends — and neither exists;
 * Q12 rules that the fixed version comes first. This figure is the fixed
 * version, and its own dance's numbers say what it costs.
 */

/** Which way round the set: `+1` the way you progress, `-1` back against it. */
const WAY: NumberExpr = {
  number: "select",
  on: "direction",
  cases: { counterclockwise: 1, clockwise: -1 },
};

/** The bearing one dancing place along the way I travel: the lattice's own answer. */
const ALONG_SET: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "same", along: 0 },
  to: { point: "slot", line: "same", along: 1 },
};

/** Which way the unit actually walks: along the set, or back along it. */
const ALONG: AngleExpr = {
  angle: "sum",
  of: [ALONG_SET, { number: "mul", of: [{ number: "sum", of: [WAY, -1] }, 90] }],
};

/** How far, px: the dancing places the call asks for. The sign is in {@link ALONG}. */
const TRAVEL: NumberExpr = { number: "mul", of: [{ param: "places" }, PLACE_PITCH_PX] };

/** Promenade around the major set, as a figure definition. */
export const promenadeDefinition: FigureDefinition = {
  id: "promenade",
  call: "PROMENADE AROUND THE SET",
  describe:
    "Side by side with the dancer named, inside hands joined, walk the two of you as one round the whole set — not across your own little circle of four but along the line you are standing in, the way a ring of couples goes round a hall. Counterclockwise is the way you are already travelling; clockwise is back the other way. You end further along the set than you began, which is the point of it.",
  lead: 4,
  nominalBeats: 8,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  params: {
    kind: "canonical",
    defaults: {
      /** Who you promenade with. */
      pairs: "neighbors",
      /** Which way round the major set. */
      direction: "counterclockwise",
      /** How far you get, in dancing places along the set. */
      places: 2,
      /** How far apart the two of you walk, px. */
      spacing: 14,
      /** How far below shoulder height the joined inside hands sit, px. */
      handDrop: 3,
    },
  },
  shape: {
    kind: "unit",
    // A promenade does not turn the couple: it carries them along the line they
    // are already standing in, side by side, the way they are already facing.
    turn: 0,
    travel: TRAVEL,
    along: ALONG,
    spacing: { param: "spacing" },
    handDrop: { param: "handDrop" },
    idleHands: { kind: "down" },
  },
  holds: [],
  // A promenade around the set lands you on a place the set has — it is how the
  // dance gets you to the next couple — so it settles on the formation's own.
  ends: "home",
  timing: { stretch: "distance", profile: "smooth" },
};
