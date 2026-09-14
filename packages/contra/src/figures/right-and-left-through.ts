import type { Beat, Side } from "@caller/core";
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
  passRight,
  takeAndRelease,
} from "./ContraFigure.js";
import type { CourtesyTurn } from "./courtesyTurn.js";
import { courtesyTurn, larkAndRobin } from "./courtesyTurn.js";
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
 * The courtesy turn is {@link courtesyTurn}, shared with the chain: the couple
 * turns as one about the point between them, their left hands joined at one
 * floor point, the lark walking backward and the robin forward, which leaves
 * them facing back across the set with the robin still on the lark's right —
 * and on the other line, which is the whole point of the figure. Dance it
 * twice and everybody is home, which is what "right and left through, right
 * and left back" means.
 */
export const rightAndLeftThrough = contraFigure<RightAndLeftThroughParams>({
  id: "right-and-left-through",
  call: "RIGHT AND LEFT THROUGH",
  describe:
    "The two couples walk toward each other and pass through by the right, each dancer passing right shoulders with the one they are facing. On the far side each lark takes the robin he came over with — his left hand in her left — and courtesy turns her: he walks backward while she walks forward round him, half way round the point between them, and the couple ends facing back the way it came with the robin still on the lark's right. Eight beats, both couples doing it at once; dance it twice and everybody is home. (unsure: the lark's right hand belongs on the robin's back through the turn and hangs at his side instead, which is the drawn arm's business and not the figure's.)",
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
    const ahead = aheadPairs(ctx);

    /** Where the pass through leaves everybody, before the courtesy turn. */
    const arrival: Spots = {};
    for (const id of ctx.ids) {
      const to = ctx.spot(ahead[id]!).p;
      arrival[id] = { p: to, facing: bearing(ctx.spot(id).p, to) };
    }

    const ends: Spots = {};
    const turns: Record<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }> = {};
    const joins: HandJoin[] = [];
    for (const pair of pairsOf(params.couples)) {
      const [lark, robin] = larkAndRobin(ctx, pair);
      const arriveLark = arrival[lark]!;
      const arriveRobin = arrival[robin]!;
      // The couple turns as one: half way round puts each on the other's
      // arrival place, facing back the way they came.
      ends[lark] = { p: arriveRobin.p, facing: arriveLark.facing + 180 };
      ends[robin] = { p: arriveLark.p, facing: arriveRobin.facing + 180 };
      const turn = courtesyTurn(
        { from: arriveLark, to: ends[lark]! },
        { from: arriveRobin, to: ends[robin]! },
        turnBeats,
      );
      turns[lark] = { turn, mine: "lark" };
      turns[robin] = { turn, mine: "robin" };
      joins.push({ a: pair[0], aSide: "L", b: pair[1], bSide: "L" });
    }
    for (const id of ctx.ids) ends[id] ??= arrival[id] ?? ctx.spot(id);

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
        const mate = turns[station] ? mustPair(params.couples, station) : undefined;
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
