import type { Beat, Hand } from "@caller/core";
import { angleDiff, dist } from "@caller/core";
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
  CLEARANCE_PX,
  centreOf,
  contraFigure,
  joinPoint,
  joinedHands,
  midpoint,
  takeAndRelease,
} from "./ContraFigure.js";
import type { CourtesyTurn } from "./courtesyTurn.js";
import { courtesyBackHands, orbitTurn, stepInHold } from "./courtesyTurn.js";

/** {@link robinsChain}'s parameters. */
export interface RobinsChainParams extends ContraParams {
  /** Which role chains across. */
  chains: RoleName;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
  /**
   * Which beat the arriving robin joins the lark's orbit on.
   *
   * F10's candidate 5, which F13 made the default and **M4 makes the only
   * regime the chain has** (A6): the lark orbits a whole turn backwards over
   * the figure's eight beats, and the pull by is the robins' walk on to the far
   * side of that orbit — so the join *is* the pull by, and there is no separate
   * `pullBeats`. The user's own number is 2, a quarter of the way through, and
   * M10c measured every value up to 4 without being able to move it — the
   * three walls are written out on {@link CHAIN_JOIN_BEAT}.
   *
   * F9's four earlier candidates — the rigid turn at two pivots, and the two
   * couple-spins — are gone with `CHAIN_CANDIDATES`, `?chain=` and
   * `pnpm figure --chain`, and with them `pullBeats`, `bowPx`, `pivotFromLark`
   * and `stepInPx`. An orbit has one circle and no pivot to choose.
   */
  joinBeat: Beat;
  /**
   * How far to her own left of the set's centre each robin passes, px — only
   * read when {@link RobinsChainParams.joinBeat} is above zero.
   *
   * The two robins' paths are point reflections of each other through the set's
   * centre, so they cross exactly `2 · passPx` apart with right shoulders
   * together: this number is half the pull by's clearance, and
   * {@link CHAIN_PASS_PX} is the smallest that keeps it at AC6's torso floor.
   */
  passPx: number;
}

/**
 * How far to her own left of the set's centre each robin passes on an orbit
 * chain, px: **half the library's own clearance**, 4.25.
 *
 * The two robins' paths are point reflections of each other through the set's
 * centre at every instant (F8's closed form, and it is still true here), so the
 * pair's clearance at the pull by is twice one robin's distance from that
 * centre and nothing else — which makes "the smallest dip that keeps them at or
 * above the torso floor" arithmetic rather than a sweep. Exactly 4 px puts them
 * exactly 8.000 px apart, which is AC6's floor **and** AC6's own test is a
 * strict `>`, so the dip that actually clears it is the next number the library
 * already has: {@link CLEARANCE_PX} halved, which is 4.25 and puts them
 * **8.500 px** apart — the same room every other figure for two leaves the pair
 * beside it.
 *
 * It is *to her own left* because that is what passes right shoulders in this
 * coordinate system (y down; see {@link passRight}), and because without it the
 * pass is the wrong way round: her take lies up the hall of the straight line
 * from her place to her new one, so the undipped paths cross with each robin on
 * the other's **left**.
 */
export const CHAIN_PASS_PX = CLEARANCE_PX / 2;

