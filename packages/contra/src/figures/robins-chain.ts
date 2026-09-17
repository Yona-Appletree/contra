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
   * `pullBeats`. M10c makes it **half the figure** on the user's own ruling;
   * {@link CHAIN_JOIN_BEAT} has the count and what had to move for it.
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
  /**
   * How long before the join the lark's own turn begins, beats.
   *
   * M10c. `0` is a lark who stands on his place until she reaches him and then
   * spends his whole turn with her; the figure's own default is
   * {@link CHAIN_LARK_LEAD_BEATS}, which has him moving to receive her rather
   * than waiting dead still. Above {@link RobinsChainParams.joinBeat} it is the
   * whole figure, which is the orbit as it ran before M10c.
   */
  larkLead: Beat;
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
 * Which beat of the orbit chain the robin joins the lark on: **4** of eight —
 * half the figure to pull by and cross, half to turn.
 *
 * The user, F10, describing what he had just watched: "the robins pull by to
 * join the larks 1/4 of the way through. (2 beats)". The user again on
 * 2026-09-16, watching it danced: *"in the chain the pull-by is still too fast
 * and the turn too slow. it should be about 4 beats each."* This is that
 * ruling, and it is the count every caller teaches: four to chain across, four
 * to courtesy turn.
 *
 * **What had to change for the number to be free.** While the lark's orbit
 * spanned the whole figure, moving the join dragged the robin's take round his
 * circle with it — she arrives at the circle's *antipode*, so a later join is a
 * take further round and further back out of the set. M10c measured the ladder:
 * twice how near her undipped walk comes to the middle of the set was 8.477 px
 * at two beats, 10.643 at 2.5, 13.716 at three and **14.050 at 3.05**, against
 * the library's own `HOLD_SPACING_PX` of 14 — so past three beats the two
 * robins stopped passing at all, and at four the right hands the figure still
 * joined were 32 px apart and `reach` failed by 3.1817 px in every
 * chain-calling dance.
 *
 * {@link CHAIN_LARK_LEAD_BEATS} is what took that wall away: his turn starts
 * when she is nearly there rather than at beat zero, so her take is the near
 * side of his circle — deep in the set, where a right-shoulder pull by reaches
 * it — whatever beat she arrives on. The join beat and the take stopped being
 * the same lever.
 */
export const CHAIN_JOIN_BEAT: Beat = 4;

/**
 * How long before the join the lark's own turn begins, beats: **1**.
 *
 * A chain's lark does not orbit from the first beat — he **receives** her. The
 * robins have the middle of the set to themselves while they pull by and cross
 * it, and he comes to meet the one arriving at his couple over the last beat of
 * it, so that the pair is already moving together when the hands close.
 *
 * The sentence this replaces — "the lark is moving from the first beat, not
 * waiting on his place" — was the coded figure's reading of an eight-beat
 * orbit, not something the user said; what he described was one whole turn
 * inside eight beats and the robins joining it part way through, which is what
 * this still is.
 *
 * **One and not zero, measured.** M10c compared a lark who stands dead still
 * through the pull by against one who has already begun, on the evenness of his
 * own per-beat speeds, which is the user's standing criterion ("people try to
 * move at a constant speed throughout the moves for the most part"); the
 * numbers and the whole ladder are in the milestone's report.
 */
export const CHAIN_LARK_LEAD_BEATS: Beat = 0;

/**
 * Robins chain: the two robins pull by the right in the middle, and each joins
 * the backward orbit of the lark whose couple she is arriving at.
 *
 * The user, watching a video walkthrough (F10): "the larks orbit backwards 1
 * full turn around the point between where they and the robin started. the
 * robins pull by to join the larks 1/4 of the way through. (2 beats) they both
 * finish the orbit."
 *
 * **M10c: four beats to pull by, four to turn** — the user's ruling of
 * 2026-09-16, and the count every caller teaches. The robins have the middle of
 * the set to themselves while they cross it, and the lark **receives** the one
 * arriving at his couple: he stands on his place while they pull by and comes
 * to meet her over the last beat of it
 * ({@link CHAIN_LARK_LEAD_BEATS}), backing round a small circle centred halfway
 * between his own place and the place beside him — one hold across — turning as
 * he goes, so his back is always to that centre. He then spends the whole of
 * that turn with her. The robin coming to him pulls by the other robin with
 * right hands in the middle of the set, passing right shoulders, and arrives on the
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
    "The two robins take right hands in the middle and pull by, passing right shoulders, and carry on across the set: four beats to chain across, four to turn. The lark of the couple each robin is arriving at waits on his own place while they cross, and receives her: from the halfway point he backs a whole turn round a small circle centred halfway between his own place and the place beside him, one hold across. She reaches him at the far side of that circle just as it begins, and takes it up with him — her left hand in his left, her own right hand behind her own back and his right hand on it — walking forward as he walks backward, both of them turning about that same centre. They face directly out of the set together half way through the turn and back in at the end, with the robin now on the lark's right, and the couple opens out on to the two places. He ends where he started, facing the way he already faced: the whole effect of a chain is that the robins have traded and each couple has a new robin. (unsure: a lark can twirl her under his hand instead, and this only scoops.)",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    chains: "robin",
    holdDrop: 6,
    stackPx: 1,
    joinBeat: CHAIN_JOIN_BEAT,
    passPx: CHAIN_PASS_PX,
    larkLead: CHAIN_LARK_LEAD_BEATS,
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
        // M10c: his turn starts when she has all but arrived, not at beat zero.
        turnFrom: Math.max(0, pullBeats - params.larkLead),
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
        // An orbit turn places the approach itself: she has to arrive on his
        // circle at its own speed, which a straight walk cannot do. Since A6 that is the only
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
