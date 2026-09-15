import type { Angle, Beat } from "@caller/core";
import { addScaled, angleDiff, dirOf, dist, mix, smooth } from "@caller/core";
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
  holdWindow,
  isHeld,
  polar,
  takeAndRelease,
} from "./ContraFigure.js";
import { BALANCE_BACK_RATIO, BALANCE_LEAN_CAP, balanceRock } from "../pair/balance.js";
import { ringFor, ringHands, ringShift } from "./ring.js";

/** {@link diamond}'s parameters. */
export interface DiamondParams extends ContraParams {
  /** How many of the figure's beats the balance takes. */
  balanceBeats: Beat;
  /** How far the body rocks, px; M5's gate-3 number is the default. */
  rock: number;
  /** How far below shoulder height the wave's joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
  /** How many whole turns the turning pair spins through as they cross. */
  spins: number;
}

/** Beats spent closing the balance's hands up, and none spent opening them. */
const TAKE_TO = 1.0;

/**
 * Balance the diamond: from a wave of four already formed — two dancers at
 * the centre facing along the set, two at the points facing across it — rock
 * in place, hands joined all round, then the two points swap with each other
 * and the two centres swap with each other, reforming the same diamond.
 *
 * Confirmed against Diamond Allotrope's own A1 (CB 14047, fetched read-only):
 * "Balance wave of four (NR,WL) — Women slide right (past N), face across ||
 * Men petronella turn — Balance diamond — Petronella turn." The two sides
 * are not symmetric, exactly as the text says, but the asymmetry is not
 * "one role always slides and the other always turns" — it is **whichever
 * pair is currently at the points slides, whichever pair is at the centre
 * turns**, which is what makes "petronella turn" alone the right word for
 * every repeat after the first: a point and a centre are never the same
 * physical two people twice running, because each reform swaps points with
 * points and centres with centres — the parity a four-station ring already
 * has built in (two places round always lands the same type you left).
 *
 * `diamond`'s reform travels **two** ring-places round instead of one —
 * the opposite station, not the next one round — which is "past neighbor"
 * read as "further than the neighbor, to the far side." Each dancer's own
 * destination is read straight off whoever currently stands there
 * (`ctx.spot`, both position and facing), the same `hey`/`petronella`
 * convention, which is what makes the parity hold with no separate
 * point/centre bookkeeping: two places away is always the other one of your
 * own kind. Unlike `petronella`'s own one-place chord (bowed a little so it
 * is not perfectly straight), a two-place opposite swap has to travel a
 * genuine arc: the straight chord between two opposite diamond vertices
 * passes through the shared centre, and both diagonal pairs reach that
 * centre at the same instant, which is a collision, not a crossing. Each
 * dancer instead sweeps round the shared centre at their own actual radius
 * from it, all four turning the same 180° in the same sense at the same
 * rate — a rigid rotation of the whole wave, which keeps every pair's
 * angular separation (and so their distance) constant throughout, the same
 * way `down-the-hall`'s own couple pivot never has to check for a collision
 * because the geometry cannot produce one.
 *
 * Precondition, per `hey`'s own convention: `plan()` reads the incoming
 * arrangement from `from`, not the group's own stations — a diamond is
 * always entered mid-dance, from whatever balance or petronella formed the
 * wave.
 */
