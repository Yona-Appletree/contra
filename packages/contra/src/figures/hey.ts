import type { Angle, Beat, Vec2 } from "@caller/core";
import { angleLerp, ramp } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraParams, FigurePlan, PlanContext, Spot, Spots } from "./ContraFigure.js";
import { centreOf, contraFigure } from "./ContraFigure.js";
import { handDown } from "../pair/PairFrame.js";
import { trapezoid } from "../pair/trapezoid.js";

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
  /** How far each lane sits from the middle of the weave, px. */
  trackPx: number;
  /** Beats spent stepping on to the weave and off it again. */
  joinBeats: Beat;
}

/**
 * A hey for four: the weave across the set.
 *
 * All four dancers travel one closed lane — out along one side of the middle,
 * round the end, and back along the other — so the two sides of the lane carry
 * traffic in opposite directions and whoever is in the middle at the same
 * moment passes shoulder to shoulder. They start spread round it, which is what
 * makes two of them cross the middle while the other two loop at the ends, and
 * then swap. A full hey is once round and home; half a hey is half way round,
 * which leaves each dancer on the place of the one who started opposite them.
 *
 * Who starts falls out of the formation rather than being written down: the two
 * dancers standing at the ends of the outgoing lane step off, and in a duple
 * improper or a becket set those are the robins. `'larks-left'` mirrors the
 * lane, which puts the larks in the middle first and turns every pass into a
 * left shoulder.
 *
 * **Where this is a model rather than a transcription.** A hey danced by people
 * has wider loops than lanes and its four passes are not evenly spaced; here the
 * lane is one stadium walked at a constant speed, so with the default track the
 * passes land at about 2.7, 5.3, 10.7 and 13.3 of the sixteen beats where a
 * caller would say 2, 6, 10 and 14. No ricochet yet; the parameters have room
 * for one.
 */
