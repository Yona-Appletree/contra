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
    "Stand beside the dancer named, both of you looking the same way, and take both hands: left in left and right in right, so your arms cross in front of you and the right hands ride over the left. Walk the two of you as one round the whole set — not across your own little circle of four but along the line you are standing in, the way a ring of couples goes round a hall. Counterclockwise is the way you are already travelling; clockwise is back the other way. You end further along the set than you began, which is the point of it.",
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
      /**
       * How far below shoulder height the joined **left** hands sit, px.
       *
       * Lower than an inside hand's three (FR-A2): a promenade hold is two arms
       * reaching across the front of the couple rather than one hand held
       * between them, so it wants the elbows down and the hands at waist height.
       */
      handDrop: 7,
      /**
       * How much higher the **right** hands ride than the left, px.
       *
       * The user: *"left in left, right in right"* — which crosses the two pairs
       * of arms in front of the couple, and two pairs of arms in the same place
       * at the same height are drawn through each other. The right pair on top
       * is the skater's hold as it is danced.
       */
      topRise: 3,
      /** How far the robin's hand rides over the lark's inside each join. */
      stackPx: 1,
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
    // Left in left and right in right: the promenade hold itself (FR-A2).
    hold: "promenade",
    topRise: { param: "topRise" },
    stackPx: { param: "stackPx" },
    idleHands: { kind: "down" },
  },
  holds: [],
  // **`ends: "relative"`, and the reason is measured.** A promenade around the
  // major set travels *past* the minor set it started in, and a gatherer is
  // handed the four places of its **own** group — so settling pulled the couple
  // straight back to where it began and the dance closed 68 px out, which is the
  // whole travel. A promenade is a carrier: it leaves you where it put you, and
  // the figure after it gathers. (What a gatherer would need is the lane's own
  // places, which resolution supplies only to a call that reaches past the four.)
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
};
