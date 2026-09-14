import type { Beat, Hand, Vec2 } from "@caller/core";
import { angleDiff, dist, sub } from "@caller/core";
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
  bearing,
  contraFigure,
  joinPoint,
  joinedHands,
  passRight,
  polar,
  takeAndRelease,
} from "./ContraFigure.js";
import type { CourtesyTurn } from "./courtesyTurn.js";
import { courtesyTurn } from "./courtesyTurn.js";

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
   * The bow is a sine over the whole walk, and the two of them now meet about
   * three quarters of the way along it rather than half way — they stop short
   * of their places for the courtesy turn — so the bow has already begun to
   * close by the time they cross. 8.5 px of bow is what leaves 9.8 px between
   * the two of them where they pass, which is what a 5 px bow bought when the
   * pull by ran the whole diagonal and stopped dead on the far place.
   */
  bowPx: number;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
  /**
   * How far the lark steps off his place into the set to scoop the robin up,
   * px — and, the same number, how far short of her place she is when he takes
   * her hand. It is what gives the courtesy turn something to turn: he backs
   * this far out again while she comes round him.
   */
  scoopPx: number;
}

/**
 * Robins chain: the two robins pull by the right in the middle and courtesy
 * turn with the lark of the couple they land on.
 *
 * The user: "robins pull by in the center, then the larks scoop them and walk
 * backwards or they twirl them." So the lark steps into the set to meet the
 * robin coming across, takes her left hand in his left, and backs out to his
 * place while she comes round him and opens out onto hers — {@link
 * courtesyTurn}, shared with right and left through. The twirl is the other
 * way to do it and is a later parameter; this is the scoop.
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
    "The two robins take right hands in the middle and pull by, passing right shoulders. Each robin then gives her left hand to the opposite lark, who catches it with his left and puts his right behind her back; he walks backward while she walks forward round him — the courtesy turn — and the two of them end as a couple facing across. The larks never leave their places: the whole effect of a chain is that the robins have traded and each couple has a new robin.",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    chains: "robin",
    pullBeats: 4.5,
    bowPx: 8.5,
    holdDrop: 6,
    stackPx: 1,
    scoopPx: 12,
  },

  plan(ctx: PlanContext, params: RobinsChainParams): FigurePlan {
    const beats = params.beats;
    const pullBeats = Math.min(params.pullBeats, beats);
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
     * Where each dancer of a turning pair stands when the hands close, and the
     * turn that takes them from there onto their places.
     *
     * She stops `scoopPx` short of her place, still on the line she pulled by
     * along; he has stepped `scoopPx` off his place toward her. So the take
     * happens between the two places rather than at them, which is the whole
     * difference between a courtesy turn and two people standing still.
     */
    const take: Record<StationId, Spot> = {};
    const turns: Record<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }> = {};
    for (const [robin, lark] of Object.entries(host)) {
      const larkPlace = ctx.spot(lark);
      const landing = ends[robin]!;
      // He steps *forward* off his place, the way he is already facing, so that
      // backing out of it again at the end of the turn is walking backward and
      // not a sidestep. Across the set is the one direction he must not go: the
      // robin is arriving along it.
      const out = polar(larkPlace.p, larkPlace.facing, params.scoopPx);
      const back = toward(landing.p, ctx.spot(robin).p, params.scoopPx);
      const robinTake: Spot = { p: back, facing: bearing(ctx.spot(robin).p, landing.p) };
      const larkTake: Spot = { p: out, facing: larkPlace.facing };
      take[lark] = larkTake;
      take[robin] = robinTake;
      const turn = courtesyTurn(
        { from: larkTake, to: larkPlace },
        { from: robinTake, to: landing },
        beats - pullBeats,
      );
      turns[lark] = { turn, mine: "lark" };
      turns[robin] = { turn, mine: "robin" };
    }

    const placeAt = (station: StationId, t: Beat): Spot => {
      const start = ctx.spot(station);
      const turning = turns[station];
      if (!turning) return start;
      if (t <= pullBeats) {
        // The robins pull by along the whole diagonal, bowing to their own left
        // so they pass right shoulders in the middle. The lark waits on his
        // place while they cross — their bowed paths come past the lark places,
        // and in becket they come past them closely — and steps out into the
        // set over the last third of the pull by to meet the one coming to him.
        if (swap[station] === undefined) {
          const wait = pullBeats - pullBeats / 3;
          const step = passRight(start, take[station]!, t - wait, pullBeats / 3, 0);
          return { p: step.p, facing: step.facing };
        }
        const step = passRight(start, take[station]!, t, pullBeats, params.bowPx);
        return { p: step.p, facing: step.facing };
      }
      const into = t - pullBeats;
      return turning.mine === "lark" ? turning.turn.lark(into) : turning.turn.robin(into);
    };

    const window = {
      takeFrom: pullBeats,
      takeTo: pullBeats + (beats - pullBeats) / 2,
      releaseFrom: beats - 0.6,
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

/** The point `px` px from `from` toward `to`; `from` itself when they are one point. */
function toward(from: Vec2, to: Vec2, px: number): Vec2 {
  const d = sub(to, from);
  const away = Math.hypot(d[0], d[1]);
  if (away <= 1e-9) return [from[0], from[1]];
  const k = Math.min(px, away) / away;
  return [from[0] + d[0] * k, from[1] + d[1] * k];
}
