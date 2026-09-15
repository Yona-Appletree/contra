import type { Beat, Hand, Vec2 } from "@caller/core";
import { angleDiff, dist, mix, ramp } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  FigurePlan,
  HandJoin,
  HoldWindow,
  LocalHand,
  PlanContext,
  Spot,
  Spots,
} from "../../figures/ContraFigure.js";
import {
  centreOf,
  bearing,
  joinPoint,
  joinedHands,
  midpoint,
  nearestTurn,
  passRight,
  takeAndRelease,
} from "../../figures/ContraFigure.js";
import type { CourtesyTurn } from "../../figures/courtesyTurn.js";
import {
  courtesyBackHands,
  courtesyHold,
  courtesyTurn,
  larkAndRobin,
  orbitTurn,
  stepInHold,
} from "../../figures/courtesyTurn.js";
import { aheadPairs } from "../../figures/pass-through.js";
import type { Pairing } from "../../figures/pairing.js";
import { pairsOf } from "../../figures/pairing.js";
import type { CourtesyTurnShape, FigureRole, HoldSpec } from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalBool, evalNumber } from "../expr.js";
import type { ShapeInput } from "../interpret.js";

/**
 * **The courtesy turn**: a couple closes up and turns as one, ending facing
 * back the way it came with the robin still on the lark's right.
 *
 * Two figures are this kind, and they turn two different ways. Right and left
 * through's is the textbook **rigid** turn: the couple walks over, closes up
 * short of the far line, and the whole of it — both bodies *and* the line
 * between them — pivots a half about a point near the lark. The chain's is the
 * lark's own backward **orbit**, which the robin joins a quarter of the way
 * through, having pulled the other robin by in the middle.
 *
 * Three things are true of both, and the geometry that makes them true lives in
 * `figures/courtesyTurn.ts` — where F7 through F13 proved it — rather than
 * being restated here:
 *
 * - **The turn is solved backwards from its ends.** A rigid half turn is its
 *   own inverse, so where the hands close is the pair of end places reflected
 *   through the pivot. The figure is told where it has to walk its two dancers
 *   first, in {@link CourtesyTurn.takes}; it does not get to choose.
 * - **The pair is rigid from the take.** Both bodies and the couple's own line
 *   turn together, so she is on his right at every sample and the four hands
 *   keep their body-local offsets — the user's "the arms basically stay put" —
 *   until the couple opens out on to the places.
 * - **The hands are four and they are not symmetric.** Her left in his left at
 *   one shared point; her own right behind her own back and his right on it,
 *   two points and never a join.
 *
 * **A6: only these two regimes ship.** The three tunings of the rigid turn F9
 * kept behind `?chain=` — the pivot at the lark, and the two couple-spins — are
 * gone, with `CHAIN_CANDIDATES` and `pnpm figure --chain`.
 */
export function planCourtesyTurn(
  shape: CourtesyTurnShape,
  _holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  return shape.regime === "orbit" ? orbitChain(shape, input) : rigidTurn(shape, input);
}

/** One turning couple: who is which part of it, and where its centre ends up. */
interface Couple {
  lark: StationId;
  robin: StationId;
  pivot: Vec2;
}

/** The environment a courtesy turn's numbers are read in; none needs a live pass. */
const envFor = (input: ShapeInput, self: FigureRole, t: Beat): ExprEnv => ({
  ctx: input.ctx,
  params: input.params,
  beats: input.beats,
  self,
  t,
  order: input.roles,
  anchor: input.anchor.centre,
});

/**
 * **Right and left through**: pass the dancer you are facing by the right, and
 * courtesy turn with the one you came over with.
 *
 * Who you pass is who is *in front of you*, which in duple improper is your
 * neighbour down the line and in becket the dancer opposite — read off where
 * people stand, not written down. The couple walks **all the way through** and
 * *then* closes up on to the hold, rather than aiming short of the far line
 * from the start: the two dancers who pass right shoulders would otherwise be
 * walking 4.25 px nearer each other the whole way over, which in becket is the
 * difference between 10 px of daylight and 5.7.
 */
