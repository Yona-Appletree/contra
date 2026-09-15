import type { Beat } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import { bearing, contraFigure, holdWindow, isHeld, takeAndRelease } from "./ContraFigure.js";
import { ringFor, ringHands, ringHangDrop, ringShift, ringWalk } from "./ring.js";

/** {@link circle}'s parameters. */
export interface CircleParams extends ContraParams {
  /** Which way the ring travels. */
  direction: "left" | "right";
  /** How many places round, in quarters of the ring: 3 or 4 in most dances. */
  places: number;
  /**
   * The lowest the joined hands hang, px below the shoulder — a floor rather
   * than a height (FR-A2): see `ring.ts`'s `ringHangDrop`.
   */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
}

/** Beats spent stepping in to the ring, and out of it again. */
const IN_BEATS = 1.5;
const OUT_BEATS = 1.5;

/**
 * Circle: take hands in a ring of four and walk it round `places` quarters.
 *
 * The ring is regular even though the places the dancers come from are a
 * rectangle — a ring of joined hands has to have the same distance between
 * every pair of neighbours, and that distance is the frame's hold spacing, so
 * every arm reaches. Everybody steps in over the first beat and a half, the
 * ring turns, and everybody steps out to the place the turn has brought them
 * to, facing the middle.
 */
export const circle = contraFigure<CircleParams>({
  id: "circle",
  call: "CIRCLE LEFT",
  describe:
    "All four join hands in a ring and walk round — circle left means the way your left hand is pointing, clockwise seen from above. Three quarters is the usual amount, which lands you one place back from where you started. Keep the hands joined and the ring the same size the whole way round.",
  lead: 4,
  beats: 8,
  defaults: { from: {}, direction: "left", places: 3, holdDrop: 13, stackPx: 1 },

  plan(ctx: PlanContext, params: CircleParams): FigurePlan {
    const ring = ringFor(ctx);
    const step = 360 / ring.order.length;
    const sign = params.direction === "left" ? 1 : -1;
    const turn = sign * params.places * step;
    const beats = params.beats;
    const window = holdWindow(beats, IN_BEATS + 0.4, OUT_BEATS);

    const ends: Spots = {};
    for (const id of ctx.ids) {
      const p = ctx.spot(ringShift(ring, id, sign * params.places)).p;
      ends[id] = { p, facing: bearing(p, ring.centre) };
    }

    const walk = { inBeats: IN_BEATS, outBeats: OUT_BEATS, turn, faceOffset: 180 };
    const placeAt = (id: StationId, t: Beat): Spot =>
      ringWalk(ring, id, ctx.spot(id), ends[id] ?? ctx.spot(id), t, beats, walk);

    const joinedAt = (
      t: Beat,
    ): { hands: ReturnType<typeof ringHands>["hands"]; joins: HandJoin[] } => {
      const at = (id: StationId): Spot => placeAt(id, t);
      // The hands **hang** rather than being held at a height (FR-A2): see
      // `ringHangDrop`. `holdDrop` is the floor, not the answer.
      return ringHands(ctx, ring, at, ringHangDrop(ring, at, params.holdDrop), params.stackPx);
    };

    return {
      ends,
      joinsAt: (t) => (isHeld(window, t) ? joinedAt(t).joins : []),
      at(station, t) {
        const self = placeAt(station, t);
        const hands = joinedAt(t).hands[station];
        if (!hands) throw new Error(`circle: no hands for station "${station}"`);
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            L: takeAndRelease(self, "L", t, hands.L, window),
            R: takeAndRelease(self, "R", t, hands.R, window),
          },
        };
      },
    };
  },
});
