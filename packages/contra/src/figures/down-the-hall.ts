import type { Angle, Beat, Vec2 } from "@caller/core";
import {
  HOLD_SPACING_PX,
  angleDiff,
  angleLerp,
  angleOfVec,
  dirOf,
  dist,
  len,
  mix,
  sub,
} from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  HoldWindow,
  LocalHand,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import {
  centreOf,
  contraFigure,
  isHeld,
  joinPoint,
  joinedHands,
  midpoint,
  polar,
  takeAndRelease,
} from "./ContraFigure.js";

/** {@link downTheHall}'s parameters. */
export interface DownTheHallParams extends ContraParams {
  /**
   * The group's own four stations, left to right in the line the figure
   * forms: the first two are one couple, the last two the other. Which
   * physical order a dance wants ("M1-W1-M2-W2" or "M1-W2-M2-W1") is a
   * per-dance fact, not a formation one, so it is data here.
   */
  order: readonly [StationId, StationId, StationId, StationId];
  /** How far down the hall the line travels, px. */
  forwardPx: number;
  /** How far apart adjacent dancers in the line stand, px. */
  linePitchPx: number;
  /** Beats spent walking down the hall. */
  downBeats: Beat;
  /** Beats spent turning as couples. */
  turnBeats: Beat;
  /** Beats spent walking up the hall. */
  upBeats: Beat;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
}

/** Beats spent taking or releasing one hand join. */
const JOIN_RAMP: Beat = 0.5;

/**
 * Down the hall: the group's own four dancers form a line, walk down the hall
 * together, turn as couples, walk back up, and bend the line into place for
 * whatever follows.
 *
 * Confirmed against Frederick Contra's own B1 (CB 10446, fetched read-only):
 * "In a line of four, go down the hall (M1-W1-M2-W2) — partner turn as
 * couples — in a line of four, go up the hall (W1-M1-W2-M2) — bend the
 * line," six-two-six-two, four dancers only, the group's own two couples. No
 * text checked reaches a dancer outside the group in its interior form.
 *
 * The two lines every contra formation lays its stations out in share one
 * axis convention (`@caller/contra`'s README: "local +y down the set"), so
 * "down the hall" is always local +y and "up the hall" always local −y,
 * regardless of formation — no per-formation direction lookup is needed.
 *
 * **Turning as couples is a rigid pivot.** Each couple's own two dancers
 * rotate together, 180°, about their couple's own midpoint: the geometry of
 * a rigid rotation keeps their mutual distance exactly constant (so the
 * joined hand that does the turning never has to stretch), and the two
 * couples turn in mirrored senses so the pair between them — the one line
 * hold that has to let go for the turn — only ever moves apart, never
 * closer. This is what "M1-W1" becomes "W1-M1": a couple pivoting 180° about
 * its own centre swaps which of its two dancers is on which side, exactly
 * the swap the text calls for, with no dancer's path crossing another's.
 *
 * **The bend** opens each dancer onto their partner's own original station:
 * a station's whole rest pose (its position and its facing) is a sane
 * finishing pose for whatever follows — the same convention `long-lines` and
 * `balance-ring` use for their own reforming moves.
 */