function rigidTurn(shape: CourtesyTurnShape, input: ShapeInput): FigurePlan {
  const { ctx, beats } = input;
  const env = envFor(input, ctx.ids[0] ?? "", 0);
  const passBeats = Math.min(evalNumber(shape.approachBeats, env), beats);
  const turnBeats = beats - passBeats;
  const closeBeats = Math.min(evalNumber(shape.closeBeats, env), turnBeats / 3);
  const openBeats = Math.min(evalNumber(shape.openBeats, env), (turnBeats - closeBeats) / 2);
  const bow = evalNumber(shape.bow, env);
  const pivotFromLark = evalNumber(shape.pivotFromLark, env);
  const ahead = aheadPairs(ctx);

  /** Where the pass through leaves everybody, before the couples close up. */
  const arrival: Spots = {};
  for (const id of ctx.ids) {
    const other = ahead[id];
    if (other === undefined) throw new Error(`right and left through: nobody in front of "${id}"`);
    const to = ctx.spot(other).p;
    arrival[id] = { p: to, facing: bearing(ctx.spot(id).p, to) };
  }

  // The couple turns as one: half way round puts each on the other's arrival
  // place, facing back the way they came.
  const ends: Spots = {};
  const couples: Couple[] = [];
  for (const pair of couplePairs(shape, input)) {
    const [lark, robin] = pair;
    const arriveLark = arrival[lark]!;
    const arriveRobin = arrival[robin]!;
    ends[lark] = { p: arriveRobin.p, facing: arriveLark.facing + 180 };
    ends[robin] = { p: arriveLark.p, facing: arriveRobin.facing + 180 };
    couples.push({ lark, robin, pivot: midpoint(ends[lark].p, ends[robin].p) });
  }
  for (const id of ctx.ids) ends[id] ??= arrival[id] ?? ctx.spot(id);

  const pivots = couples.map((couple) => couple.pivot);
  const turns = new Map<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }>();
  const takes: Spots = {};
  const joins: HandJoin[] = [];
  const mates = new Map<StationId, StationId>();
  for (const { lark, robin, pivot } of couples) {
    // The robin is already on the lark's right as the two walk over, and the
    // couple's turn is rigid, so the take is exactly the pair of end places
    // reflected through the pivot.
    const turn = courtesyTurn({
      lark: ends[lark]!,
      robin: ends[robin]!,
      hold: courtesyHold(ctx.spacing, pivot, pivots, pivotFromLark),
      beats: turnBeats - closeBeats,
      openBeats,
      pivotFromLark,
      // M10: the rotation rides the definition's profile.
      profile: input.profile,
    });
    turns.set(lark, { turn, mine: "lark" });
    turns.set(robin, { turn, mine: "robin" });
    takes[lark] = turn.takes.lark;
    takes[robin] = turn.takes.robin;
    mates.set(lark, robin);
    mates.set(robin, lark);
    joins.push({ a: lark, aSide: "L", b: robin, bSide: "L" });
  }

  const placeAt = (role: StationId, t: Beat): Spot => {
    const arrive = arrival[role] ?? ctx.spot(role);
    if (t <= passBeats) {
      // M10: the pass over rides the definition's profile, like every other walk.
      const step = passRight(ctx.spot(role), arrive, t, passBeats, bow, input.profile);
      return { p: step.p, facing: step.facing };
    }
    const turning = turns.get(role);
    const take = takes[role];
    if (!turning || !take) return arrive;
    // Closing after the pass is a straight slide with no turn in it — the take
    // faces the way the walk arrived — so the rotation that follows is still
    // the whole of the couple's turning.
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

  // The hands go up over the beats the couple spends closing up and come down
  // over exactly the beats it spends opening out: a hand that finishes its take
  // while its target is still travelling has to chase it, and chasing is what
  // the oracle's hand column sees.
  const window: HoldWindow = {
    takeFrom: passBeats,
    takeTo: passBeats + closeBeats,
    releaseFrom: beats - openBeats,
    releaseTo: beats,
  };
  const backs = evalBool(shape.backHands, env);
  const drop = evalNumber(shape.hands.drop, env);
  const stackPx = evalNumber(shape.hands.stackPx, env);

  return {
    ends,
    joinsAt: (t) => (t >= window.takeTo && t <= window.releaseFrom ? joins : []),
    at(role, t) {
      const self = placeAt(role, t);
      const turning = turns.get(role);
      const mate = mates.get(role);
      if (mate === undefined || !turning) {
        return { p: self.p, facing: self.facing, hands: { L: "down", R: "down" }, amp: 1 };
      }
      const other = placeAt(mate, t);
      const hands = coupleHands(
        ctx,
        role,
        mate,
        self,
        other,
        turning.mine === "lark",
        t,
        window,
        drop,
        stackPx,
        backs,
      );
      return { p: self.p, facing: self.facing, hands, stepRate: 1 };
    },
  };
}

