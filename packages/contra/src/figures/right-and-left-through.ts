import type { Beat, Hand, Vec2 } from "@caller/core";
import { mix, ramp } from "@caller/core";
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
  nearestTurn,
  joinPoint,
  joinedHands,
  midpoint,
  passRight,
  takeAndRelease,
} from "./ContraFigure.js";
import type { CourtesyTurn } from "./courtesyTurn.js";
import {
  COURTESY_PIVOT_FROM_LARK_PX,
  courtesyBackHands,
  courtesyHold,
  courtesyTurn,
  larkAndRobin,
} from "./courtesyTurn.js";
import { aheadPairs } from "./pass-through.js";
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
  /**
   * How far from the lark the couple pivots, px; see
   * {@link COURTESY_PIVOT_FROM_LARK_PX}. The same helper and the same default
   * as the chain's.
   */
  pivotFromLark: number;
}

/**
 * Right and left through: pass the dancer you are facing by the right, and
 * courtesy turn with the one you came over with.
 *
 * Who you pass is who is *in front of you* ({@link aheadPairs}), which in duple
 * improper is your neighbour 20 px down the line and in becket the dancer
 * opposite. Before F4 it was whoever stood across the set's short axis, which
 * in duple improper is the partner standing beside you: the two of them walked
 * through each other's places and nobody ever passed anybody.
 *
 * The courtesy turn is {@link courtesyTurn}, shared with the chain, with the
 * same `pivotFromLark` and the same default. This is the figure whose turn is
 * the textbook one: the couple walks over with the robin already on the lark's
 * right and stops short of the far line, and the whole of it — both bodies
 * *and* the line between them — pivots as one rigid body a half round a point
 * near the lark, so they end facing back the way they came, the robin still on
 * his right and both of them on the other line.
 * Dance it twice and everybody is home, which is what "right and left through,
 * right and left back" means.
 */