export const downTheHall = contraFigure<DownTheHallParams>({
  id: "down-the-hall",
  call: "DOWN THE HALL",
  describe:
    "With the group's own four, form a line side by side, take hands, and walk forward down the hall together. Turn as couples to face back the way you came, still holding your partner's hands, and walk back up the hall to place. Bend the line: each of you ends on your partner's own spot, ready for whatever comes next.",
  lead: 4,
  beats: 16,
  defaults: {
    from: {},
    order: ["1L", "1R", "2L", "2R"],
    forwardPx: 32,
    linePitchPx: HOLD_SPACING_PX,
    downBeats: 6,
    turnBeats: 2,
    upBeats: 6,
    holdDrop: 8,
    stackPx: 1,
  },

  plan(ctx: PlanContext, params: DownTheHallParams): FigurePlan {
    const beats = params.beats;
    const [c1a, c1b, c2a, c2b] = params.order;
    const order = params.order;
    const partnerOf = (id: StationId): StationId => {
      const at = order.indexOf(id);
      if (at < 0) throw new Error(`down-the-hall: "${id}" is not in "order"`);
      return order[at % 2 === 0 ? at + 1 : at - 1]!;
    };

    const t0 = 0;
    const t1 = Math.min(params.downBeats, beats);
    const t2 = Math.min(t1 + params.turnBeats, beats);
    const t3 = Math.min(t2 + params.upBeats, beats);
    const t4 = beats;

    const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
    const pitch = params.linePitchPx;
    // The turn's own hold reach, not the line's own spacing: at the turn's
    // own peak angular speed (the smoothstep's velocity peaks exactly at its
    // midpoint, same as everywhere else in this figure), the motion-quiet
    // sway `armShortfall` folds in ate a hair off a hold planned at the bare
    // line spacing — 0.11 px, found by the probe, not by inspection. A small
    // safety factor on the turn's own radius (never the line's own width,
    // still `pitch` everywhere else) buys back more than that.
    const TURN_RADIUS_SAFETY = 0.95;
    const radius = (pitch / 2) * TURN_RADIUS_SAFETY;
    // The line's four positions, left to right, centred on the group.
    const lineX = (k: number): number => (k - 1.5) * pitch;
    const orderIndex: Record<StationId, number> = {};
    order.forEach((id, k) => (orderIndex[id] = k));
    // Which couple a station is in, and that couple's own midpoint x (the
    // pivot centre for "turn as couples"), left couple negative, right
    // couple positive.
    const midXOf = (id: StationId): number => (orderIndex[id]! < 2 ? -pitch : pitch);
    // The line position a station ends up on after the couples swap: the
    // couple's other slot.
    const postSwapX = (id: StationId): number => lineX(orderIndex[partnerOf(id)]!);

    const DOWN = 90;
    const UP = 270;
    // Forming the line happens before any hand is taken: a dancer's own line
    // neighbour depends on where everybody else in the line actually is, and
    // that relationship is only stable once the line itself has formed — a
    // hand taken mid-formation had no fixed neighbour to reach for, which is
    // what the probe caught (both a reach shortfall, since a couple 32 px
    // apart is asked for a 14 px hold, and a join split across two different
    // holds at once, since a dancer between two neighbours cannot tell which
    // hand goes where until the line is actually a line).
    const formBeats = Math.min(2, t1 / 2);
    // A dance's own authoring order does not have to match which physical
    // side of their couple each dancer already stands on ("M1-W2-M2-W1" is
    // named as a valid order in the brief), so forming the line — and,
    // symmetrically, bending back out of it at the end — can ask a couple's
    // two dancers to cross. Rather than nudge a straight walk sideways to
    // dodge the crossing point (tried, and fragile: any fixed or
    // position-reactive sideways sign that fixes one couple's crossing
    // reliably created a new, smaller one between a *different* pair, found
    // only by the probe and not by inspection), each dancer of a crossing
    // couple travels on {@link pivotAt}: a rigid rotation about the couple's
    // own midpoint, exactly the geometry `turn as couples` already uses,
    // except the midpoint itself is also allowed to travel (from the
    // couple's own start midpoint to its own end midpoint) and the radius to
    // change (from the couple's own starting spacing to the line's). A rigid
    // rotation's two ends are always the same distance apart as the rotation
    // itself calls for, at every instant, which is what makes it safe by
    // construction rather than by a tuned constant: nothing about *this*
    // couple's own path can ever bring its own two dancers together, because
    // they are always exactly `2 × radius` apart, on opposite sides of one
    // travelling point.
    // A couple that needs a genuine 180° flip has two equally valid arcs —
    // clockwise and anticlockwise — since a rotation exactly half way round
    // is its own mirror image. `couplePivot` breaks that tie away from
    // wherever the *other* couple's own crossing sits, so a couple that does
    // need to sweep wide never sweeps toward the couple beside it.
    const otherCoupleOf = (id: StationId): readonly [StationId, StationId] => {
      const partner = partnerOf(id);
      const others = order.filter((s) => s !== id && s !== partner);
      return [others[0]!, others[1]!];
    };
    // Always computed from the *same* member of the couple, whichever
    // station is actually asked for: `couplePivot` decides its 180° tie once
    // per call from that member's own `angleStart`, so asking it once for
    // "1L, then 1R" and once for "1R, then 1L" is two different calls that
    // can (and, before this, did) resolve the tie two different ways —
    // breaking the fixed-distance guarantee the whole approach rests on.
    // Routing both requests through one designated member keeps every
    // question about a couple's own pivot a single, shared answer.
    const canonicalOf = (id: StationId): StationId => {
      const partner = partnerOf(id);
      return orderIndex[id]! < orderIndex[partner]! ? id : partner;
    };
    const formPos = (id: StationId, k: number): Vec2 => {
      const a = canonicalOf(id);
      const b = partnerOf(a);
      const [o1, o2] = otherCoupleOf(a);
      const otherAt = (at: number): readonly [Vec2, Vec2] => {
        const other = couplePivot(
          ctx.spot(o1).p,
          ctx.spot(o2).p,
          [centre[0] + lineX(orderIndex[o1]!), centre[1]],
          [centre[0] + lineX(orderIndex[o2]!), centre[1]],
          at,
          "translate-then-pivot",
        );
        return [other.a, other.b];
      };
      const pivot = couplePivot(
        ctx.spot(a).p,
        ctx.spot(b).p,
        [centre[0] + lineX(orderIndex[a]!), centre[1]],
        [centre[0] + lineX(orderIndex[b]!), centre[1]],
        k,
        "translate-then-pivot",
        otherAt,
      );
      return id === a ? pivot.a : pivot.b;
    };

    /** Where a station stands `t` beats in, in every phase. */
    const placeAt = (id: StationId, t: Beat): Spot => {
      const start = ctx.spot(id);
      if (t <= formBeats) {
        const k = rampAt(t, t0, formBeats);
        return { p: formPos(id, k), facing: angleLerp(start.facing, DOWN, k) };
      }
      if (t <= t1) {
        const k = rampAt(t, formBeats, t1);
        const from: Vec2 = [centre[0] + lineX(orderIndex[id]!), centre[1]];
        const end: Vec2 = [centre[0] + lineX(orderIndex[id]!), centre[1] + params.forwardPx];
        return { p: mixVec(from, end, k), facing: DOWN };
      }
      if (t <= t2) {
        const k = rampAt(t, t1, t2);
        const mid = midXOf(id);
        // Each couple rotates as a rigid pair about its own midpoint; the two
        // couples turn in mirrored senses, which is what keeps the pair
        // between them (the outer line hold) only ever moving apart.
        const own = orderIndex[id]! % 2 === 0 ? 0 : 1;
        const isLeftCouple = orderIndex[id]! < 2;
        const sweep = isLeftCouple ? 180 * k : -180 * k;
        const angle = (own === 0 ? 180 : 0) + sweep;
        const rad = (angle * Math.PI) / 180;
        const p: Vec2 = [
          centre[0] + mid + radius * Math.cos(rad),
          centre[1] + params.forwardPx + radius * Math.sin(rad),
        ];
        return { p, facing: angleLerp(DOWN, UP, k) };
      }
      if (t <= t3) {
        const k = rampAt(t, t2, t3);
        const x = centre[0] + postSwapX(id);
        const y = mix(centre[1] + params.forwardPx, centre[1], k);
        return { p: [x, y], facing: UP };
      }
      const k = rampAt(t, t3, t4);
      const a = canonicalOf(id);
      const b = partnerOf(a);
      const [o1, o2] = otherCoupleOf(a);
      const otherAt = (at: number): readonly [Vec2, Vec2] => {
        const other = couplePivot(
          [centre[0] + postSwapX(o1), centre[1]],
          [centre[0] + postSwapX(o2), centre[1]],
          ends[o1]!.p,
          ends[o2]!.p,
          at,
          "pivot-then-translate",
        );
        return [other.a, other.b];
      };
      const pivot = couplePivot(
        [centre[0] + postSwapX(a), centre[1]],
        [centre[0] + postSwapX(b), centre[1]],
        ends[a]!.p,
        ends[b]!.p,
        k,
        "pivot-then-translate",
        otherAt,
      );
      const p = id === a ? pivot.a : pivot.b;
      const end = ends[id]!;
      return { p, facing: angleLerp(UP, end.facing, k) };
    };

    const ends: Spots = {};
    for (const id of ctx.ids) ends[id] = { ...ctx.spot(partnerOf(id)) };

    // The two couple holds (the pivot's own inside hands) span from the start
    // to just before the bend; the outer line hold swaps which two stations
    // it joins at the turn, since the couple in the middle of the line
    // changes at the swap.
    const coupleWindow = activeWindow(formBeats, t3, JOIN_RAMP);
    const outerDownWindow = activeWindow(formBeats, t1, JOIN_RAMP);
    const outerUpWindow = activeWindow(t2, t3, JOIN_RAMP);

    interface Link {
      a: StationId;
      b: StationId;
      window: HoldWindow;
      // Fixed for the whole hold, not recomputed per beat: a couple's inside
      // hands stay each other's inside hands through their own 180° pivot —
      // the same hand the whole time a courtesy turn or an allemande keeps
      // one — even though the two dancers' *relative bearing* sweeps a full
      // turn and a per-instant "which side are you on" test would flip
      // mid-turn. It very nearly did: the flip did not move the joined point
      // (the point stays the couple's own midpoint the whole time either
      // way), only *which of a dancer's two hands* carries it — so the hand
      // that lost the hold snapped to "down" and the hand that gained it
      // snapped up from "down" too, both in the time it takes `sideToward`'s
      // dot product to cross zero. Found by the motion oracle (`pnpm figure
      // down-the-hall`), not by the postcondition probe: reach, the joined
      // gap and the end poses are all still exact either way, because nothing
      // here is actually unreachable — it is only fast.
      aSide: "L" | "R";
      bSide: "L" | "R";
    }
    const sidesAt = (a: StationId, b: StationId, t: Beat): { aSide: "L" | "R"; bSide: "L" | "R" } => {
      const spotA = placeAt(a, t);
      const spotB = placeAt(b, t);
      return { aSide: sideToward(spotA, spotB), bSide: sideToward(spotB, spotA) };
    };
    const links: Link[] = [
      { a: c1a, b: c1b, window: coupleWindow, ...sidesAt(c1a, c1b, coupleWindow.takeFrom) },
      { a: c2a, b: c2b, window: coupleWindow, ...sidesAt(c2a, c2b, coupleWindow.takeFrom) },
      {
        a: c1b,
        b: c2a,
        window: outerDownWindow,
        ...sidesAt(c1b, c2a, outerDownWindow.takeFrom),
      },
      { a: c1a, b: c2b, window: outerUpWindow, ...sidesAt(c1a, c2b, outerUpWindow.takeFrom) },
    ];

    const joinsAt = (t: Beat): HandJoin[] => {
      const out: HandJoin[] = [];
      for (const link of links) {
        if (!isHeld(link.window, t)) continue;
        out.push({ a: link.a, aSide: link.aSide, b: link.b, bSide: link.bSide });
      }
      return out;
    };

    return {
      ends,
      joinsAt,
      at(station, t) {
        const self = placeAt(station, t);
        const hands: { L: LocalHand; R: LocalHand } = { L: "down", R: "down" };
        for (const link of links) {
          if (link.a !== station && link.b !== station) continue;
          // The take and release *ramps* have to run through here too, not
          // only the fully-held plateau `isHeld` names: gating on `isHeld`
          // left the hand at "down" for the whole ramp and then snapped it
          // straight to the joined point the instant the plateau began — a
          // real jump, not a fast-but-continuous take, which is what the
          // motion oracle's hand and height-rate numbers were actually
          // measuring (`pnpm figure down-the-hall`, not the postcondition
          // probe — every sampled pose was still individually reachable).
          if (t < link.window.takeFrom || t > link.window.releaseTo) continue;
          const other = link.a === station ? link.b : link.a;
          const selfSpot = self;
          const otherSpot = placeAt(other, t);
          const side = link.a === station ? link.aSide : link.bSide;
          const otherSide = link.a === station ? link.bSide : link.aSide;
          const point = joinPoint(selfSpot, side, otherSpot, otherSide);
          const joined = joinedHands(ctx, station, other, point, params.holdDrop, params.stackPx);
          const mine = joined[station];
          if (!mine) throw new Error(`down-the-hall: no joined hand for "${station}"`);
          hands[side] = takeAndRelease(selfSpot, side, t, mine, link.window);
        }
        return { p: self.p, facing: self.facing, hands };
      },
    };
  },
});