export const diamond = contraFigure<DiamondParams>({
  id: "diamond",
  call: "BALANCE THE DIAMOND",
  describe:
    "From the wave of four you are already standing in, take hands with both neighbors and balance in place, forward and back. Then the two of you at the points slide across to the far point, and the two of you at the centre turn across to the far centre — the points slide, the centre turns, and the diamond reforms with everybody's own kind swapped to the other side. Eight beats, and nobody is holding on for the second half.",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    balanceBeats: 4,
    rock: 1.0,
    holdDrop: 6,
    stackPx: 1,
    spins: 1,
  },

  plan(ctx: PlanContext, params: DiamondParams): FigurePlan {
    const beats = params.beats;
    const balanceBeats = Math.min(params.balanceBeats, beats);
    const reformBeats = Math.max(0, beats - balanceBeats);
    const ring = ringFor(ctx);

    /** Facing mostly along the set (a "centre") or mostly across it (a "point"). */
    const isCentre = (facing: Angle): boolean => {
      const rad = (facing * Math.PI) / 180;
      return Math.abs(Math.sin(rad)) > Math.abs(Math.cos(rad));
    };

    // Two ring-places round always lands a dancer on their own kind: a
    // four-station ring alternates point, centre, point, centre, so "two
    // round" is always point-to-point or centre-to-centre.
    const ends: Spots = {};
    for (const id of ctx.ids) ends[id] = { ...ctx.spot(ringShift(ring, id, -2)) };

    const window = holdWindow(balanceBeats, TAKE_TO, TAKE_TO);

    /** How far off place the body rocks at `t`, forward positive. */
    const rockAt = (t: Beat): number => {
      const f = balanceRock(t);
      return params.rock * f * (f > 0 ? 1 : BALANCE_BACK_RATIO);
    };
    const leanAt = (t: Beat): number =>
      Math.max(-BALANCE_LEAN_CAP, Math.min(BALANCE_LEAN_CAP, balanceRock(t)));

    /** Where a dancer stands during the balance: rocked along their own facing. */
    const balanceAt = (id: StationId, t: Beat): Spot => {
      const start = ctx.spot(id);
      return { p: addScaled(start.p, dirOf(start.facing), rockAt(t)), facing: start.facing };
    };

    /** Where a dancer stands during the reform: a rigid rotation round the shared centre. */
    const reformAt = (id: StationId, t: Beat): Spot => {
      const start = ctx.spot(id);
      const end = ends[id] ?? start;
      const k = reformBeats <= 0 ? 1 : smooth(t / reformBeats);
      const r0 = dist(ring.centre, start.p);
      const r1 = dist(ring.centre, end.p);
      const a0 = bearing(ring.centre, start.p);
      // Deterministic and, for a genuine opposite pair, always ±180° — every
      // dancer of the wave turns the same signed amount, which is what keeps
      // all four 90° apart the whole way round rather than only at the ends.
      const sweep = angleDiff(a0, bearing(ring.centre, end.p));
      const p = polar(ring.centre, a0 + sweep * k, mix(r0, r1, k));
      // Points slide across with no extra spin; centres turn through the
      // number of whole turns the call asks for, on top of the shortest turn
      // to the new facing.
      const spins = isCentre(start.facing) ? params.spins : 0;
      const spin = -360 * spins + angleDiff(start.facing, end.facing);
      return { p, facing: start.facing + spin * k };
    };

    const placeAt = (id: StationId, t: Beat): Spot =>
      t <= balanceBeats ? balanceAt(id, t) : reformAt(id, Math.max(0, t - balanceBeats));

    const joinedAt = (t: Beat): ReturnType<typeof ringHands> =>
      ringHands(ctx, ring, (id) => balanceAt(id, t), params.holdDrop, params.stackPx);

    return {
      ends,
      joinsAt: (t: Beat): HandJoin[] => (isHeld(window, t) ? joinedAt(t).joins : []),
      at(station, t) {
        const self = placeAt(station, t);
        if (t > balanceBeats) {
          // Petronella-style travel: hands come up and out, nobody holds on.
          return {
            p: self.p,
            facing: self.facing,
            hands: { L: "down", R: "down" },
            flare:
              2.6 * Math.sin((Math.PI * Math.max(0, t - balanceBeats)) / Math.max(1, reformBeats)),
          };
        }
        const hands = joinedAt(t).hands[station];
        if (!hands) throw new Error(`diamond: no hands for station "${station}"`);
        return {
          p: self.p,
          facing: self.facing,
          lean: leanAt(t),
          hands: {
            L: takeAndRelease(self, "L", t, hands.L, window),
            R: takeAndRelease(self, "R", t, hands.R, window),
          },
          amp: 0,
        };
      },
    };
  },
});
