import type { Angle, Beat, Hand, Side, Vec2 } from "@caller/core";
import { addScaled, angleLerp, dirOf, dist, lerpHand, mix, ramp } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import { bearing, contraFigure, midpoint, orbitRadius, polar } from "./ContraFigure.js";
import type { Pairing } from "./pairing.js";
import { pairsOf } from "./pairing.js";
import { handDown } from "../pair/PairFrame.js";
import { TURN_RADIUS_PX } from "../pair/allemande.js";
import { trapezoid } from "../pair/trapezoid.js";
import { stationHalf } from "./swing.js";

/** {@link allemande}'s parameters. */
export interface AllemandeParams extends ContraParams {
  /** Who turns with whom. */
  pairs: Pairing;
  /** Which hand is given. */
  hand: Side;
  /** How far round: once, once and a half, twice. */
  amount: number;
  /**
   * How many degrees each body turns toward the centre on top of walking the
   * circle, so the arm has something to pull against. M5's gate-3 tuning.
   */
  inward: number;
  /** How far below shoulder height the one joined hand sits, px. */
  holdDrop: number;
  /** How far from the centre each dancer ends, px. `null` takes it from the formation. */
  endHalf: number | null;
}

/**
 * Allemande: give one hand in the middle and walk round it.
 *
 * The joined hand is one floor point at the pair's centre, held high, and each
 * body turns `inward` degrees toward it rather than walking a straight line
 * past the partner — both M5's, from gate 3. The turning radius is M5's too
 * unless the pair beside them is close enough that it would not fit, in which
 * case they turn tighter; see `orbitRadius`.
 */
export const allemande = contraFigure<AllemandeParams>({
  id: "allemande",
  call: "ALLEMANDE",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    pairs: "neighbors",
    hand: "L",
    amount: 1,
    inward: 20,
    holdDrop: 2,
    endHalf: null,
  },

  plan(ctx: PlanContext, params: AllemandeParams): FigurePlan {
    const beats = params.beats;
    const spin = params.hand === "L" ? -1 : 1;
    const turn = spin * 360 * params.amount;
    const pairOf: Record<StationId, TurnPair> = {};
    const ends: Spots = {};
    const joins: HandJoin[] = [];

    const centres = pairsOf(params.pairs).map(([a, b]) =>
      midpoint(ctx.spot(a).p, ctx.spot(b).p),
    );
    pairsOf(params.pairs).forEach(([a, b], index) => {
      const centre = centres[index]!;
      const half = params.endHalf ?? stationHalf(ctx.stations, a, b);
      const pair: TurnPair = {
        centre,
        half,
        radius: orbitRadius(TURN_RADIUS_PX, centre, centres),
        other: { [a]: b, [b]: a },
      };
      pairOf[a] = pair;
      pairOf[b] = pair;
      for (const id of [a, b]) {
        const angle = bearing(centre, ctx.spot(id).p) + turn;
        ends[id] = { p: polar(centre, angle, half), facing: angle + 180 };
      }
      joins.push({ a, aSide: params.hand, b, bSide: params.hand });
    });
    for (const id of ctx.ids) ends[id] ??= ctx.spot(id);

    const placeAt = (station: StationId, t: Beat): Spot => {
      const pair = pairOf[station];
      if (!pair) return ctx.spot(station);
      const start = ctx.spot(station);
      const from = bearing(pair.centre, start.p);
      const angle = from + turn * trapezoid(t, 0.8, 1.8, beats - 1.6, beats - 0.6);
      const out = ramp(t, 0, 1.3);
      const close = ramp(t, beats - 1.1, beats);
      const radius = mix(
        mix(dist(pair.centre, start.p), pair.radius, out),
        pair.half,
        close,
      );

      const toPartner = ramp(t, 0.1, 0.9);
      const toTurn = ramp(t, 0.9, 1.9);
      const back = ramp(t, beats - 1.2, beats - 0.2);
      let facing = angleLerp(start.facing, angle + 180, toPartner);
      facing = angleLerp(facing, angle + spin * (90 + params.inward), toTurn);
      facing = angleLerp(facing, angle + 180, back);
      return { p: polar(pair.centre, angle, radius), facing };
    };

    const window = { take: [0.4, 1.3], release: [beats - 0.9, beats - 0.1] } as const;

    return {
      ends,
      joinsAt: (t) => (t >= window.take[1] && t <= window.release[0] ? joins : []),
      at(station, t) {
        const pair = pairOf[station];
        const self = placeAt(station, t);
        const free: Side = params.hand === "L" ? "R" : "L";
        if (!pair) {
          return { p: self.p, facing: self.facing, hands: { L: "down", R: "down" }, amp: 0 };
        }
        const joined: Hand = { p: pair.centre, drop: params.holdDrop };
        const down = (side: Side): Hand => handDown(self.p, self.facing, side, t, 0);
        const given = lerpHand(
          lerpHand(down(params.hand), joined, ramp(t, window.take[0], window.take[1])),
          down(params.hand),
          ramp(t, window.release[0], window.release[1]),
        );
        return {
          p: self.p,
          facing: self.facing,
          look: bearing(self.p, pair.centre),
          hands: { [params.hand]: given, [free]: "down" } as {
            L: Hand | "down";
            R: Hand | "down";
          },
        };
      },
    };
  },
});

/** What one turning pair needs to know about itself. */
interface TurnPair {
  centre: Vec2;
  /** How far from the centre the dancers end, px. */
  half: number;
  /** How far from the centre they turn, px. */
  radius: number;
  other: Record<StationId, StationId>;
}

/** Where a dancer stands `r` px from `centre` at `angle`; re-exported for the tests. */
export const turnPlace = (centre: Vec2, angle: Angle, r: number): Vec2 =>
  addScaled(centre, dirOf(angle), r);
