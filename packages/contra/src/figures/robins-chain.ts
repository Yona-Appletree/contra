import type { Beat, Hand, Vec2 } from "@caller/core";
import { angleDiff, dist, ramp, sub } from "@caller/core";
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
import { courtesyBackHands, courtesyHold, courtesyTurn } from "./courtesyTurn.js";

/** {@link robinsChain}'s parameters. */
export interface RobinsChainParams extends ContraParams {
  /** Which role chains across. */
  chains: RoleName;
  /** How long the pull by takes, in beats; the rest is the courtesy turn. */
  pullBeats: Beat;
  /**
   * How far each chaining dancer bows to their own left, so they pass right
   * shoulders, px.
   *
   * The bow is a sine over the whole walk, and the two of them meet about two
   * thirds of the way along it rather than half way — they stop short of their
   * places for the courtesy turn — so the bow has already begun to close by the
   * time they cross. This is what leaves them a clear pass rather than a
   * collision at the point where they actually meet.
   */
  bowPx: number;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
  /**
   * How far short of her place the robin is when the lark takes her hand, px.
   *
   * She is still on the line she pulled by along, and he has stepped off his
   * place into the set to meet her there, so the take happens between the two
   * places rather than at them. The bigger this is the earlier in her walk the
   * hands close, and the nearer the middle of the set the turning couple sits —
   * which is what the couple turning beside it has to be left room by, so it
   * cannot grow without measuring the clearance again.
   */
  scoopPx: number;
}

/**
 * Robins chain: the two robins pull by the right in the middle and courtesy
 * turn with the lark of the couple they land on.
 *
 * The user: "robins pull-by right in the center, give left hand to the larks
 * left, right hand goes on their back and lark's right goes there too, robins
 * walk forward a half turn while larks walk backwards until both face in again,
 * with robin on the right."
 *
 * So the lark turns about to face out of the set and steps off his place to
 * meet the robin coming across; she arrives on his **left** with her left hand
 * in his left and both their right hands at her back; and then the two of them
 * turn a half — she walking forward, he walking backward — which leaves both of
 * them facing back into the set with her on his **right**, because a body that
 * turns 180° swaps which of its own sides a fixed direction is on. See
 * {@link courtesyTurn} for what that costs the couple's own line, which is the
 * part of this figure that is a model rather than a transcription.
 *
 * Which lark is *her* lark is the couple she lands on, not the nearest one on
 * the floor: in duple improper the two robins stand on a diagonal, so the lark
 * she ends beside is 32 px across the set while the other one is 20 px up the
 * line. F3a's known-wrong list called that out; the couple is found here by the
 * facing the two of them share.
 *
 * The lark ends on his own place facing the way he began: the whole effect of a
 * chain is that the robins have traded and each couple has a new robin.
 */
export const robinsChain = contraFigure<RobinsChainParams>({
  id: "robins-chain",
  call: "ROBINS CHAIN",
  describe:
    "The two robins take right hands in the middle and pull by, passing right shoulders, and carry on across the set. The lark of the couple each robin is arriving at turns about to face out and steps off his place to meet her; she comes to his left, her left hand in his left, his right hand on her back and her own right hand there too. Then the couple turns a half — she walks forward, he walks backward — until both of them face in again with the robin on the lark's right, and opens out on to the two places. He ends where he started, facing the way he already faced: the whole effect of a chain is that the robins have traded and each couple has a new robin. (unsure: a lark can twirl her under his hand instead, and this only scoops; and the couple's own line barely turns while the two bodies turn a half, because the places it ends on are a whole set's width apart.)",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    chains: "robin",
    pullBeats: 4.5,
    bowPx: 7,
    holdDrop: 6,
    stackPx: 1,
    scoopPx: 10,
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
     * She stops `scoopPx` short of her place, still on the line she pulled by
     * along; the hold is a whole `hold` across from her, back along the line
     * the couple ends on, and that is where he has to be — which puts him off
     * his place and into the set, facing out, waiting for her.
     */
    const take: Record<StationId, Spot> = {};
    const turns: Record<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }> = {};
    for (const { robin, lark, pivot } of couples) {
      const larkPlace = ctx.spot(lark);
      const landing = ends[robin]!;
      // She stops `scoopPx` short of her place, still on the line she pulled by
      // along; he steps the same `scoopPx` off his place straight at her, but
      // never so far that the two of them are inside the hold before the turn
      // has begun — in becket her landing place is only 17 px from his and the
      // whole step would walk him into her. She arrives on his *left* and
      // leaves on his right, so the couple's own line barely turns: the two
      // bodies do all of it.
      const hold = courtesyHold(ctx.spacing, pivot, pivots);
      const robinTake = toward(landing.p, ctx.spot(robin).p, params.scoopPx);
      const step = Math.min(params.scoopPx, Math.max(0, dist(larkPlace.p, robinTake) - hold));
      const turn = courtesyTurn({
        larkTake: toward(larkPlace.p, robinTake, step),
        robinTake,
        lark: larkPlace,
        robin: landing,
        hold,
        beats: turnBeats,
        closeBeats: openBeats,
        openBeats,
      });
      take[lark] = turn.takes.lark;
      take[robin] = turn.takes.robin;
      turns[lark] = { turn, mine: "lark" };
      turns[robin] = { turn, mine: "robin" };
    }

    /** How long the lark spends turning about and stepping out to meet her. */
    const stepBeats = pullBeats / 2;

    const placeAt = (station: StationId, t: Beat): Spot => {
      const start = ctx.spot(station);
      const turning = turns[station];
      if (!turning) return start;
      if (t <= pullBeats) {
        if (swap[station] === undefined) {
          // The lark waits on his place while the robins cross — their bowed
          // paths come past the lark places, and in becket they come past them
          // closely — then turns about and steps out into the set to meet the
          // one coming to him. He turns the opposite way from the courtesy
          // turn, so the two of them cancel and he ends facing as he began.
          const wait = pullBeats - stepBeats;
          const step = passRight(start, take[station]!, t - wait, stepBeats, 0);
          return {
            p: step.p,
            facing: start.facing - turning.turn.bodyTurn * ramp(t, wait, pullBeats),
          };
        }
        // The robins pull by along the diagonal, bowing to their own left so
        // they pass right shoulders in the middle, and stop short of their
        // places where the hands close.
        const step = passRight(start, take[station]!, t, pullBeats, params.bowPx);
        return { p: step.p, facing: step.facing };
      }
      const into = t - pullBeats;
      return turning.mine === "lark" ? turning.turn.lark(into) : turning.turn.robin(into);
    };

    // A beat to take, and the whole of the opening out to let go over. Right
    // and left through matches its take to its closing up because its couple
    // closes 10 px and a hand that finishes its take while the target is still
    // travelling has to chase it; a chain's couple closes about a pixel, so
    // there is nothing to chase and a beat of held hold is worth more.
    const window = {
      takeFrom: pullBeats,
      takeTo: pullBeats + Math.min(1, turnBeats / 2),
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
 * The turn happens at the hold and the places are a set's width apart, so the
 * last beat and a half of the figure is the couple opening out and letting go
 * at the same time.
 */
const OPEN_BEATS: Beat = 1.5;

/** The point `px` px from `from` toward `to`; `from` itself when they are one point. */
function toward(from: Vec2, to: Vec2, px: number): Vec2 {
  const d = sub(to, from);
  const away = Math.hypot(d[0], d[1]);
  if (away <= 1e-9) return [from[0], from[1]];
  const k = Math.min(px, away) / away;
  return [from[0] + d[0] * k, from[1] + d[1] * k];
}
