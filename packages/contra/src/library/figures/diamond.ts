import { DEFAULT_BOW_PX } from "@caller/choreo";
import type {
  AngleExpr,
  FigureDefinition,
  NumberExpr,
  PointExpr,
  SequencePart,
} from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Form a diamond** (M9): the cast that makes one, which is the half of the
 * diamond M7 did not build.
 *
 * The **shape** has been in `set/shape.ts` since M7 — a kind of `SetShape` with
 * two `point` places along its axis and two `side` places across it, covered by
 * `shape.test.ts` — and nothing in the corpus made one. Jeremy Corners' A1 is
 * what does:
 *
 * ```text
 * (8) Ones pass through across (1R); turn right; cast clockwise around one;
 *     step into center and face partner in distance; form diamonds
 * ```
 *
 * Four sentences and one call, so it is one figure of four parts and eight
 * beats, ending with `ends: { target: { shape: "diamond" } }` — which is how a
 * figure declares the shape it forms (Q6, M7) and is the whole reason the
 * target solver exists.
 *
 * ## Which couple casts is the call's business
 *
 * Jeremy Corners has two passes and the second is *"the same with the twos
 * active"*, so the actives cannot be written into the definition. They are the
 * `actives` pairing — `[["1L", "1R"]]` in the first pass and `[["2L", "2R"]]`
 * in the second — and the pairing is what the `path` kind reads to decide who
 * walks and who stands (`idle`). The inactive couple is **in** the figure the
 * whole time, standing where they were, because they are two of the diamond's
 * four places and the shape could not be solved without them.
 *
 * ## The route, in slots, and the one thing that is a sign
 *
 * Every leg is written against the dancer's own slot, because "across", "down"
 * and "outside" are all different directions for the two lines of a set and for
 * the two couples of a minor set (`{ point: "slot" }`, M7's own node):
 *
 * 1. **Pass through across** — walk to where the other active is standing,
 *    right shoulders. Two dancers of one couple swap sides of the set.
 * 2. **Turn right and cast round one** — out past the line you have just
 *    arrived on and one dancing place along it, round the inactive standing
 *    there. `outPx` is how far outside, the same 10 px `cast-off` and
 *    `go-down-outside` both use.
 * 3. **Step into the centre** — to the middle of the set, `apartPx` along it
 *    from the pair you cast around, facing back at the other active.
 *
 * The sign in step 3 is the one thing the geometry cannot read off a slot: the
 * two actives are a couple, so they travel the same way along the set and "one
 * place along from the middle" is the same point for both of them. Which of the
 * two takes which end of the diamond's long axis is settled by the dancers' own
 * **contra role** (`leadRole`, the lark by default), which is a real answer in
 * both passes because every couple in a contra set is one of each.
 *
 * ## What the target does on top, and what it does not
 *
 * `settle` is **not** set. A diamond is not four places the formation has — the
 * whole point of it is that two dancers are in the middle of the set where no
 * station is — so the shape is imposed as an *arrangement* about the four
 * dancers' own centroid and nobody is pulled on to a lattice place. What that
 * means in practice is that the route above decides **where** the diamond sits
 * and how big it is, and the target decides that it is square.
 */

/** The direction from my own line to the other one: straight across the set. */
const ACROSS: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "same", along: 0 },
  to: { point: "slot", line: "other", along: 0 },
};

/** Out past the line I have just crossed to: one more step the way I walked. */
const OUTWARD: AngleExpr = ACROSS;

/** The middle of the set, level with the couple one place along from mine. */
const CENTRE_ALONG: PointExpr = {
  point: "midpoint",
  a: { point: "slot", line: "same", along: 1 },
  b: { point: "slot", line: "other", along: 1 },
};

/** The way I travel along the set. */
const ALONG_TRAVEL: AngleExpr = {
  angle: "bearing",
  from: { point: "slot", line: "same", along: 0 },
  to: { point: "slot", line: "same", along: 1 },
};

/**
 * Which end of the diamond's long axis this dancer takes: the `leadRole` one
 * ahead along the set, the other behind.
 *
 * @see diamondDefinition — the paragraph about the sign.
 */
const MY_END: NumberExpr = {
  number: "ifRole",
  role: "leadRole",
  then: { param: "apartPx" },
  else: { number: "mul", of: [{ param: "apartPx" }, -1] },
};

/** One leg of the cast: everybody the `actives` pairing names walks, the rest stand. */
function leg(share: number, ends: { p: PointExpr; facing: AngleExpr }, bow: number): SequencePart {
  return {
    beats: { share },
    shape: {
      kind: "path",
      pairing: { kind: "param", param: "actives" },
      track: {
        ends,
        curve: { kind: "walkStep", bow },
        facing: { kind: "curve" },
        idleHands: { kind: "down" },
        stepRate: { when: "moving" },
        amp: { when: "moving" },
      },
      idle: { idleHands: { kind: "down" }, amp: 0 },
    },
    holds: [],
  };
}

/** Form a diamond, as a figure definition. */
export const diamondDefinition: FigureDefinition = {
  id: "diamond",
  call: "FORM DIAMONDS",
  describe:
    "Pass through across the set with the other active, passing right shoulders, then turn to your right and cast round the dancer standing one place along the line you have arrived on, going outside the line. Come into the middle of the set and stop facing the other active a long way off. The two who stood still are the sides of the diamond and the two of you are its points.",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      /** Which couple casts: the ones in a first pass, the twos in a second. */
      actives: [["1L", "1R"]],
      /** How far outside the line the cast goes, px — `cast-off`'s own number. */
      outPx: 10,
      /** How far along the set from the middle each active stops, px. */
      apartPx: 14,
      /** Which of the two actives takes the far end of the diamond. */
      leadRole: "lark",
    },
  },
  shape: {
    kind: "sequence",
    parts: [
      // **Pass through across (1R).** Walk to where the other active is
      // standing, right shoulders — which is each dancer bowing to their own
      // left, `pass-through`'s own rule.
      leg(
        0.25,
        {
          p: { point: "start", role: { role: "mate" } },
          facing: {
            angle: "bearing",
            from: { point: "start", role: { role: "self" } },
            to: { point: "start", role: { role: "mate" } },
          },
        },
        DEFAULT_BOW_PX,
      ),
      // **Turn right and cast clockwise around one.** Out past the line you
      // have arrived on and one dancing place along it.
      leg(
        0.375,
        {
          p: {
            point: "offset",
            from: { point: "slot", line: "other", along: 1 },
            along: OUTWARD,
            distance: { param: "outPx" },
          },
          facing: ALONG_TRAVEL,
        },
        0,
      ),
      // **Step into the centre and face your partner in distance.**
      leg(
        0.375,
        {
          p: { point: "offset", from: CENTRE_ALONG, along: ALONG_TRAVEL, distance: MY_END },
          facing: { angle: "sum", of: [ALONG_TRAVEL, 180] },
        },
        0,
      ),
    ],
  },
  holds: [],
  ends: { target: { shape: "diamond" } },
  timing: { stretch: "distance", profile: "smooth" },
  symmetry: {
    mirror: {
      kind: "handed",
      why: "the pass through is right shoulders and the cast is clockwise; the mirror image is a diamond formed the other way round, which no dance in the corpus calls",
    },
  },
};