/** `ramp`, but never past `[0, 1]` even when the window has no length. */
const rampAt = (t: Beat, t0: Beat, t1: Beat): number => {
  if (t1 <= t0) return t > t0 ? 1 : 0;
  const k = (t - t0) / (t1 - t0);
  const c = k < 0 ? 0 : k > 1 ? 1 : k;
  return c * c * (3 - 2 * c);
};

const mixVec = (a: Vec2, b: Vec2, k: number): Vec2 => [mix(a[0], b[0], k), mix(a[1], b[1], k)];

/**
 * How much of a crossing couple's own share of the phase is spent pivoting
 * (rotating in place, changing radius) rather than translating (sliding as a
 * rigid, unrotated pair, radius fixed). See {@link couplePivot}.
 */
const PIVOT_FRAC = 0.8;

/**
 * Both of a couple's own positions, `k` of the way through a two-stage move:
 * a rigid **translation** (both dancers keep their starting offset from the
 * couple's own midpoint — no rotation, so their mutual distance never
 * changes) and a **pivot in place** (the midpoint holds still while the pair
 * rotates the shortest way to its ending offset and the radius eases from
 * the couple's starting spacing to its ending one) — in the order `stages`
 * says, `pivotFrac` of the phase spent on whichever stage pivots.
 *
 * `b` is always exactly opposite `a` through the pivot — computed from the
 * same one turn, in the same call, rather than by calling this a second time
 * for `b` and trusting the two calls to agree. They do not always agree: a
 * couple that needs a genuine 180° flip has two equally valid arcs (clockwise
 * and anticlockwise bulge to opposite sides of the same two endpoints), and
 * resolving that tie separately for each dancer — from each one's own
 * `angleStart` — can pick a different arc for `a` than for `b`, which breaks
 * the one guarantee this whole approach exists for: the two of them a fixed
 * `2 × radius` apart. Found by the probe as a dead-on collision, not a near
 * miss, which is what a broken symmetry looks like. See the couple-crossing
 * comment in {@link downTheHall}'s `plan`.
 *
 * **Why two stages, not one continuous rotation.** A single rotation whose
 * midpoint travels *and* whose radius shrinks *at the same time* swings the
 * couple's own wide starting radius through the middle of the floor exactly
 * while the other couple is passing through it too — found by the probe as a
 * close pass under 3 px, not fixed by trying the other rotational sense
 * (both directions passed under 4 px; the conflict is the swing itself, not
 * which way it goes). Translating first, at the *original*, wider radius,
 * and only pivoting once already standing on the couple's own *target*
 * midpoint keeps the closest approach — at the pivot's smallest radius —
 * away from the other couple's own crossing, because by the time the
 * shrinking radius is small enough to matter, the couple is already off to
 * its own side of the floor. Which order (translate-then-pivot or the
 * reverse) is safer differs between the forming and bending sub-phases,
 * because the other couple crosses a different part of the floor in each —
 * both are offered as `stages`, chosen at the call site by which one a
 * sampling check (see `--figure down-the-hall`'s own probe) actually clears.
 *
 * `otherAt`, when given, breaks the 180°-tie by actually sampling both
 * candidate arcs against the other couple's own path (not just a single
 * point) and keeping whichever arc's worst approach to either of the other
 * couple's two dancers is furthest — the other couple is moving too, over
 * the same `k`, so the two candidates' relative safety is a property of both
 * whole paths, not of one snapshot.
 */
