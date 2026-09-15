import type { Beat, Hand } from "@caller/core";
import { angleDiff, dist, ramp } from "@caller/core";
import type { RoleName, StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import {
  contraFigure,
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
  stepInHold,
  stepInTurn,
} from "./courtesyTurn.js";

/** {@link robinsChain}'s parameters. */
export interface RobinsChainParams extends ContraParams {
  /** Which role chains across. */
  chains: RoleName;
  /** How long the pull by takes, in beats; the rest is the courtesy turn. */
  pullBeats: Beat;
  /**
   * How far each robin bows to her own left on the way across, px.
   *
   * See {@link CHAIN_BOW_PX}: in this figure the bow no longer buys a
   * right-shoulder pass, because the courtesy turn's take is on the near side
   * of the couple's centre and the two robins therefore stop short of each
   * other. It only decides how near the two of them come.
   */
  bowPx: number;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
  /**
   * How far from the lark the couple pivots, px; see
   * {@link COURTESY_PIVOT_FROM_LARK_PX}. The user's ruling is that it is near
   * him; the exact distance is theirs to judge by eye. Only the rigid turn has
   * a pivot: at `stepInPx > 0` this number is not read.
   */
  pivotFromLark: number;
  /**
   * How far the lark steps off his place to meet her, px — **0 for the rigid
   * turn**, which is the default and is what the branch ships.
   *
   * F9's other two candidates. Above zero the couple stops being a rigid body:
   * the lark steps `stepInPx` into the set, the robin comes the whole way past
   * the middle and stops `stepInPx` short of her own place, and the two of them
   * **spin** — both bodies turning a half while the couple's line barely moves
   * and its centre drifts out on to the places. See {@link stepInTurn} for why
   * a right-shoulder pull by needs exactly that, and what it costs.
   */
  stepInPx: number;
}

/**
 * How far each robin bows to her own left on the way across, px.
 *
 * Down from 7, and the reason is the whole of deviation 1 in F7's report and
 * the whole of F8's. The rigid turn's take is the finish reflected through the
 * pivot, so each robin stops 21.75 px short of her new place, on the **near**
 * side of her couple's centre — and two robins who both stop short of the
 * middle pass on each other's *left*, 19.36 px apart, however they walk. Where
 * the pivot sits does not move that number by a thousandth of a pixel: her take
 * is one hold behind his, so it is the *couple's* clearance that decides it.
 * Bowing to her own
 * left now closes that gap instead of opening it: 3.5 px of bow brings the two
 * of them to 13.4 px in duple improper and 8.6 px in becket, which is as close
 * as AC6's 8 px will let them come. At 7 they were 7.6 px apart in becket,
 * inside the clearance.
 */
const CHAIN_BOW_PX = 3.5;

/**
 * Robins chain: the two robins pull by the right in the middle and courtesy
 * turn with the lark of the couple they land on.
 *
 * The user: "robins pull-by right in the center, give left hand to the larks
 * left, right hand goes on their back and lark's right goes there too, robins
 * walk forward a half turn while larks walk backwards until both face in again,
 * with robin on the right."
 *
 * So the lark turns about to face out of the set and steps across it to meet
 * the robin coming over; she arrives beside him **on his right**, both of them
 * facing out, her left hand in his left and both their right hands at her back.
 * Then the couple pivots as one rigid body, a half turn about a point **near
 * the lark** — she walking forward round the big arc, he backing round a small
 * circle, the arms staying put — which leaves them facing back into the set
 * with her still on his right, and opens out on to the two places.
 *
 * A rigid half turn is its own inverse, so **the take is the finish reflected
 * through the pivot**: he has to be standing on her side of it and she on his.
 * That is why the lark steps into and across the middle of the set rather than
 * waiting on his place — the two lines of this model stand 32 px apart while a
 * courtesy turn holds at 8.625, so the reflection is 18.875 px of stepping for
 * him. It is the part of this figure that is a model rather than a
 * transcription; see {@link courtesyTurn}. Where the pivot sits between the two
 * of them is `pivotFromLark`, and the user's ruling is that it is near him.
 *
 * Which lark is *her* lark is the couple she lands on, not the nearest one on
 * the floor: in duple improper the two robins stand on a diagonal, so the lark
 * she ends beside is 32 px across the set while the other one is 20 px up the
 * line. F3a's known-wrong list called that out; the couple is found here by the
 * facing the two of them share.
 *
 * The lark ends on his own place facing the way he began: the whole effect of a
 * chain is that the robins have traded and each couple has a new robin.
 *
 * **What the reflection costs the pull by** is the one thing in this figure
 * that is measured and wrong rather than modelled: each robin stops on the near
 * side of her couple's centre, so the two of them stop short of each other and
 * pass on the *left*. See {@link CHAIN_BOW_PX} and the `robins-chain` row of
 * `knownWrong.ts`.
 */
export const robinsChain = contraFigure<RobinsChainParams>({
  id: "robins-chain",
  call: "ROBINS CHAIN",
  describe:
    "The two robins take right hands in the middle and pull by, and carry on across the set. The lark of the couple each robin is arriving at steps across to meet her, turning to face out of the set as he goes and standing on the spot half a beat before she gets there: she arrives beside him on his right, both of them facing out, her left hand in his left, her own right hand behind her own back and his right hand on it. Then the two of them pivot as one body, a half turn about a point near the lark — he backs round a small circle of his own while she walks the big arc round him, the arms staying put — until both face in again with the robin still on his right, and the couple opens out on to the two places. He ends where he started, facing the way he already faced: the whole effect of a chain is that the robins have traded and each couple has a new robin. (unsure: exact pivot distance — the user judges by eye. A quarter of the hold puts his circle 2.9 px from him, which is 9 px of walking against her 18. A lark can also twirl her under his hand instead, and this only scoops. And two things this model still gets wrong, both of them the same cause — its two lines stand 32 px apart where a courtesy turn holds at 8.6. The lark has to step 18.9 px across the middle of the set to be on the robin's far side when the hands close, and wheel back out of it, where a real lark barely leaves his place. And the two robins pull by on the wrong shoulder: each of them stops a hold short of her new couple's centre, which leaves them on each other's left, 13.5 px apart, where a chain passes right shoulders.)",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    chains: "robin",
    pullBeats: 4.5,
    bowPx: CHAIN_BOW_PX,
    holdDrop: 6,
    stackPx: 1,
    pivotFromLark: COURTESY_PIVOT_FROM_LARK_PX,
    stepInPx: 0,
  },

  plan(ctx: PlanContext, params: RobinsChainParams): FigurePlan {
    const beats = params.beats;
    const pullBeats = Math.min(params.pullBeats, beats);
    const turnBeats = beats - pullBeats;
    const openBeats = Math.min(OPEN_BEATS, turnBeats / 2);
    const chaining = ctx.ids.filter((id) => ctx.role(id) === params.chains);
    if (chaining.length !== 2) {
      throw new Error(
        `robins-chain: a chain needs exactly two ${params.chains}s, found ${chaining.length}`,
      );
    }
    const [first, second] = chaining as [StationId, StationId];
    const swap: Record<StationId, StationId> = { [first]: second, [second]: first };

    /**
     * Which lark each chaining dancer courtesy turns with: the lark of the
     * couple whose place she lands on.
     *
     * A couple faces one way together — both dancers of it — and no two couples
     * of a minor set face the same way, so the lark she ends beside is the one
     * facing the way her landing place faces. Picking the *nearest* lark
     * instead is what F3a measured as 42.7 px of daylight between two hands
     * that are supposed to be one point: in duple improper the nearest lark is
     * 20 px up the line and hers is 32 px across the set.
     */
    const host: Record<StationId, StationId> = {};
    for (const id of chaining) {
      const landing = ctx.spot(swap[id]!);
      let best: StationId | undefined;
      let bestScore = Infinity;
      for (const other of ctx.ids) {
        if (ctx.role(other) === params.chains) continue;
        const turned = Math.abs(angleDiff(landing.facing, ctx.spot(other).facing));
        // Facing the same way as her landing place decides it; how near he is
        // only breaks a tie between two larks facing the same way.
        const score = (turned > 90 ? 1e6 : 0) + dist(ctx.spot(other).p, landing.p);
        if (score < bestScore) {
          bestScore = score;
          best = other;
        }
      }
      if (best === undefined) throw new Error(`robins-chain: nobody for "${id}" to turn with`);
      host[id] = best;
    }
    const guest: Record<StationId, StationId> = {};
    for (const [id, lark] of Object.entries(host)) guest[lark] = id;

    const ends: Spots = {};
    for (const id of ctx.ids) {
      const to = swap[id];
      ends[id] =
        to === undefined ? ctx.spot(id) : { p: ctx.spot(to).p, facing: ctx.spot(host[id]!).facing };
    }

    /**
     * Each turning couple, and where its centre ends up: what the clearance to
     * the couple turning beside it is measured from.
     */
    const couples = Object.entries(host).map(([robin, lark]) => ({
      robin,
      lark,
      pivot: midpoint(ctx.spot(lark).p, ends[robin]!.p),
    }));
    const pivots = couples.map((couple) => couple.pivot);

    /**
     * Where each dancer of a turning couple stands when the hands close, and
     * the turn that takes them from there on to their places.
     *
     * The couple's turn is rigid, so the take is not a choice: it is the pair
     * of end places reflected through the point between them and brought in to
     * the hold ({@link courtesyTurn}). He stands on *her* side of that point and
     * she on *his*, both facing out, she on his right. What the figure has to
     * do is walk the two of them there over the pull by.
     */
    const take: Record<StationId, Spot> = {};
    const turns: Record<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }> = {};
    for (const { robin, lark, pivot } of couples) {
      const turn =
        params.stepInPx > 0
          ? stepInTurn({
              lark: ctx.spot(lark),
              robin: ends[robin]!,
              robinFrom: ctx.spot(robin).p,
              hold: stepInHold(ctx.spacing, pivot, pivots),
              stepInPx: params.stepInPx,
              beats: turnBeats,
              closeBeats: openBeats,
              openBeats,
            })
          : courtesyTurn({
              lark: ctx.spot(lark),
              robin: ends[robin]!,
              hold: courtesyHold(ctx.spacing, pivot, pivots, params.pivotFromLark),
              beats: turnBeats,
              openBeats,
              pivotFromLark: params.pivotFromLark,
            });
      take[lark] = turn.takes.lark;
      take[robin] = turn.takes.robin;
      turns[lark] = { turn, mine: "lark" };
      turns[robin] = { turn, mine: "robin" };
    }

    const placeAt = (station: StationId, t: Beat): Spot => {
      const start = ctx.spot(station);
      const turning = turns[station];
      if (!turning) return start;
      if (t <= pullBeats) {
        // Everybody walks to their take over the pull by: the robins across
        // the set, bowing to their own left; the lark straight across it to the
        // place she has to find him on her right, which is on her side of the
        // couple's centre. `walkStep` turns each of them to face the way they
        // are walking and then, over the **last beat**, to the facing the take
        // wants — so the lark's turn to face out is folded into his step rather
        // than done standing still, and the take is one motion.
        //
        // The lark is given {@link LARK_LEAD_BEATS} of head start, so that he
        // is standing on his take before she arrives at hers.
        const mine = swap[station] !== undefined;
        if (!mine && params.stepInPx > 0) {
          // A step-in turn's lark has only a few pixels to cover, so he waits
          // on his place while the robins cross — their bowed paths come past
          // the lark places, and in becket they come past them closely — and
          // then turns about and steps out into the set to meet the one coming
          // to him, over the second half of the pull by. He turns the opposite
          // way from the courtesy turn, so the two cancel and he ends facing as
          // he began.
          const stepBeats = pullBeats / 2;
          const wait = pullBeats - stepBeats;
          const step = passRight(start, take[station]!, t - wait, stepBeats, 0);
          return {
            p: step.p,
            facing: start.facing - turning.turn.bodyTurn * ramp(t, wait, pullBeats),
          };
        }
        const walk = mine ? pullBeats : Math.max(pullBeats - LARK_LEAD_BEATS, 1);
        const step = passRight(
          start,
          take[station]!,
          Math.min(t, walk),
          walk,
          mine ? params.bowPx : 0,
        );
        return { p: step.p, facing: step.facing };
      }
      const into = t - pullBeats;
      return turning.mine === "lark" ? turning.turn.lark(into) : turning.turn.robin(into);
    };

    // The hands go up over the **last beat of the pull by**, so that they are
    // joined at the instant the rigid turn begins and stay joined for every
    // sample of it. Taking them after it begins instead means each hand is
    // chasing a point that is swinging round the pivot: measured, the lark's
    // right hand on her back does 9.20 elbow-per-hand that way against 5.15
    // this way, on a guard of 9.5833.
    const window = {
      takeFrom: Math.max(0, pullBeats - TAKE_BEATS),
      takeTo: pullBeats,
      releaseFrom: beats - openBeats,
      releaseTo: beats,
    };
    const pull = { takeFrom: 0.8, takeTo: 1.6, releaseFrom: 2.4, releaseTo: 3.2 };

    const joins: HandJoin[] = [];
    for (const [id, lark] of Object.entries(host))
      joins.push({ a: id, aSide: "L", b: lark, bSide: "L" });
    const pullJoin: HandJoin = { a: first, aSide: "R", b: second, bSide: "R" };

    return {
      ends,
      joinsAt(t) {
        if (t >= pull.takeTo && t <= pull.releaseFrom) return [pullJoin];
        if (t >= window.takeTo && t <= window.releaseFrom) return joins;
        return [];
      },
      at(station, t) {
        const self = placeAt(station, t);
        const mine = swap[station] !== undefined;
        const lark = mine ? host[station]! : station;
        const robin = mine ? station : guest[station];
        const partner = mine ? lark : robin;

        const hands: { L: Hand | "down"; R: Hand | "down" } = { L: "down", R: "down" };

        if (mine) {
          // The pull by: both right hands on one point between the two robins.
          const other = placeAt(swap[station]!, t);
          const point = joinPoint(self, "R", other, "R");
          const joined = joinedHands(ctx, station, swap[station]!, point, params.holdDrop);
          hands.R = takeAndRelease(self, "R", t, joined[station]!, pull);
        }

        if (partner !== undefined) {
          const other = placeAt(partner, t);
          const point = joinPoint(self, "L", other, "L");
          const joined = joinedHands(ctx, station, partner, point, params.holdDrop, params.stackPx);
          const held = joined[station];
          if (held) hands.L = takeAndRelease(self, "L", t, held, window);
          // Both right hands go to the robin's back: two points, never a join.
          // Hers has to let go of the pull by first, which it has by the time
          // the courtesy turn's own take begins.
          const back = courtesyBackHands(mine ? self : other, mine ? other : self);
          const free = takeAndRelease(self, "R", t, mine ? back.robin : back.lark, window);
          if (!mine || t > pull.releaseTo) hands.R = free;
        }

        // Everybody in a chain is walking now: the larks go in and back out.
        return {
          p: self.p,
          facing: self.facing,
          hands,
          stepRate: 1,
          amp: 1,
        };
      },
    };
  },
});

