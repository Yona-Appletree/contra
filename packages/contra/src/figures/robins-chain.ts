import type { Beat, Hand, Vec2 } from "@caller/core";
import { angleLerp, ramp, smooth } from "@caller/core";
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
  midpoint,
  passRight,
  takeAndRelease,
} from "./ContraFigure.js";

/** {@link robinsChain}'s parameters. */
export interface RobinsChainParams extends ContraParams {
  /** Which role chains across. */
  chains: RoleName;
  /** How long the pull by takes, in beats; the rest is the courtesy turn. */
  pullBeats: Beat;
  /** How far each chaining dancer bows to their own left, so they pass right shoulders, px. */
  bowPx: number;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
}

/**
 * Robins chain: the two robins pull by the right in the middle and courtesy
 * turn with the opposite lark.
 *
 * The larks stay on their places — a courtesy turn leaves a lark where it found
 * him, facing the way he already faced — and turn to take the incoming robin's
 * left hand as she comes round them. That is the whole of the chain's effect:
 * the robins have traded places and each couple has a new robin.
 */
export const robinsChain = contraFigure<RobinsChainParams>({
  id: "robins-chain",
  call: "ROBINS CHAIN",
  lead: 4,
  beats: 8,
  defaults: { from: {}, chains: "robin", pullBeats: 4.5, bowPx: 5, holdDrop: 6, stackPx: 1 },

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

    /** Which lark each chaining dancer courtesy turns with: the one beside where she lands. */
    const host: Record<StationId, StationId> = {};
    for (const id of chaining) {
      const landing = ctx.spot(swap[id]!).p;
      let best: StationId | undefined;
      let bestGap = Infinity;
      for (const other of ctx.ids) {
        if (ctx.role(other) === params.chains) continue;
        const gap = Math.hypot(
          ctx.spot(other).p[0] - landing[0],
          ctx.spot(other).p[1] - landing[1],
        );
        if (gap < bestGap) {
          bestGap = gap;
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
        to === undefined
          ? ctx.spot(id)
          : { p: ctx.spot(to).p, facing: ctx.spot(host[id]!).facing };
    }

    const placeAt = (station: StationId, t: Beat): Spot => {
      const start = ctx.spot(station);
      const end = ends[station] ?? start;
      if (swap[station] === undefined) {
        // A lark turns to greet the robin coming to him and turns back.
        const toward = bearing(start.p, ctx.spot(guest[station] ?? station).p);
        const greet = ramp(t, 1, pullBeats) * (1 - ramp(t, beats - 1.5, beats));
        return { p: start.p, facing: angleLerp(start.facing, toward, 0.5 * greet) };
      }
      if (t <= pullBeats) {
        const step = passRight(start, { p: end.p, facing: end.facing }, t, pullBeats, params.bowPx);
        return { p: step.p, facing: step.facing };
      }
      // The last beats curve her round the lark into her place beside him.
      const k = smooth((t - pullBeats) / (beats - pullBeats));
      const arrive = passRight(start, end, pullBeats, pullBeats, params.bowPx);
      const around = midpoint(arrive.p, ctx.spot(host[station]!).p);
      const p: Vec2 = [
        (1 - k) * (1 - k) * arrive.p[0] + 2 * (1 - k) * k * around[0] + k * k * end.p[0],
        (1 - k) * (1 - k) * arrive.p[1] + 2 * (1 - k) * k * around[1] + k * k * end.p[1],
      ];
      return { p, facing: angleLerp(arrive.facing, end.facing, k) };
    };

    const window = {
      takeFrom: pullBeats,
      takeTo: pullBeats + (beats - pullBeats) / 2,
      releaseFrom: beats - 0.6,
      releaseTo: beats,
    };
    const pull = { takeFrom: 0.8, takeTo: 1.6, releaseFrom: 2.4, releaseTo: 3.2 };

    const joins: HandJoin[] = [];
    for (const [id, lark] of Object.entries(host)) joins.push({ a: id, aSide: "L", b: lark, bSide: "L" });
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

        return {
          p: self.p,
          facing: self.facing,
          hands,
          stepRate: 1,
          amp: mine ? 1 : 0,
        };
      },
    };
  },
});