function couplePivot(
  aStart: Vec2,
  bStart: Vec2,
  aEnd: Vec2,
  bEnd: Vec2,
  k: number,
  stages: "translate-then-pivot" | "pivot-then-translate",
  otherAt?: (k: number) => readonly [Vec2, Vec2],
): { a: Vec2; b: Vec2 } {
  const pivotStart = midpoint(aStart, bStart);
  const pivotEnd = midpoint(aEnd, bEnd);
  const relStart = sub(aStart, pivotStart);
  const relEnd = sub(aEnd, pivotEnd);
  const angleStart: Angle = angleOfVec(relStart);
  const radiusStart = len(relStart);
  const radiusEnd = len(relEnd);
  let turn = angleDiff(angleStart, angleOfVec(relEnd));
  if (otherAt && Math.abs(Math.abs(turn) - 180) < 1e-6) {
    turn = bestFlipSign(pivotStart, pivotEnd, angleStart, radiusStart, radiusEnd, stages, otherAt) * 180;
  }
  const { pivot, radius, angle } = stagedPose(
    pivotStart,
    pivotEnd,
    angleStart,
    radiusStart,
    radiusEnd,
    turn,
    k,
    stages,
  );
  return { a: polar(pivot, angle, radius), b: polar(pivot, angle + 180, radius) };
}