/**
 * How long the couple takes to open out on to its two places, beats.
 *
 * The rigid turn happens at the hold and the places are a set's width apart, so
 * the last beat and a half of the figure is the couple opening out and letting
 * go at the same time, after the rotation is over.
 */
const OPEN_BEATS: Beat = 1.5;

/** How long the hands take to close, at the end of the pull by, beats. */
const TAKE_BEATS: Beat = 1;

/**
 * How long before the hands close the lark is standing on his take, beats.
 *
 * He has to be across the set and turned about before she gets there — the take
 * is the couple's finish reflected through the pivot, so his side of it is the
 * far side — and the two of them are converging on a hold 8.625 px wide from
 * opposite directions. Getting there ahead of her is what keeps that
 * convergence outside AC6's 8 px: walking in step with her they cross **6.98
 * px** apart at beat 3.34 in duple improper and 7.47 px at 3.56 in becket, and
 * half a beat of head start makes those 8.46 and 8.35.
 *
 * F7 did not need this, because its pivot sat midway between the two bodies and
 * its couple therefore turned 11.5 px apart: the nearer pivot of F8 closes the
 * hold to 8.625 and with it the room the two of them had to converge in.
 *
 * **Half a beat and no more**, and the number is measured rather than chosen. A
 * lark who is standing still for the *whole* of the beat his right hand takes
 * her back over is F3c's elbow-azimuth singularity again — a hand nearly still
 * while its target rotates — and the elbow-per-hand it costs is a cliff, not a
 * slope: 6.85 at half a beat of lead, 30.50 at 0.6 and 35.28 at 0.7, on a guard
 * of 9.5833. At half a beat he is still walking when the hand leaves his hip
 * and stops before it lands, which is the only part of the window that matters.
 */
const LARK_LEAD_BEATS: Beat = 0.5;
