import type { Angle, Beat, Vec2 } from "@caller/core";
import { angleDiff, angleOfVec, ramp } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraParams, FigurePlan, PlanContext, Spot, Spots } from "./ContraFigure.js";
import { centreOf, contraFigure } from "./ContraFigure.js";
import { handDown } from "../pair/PairFrame.js";

/** {@link hey}'s parameters. */
export interface HeyParams extends ContraParams {
  /**
   * Who starts and by which shoulder. `'robins-right'` is the usual hey: the
   * robins step off into the middle and pass right shoulders while the larks
   * loop at the ends. `'larks-left'` mirrors the whole weave.
   */
  start: "robins-right" | "larks-left";
  /** Half a hey stops when everybody has changed sides. */
  half: boolean;
  /**
   * How far each dancer swings off the middle of the weave, px.
   *
   * Two dancers passing in the centre are `2 × weavePx` apart and two passing
   * at a side are `√2 × weavePx`, so this is the one number that sets both
   * shoulder gaps: 6.5 px puts 13 px between the pair in the middle and 9.2 px
   * between the pair at the side, which is inside a pass (14 px) and outside
   * AC6's 8 px either way.
   */
  weavePx: number;
  /** Beats spent stepping on to the weave and off it again. */
  joinBeats: Beat;
}

/**
 * A hey for four: the weave across the set.
 *
 * The user: "that's a weaving figure, they should be passing shoulders in the
 * center of the set." So every dancer walks the *same* closed weave — out
 * through the middle, round the end, back through the middle, round the other
 * end — and the four of them are spaced a quarter of it apart. Two dancers half
 * the weave apart are always on opposite sides of it, which is why they meet:
 * every two beats somebody passes somebody.
 *
 * **Why the shoulders alternate.** The weave is
 * `u = U·cos ψ`, `v = weavePx·sin 3ψ` — the dancer's place along the hey
 * against their side-step across it — and the *three* in `sin 3ψ` is the whole
 * figure. It puts a full swing of the side-step between the middle and the end,
 * so a dancer who kept to their own left through the centre is keeping to their
 * own right by the time they reach the end: right shoulders in the middle, left
 * shoulders on the sides, which is what a caller says a hey is. One lane walked
 * one way round — what this was before F4 — cannot alternate anything, and F3a
 * measured all three of its side passes on the wrong shoulder.
 *
 * Counts: with `ψ` running a whole turn over sixteen beats the four passes in
 * the centre land on 2, 6, 10 and 14 and the passes at the sides on 4, 8 and
 * 12, which is what a caller counts. Half a hey is half the weave, and leaves
 * each dancer on the place of the one who started opposite them.
 *
 * **Where this is a model rather than a transcription.** The weave's ends reach
 * `√2 × ` the set's own half width, so a dancer loops about 6 px outside the
 * line before coming back — dancers really do loop outside the set, but here it
 * is a consequence of the cosine rather than a choice. And the four places are
 * off the weave (a duple improper set's two lines are 20 px apart along the
 * hall, the weave a third of that), so everybody steps on to it over
 * `joinBeats` at the start and off it again at the end. No ricochet yet.
 */