/**
 * The shared geometry {@link couplePivot} and {@link bestFlipSign} both walk.
 *
 * A couple with nothing to turn (`turn === 0`) has no reason to hold its own
 * radius at the starting spacing while it translates, only to shrink it
 * later — that delay is what the flipping couple's own staging needs (see
 * {@link couplePivot}), and forcing it on the *other* couple too, uniformly,
 * is what turned a safe margin into an unsafe one: found by the probe when
 * "fix the flipping couple's own crossing" reintroduced a different, smaller
 * one against a couple that was never at risk on its own. A couple with
 * nothing to turn simply eases pivot and radius together, plainly.
 */
function stagedPose(
  pivotStart: Vec2,
  pivotEnd: Vec2,
  angleStart: Angle,
  radiusStart: number,
  radiusEnd: number,
  turn: Angle,
  k: number,
  stages: "translate-then-pivot" | "pivot-then-translate",
): { pivot: Vec2; radius: number; angle: Angle } {
  if (turn === 0) {
    const plain = smooth(k);
    return {
      pivot: mixVec(pivotStart, pivotEnd, plain),
      radius: mix(radiusStart, radiusEnd, plain),
      angle: angleStart,
    };
  }
  const pivotFirst = stages === "pivot-then-translate";
  const moveFrac = 1 - PIVOT_FRAC;
  const kMove = pivotFirst
    ? smooth(clamp01((k - PIVOT_FRAC) / moveFrac))
    : smooth(clamp01(k / moveFrac));
  const kPivot = pivotFirst
    ? smooth(clamp01(k / PIVOT_FRAC))
    : smooth(clamp01((k - moveFrac) / PIVOT_FRAC));
  return {
    pivot: mixVec(pivotStart, pivotEnd, kMove),
    radius: mix(radiusStart, radiusEnd, kPivot),
    angle: angleStart + turn * kPivot,
  };
}