/**
 * Which beat of the orbit chain the robin joins the lark on: **2**, the user's
 * own number — "the robins pull by to join the larks 1/4 of the way through.
 * (2 beats)".
 *
 * F10 measured 2, 2.5 and 3 and the table is in its report. 2 is the earliest
 * take and the fastest robin; it is also the one the user said.
 *
 * ## M10c: the user asked for four, and this number cannot move at all
 *
 * The user, watching the chain danced: *"in the chain the pull-by is still too
 * fast and the turn too slow. it should be about 4 beats each."* M10c measured
 * the whole ladder from 2 to 4 and **shipped no change**, because three
 * separate walls stand in the way and each of them needs a ruling this figure
 * does not get to make. The numbers are recorded here so that nobody derives
 * them twice.
 *
 * **1. This hand is what the library's motion bounds are derived from.**
 * `takeExtremes()` scans every figure in the registry for the furthest a
 * dancer ever reaches from her own hip to a hand she holds, and the winner is
 * `robins-chain 1R R` — the robin's own right hand on the pull by's shared
 * point. Moving the join moves it, and `CONTRA_MOTION_BOUNDS` with it:
 * 15.2143 px at 2 beats, 15.1642 at 2.25, 15.3925 at 2.5, 17.2568 at 3,
 * 22.3189 at 4, taking `handSpeedPx` from 68.375 to 68.15 / 69.18 / 77.55 /
 * 100.30 and `elbowPerHand` from 9.8864 to 9.98 / 9.53 / 10.11 / 8.74. So
 * `motionBounds.test.ts` fails at **every** value above, including the ones
 * that are otherwise green, and re-deriving is a bound edit.
 *
 * **2. `elbowPerHand`, even against a re-derived bound.** The chain's own row
 * inside a dance goes 7.94× at 2 beats → 8.06 at 2.25 → 9.63 at 2.5 → 12.33 at
 * 3 → 13.87 at 3 in becket. The elbow did not get worse: the lark's right
 * elbow flips through its pole at 169 px/beat in one 1/32-beat sample at the
 * two-beat join and 121 px/beat at the three-beat one. What changed is the
 * hand it is divided by — 20.11 px/beat then, 9.90 now — because a longer pull
 * by is a slower take. A ratio guard punishes exactly the improvement the user
 * asked for.
 *
 * **3. The pull by stops existing at 3.05 beats.** `orbitTurn` shapes a pull by
 * only where the robins' own undipped walks bring them within
 * `HOLD_SPACING_PX` of each other. Twice how near that walk comes to the middle
 * of the set: 8.477 px at 2 beats, 10.643 at 2.5, **13.716 at 3, 14.050 at
 * 3.05**, 17.059 at 3.5, 20.002 at 4. Past three beats the two robins never
 * pass, and the right hands the figure still joins are 32 px apart: `reach`
 * fails by 3.1817 px in every chain-calling dance.
 *
 * **And four is structurally out of reach, not merely tight.** The lark spends
 * his one whole turn evenly — which is the user's own "constant speed
 * throughout" — so at the midpoint of the figure he is exactly half way round
 * his circle, and she joins at that circle's *antipode*, which at a half turn
 * is **his own starting place**. That makes the two robins' walks parallel: in
 * a duple improper four she walks the 20 px to it along her own line and never
 * crosses the set at all, and in becket she crosses it on a track 20 px from
 * the other robin's, which is why there is nothing left to pull by.
 *
 * **The one arrangement that does give the user four and four**, measured, is
 * the other half of M10c's brief: the lark **waits on his place and spends his
 * whole turn over the last four beats**. The pull by survives (the robins pass
 * at 8.500 px in becket), every programme dance keeps its `closure`, `reach`,
 * `collision` and `progressed` at every length, and seven of the eight motion
 * columns improve — `hand` 52.8 → 37.5, `elbow` 143.9 → 74.2, `elbowPerHand`
 * 8.17 → 7.41, `height` 45.4 → 22.8, `travel` 21.9 → 16.3, `halves` 1.84 →
 * 1.11, with `roleSpread` the one that worsens, 1.94 → 2.23. It is **not**
 * taken here, for three reasons that are the user's own words rather than an
 * oracle's: he told us "the larks orbit backwards 1 full turn ... from the
 * first beat", a lark who stands still for four of eight beats is the opposite
 * of "constant speed throughout the moves", and the couple stops facing out of
 * the set at the half — four of this figure's own assertions fail, because at
 * beat 4 they now face in and do not face out until beat 6. Wall 1 stands over
 * it either way: the reach becomes 17.0152 px and `handSpeedPx` 76.4688.
 */
export const CHAIN_JOIN_BEAT: Beat = 2;