/**
 * **The chain**: the two robins pull by the right in the middle, and each joins
 * the backward orbit of the lark whose couple she is arriving at.
 *
 * The lark is moving from the first beat, not waiting on his place: he backs
 * round a small circle centred half a hold off his own place toward hers,
 * turning as he goes, so his back is always to that centre. She reaches him a
 * quarter of the way round it, at the far side of his circle, moving with the
 * orbit's own velocity so she joins it rather than being picked up standing
 * still.
 *
 * Which lark is *her* lark is the couple she lands on, not the nearest one on
 * the floor: in duple improper the two robins stand on a diagonal, so the lark
 * she ends beside is 32 px across the set while the other is 20 px up the line.
 */
function orbitChain(shape: CourtesyTurnShape, input: ShapeInput): FigurePlan {
  const { ctx, beats } = input;
  const env = envFor(input, ctx.ids[0] ?? "", 0);
  const pullBeats = Math.min(evalNumber(shape.approachBeats, env), beats);
  const turnBeats = beats - pullBeats;
  const openBeats = Math.min(evalNumber(shape.openBeats, env), turnBeats / 2);
  const passPx = evalNumber(shape.passPx, env);

  const chaining = chainingDancers(shape, input);
  const [first, second] = chaining;
  const swap: Record<StationId, StationId> = { [first]: second, [second]: first };
  const host = hostLarks(ctx, chaining, swap);
  const guest: Record<StationId, StationId> = {};
  for (const [id, lark] of Object.entries(host)) guest[lark] = id;

  const ends: Spots = {};
  for (const id of ctx.ids) {
    const to = swap[id];
    ends[id] =
      to === undefined ? ctx.spot(id) : { p: ctx.spot(to).p, facing: ctx.spot(host[id]!).facing };
  }

  const couples = Object.entries(host).map(([robin, lark]) => ({
    robin,
    lark,
    pivot: midpoint(ctx.spot(lark).p, ends[robin]!.p),
  }));
  const pivots = couples.map((couple) => couple.pivot);
  /** The middle of the set: where the pull by happens. */
  const setCentre = centreOf(ctx.ids.map((id) => ctx.spot(id)));

  const turns = new Map<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }>();
  for (const { robin, lark, pivot } of couples) {
    const turn = orbitTurn({
      lark: ctx.spot(lark),
      robin: ends[robin]!,
      robinFrom: ctx.spot(robin),
      centre: setCentre,
      // A couple that orbits has no arc and no circle to divide the clearance
      // between, exactly like a couple that spins, so it takes that rule.
      hold: stepInHold(ctx.spacing, pivot, pivots),
      joinBeat: pullBeats,
      passPx,
      beats,
      openBeats,
      // M10: the lark's orbit runs at a constant rate for the middle of the
      // figure, so he is further round at the join than a smoothstep left him.
      profile: input.profile,
    });
    turns.set(lark, { turn, mine: "lark" });
    turns.set(robin, { turn, mine: "robin" });
  }

  const placeAt = (role: StationId, t: Beat): Spot => {
    const start = ctx.spot(role);
    const turning = turns.get(role);
    if (!turning) return start;
    if (t <= pullBeats) {
      // An orbit turn is already moving both of them before the take — he is a
      // quarter of the way round his circle and she has to arrive on it at its
      // own speed — so it places them itself.
      const { approach } = turning.turn;
      if (approach) return approach(turning.mine, t);
      return start;
    }
    const into = t - pullBeats;
    return turning.mine === "lark" ? turning.turn.lark(into) : turning.turn.robin(into);
  };

  const { window, pull } = chainWindows(pullBeats, beats, openBeats);
  const joins: HandJoin[] = [];
  for (const [id, lark] of Object.entries(host))
    joins.push({ a: id, aSide: "L", b: lark, bSide: "L" });
  const pullJoin: HandJoin = { a: first, aSide: "R", b: second, bSide: "R" };

  const backs = evalBool(shape.backHands, env);
  const drop = evalNumber(shape.hands.drop, env);
  const stackPx = evalNumber(shape.hands.stackPx, env);
  const pullDrop = shape.hands.pullDrop === null ? drop : evalNumber(shape.hands.pullDrop, env);

  return {
    ends,
    joinsAt(t) {
      if (t >= pull.takeTo && t <= pull.releaseFrom) return [pullJoin];
      if (t >= window.takeTo && t <= window.releaseFrom) return joins;
      return [];
    },
    at(role, t) {
      const self = placeAt(role, t);
      const mine = swap[role] !== undefined;
      const lark = mine ? host[role]! : role;
      const robin = mine ? role : guest[role];
      const partner = mine ? lark : robin;

      const hands: { L: LocalHand; R: LocalHand } = { L: "down", R: "down" };

      if (mine) {
        // The pull by: both right hands on one point between the two robins.
        const other = placeAt(swap[role]!, t);
        const point = joinPoint(self, "R", other, "R");
        const joined = joinedHands(ctx, role, swap[role]!, point, pullDrop);
        hands.R = takeAndRelease(self, "R", t, joined[role]!, pull);
      }

      if (partner !== undefined) {
        const other = placeAt(partner, t);
        const point = joinPoint(self, "L", other, "L");
        const joined = joinedHands(ctx, role, partner, point, drop, stackPx);
        const held = joined[role];
        if (held) hands.L = takeAndRelease(self, "L", t, held, window);
        if (backs) {
          // Both right hands go to the robin's back: two points, never a join.
          // Hers has to let go of the pull by first, which it has by the time
          // the courtesy turn's own take begins.
          const back = courtesyBackHands(mine ? self : other, mine ? other : self);
          const free = takeAndRelease(self, "R", t, mine ? back.robin : back.lark, window);
          if (!mine || t > pull.releaseTo) hands.R = free;
        }
      }

      // Everybody in a chain is walking now: the larks go in and back out.
      return { p: self.p, facing: self.facing, hands, stepRate: 1, amp: 1 };
    },
  };
}