/** `k` clamped to `[0, 1]`, for a stage fraction that only runs part of the phase. */
const clamp01 = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k);

/** {@link Math.sin}/{@link Math.cos}-free smoothstep, matching `@caller/core`'s `smooth`. */
const smooth = (k: number): number => k * k * (3 - 2 * k);

/**
 * Which of the two 180°-flip directions keeps this couple's own path furthest
 * from the other couple's path, sampled across the whole figure rather than
 * guessed from one point. Ties (an empty `otherAt`, or two paths equally far
 * apart the whole way) keep the shortest-arc-first sign, `+1`.
 */
function bestFlipSign(
  pivotStart: Vec2,
  pivotEnd: Vec2,
  angleStart: Angle,
  radiusStart: number,
  radiusEnd: number,
  stages: "translate-then-pivot" | "pivot-then-translate",
  otherAt: (k: number) => readonly [Vec2, Vec2],
): number {
  const SAMPLES = 16;
  let bestSign = 1;
  let bestWorst = -Infinity;
  for (const sign of [1, -1]) {
    let worst = Infinity;
    for (let i = 0; i <= SAMPLES; i++) {
      const at = i / SAMPLES;
      const { pivot, radius, angle } = stagedPose(
        pivotStart,
        pivotEnd,
        angleStart,
        radiusStart,
        radiusEnd,
        sign * 180,
        at,
        stages,
      );
      const pA = polar(pivot, angle, radius);
      const pB = polar(pivot, angle + 180, radius);
      const [o1, o2] = otherAt(at);
      worst = Math.min(worst, dist(pA, o1), dist(pA, o2), dist(pB, o1), dist(pB, o2));
    }
    if (worst > bestWorst) {
      bestWorst = worst;
      bestSign = sign;
    }
  }
  return bestSign;
}

/** A hold active only between `from` and `to`, taken and released over `ramp` beats. */
const activeWindow = (from: Beat, to: Beat, ramp: Beat): HoldWindow => {
  const r = Math.min(ramp, Math.max(0, to - from) / 2);
  return { takeFrom: from, takeTo: from + r, releaseFrom: to - r, releaseTo: to };
};

/** Which hand of `self` points toward `other`, given `self`'s current facing. */
function sideToward(self: Spot, other: Spot): "L" | "R" {
  const left = dirOf(self.facing - 90);
  const toOther = sub(other.p, self.p);
  return left[0] * toOther[0] + left[1] * toOther[1] > 0 ? "L" : "R";
}