export const hey = contraFigure<HeyParams>({
  id: "hey",
  call: "HEY FOR FOUR",
  describe:
    "The weave. All four dancers travel the same closed figure of eight across the set, passing each other by alternate shoulders and never taking hands: right shoulders with the one you meet in the centre of the set, left shoulders with the one you meet at the side, and a loop round the end before you come back. The robins start it, passing right shoulders in the centre; the larks loop at the ends and follow them in. Sixteen beats, four passes in the centre at counts 2, 6, 10 and 14 and three at the sides at 4, 8 and 12, and everybody is home where they started.",
  lead: 4,
  beats: 16,
  defaults: { from: {}, start: "robins-right", half: false, weavePx: 6.5, joinBeats: 2 },

  plan(ctx: PlanContext, params: HeyParams): FigurePlan {
    const beats = params.beats;
    const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
    // The weave runs along the axis the dancers are most spread on, which
    // across a contra set is the axis between the two lines.
    const spread = (axis: 0 | 1): number =>
      Math.max(...ctx.ids.map((id) => Math.abs(ctx.spot(id).p[axis] - centre[axis])));
    const axisAngle: Angle = spread(0) >= spread(1) ? 0 : 90;
    const cos = Math.cos((axisAngle * Math.PI) / 180);
    const sin = Math.sin((axisAngle * Math.PI) / 180);
    /** A weave-local point as a frame-local one. */
    const toFrame = (q: Vec2): Vec2 => [
      centre[0] + q[0] * cos - q[1] * sin,
      centre[1] + q[0] * sin + q[1] * cos,
    ];
    /** A frame-local point in weave-local px. */
    const toWeave = (p: Vec2): Vec2 => {
      const x = p[0] - centre[0];
      const y = p[1] - centre[1];
      return [x * cos + y * sin, -x * sin + y * cos];
    };

    // The four places sit at the quarter points of the weave, `±45°` and
    // `±135°`, so the weave is as long as it has to be to reach them: the
    // places are at `U·cos 45°` along it.
    const along = Math.max(spread(0), spread(1));
    const U = along * Math.SQRT2;
    // Mirroring the side-step mirrors the whole weave: the larks start it, and
    // every pass is by the other shoulder.
    const V = params.start === "larks-left" ? -params.weavePx : params.weavePx;
    const starting = params.start === "larks-left" ? "lark" : "robin";

    /**
     * Where on the weave each dancer starts.
     *
     * A dancer at `ψ = 135°` or `−45°` walks into the middle and is there at
     * count 2; one at `45°` or `−135°` loops round the end first and follows
     * them in. Which end they stand at picks between the two, so the whole
     * assignment is: the side of the set they are on, and whether their role is
     * the one that starts.
     */
    const phase: Record<StationId, number> = {};
    for (const id of ctx.ids) {
      const starts = ctx.role(id) === starting;
      const u = toWeave(ctx.spot(id).p)[0];
      phase[id] = u > 0 ? (starts ? -45 : 45) : starts ? 135 : -135;
    }

    const amount = params.half ? 0.5 : 1;
    /** How far round the weave a dancer is `t` beats in, degrees. */
    const psi = (station: StationId, t: Beat): number =>
      phase[station]! - 360 * amount * (beats <= 0 ? 1 : t / beats);
    /** The weave itself, in weave-local px. */
    const weaveAt = (deg: number): Vec2 => {
      const rad = (deg * Math.PI) / 180;
      return [U * Math.cos(rad), V * Math.sin(3 * rad)];
    };

    // Whose place each dancer lands on: whoever stands where they end up on the
    // weave. A whole hey is a whole turn of it, so that is themselves; half a
    // hey is half a turn, so it is the dancer who started opposite them.
    const landing: Record<StationId, StationId> = {};
    for (const id of ctx.ids) {
      const want = psi(id, beats);
      let best = id;
      let bestGap = Infinity;
      for (const other of ctx.ids) {
        const gap = Math.abs(wrapSigned(phase[other]! - want));
        if (gap < bestGap) {
          bestGap = gap;
          best = other;
        }
      }
      landing[id] = best;
    }

    const ends: Spots = {};
    for (const id of ctx.ids) ends[id] = ctx.spot(landing[id]!);

    /** How far each dancer's place is off the weave, at each end of the figure. */
    const offOf = (station: StationId, at: Beat): Vec2 => {
      const place = toWeave(ctx.spot(station).p);
      const on = weaveAt(at);
      return [place[0] - on[0], place[1] - on[1]];
    };
    const offStart: Record<StationId, Vec2> = {};
    const offEnd: Record<StationId, Vec2> = {};
    for (const id of ctx.ids) {
      offStart[id] = offOf(id, phase[id]!);
      offEnd[id] = offOf(landing[id]!, psi(id, beats));
    }

    /**
     * Which way the weave is going `t` beats in, as a frame-local facing.
     *
     * A chord a quarter beat long rather than a derivative, and a raw
     * `atan2`: it wraps through ±180° like any other bearing, which is fine
     * because everything downstream reads it as a direction. What it must not
     * do is be *lerped toward* — see the turn each dancer keeps below.
     */
    const travelAt = (station: StationId, t: Beat): Angle => {
      const on = weaveAt(psi(station, t));
      const ahead = weaveAt(psi(station, t) - 360 * amount * (LOOK_BEATS / beats));
      const step: Vec2 = [ahead[0] - on[0], ahead[1] - on[1]];
      return angleOfVec([step[0] * cos - step[1] * sin, step[0] * sin + step[1] * cos]);
    };

    /**
     * How far each dancer's own facing is off the weave's, at each end.
     *
     * Held as a constant turn added to the weave's own direction rather than
     * as `angleLerp(place, travel, …)`: lerping *toward a moving angle* flips
     * the way round it goes at the instant the target passes the antipode of
     * the place's facing, and a dancer whose previous figure left them facing
     * the other way down the hall snapped 61° in one sample when it did. F3a's
     * oracle caught it as 201 px/beat of hand speed inside `butter`'s hey.
     */
    const turnIn: Record<StationId, number> = {};
    const turnOut: Record<StationId, number> = {};
    for (const id of ctx.ids) {
      turnIn[id] = angleDiff(travelAt(id, 0), ctx.spot(id).facing);
      turnOut[id] = angleDiff(travelAt(id, beats), (ends[id] ?? ctx.spot(id)).facing);
    }

    const placeAt = (station: StationId, t: Beat): Spot => {
      const here = psi(station, t);
      const on = weaveAt(here);
      // Step on to the weave over the first beats and off it at the end, so
      // both ends of the figure land exactly where the dance says they do.
      // Evenly, not eased: a smoothstep barely moves for the first half beat,
      // and over that half beat the weave's own side-step carries the dancer a
      // px *past* their own place before it brings them in, which is a lean
      // nobody dances and a px the gallery tile would clip.
      const leaving = 1 - even(t, 0, params.joinBeats);
      const arriving = even(t, beats - params.joinBeats, beats);
      const from = offStart[station]!;
      const to = offEnd[station]!;
      const q: Vec2 = [
        on[0] + from[0] * leaving + to[0] * arriving,
        on[1] + from[1] * leaving + to[1] * arriving,
      ];
      // Facing is the way the weave is going, plus the turn that takes it on to
      // the place's own facing at either end — eased, because a body turning is
      // the one thing in the figure that should not start at full speed.
      const facing =
        travelAt(station, t) +
        turnIn[station]! * (1 - ramp(t, 0, params.joinBeats)) +
        turnOut[station]! * ramp(t, beats - params.joinBeats, beats);
      return { p: toFrame(q), facing };
    };

    return {
      ends,
      joinsAt: () => [],
      at(station, t) {
        const self = placeAt(station, t);
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            L: handDown(self.p, self.facing, "L", t, 1),
            R: handDown(self.p, self.facing, "R", t, 1),
          },
          stepRate: 1,
          amp: 1,
        };
      },
    };
  },
});

/**
 * How far ahead on the weave a dancer looks to know which way they are facing.
 *
 * A quarter of a beat: near enough to be the tangent, far enough that the
 * difference is a direction and not floating-point noise.
 */
const LOOK_BEATS: Beat = 0.25;

/** How far `t` is between `t0` and `t1`, clamped, with no easing. */
const even = (t: Beat, t0: Beat, t1: Beat): number =>
  t1 <= t0 ? (t > t0 ? 1 : 0) : Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));

/** `a` wrapped into `(-180, 180]` degrees. */
const wrapSigned = (a: number): number => {
  const wrapped = ((a % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
};
