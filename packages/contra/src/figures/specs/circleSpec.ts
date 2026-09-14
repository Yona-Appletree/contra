import type { ContraFigure } from "../ContraFigure.js";
import type { FigureSpec, NumberExpr, PointExpr, SpecParams } from "../language/index.js";
import { compileFigureSpec } from "../language/index.js";

/**
 * How many ring places the dancers travel, signed: `places` quarters, the way
 * `direction` says. Positive is the way the ring order runs, which is the way
 * a circle left travels.
 */
const PLACES: NumberExpr = {
  number: "mul",
  of: [{ number: "select", on: "direction", cases: { left: 1, right: -1 } }, { param: "places" }],
};

/** Where the turn leaves this dancer: the place of whoever stood there. */
const END_POINT: PointExpr = {
  point: "start",
  station: { station: "ringShift", places: PLACES },
};

/**
 * `circle`, as data: take hands in a ring of four and walk it round `places`
 * quarters.
 *
 * The same figure `figures/circle.ts` codes, written in the primitive language
 * instead of a closure. It is kept beside the coded one rather than replacing
 * it — coexistence is this plan's default — and its test is the proof that the
 * interpreter reproduces a real figure exactly.
 *
 * Read it against `circle.ts`: one `ringWalk` segment for everybody, both
 * hands joined round the ring, the hold taken 0.4 beats after the dancers are
 * on the ring and dropped over the last beat and a half.
 */
export const circleSpec: FigureSpec = {
  id: "circle-data",
  call: "CIRCLE LEFT",
  lead: 4,
  beats: 8,
  defaults: { direction: "left", places: 3, holdDrop: 6, stackPx: 1 },

  tracks: {
    all: [
      {
        kind: "ringWalk",
        places: PLACES,
        // 180: the body points at the middle of the ring.
        faceOffset: 180,
        inBeats: 1.5,
        outBeats: 1.5,
        end: {
          p: END_POINT,
          facing: { angle: "bearing", from: END_POINT, to: { point: "ringCentre" } },
        },
      },
    ],
  },

  hands: {
    all: {
      // My left hand is in the right hand of the dancer one place round; my
      // right is in the left of the dancer one place back. Both joins name
      // their left-hand dancer first, which is the order the ring's own
      // `ringHands` reports them in.
      L: {
        hand: "joined",
        a: { station: { station: "self" }, side: "L" },
        b: { station: { station: "ringShift", places: 1 }, side: "R" },
        point: {
          point: "joinPoint",
          a: { station: "self" },
          aSide: "L",
          b: { station: "ringShift", places: 1 },
          bSide: "R",
        },
        drop: { param: "holdDrop" },
        stackPx: { param: "stackPx" },
        window: { take: 1.9, release: 1.5 },
      },
      R: {
        hand: "joined",
        a: { station: { station: "ringShift", places: -1 }, side: "L" },
        b: { station: { station: "self" }, side: "R" },
        point: {
          point: "joinPoint",
          a: { station: "ringShift", places: -1 },
          aSide: "L",
          b: { station: "self" },
          bSide: "R",
        },
        drop: { param: "holdDrop" },
        stackPx: { param: "stackPx" },
        window: { take: 1.9, release: 1.5 },
      },
    },
  },
};

/**
 * {@link circleSpec}, compiled.
 *
 * Deliberately **not** in `CONTRA_FIGURES`: the live registry keeps the coded
 * `circle`, and this is the proof the interpreter reproduces it. A test that
 * wants it danced puts it in `createContraRegistry`'s `extra` array, which is
 * the same seam a dance-local figure will use in M4.
 */
export const circleData: ContraFigure<SpecParams> = compileFigureSpec(circleSpec);
