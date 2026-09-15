import type { AngleExpr, FigureDefinition, NumberExpr, SideRule } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **California twirl**, as data: one hand held up, the other dancer walks under
 * it, and the two of them come out the other way round.
 *
 * The user, on the Moves page:
 *
 * > "totally wrong. they should start facing each other or facing a direction
 * > together or at 45deg like from a circle, holding either left-in-right or
 * > right-in-left, lark raises the hand, robin walks under, their direction
 * > switches. used to switch direction (and place) often in a progression."
 *
 * Four things in that, and the old figure had none of them.
 *
 * 1. **A named hand.** It took "the inside hand", which is a rule about two
 *    dancers standing side by side and answers *nothing* for a couple standing
 *    face to face — both of them offer the same hand and `noInsideHands` quietly
 *    declines to place either. A twirl is called from face to face, from a
 *    shared direction and from 45° out of a circle alike, so the hold is
 *    **named**: `hand` is `"right-in-left"` (the raiser's right in the other's
 *    left) or `"left-in-right"`, and `raises` says whose hand goes up.
 * 2. **They close up.** The old figure swung the pair round the point between
 *    them at whatever radius they happened to stand at, which for a hands-four's
 *    partners is sixteen px — so the two of them windmilled round each other at
 *    a whole set's width, with an arm stretched 16 px when the rendering
 *    contract gives it 15. They come together to `closePx` now, turn, and open
 *    out on to each other's places.
 * 3. **One of them goes under.** `duckPx` is the bow that makes the difference:
 *    the one walking under turns tightly, inside the pair's own circle, while
 *    the raiser walks the circle itself, round the outside of her.
 * 4. **The arch is over the dancer under it**, not half way between the two:
 *    `{ kind: "over" }`, a px and a half back along the line toward the raiser,
 *    which puts it within a bent arm of both of them.
 *
 * **What is still crowded, measured.** A hands-four twirls *both* its couples
 * at once, about centres one place pitch — 20 px — apart, and half way through
 * a half turn every dancer is on the set's own midline by construction. At
 * `closePx: 12` the two outermost dancers pass 8.0 px apart, which is exactly
 * AC6's floor and no more; the four of them read as a short column at the
 * midpoint. That is what two couples twirling in one hands-four looks like from
 * above, and the only ways out of it are a wider close (which costs the
 * clearance) or a figure for one couple at a time (which `actors` does not yet
 * say).
 *
 * The outcome was already right and is unchanged: half a turn about the point
 * between them exchanges their places and reverses both facings, which is the
 * "switch direction (and place)" a progression uses it for.
 *
 * **How high the arch is, is the renderer's business and it is already as high
 * as it goes.** `Hand.drop` is measured *down* from shoulder height and the arm
 * solver clamps it at zero (`kinematics/Arm.ts`: `hz = -Math.max(0, drop)`), so
 * `holdDrop: 0` — the coded figure's own default — already draws the highest
 * hand the contract has. Raising it further is a rendering-contract change and
 * not a figure's to make.
 */

/** Half a turn, the way `direction` says. */
const HALF: AngleExpr = { number: "mul", of: [180, { param: "direction" }] };

/**
 * Which of your hands is in theirs: the raiser's is the one `hand` names first,
 * and the dancer walking under gives the other.
 */
const TWIRL_HAND: SideRule = {
  ifRole: "raises",
  then: { select: "hand", cases: { "left-in-right": "L", "right-in-left": "R" } },
  else: { select: "hand", cases: { "left-in-right": "R", "right-in-left": "L" } },
};

/**
 * The raiser walks the pair's own circle; the dancer under the arch turns
 * inside it.
 *
 * The duck is **hers alone** and not a spread of the two of them, because the
 * pair has another pair turning a place pitch away and only the outermost
 * radius decides whether the two of them clear it: two couples of a hands-four
 * close to `closePx` and turn about centres 20 px apart, which leaves
 * `20 − closePx` px between the two outer dancers at the moment they pass.
 */
const DUCK: NumberExpr = {
  number: "ifRole",
  role: "raises",
  then: 0,
  else: { number: "mul", of: [{ param: "duckPx" }, -1] },
};

/** California twirl, as a figure definition. */
export const californiaTwirlDefinition: FigureDefinition = {
  id: "california-twirl",
  call: "CALIFORNIA TWIRL",
  describe:
    "Join one hand with your partner — the lark's right in the robin's left, or the other way about — and the lark puts it up. Come together, the robin walks under the arch while the lark walks round the outside of her, and the two of you come out on each other's places facing back the way you came. It works from side by side, from face to face, or from wherever a circle left you. Four beats, the hand held the whole way through.",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      pairs: "partners",
      holdDrop: 0,
      direction: 1,
      /** Whose hand goes up; the other one walks under it. */
      raises: "lark",
      /**
       * Which pair of hands, **the raiser's named first**: `"right-in-left"` is
       * his right in her left, which is the inside hand of a couple standing
       * the way a contra couple stands — the robin on the lark's right — and so
       * the default. `"left-in-right"` is the other hold, the outside hands,
       * which a call coming out of a circle or a promenade may want.
       */
      hand: "right-in-left",
      /**
       * How close the two of them come to turn, px.
       *
       * Twelve rather than a hold spacing's fourteen, and the two px are the
       * pair turning beside them: a hands-four's two couples turn about centres
       * one place pitch — 20 px — apart, so the gap between the two outermost
       * dancers as they pass is `20 − closePx`, and AC6 asks for eight.
       */
      closePx: 12,
      /** How long the closing in and the opening out each take, beats. */
      closeBeats: 1,
      /** How far inside the turn the dancer under the arch goes, px. */
      duckPx: 2,
      /** How far back from their head, toward the raiser, the arch sits, px. */
      archBackPx: 1.5,
    },
  },
  shape: {
    kind: "path",
    pairing: { kind: "param", param: "pairs" },
    track: {
      // Their place, facing back the way you came.
      ends: {
        p: { point: "start", role: { role: "mate" } },
        facing: {
          angle: "sum",
          of: [{ angle: "facingOf", role: { role: "self" }, at: "start" }, HALF],
        },
      },
      curve: {
        kind: "arc",
        sweep: HALF,
        hold: { number: "mul", of: [{ param: "closePx" }, 0.5] },
        closeBeats: { param: "closeBeats" },
        bow: DUCK,
      },
      facing: { kind: "withArc" },
      idleHands: { kind: "down" },
    },
    idle: { idleHands: { kind: "down" }, amp: 0 },
  },
  holds: [
    {
      // The arch: one named hand in one named hand, held over the head of the
      // dancer walking under it.
      kind: "mate",
      side: TWIRL_HAND,
      point: {
        kind: "over",
        // The dancer walking under it: my mate if I am the one raising, and me
        // if I am not.
        role: { role: "ifRole", is: "raises", then: { role: "mate" }, else: { role: "self" } },
        back: { param: "archBackPx" },
      },
      drop: { param: "holdDrop" },
      window: { kind: "holdWindow", take: 1, release: 1 },
    },
  ],
  ends: "relative",
  timing: { stretch: "distance", profile: "cruise" },
  // The two places a twirl ends on are the same either way round; the arc
  // between them is the mirror image, which is `direction` — and a mirror swaps
  // the two hands, which is what `hand`'s two words say.
  symmetry: {
    mirror: {
      kind: "parameters",
      signs: ["direction"],
      words: { hand: { "left-in-right": "right-in-left", "right-in-left": "left-in-right" } },
    },
    // "The robin raises and the lark goes under" is this figure with one word
    // changed, which is what a role swap is for.
    roles: ["raises"],
  },
};
