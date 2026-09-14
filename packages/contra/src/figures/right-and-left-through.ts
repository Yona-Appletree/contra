import type { Beat, Side, Vec2 } from "@caller/core";
import { angleLerp, dist, smooth } from "@caller/core";
import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import {
  bearing,
  contraFigure,
  joinPoint,
  joinedHands,
  midpoint,
  passRight,
  polar,
  takeAndRelease,
} from "./ContraFigure.js";
import { facingPairs } from "./pass-through.js";
import type { Pairing } from "./pairing.js";
import { mustPair, pairsOf } from "./pairing.js";

/** {@link rightAndLeftThrough}'s parameters. */
export interface RightAndLeftThroughParams extends ContraParams {
  /** Which two dancers make a couple for the courtesy turn. */
  couples: Pairing;
  /** How long the pass across takes, in beats; the rest is the courtesy turn. */
  passBeats: Beat;
  /** How far each dancer bows to their own left so they pass right shoulders, px. */
  bowPx: number;
  /** How far below shoulder height the courtesy turn's joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
}

/**
 * Right and left through: pass the dancer across the set by the right, and
 * courtesy turn with the one you came over with.
 *
 * The courtesy turn is the couple turning as one about the point between them,
 * their left hands joined at one floor point, which leaves them facing back
 * across the set with the robin still on the lark's right — and on the other
 * line, which is the whole point of the figure.
 */
export const rightAndLeftThrough = contraFigure<RightAndLeftThroughParams>({
  id: "right-and-left-through",
  call: "RIGHT AND LEFT THROUGH",
  describe:
    "The two couples walk toward each other and pass through by the right, each dancer passing right shoulders with the one opposite. On the far side each lark takes the robin who has arrived beside him — his left hand in her left, his right behind her back — and courtesy turns her: he backs up while she walks forward round him, and the couple ends facing back across the set. Eight beats, both couples doing it at once.",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    couples: "partners",
    passBeats: 3.5,
    bowPx: DEFAULT_BOW_PX,
    holdDrop: 6,
    stackPx: 1,
  },

  plan(ctx: PlanContext, params: RightAndLeftThroughParams): FigurePlan {
    const beats = params.beats;
    const passBeats = Math.min(params.passBeats, beats);
    const turnBeats = beats - passBeats;
    const across = facingPairs(ctx, "across");

    /** Where the pass across leaves everybody, before the courtesy turn. */
    const arrival: Spots = {};
    for (const id of ctx.ids) {
      const other = across[id];
      if (other === undefined)
        throw new Error(`right-and-left-through: nobody across from "${id}"`);
      const to = ctx.spot(other).p;
      arrival[id] = { p: to, facing: bearing(ctx.spot(id).p, to) };
    }

    const ends: Spots = {};
    const centres: Record<StationId, Vec2> = {};
    const joins: HandJoin[] = [];
    for (const [a, b] of pairsOf(params.couples)) {
      const arriveA = arrival[a]!;
      const arriveB = arrival[b]!;
      const centre = midpoint(arriveA.p, arriveB.p);
      centres[a] = centre;
      centres[b] = centre;
      // The couple turns as one: half way round puts each on the other's
      // arrival place, facing back the way they came.
      ends[a] = { p: arriveB.p, facing: arriveA.facing + 180 };
      ends[b] = { p: arriveA.p, facing: arriveB.facing + 180 };
      joins.push({ a, aSide: "L", b, bSide: "L" });
    }
    for (const id of ctx.ids) ends[id] ??= arrival[id] ?? ctx.spot(id);

    const placeAt = (station: StationId, t: Beat): Spot => {
      const arrive = arrival[station] ?? ctx.spot(station);
      if (t <= passBeats) {
        const step = passRight(ctx.spot(station), arrive, t, passBeats, params.bowPx);
        return { p: step.p, facing: step.facing };
      }
      const centre = centres[station];
      if (!centre) return arrive;
      const k = smooth((t - passBeats) / turnBeats);
      const from = bearing(centre, arrive.p);
      return {
        p: polar(centre, from + 180 * k, dist(centre, arrive.p)),
        facing: angleLerp(arrive.facing, arrive.facing + 180, k),
      };
    };

    const window = {
      takeFrom: passBeats,
      takeTo: passBeats + Math.min(1, turnBeats / 2),
      releaseFrom: beats - Math.min(0.8, turnBeats / 4),
      releaseTo: beats,
    };

    return {
      ends,
      joinsAt: (t) => (t >= window.takeTo && t <= window.releaseFrom ? joins : []),
      at(station, t) {
        const self = placeAt(station, t);
        const mate = centres[station] ? mustPair(params.couples, station) : undefined;
        if (mate === undefined) {
          return { p: self.p, facing: self.facing, hands: { L: "down", R: "down" }, amp: 1 };
        }
        const other = placeAt(mate, t);
        // Both left hands on one point: the midpoint of the two left shoulders.
        const point = joinPoint(self, "L", other, "L");
        const joined = joinedHands(ctx, station, mate, point, params.holdDrop, params.stackPx);
        const mine = joined[station];
        if (!mine) throw new Error(`right-and-left-through: no joined hand for "${station}"`);
        const side: Side = "L";
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            L: takeAndRelease(self, side, t, mine, window),
            R: "down",
          },
          stepRate: 1,
        };
      },
    };
  },
});