/**
 * Robins chain: the two robins pull by the right in the middle, and each joins
 * the backward orbit of the lark whose couple she is arriving at.
 *
 * The user, watching a video walkthrough (F10): "the larks orbit backwards 1
 * full turn around the point between where they and the robin started. the
 * robins pull by to join the larks 1/4 of the way through. (2 beats) they both
 * finish the orbit."
 *
 * So the lark is moving from the first beat, not waiting on his place: he backs
 * round a small circle centred halfway between his own place and the place
 * beside him — one hold across — turning as he goes, so his back is always to
 * that centre. The robin coming to him pulls by the other robin with right
 * hands in the middle of the set, passing right shoulders, and arrives on the
 * far side of his circle — its **antipode** — at the join beat, moving with the
 * orbit's own velocity so she joins it rather than being picked up standing
 * still. From there the pair is rigid about that same centre: her left hand in
 * his left, his right hand behind her back and her own right hand there too,
 * she walking forward as he keeps walking backward, both turning at the
 * orbit's own rate. They face directly out of the set together at the half and
 * back in at the end, with her now on his right, and open out on to the two
 * places over the last beat and a half.
 *
 * This was F10's candidate 5 of five — the only one of them a different figure
 * rather than a tuning of the rigid pivot F7/F8/F9 shipped, because a quarter
 * of an orbit carries the lark's take on to the **inner** side of his line,
 * where a right-shoulder pull by can reach it. F13 made it the default and
 * **M4 makes it the only one** (A6): the other four, `CHAIN_CANDIDATES`,
 * `?chain=` and `pnpm figure --chain` are gone. See {@link orbitTurn}.
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
    "The two robins take right hands in the middle and pull by, passing right shoulders, and carry on across the set. The lark of the couple each robin is arriving at is already moving: from the first beat he backs round a small circle centred halfway between his own place and the place beside him, one hold across. She reaches him a quarter of the way round it, at the far side of his circle, and takes it up with him — her left hand in his left, her own right hand behind her own back and his right hand on it — walking forward as he keeps walking backward, both of them turning about that same centre. They face directly out of the set together at the halfway point and back in at the end, with the robin now on the lark's right, and the couple opens out on to the two places. He ends where he started, facing the way he already faced: the whole effect of a chain is that the robins have traded and each couple has a new robin. (unsure: a lark can twirl her under his hand instead, and this only scoops.)",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    chains: "robin",
    holdDrop: 6,
    stackPx: 1,
    joinBeat: CHAIN_JOIN_BEAT,
    passPx: CHAIN_PASS_PX,
  },

  plan(ctx: PlanContext, params: RobinsChainParams): FigurePlan {
    const beats = params.beats;
    // An orbit chain's pull by *is* its join: she walks on to the lark's circle
    // and the figure turns from there.
    const pullBeats = Math.min(params.joinBeat, beats);
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

    /** The middle of the set: where the pull by happens on an orbit chain. */
    const setCentre = centreOf(ctx.ids.map((id) => ctx.spot(id)));

    /**
     * Where each dancer of a turning couple stands when the hands close, and
     * the turn that takes them from there on to their places.
     *
     * The couple's turn is rigid, so the take is not a choice: it is the pair
     * of end places reflected through the point between them and brought in to
     * the hold ({@link courtesyTurn}). He stands on *her* side of that point and
     * she on *his*, both facing out, she on his right. What the figure has to
     * do is walk the two of them there over the pull by — unless the turn is an
     * {@link orbitTurn}, which is already walking them itself and says so with
     * {@link CourtesyTurn.approach}.
     */
    const take: Record<StationId, Spot> = {};
    const turns: Record<StationId, { turn: CourtesyTurn; mine: "lark" | "robin" }> = {};
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
        passPx: params.passPx,
        beats,
        openBeats,
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
        // An orbit turn is already moving both of them before the take — he is
        // a quarter of the way round his circle and she has to arrive on it at
        // its own speed — so it places them itself. Since A6 that is the only
        // regime this figure has, and `approach` is therefore always there.
        const { approach } = turning.turn;
        if (!approach) throw new Error(`robins-chain: an orbit turn must place its own approach`);
        return approach(turning.mine, t);
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
    //
    // Both windows are fractions of the pull by's own length rather than fixed
    // beats, because an orbit chain's pull by is two beats where the rigid
    // turn's is four and a half, and a hand that is still letting go of the
    // other robin when the lark's hand arrives on her back jumps. `PULL_WINDOW_
    // BEATS` is the figure's own default, so every number below is exactly what
    // it was at the default pull by and the four earlier candidates do not move.
    const pullScale = pullBeats / PULL_WINDOW_BEATS;
    const window = {
      takeFrom: Math.max(0, pullBeats - TAKE_BEATS * pullScale),
      takeTo: pullBeats,
      releaseFrom: beats - openBeats,
      releaseTo: beats,
    };
    // The pull by's own two hands **start** where scaling puts them and then
    // last as long as there is room for, up to the default's own 0.8 of a beat.
    // A hand that has to go up and come down inside a two-beat pull by is a
    // fast hand and there is no reason to make it faster than it must be — but
    // it may not start any earlier either, because at beat zero the two robins
    // are a set apart and the point between them is nowhere near either hip.
    // So the take grows forwards, to the crossing at the middle of the pull by
    // and no further, and the release grows forwards to where the courtesy
    // turn's own hands begin. At the default pull by every one of the four is
    // exactly the number it always was.
    const takeFrom = 0.8 * pullScale;
    const takeTo = Math.min(Math.max(1.6 * pullScale, takeFrom + PULL_TAKE_BEATS), pullBeats / 2);
    const releaseFrom = Math.max(2.4 * pullScale, takeTo);
    const pull = {
      takeFrom,
      takeTo,
      releaseFrom,
      releaseTo: Math.min(releaseFrom + PULL_TAKE_BEATS, window.takeFrom),
    };

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
 * The pull by the two hand windows above are written in beats of: **the rigid
 * turn's own four and a half**, which is F9's pull by and not this figure's.
 *
 * Both windows scale with the pull by's actual length, so a chain whose pull by
 * is three beats rather than four and a half takes and lets go proportionally
 * rather than running off the end of it.
 *
 * The sentence that used to stand here — "at the default the scale is exactly
 * 1, `4.5 / 4.5` is 1 to the last bit" — is **withdrawn** (M10c): it was true
 * of F9's rigid turn and stopped being true the moment F13 made the orbit the
 * default, because an orbit chain's pull by is {@link CHAIN_JOIN_BEAT} beats
 * and the scale is that over this. It is `3 / 4.5` now and was `2 / 4.5`
 * before.
 */
const PULL_WINDOW_BEATS: Beat = 4.5;

/**
 * How long the pull by's own right hands take to close, and to let go, beats:
 * the default pull by's own `1.6 − 0.8` and `3.2 − 2.4`, named.
 *
 * Where the pull by is shorter than the default the window's *position* scales
 * with it but its two ramps keep this length wherever there is room for them,
 * because the alternative is a hand that crosses a hold in a third of a beat —
 * over the oracle's hand-speed guard, measured, and for no reason but
 * arithmetic.
 */
const PULL_TAKE_BEATS: Beat = 0.8;