/**
 * The pull by's own hand window and the courtesy turn's.
 *
 * Both are fractions of the pull by's own length rather than fixed beats,
 * because an orbit chain's pull by is two beats where a rigid turn's was four
 * and a half, and a hand that is still letting go of the other robin when the
 * lark's hand arrives on her back jumps. The pull by's window may not start any
 * earlier than the scaling puts it — at beat zero the two robins are a set
 * apart and the point between them is nowhere near either hip — so it grows
 * *forwards*, to the crossing at the middle of the pull by and no further.
 */
function chainWindows(
  pullBeats: Beat,
  beats: Beat,
  openBeats: Beat,
): { window: HoldWindow; pull: HoldWindow } {
  const scale = pullBeats / PULL_WINDOW_BEATS;
  const window: HoldWindow = {
    takeFrom: Math.max(0, pullBeats - TAKE_BEATS * scale),
    takeTo: pullBeats,
    releaseFrom: beats - openBeats,
    releaseTo: beats,
  };
  const takeFrom = 0.8 * scale;
  const takeTo = Math.min(Math.max(1.6 * scale, takeFrom + PULL_TAKE_BEATS), pullBeats / 2);
  const releaseFrom = Math.max(2.4 * scale, takeTo);
  return {
    window,
    pull: {
      takeFrom,
      takeTo,
      releaseFrom,
      releaseTo: Math.min(releaseFrom + PULL_TAKE_BEATS, window.takeFrom),
    },
  };
}

/**
 * The pull by the two hand windows above are written in beats of: the chain's
 * own historical `pullBeats` default.
 *
 * Both windows scale with the pull by's actual length, so a chain whose pull by
 * is two beats rather than four and a half takes and lets go proportionally
 * rather than running off the end of it.
 */
const PULL_WINDOW_BEATS: Beat = 4.5;

