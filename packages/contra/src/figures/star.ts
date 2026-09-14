import type { Beat, Hand, Side } from "@caller/core";
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
import { ringFor, ringShift, ringWalk } from "./ring.js";

/** {@link star}'s parameters. */
export interface StarParams extends ContraParams {
  /** Which hand goes in the middle. */
  hand: Side;
  /** How many places round, in quarters: 3 or 4 in most dances. */
  places: number;
  /** How far below shoulder height the hands in the middle sit, px. */
  holdDrop: number;
  /** How much higher the robins' hands sit than the larks', px. */
  stackPx: number;
}

const IN_BEATS = 1.5;
const OUT_BEATS = 1.5;

/**
 * Star: hands across in the middle and walk it round.
 *
 * Everybody's giving hand is at one floor point — the middle of the star —
 * with the robins' hands stacked above the larks', which is the hands-across
 * hold seen from above. The bodies face the way they travel, so a right-hand
 * star keeps the middle on everybody's right.
 */
export const star = contraFigure<StarParams>({
  id: "star",
  call: "STAR RIGHT",
  lead: 4,
  beats: 8,
  defaults: { from: {}, hand: "R", places: 4, holdDrop: 3, stackPx: 1.2 },

  plan(ctx: PlanContext, params: StarParams): FigurePlan {
    const ring = ringFor(ctx);
    const step = 360 / ring.order.length;
    // A right-hand star keeps the middle on the dancer's right, which turns the
    // ring the same way a circle left goes; a left-hand star turns back.
    const sign = params.hand === "R" ? 1 : -1;
    const faceOffset = sign * 90;
    const turn = sign * params.places * step;
    const beats = params.beats;
    const window = holdWindow(beats, IN_BEATS + 0.4, OUT_BEATS);
    const free: Side = params.hand === "R" ? "L" : "R";

    const ends: Spots = {};
    for (const id of ctx.ids) {
      const p = ctx.spot(ringShift(ring, id, sign * params.places)).p;
      ends[id] = { p, facing: bearing(ring.centre, p) + faceOffset };
    }

    const walk = { inBeats: IN_BEATS, outBeats: OUT_BEATS, turn, faceOffset };
    const placeAt = (id: StationId, t: Beat): Spot =>
      ringWalk(ring, id, ctx.spot(id), ends[id] ?? ctx.spot(id), t, beats, walk);

    // The hands across: one floor point for all four, the top role's above.
    const middle = (id: StationId): Hand => ({
      p: ring.centre,
      drop:
        ctx.role(id) === ctx.roleSet.top
          ? params.holdDrop - params.stackPx / 2
          : params.holdDrop + params.stackPx / 2,
    });

    const joins: HandJoin[] = [];
    const n = ring.order.length;
    for (let k = 0; k < n / 2; k++) {
      const a = ring.order[k]!;
      const b = ring.order[(k + n / 2) % n]!;
      joins.push({ a, aSide: params.hand, b, bSide: params.hand });
    }

    return {
      ends,
      joinsAt: (t) => (isHeld(window, t) ? joins : []),
      at(station, t) {
        const self = placeAt(station, t);
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            [params.hand]: takeAndRelease(self, params.hand, t, middle(station), window),
            [free]: "down",
          } as { L: Hand | "down"; R: Hand | "down" },
        };
      },
    };
  },
});