export const rightAndLeftThrough = contraFigure<RightAndLeftThroughParams>({
  id: "right-and-left-through",
  call: "RIGHT AND LEFT THROUGH",
  describe:
    "The two couples walk toward each other and pass through by the right, each dancer passing right shoulders with the one they are facing, and close up with the one they came over with, stopping short of the far line — the lark sliding the further of the two, because the couple closes up about the point it is going to turn about. Left hand in her left, her own right hand behind her back and his right hand on it, the couple pivots as one, a half turn about a point near the lark — he backs round a small circle of his own, she walks the big arc round him, and the arms stay put — until both of them face in again with the robin still on the lark's right, and then opens out on to the two places. Eight beats, both couples doing it at once; dance it twice and everybody is home. (unsure: exact pivot distance — the user judges by eye. And a hall turns a courtesy turn at a hold and stands in the lines at a hold, where this model's lines are nearly four times that far apart, so the couple stops short of the line to turn and opens out again as it lets go.)",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    couples: "partners",
    passBeats: 3.5,
    bowPx: DEFAULT_BOW_PX,
    holdDrop: 6,
    stackPx: 1,
    pivotFromLark: COURTESY_PIVOT_FROM_LARK_PX,
  },

  plan(ctx: PlanContext, params: RightAndLeftThroughParams): FigurePlan {
    const beats = params.beats;
    const passBeats = Math.min(params.passBeats, beats);
    const turnBeats = beats - passBeats;
    const closeBeats = Math.min(CLOSE_BEATS, turnBeats / 3);
    const openBeats = Math.min(OPEN_BEATS, (turnBeats - closeBeats) / 2);
    const ahead = aheadPairs(ctx);

    /** Where the pass through leaves everybody, before the couples close up. */
    const arrival: Spots = {};
    for (const id of ctx.ids) {
      const to = ctx.spot(ahead[id]!).p;
      arrival[id] = { p: to, facing: bearing(ctx.spot(id).p, to) };
    }

    // The couple turns as one: half way round puts each on the other's arrival
    // place, facing back the way they came.
    const ends: Spots = {};
    const couples: { lark: StationId; robin: StationId; pivot: Vec2 }[] = [];
    for (const pair of pairsOf(params.couples)) {
      const [lark, robin] = larkAndRobin(ctx, pair);
      const arriveLark = arrival[lark]!;
      const arriveRobin = arrival[robin]!;
      ends[lark] = { p: arriveRobin.p, facing: arriveLark.facing + 180 };
      ends[robin] = { p: arriveLark.p, facing: arriveRobin.facing + 180 };
      couples.push({ lark, robin, pivot: midpoint(ends[lark]!.p, ends[robin]!.p) });
    }
    for (const id of ctx.ids) ends[id] ??= arrival[id] ?? ctx.spot(id);

    const pivots = couples.map((couple) => couple.pivot);
    const turns: Record<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }> = {};
    const takes: Spots = {};
    const joins: HandJoin[] = [];
    for (const { lark, robin, pivot } of couples) {
      // The robin is already on the lark's right as the two of them walk over,
      // and the couple's turn is rigid, so the take is exactly the pair of end
      // places reflected through the pivot: the pass through stops short of the
      // far line rather than walking on to it and closing up afterward. With
      // the pivot near the lark the reflection is no longer even — his take is
      // `2 × pivotFromLark` from his place and hers is a hold behind his — so
      // the closing up below slides him further than her.
      const turn = courtesyTurn({
        lark: ends[lark]!,
        robin: ends[robin]!,
        hold: courtesyHold(ctx.spacing, pivot, pivots, params.pivotFromLark),
        beats: turnBeats - closeBeats,
        openBeats,
        pivotFromLark: params.pivotFromLark,
      });
      turns[lark] = { turn, mine: "lark" };
      turns[robin] = { turn, mine: "robin" };
      takes[lark] = turn.takes.lark;
      takes[robin] = turn.takes.robin;
      joins.push({ a: lark, aSide: "L", b: robin, bSide: "L" });
    }

    const placeAt = (station: StationId, t: Beat): Spot => {
      const arrive = arrival[station] ?? ctx.spot(station);
      if (t <= passBeats) {
        const step = passRight(ctx.spot(station), arrive, t, passBeats, params.bowPx);
        return { p: step.p, facing: step.facing };
      }
      const turning = turns[station];
      const take = takes[station];
      if (!turning || !take) return arrive;
      // The couple walks all the way through and *then* closes up on to the
      // hold, rather than aiming short of the far line from the start: the two
      // dancers who pass right shoulders would otherwise be walking 4.25 px
      // nearer each other the whole way over, which in becket is the difference
      // between 10 px of daylight and 5.7. Closing after the pass is a straight
      // slide with no turn in it — the take faces the way the walk arrived — so
      // the rotation that follows is still the whole of the couple's turning.
      if (t <= passBeats + closeBeats) {
        const k = ramp(t, passBeats, passBeats + closeBeats);
        return {
          p: [mix(arrive.p[0], take.p[0], k), mix(arrive.p[1], take.p[1], k)],
          facing: mix(arrive.facing, nearestTurn(arrive.facing, take.facing), k),
        };
      }
      const into = t - passBeats - closeBeats;
      const { turn, mine } = turning;
      return mine === "lark" ? turn.lark(into) : turn.robin(into);
    };

    // The hands go up over the first beats of the rigid turn and come down over
    // exactly the beats the couple spends opening out: a hand that finishes its
    // take while its target is still travelling has to chase it, and chasing is
    // what the oracle's hand column sees.
    const window = {
      takeFrom: passBeats,
      takeTo: passBeats + closeBeats,
      releaseFrom: beats - openBeats,
      releaseTo: beats,
    };

    return {
      ends,
      joinsAt: (t) => (t >= window.takeTo && t <= window.releaseFrom ? joins : []),
      at(station, t) {
        const self = placeAt(station, t);
        const turning = turns[station];
        const mate = turning ? mustPair(params.couples, station) : undefined;
        if (mate === undefined || !turning) {
          return { p: self.p, facing: self.facing, hands: { L: "down", R: "down" }, amp: 1 };
        }
        const other = placeAt(mate, t);
        const isLark = turning.mine === "lark";
        // Both left hands on one point: the midpoint of the two left shoulders.
        const point = joinPoint(self, "L", other, "L");
        const joined = joinedHands(ctx, station, mate, point, params.holdDrop, params.stackPx);
        const mine = joined[station];
        if (!mine) throw new Error(`right-and-left-through: no joined hand for "${station}"`);
        // Both right hands go to the robin's back: two points, never a join.
        const back = courtesyBackHands(isLark ? other : self, isLark ? self : other);
        const free: Hand = isLark ? back.lark : back.robin;
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            L: takeAndRelease(self, "L", t, mine, window),
            R: takeAndRelease(self, "R", t, free, window),
          },
          stepRate: 1,
        };
      },
    };
  },
});

/**
 * How long the couple takes to open out on to its two places, beats.
 *
 * The turn happens at the hold and the places are a set's width apart, so the
 * last beat and a half of the figure is the couple opening out and letting go
 * at the same time — which is the only moment either arm has to stretch.
 */
const OPEN_BEATS: Beat = 1.5;

/**
 * How long the couple takes to close up from the two far places on to the hold,
 * beats.
 *
 * The pass through walks everybody the whole way over — that is what keeps the
 * two dancers who pass right shoulders apart — so the couple arrives a set's
 * width apart and has to come in to the hold before it can turn. It is a slide,
 * not a turn: the rotation that follows it is rigid and is the whole of the
 * 180°, and this is also the beat the hands go up over, so no hand is chasing a
 * point that is still travelling.
 */
const CLOSE_BEATS: Beat = 1;
