import type { Beat, Hand, Vec2 } from "@caller/core";
import { addScaled, dirOf, lerp, smooth } from "@caller/core";
import type { RoleName, StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import { contraFigure, joinedHands, midpoint, takeAndRelease } from "./ContraFigure.js";
import { insidePair, insideSide } from "./california-twirl.js";
import type { Pairing } from "./pairing.js";
import { pairsOf } from "./pairing.js";

/** {@link rollAway}'s parameters. */
export interface RollAwayParams extends ContraParams {
  /** Whose places trade. */
  pairs: Pairing;
  /** Which role rolls across in front; the other slides behind. */
  roller: RoleName;
  /** How far in front and behind the two pass each other, px. */
  bowPx: number;
  /** How many whole turns the roller makes on the way. */
  spins: number;
  /** How far below shoulder height the joined hands start, px. */
  holdDrop: number;
}

/**
 * Roll away with a half sashay: the couple trades places, one rolling across in
 * front while the other slides behind, and both keep facing the way they were.
 *
 * The hands are joined to start the roll and let go as it turns, because a
 * dancer spinning a whole turn cannot keep a hand on a point ten px away and
 * still have an arm that reaches it.
 */
export const rollAway = contraFigure<RollAwayParams>({
  id: "roll-away",
  call: "ROLL AWAY WITH A HALF SASHAY",
  describe:
    "Take your partner's near hand. The robin rolls across in front of the lark, turning once round as she goes, while the lark slides sideways into the place she came out of. You have traded places and you are both still facing the way you were. Four beats, hands joined through the roll.",
  lead: 4,
  beats: 4,
  defaults: { from: {}, pairs: "partners", roller: "robin", bowPx: 4.5, spins: 1, holdDrop: 6 },

  plan(ctx: PlanContext, params: RollAwayParams): FigurePlan {
    const beats = params.beats;
    const window = {
      takeFrom: 0,
      takeTo: 0.6,
      releaseFrom: Math.min(1.2, beats / 3),
      releaseTo: Math.min(2, beats / 2),
    };
    const ends: Spots = {};
    const mates: Record<StationId, StationId> = {};
    const joins: HandJoin[] = [];

    for (const [a, b] of pairsOf(params.pairs)) {
      mates[a] = b;
      mates[b] = a;
      ends[a] = { p: ctx.spot(b).p, facing: ctx.spot(a).facing };
      ends[b] = { p: ctx.spot(a).p, facing: ctx.spot(b).facing };
      const [sideA, sideB] = insidePair(ctx, a, b);
      joins.push({ a, aSide: sideA, b, bSide: sideB });
    }
    for (const id of ctx.ids) ends[id] ??= ctx.spot(id);

    const rolls = (id: StationId): boolean => ctx.role(id) === params.roller;

    const placeAt = (station: StationId, t: Beat): Spot => {
      const start = ctx.spot(station);
      const end = ends[station] ?? start;
      const k = smooth(t / beats);
      // One passes in front and one behind, so they never share a point.
      const bow = (rolls(station) ? 1 : -1) * params.bowPx * Math.sin(Math.PI * k);
      const p: Vec2 = addScaled(lerp(start.p, end.p, k), dirOf(start.facing), bow);
      const spin = rolls(station) ? 360 * params.spins * smooth(clampFrom(t, 0.8, beats)) : 0;
      return { p, facing: start.facing + spin };
    };

    return {
      ends,
      joinsAt: (t) => (t >= window.takeTo && t <= window.releaseFrom ? joins : []),
      at(station, t) {
        const self = placeAt(station, t);
        const mate = mates[station];
        if (mate === undefined) {
          return { p: self.p, facing: self.facing, hands: { L: "down", R: "down" }, amp: 0 };
        }
        const other = placeAt(mate, t);
        const side = insideSide(ctx, station, mate);
        const joined = joinedHands(ctx, station, mate, midpoint(self.p, other.p), params.holdDrop);
        const mine = joined[station];
        if (!mine) throw new Error(`roll-away: no joined hand for "${station}"`);
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            [side]: takeAndRelease(self, side, t, mine, window),
            [side === "L" ? "R" : "L"]: "down",
          } as { L: Hand | "down"; R: Hand | "down" },
          flare: rolls(station) ? 2.2 * Math.sin(Math.PI * (t / beats)) : 0,
        };
      },
    };
  },
});

/** `t` as a fraction of the window `[from, to]`, clamped to `[0, 1]`. */
const clampFrom = (t: Beat, from: Beat, to: Beat): number =>
  to <= from ? 1 : Math.max(0, Math.min(1, (t - from) / (to - from)));