/** How long the hands take to close, at the end of the pull by, beats. */
const TAKE_BEATS: Beat = 1;

/**
 * How long the pull by's own right hands take to close, and to let go, beats.
 *
 * Where the pull by is shorter than the default the window's *position* scales
 * with it but its two ramps keep this length wherever there is room for them,
 * because the alternative is a hand that crosses a hold in a third of a beat.
 */
const PULL_TAKE_BEATS: Beat = 0.8;

/** The couples a `"couples"` pairing names, each as `[lark, robin]`. */
function couplePairs(
  shape: CourtesyTurnShape,
  input: ShapeInput,
): readonly [StationId, StationId][] {
  if (shape.pairing.kind !== "couples") throw new Error(`not a couples pairing`);
  const named = input.params[shape.pairing.param];
  if (named === undefined) {
    throw new Error(`a courtesy turn reads "${shape.pairing.param}", which is not a parameter`);
  }
  const here = new Set(input.ctx.ids);
  return pairsOf(named as Pairing)
    .filter(([a, b]) => here.has(a) && here.has(b))
    .map((pair) => larkAndRobin(input.ctx, pair));
}

/** The two dancers a `"chain"` pairing sends across. */
function chainingDancers(shape: CourtesyTurnShape, input: ShapeInput): [StationId, StationId] {
  if (shape.pairing.kind !== "chain") throw new Error(`not a chain pairing`);
  const role = input.params[shape.pairing.param];
  const chaining = input.ctx.ids.filter((id) => input.ctx.role(id) === role);
  if (chaining.length !== 2) {
    throw new Error(`a chain needs exactly two ${String(role)}s, found ${String(chaining.length)}`);
  }
  return [chaining[0]!, chaining[1]!];
}

/**
 * Which lark each chaining dancer courtesy turns with: the lark of the couple
 * whose place she lands on.
 *
 * A couple faces one way together — both dancers of it — and no two couples of
 * a minor set face the same way, so the lark she ends beside is the one facing
 * the way her landing place faces. Picking the *nearest* lark instead is what
 * F3a measured as 42.7 px of daylight between two hands that are supposed to be
 * one point.
 */
function hostLarks(
  ctx: PlanContext,
  chaining: readonly StationId[],
  swap: Record<StationId, StationId>,
): Record<StationId, StationId> {
  const chains = new Set(chaining);
  const host: Record<StationId, StationId> = {};
  for (const id of chaining) {
    const landing = ctx.spot(swap[id]!);
    let best: StationId | undefined;
    let bestScore = Infinity;
    for (const other of ctx.ids) {
      if (chains.has(other)) continue;
      const turned = Math.abs(angleDiff(landing.facing, ctx.spot(other).facing));
      // Facing the same way as her landing place decides it; how near he is
      // only breaks a tie between two larks facing the same way.
      const score = (turned > 90 ? 1e6 : 0) + dist(ctx.spot(other).p, landing.p);
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    if (best === undefined) throw new Error(`a chain has nobody for "${id}" to turn with`);
    host[id] = best;
  }
  return host;
}

/** A turning couple's four hands, for one of the two dancers. */
function coupleHands(
  ctx: PlanContext,
  role: StationId,
  mate: StationId,
  self: Spot,
  other: Spot,
  isLark: boolean,
  t: Beat,
  window: HoldWindow,
  drop: number,
  stackPx: number,
  backs: boolean,
): { L: LocalHand; R: LocalHand } {
  // Both left hands on one point: the midpoint of the two left shoulders.
  const point = joinPoint(self, "L", other, "L");
  const joined = joinedHands(ctx, role, mate, point, drop, stackPx);
  const mine = joined[role];
  if (!mine) throw new Error(`a courtesy turn has no joined hand for "${role}"`);
  if (!backs) {
    return { L: takeAndRelease(self, "L", t, mine, window), R: "down" };
  }
  // Both right hands go to the robin's back: two points, never a join.
  const back = courtesyBackHands(isLark ? other : self, isLark ? self : other);
  const free: Hand = isLark ? back.lark : back.robin;
  return {
    L: takeAndRelease(self, "L", t, mine, window),
    R: takeAndRelease(self, "R", t, free, window),
  };
}
