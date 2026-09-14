import type { Beat, Hand, Vec2 } from "@caller/core";
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
  takeAndRelease,
} from "./ContraFigure.js";
import type { CourtesyTurn } from "./courtesyTurn.js";
import { courtesyBackHands, courtesyHold, courtesyTurn, larkAndRobin } from "./courtesyTurn.js";
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
 * The courtesy turn is {@link courtesyTurn}, shared with the chain. This is the
 * figure whose turn is the textbook one: the couple arrives with the robin
 * already on the lark's right, closes up to the hold, and the whole of it —
 * both bodies *and* the line between them — sweeps a clean half round the point
 * between them, so they end facing back the way they came, the robin still on
 * his right and both of them on the other line. Dance it twice and everybody is
 * home, which is what "right and left through, right and left back" means.
 */
export const rightAndLeftThrough = contraFigure<RightAndLeftThroughParams>({
  id: "right-and-left-through",
  call: "RIGHT AND LEFT THROUGH",
  describe:
    "The two couples walk toward each other and pass through by the right, each dancer passing right shoulders with the one they are facing, and close up with the one they came over with. Left hand in her left, his right hand on her back and her own right hand there too, the couple turns half way round the point between them — she walks forward, he walks backward — until both of them face in again with the robin on the lark's right, and opens out on to the two places. Eight beats, both couples doing it at once; dance it twice and everybody is home. (unsure: the lark's right hand reaching round a robin who is opening out on to a place a whole set's width away is further than an arm reaches, so the last of the turn draws that arm as a straight stick.)",
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
    const openBeats = Math.min(OPEN_BEATS, turnBeats / 2);
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
    const joins: HandJoin[] = [];
    for (const { lark, robin, pivot } of couples) {
      // They arrive on the two places they walked to, the robin already on the
      // lark's right, and close up on to the hold as the hands go up.
      const turn = courtesyTurn({
        larkTake: arrival[lark]!.p,
        robinTake: arrival[robin]!.p,
        lark: ends[lark]!,
        robin: ends[robin]!,
        hold: courtesyHold(ctx.spacing, pivot, pivots),
        beats: turnBeats,
        closeBeats: openBeats,
        openBeats,
      });
      turns[lark] = { turn, mine: "lark" };
      turns[robin] = { turn, mine: "robin" };
      joins.push({ a: lark, aSide: "L", b: robin, bSide: "L" });
    }

    const placeAt = (station: StationId, t: Beat): Spot => {
      const arrive = arrival[station] ?? ctx.spot(station);
      if (t <= passBeats) {
        const step = passRight(ctx.spot(station), arrive, t, passBeats, params.bowPx);
        return { p: step.p, facing: step.facing };
      }
      const turning = turns[station];
      if (!turning) return arrive;
      const { turn, mine } = turning;
      return mine === "lark" ? turn.lark(t - passBeats) : turn.robin(t - passBeats);
    };

    // The hands go up over exactly the beats the couple spends closing, and
    // come down over exactly the beats it spends opening out: a hand that
    // finishes its take while its target is still travelling has to chase it,
    // and chasing is what the oracle's hand column sees.
    const window = {
      takeFrom: passBeats,
      takeTo: passBeats + openBeats,
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