export const hey = contraFigure<HeyParams>({
  id: "hey",
  call: "HEY FOR FOUR",
  lead: 4,
  beats: 16,
  defaults: { from: {}, start: "robins-right", half: false, trackPx: 5, joinBeats: 2 },

  plan(ctx: PlanContext, params: HeyParams): FigurePlan {
    const beats = params.beats;
    const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
    // The weave runs along the axis the dancers are most spread on, which
    // across a contra set is the axis between the two lines.
    const spread = (axis: 0 | 1): number =>
      Math.max(...ctx.ids.map((id) => Math.abs(ctx.spot(id).p[axis] - centre[axis])));
    const axisAngle: Angle = spread(0) >= spread(1) ? 0 : 90;
    const lane = laneOf(Math.max(spread(0), spread(1)), params.trackPx);
    const cos = Math.cos((axisAngle * Math.PI) / 180);
    const sin = Math.sin((axisAngle * Math.PI) / 180);

    // Which way round the lane runs is chosen so the role that starts the hey
    // is the pair standing at the two ends of the outgoing side. In duple
    // improper that puts the robins in the middle first, passing right
    // shoulders; in a becket set, whose robins stand on the other diagonal, it
    // is the same two dancers but the other shoulder — which is what the
    // formation makes true, and why a becket dance calls its hey from an
    // improper-like arrangement rather than from the becket start.
    const starting = params.start === "larks-left" ? "lark" : "robin";
    const mirror = startingDiagonal(ctx, starting, centre, cos, sin) ? 1 : -1;
    /** A lane-local point as a frame-local one. */
    const toFrame = (q: Vec2): Vec2 => {
      const y = q[1] * mirror;
      return [centre[0] + q[0] * cos - y * sin, centre[1] + q[0] * sin + y * cos];
    };
    /** A frame-local point in lane-local px. */
    const toLane = (p: Vec2): Vec2 => {
      const x = p[0] - centre[0];
      const y = p[1] - centre[1];
      return [x * cos + y * sin, (-x * sin + y * cos) * mirror];
    };
    /** A lane tangent as a frame-local facing. */
    const toFacing = (tangent: Angle): Angle => {
      const rad = (tangent * Math.PI) / 180;
      const d: Vec2 = [Math.cos(rad), Math.sin(rad) * mirror];
      return (Math.atan2(d[0] * sin + d[1] * cos, d[0] * cos - d[1] * sin) * 180) / Math.PI;
    };

    /** Where each dancer joins the lane, and how far their place is off it. */
    const arcOf: Record<StationId, number> = {};
    const offsetOf: Record<StationId, Vec2> = {};
    for (const id of ctx.ids) {
      const q = toLane(ctx.spot(id).p);
      const arc = joinArc(lane, q);
      const on = laneAt(lane, arc);
      arcOf[id] = arc;
      offsetOf[id] = [q[0] - on.p[0], q[1] - on.p[1]];
    }

    // Whose place each dancer lands on: whoever joined the lane where they end.
    const amount = params.half ? 0.5 : 1;
    const landing: Record<StationId, StationId> = {};
    for (const id of ctx.ids) {
      const want = wrap(arcOf[id]! + amount * lane.perimeter, lane.perimeter);
      let best = id;
      let bestGap = Infinity;
      for (const other of ctx.ids) {
        const gap = Math.abs(
          wrap(arcOf[other]! - want + lane.perimeter / 2, lane.perimeter) - lane.perimeter / 2,
        );
        if (gap < bestGap) {
          bestGap = gap;
          best = other;
        }
      }
      landing[id] = best;
    }

    const ends: Spots = {};
    for (const id of ctx.ids) ends[id] = ctx.spot(landing[id]!);

    const placeAt = (station: StationId, t: Beat): Spot => {
      const start = ctx.spot(station);
      const end = ends[station] ?? start;
      const travelled = amount * lane.perimeter * trapezoid(t, 0, 1, beats - 1, beats);
      const on = laneAt(lane, arcOf[station]! + travelled);
      // Step on to the lane over the first beats and off it at the end, so both
      // ends of the figure land exactly where the dance says they do.
      const leaving = 1 - ramp(t, 0, params.joinBeats);
      const arriving = ramp(t, beats - params.joinBeats, beats);
      const from = offsetOf[station]!;
      const to = offsetOf[landing[station]!]!;
      const q: Vec2 = [
        on.p[0] + from[0] * leaving + to[0] * arriving,
        on.p[1] + from[1] * leaving + to[1] * arriving,
      ];
      const facing = angleLerp(
        angleLerp(start.facing, toFacing(on.tangent), ramp(t, 0, params.joinBeats)),
        end.facing,
        arriving,
      );
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

/** The closed lane a hey weaves along: two straights and two end loops. */
export interface Lane {
  /** Half the length of a straight, px. */
  half: number;
  /** How far each straight sits from the middle, px. */
  track: number;
  /** Length of one straight, px. */
  straight: number;
  /** Length of one end loop, px. */
  loop: number;
  perimeter: number;
}

/** A lane `2 × half` long and `2 × track` wide. */
export function laneOf(half: number, track: number): Lane {
  const straight = 2 * half;
  const loop = Math.PI * track;
  return { half, track, straight, loop, perimeter: 2 * straight + 2 * loop };
}

/**
 * Where `arc` px along the lane is, in lane-local px, and which way it runs.
 *
 * Arc 0 is the far end of the outgoing lane: the straight from `(+half, +track)`
 * to `(−half, +track)`, then the loop round the near end, then the straight
 * back, then the loop home.
 */
export function laneAt(lane: Lane, arc: number): { p: Vec2; tangent: Angle } {
  const { half, track, straight, loop } = lane;
  const s = wrap(arc, lane.perimeter);

  if (s < straight) return { p: [half - s, track], tangent: 180 };
  if (s < straight + loop) {
    const k = (s - straight) / loop;
    const th = (90 + 180 * k) * (Math.PI / 180);
    return { p: [-half - track * Math.sin(th - Math.PI / 2), track * Math.cos(th - Math.PI / 2)], tangent: 180 + 180 * k };
  }
  if (s < 2 * straight + loop) {
    return { p: [-half + (s - straight - loop), -track], tangent: 0 };
  }
  const k = (s - 2 * straight - loop) / loop;
  const th = (k * 180 * Math.PI) / 180;
  return { p: [half + track * Math.sin(th), -track * Math.cos(th)], tangent: 180 * k };
}

/**
 * Whether the role that starts the hey stands on the diagonal the lane serves
 * when it runs the way {@link laneAt} describes.
 *
 * The two dancers who step off are the ones at the far ends of the two sides of
 * the lane — the `(+, +)` and `(−, −)` corners — so this asks whether the
 * starting role is on that diagonal, and the lane is mirrored when it is not.
 */
function startingDiagonal(
  ctx: PlanContext,
  role: string,
  centre: Vec2,
  cos: number,
  sin: number,
): boolean {
  const on = ctx.ids
    .filter((id) => ctx.role(id) === role)
    .map((id) => {
      const x = ctx.spot(id).p[0] - centre[0];
      const y = ctx.spot(id).p[1] - centre[1];
      return (x * cos + y * sin) * (-x * sin + y * cos);
    });
  if (on.length === 0) return true;
  return on.every((v) => v > 0);
}

/** Which of the lane's four corners a dancer standing at `q` joins it at. */
function joinArc(lane: Lane, q: Vec2): number {
  const { straight, loop } = lane;
  if (q[0] > 0) return q[1] > 0 ? 0 : 2 * straight + loop;
  return q[1] > 0 ? straight : straight + loop;
}

/** `v` wrapped into `[0, period)`. */
const wrap = (v: number, period: number): number => ((v % period) + period) % period;
