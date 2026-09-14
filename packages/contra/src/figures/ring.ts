import type { Angle, Beat, Hand, Vec2 } from "@caller/core";
import { angleDiff, angleLerp, dist, mix, ramp } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { HandJoin, PlanContext, Spot, Spots } from "./ContraFigure.js";
import { bearing, centreOf, joinPoint, joinedHands, polar } from "./ContraFigure.js";
import { mustSpot, wrap360, ringOrder } from "./pairing.js";

/**
 * The ring four dancers make when they take hands round: where its centre is,
 * how big it is, who stands where round it, and which way round it runs.
 *
 * The ring is regular — `n` places evenly spaced — even though the places the
 * dancers come from are a rectangle, because a ring of hands has to be the same
 * distance between every pair of neighbours or the arms cannot all reach. Its
 * radius is the one that puts neighbours exactly `spacing` apart, and its phase
 * is the circular mean of where everybody already stands, so nobody walks
 * further in than they have to.
 */
export interface Ring {
  centre: Vec2;
  radius: number;
  /** The stations, anticlockwise: the way a circle left travels. */
  order: readonly StationId[];
  /** Where each station stands on the ring, in degrees. */
  angle: Record<StationId, Angle>;
}

/** The ring the dancers of `spots` make, with neighbours `spacing` apart. */
export function ringOf(spots: Spots, ids: readonly StationId[], spacing: number): Ring {
  const order = ringOrder(spots, ids);
  const n = order.length;
  const centre = centreOf(order.map((id) => mustSpot(spots, id)));
  const step = 360 / n;
  const radius = spacing / (2 * Math.sin(Math.PI / n));

  // The phase that turns the ring to where the dancers already are: the
  // circular mean of each dancer's own angle less their place round the ring.
  let sin = 0;
  let cos = 0;
  order.forEach((id, k) => {
    const off = ((bearing(centre, mustSpot(spots, id).p) - k * step) * Math.PI) / 180;
    sin += Math.sin(off);
    cos += Math.cos(off);
  });
  const phase = (Math.atan2(sin, cos) * 180) / Math.PI;

  const angle: Record<StationId, Angle> = {};
  order.forEach((id, k) => {
    angle[id] = wrap360(phase + k * step);
  });
  return { centre, radius, order, angle };
}

/**
 * Whose place a station's dancer takes when the ring turns `places` places.
 * Positive is the way {@link Ring.order} runs, which is the way a circle left
 * travels.
 */
export function ringShift(ring: Ring, station: StationId, places: number): StationId {
  const n = ring.order.length;
  const at = ring.order.indexOf(station);
  if (at < 0) throw new Error(`station "${station}" is not on this ring`);
  const id = ring.order[(((at + Math.round(places)) % n) + n) % n];
  if (id === undefined) throw new Error(`ring has no place for "${station}"`);
  return id;
}

/**
 * The joined hands round a ring: every dancer's left hand in the next dancer's
 * right, at one shared floor point each, the role set's top role on top.
 *
 * The points are computed once for the whole ring and read by both dancers of
 * each join, so a joined hand is literally one point rather than two that agree
 * to a tolerance (plan AC2).
 */
export function ringHands(
  ctx: PlanContext,
  ring: Ring,
  at: (station: StationId) => Spot,
  drop: number,
  stackPx = 0,
): { hands: Record<StationId, { L: Hand; R: Hand }>; joins: HandJoin[] } {
  const hands: Record<StationId, { L: Hand; R: Hand }> = {};
  const joins: HandJoin[] = [];
  const order = ring.order;
  const hand = (id: StationId): { L: Hand; R: Hand } => {
    const found = hands[id];
    if (found) return found;
    const fresh = { L: { p: at(id).p, drop }, R: { p: at(id).p, drop } };
    hands[id] = fresh;
    return fresh;
  };
  for (let k = 0; k < order.length; k++) {
    const a = order[k]!;
    const b = order[(k + 1) % order.length]!;
    const p = joinPoint(at(a), "L", at(b), "R");
    const joined = joinedHands(ctx, a, b, p, drop, stackPx);
    hand(a).L = joined[a]!;
    hand(b).R = joined[b]!;
    joins.push({ a, aSide: "L", b, bSide: "R" });
  }
  return { hands, joins };
}

/** How a dancer travels round a ring: in to it, round it, and out again. */
export interface RingWalk {
  /** Beats spent stepping in to the ring. */
  inBeats: Beat;
  /** Beats spent stepping out of it at the end. */
  outBeats: Beat;
  /** How far round the ring turns, in degrees; positive is anticlockwise. */
  turn: Angle;
  /** Where the body points relative to the ring angle: 180 faces the centre. */
  faceOffset: Angle;
}

/**
 * One dancer's place `t` beats into a ring figure: they step in from `start` on
 * to the ring, the ring turns `turn` degrees, and they step out to `end`.
 *
 * Both ends are exact — `t = 0` is `start` and `t = beats` is `end` — and both
 * ease to a stop, which is what makes a seam between two figures match to the
 * bit rather than to a tolerance.
 */
export function ringWalk(
  ring: Ring,
  station: StationId,
  start: Spot,
  end: Spot,
  t: Beat,
  beats: Beat,
  walk: RingWalk,
): Spot {
  const on = ring.angle[station];
  if (on === undefined) throw new Error(`station "${station}" is not on this ring`);

  const kIn = ramp(t, 0, Math.min(walk.inBeats, beats));
  const kTurn = ramp(t, walk.inBeats, beats - walk.outBeats);
  const kOut = ramp(t, beats - walk.outBeats, beats);

  const from = bearing(ring.centre, start.p);
  const to = bearing(ring.centre, end.p);
  const turned = from + angleDiff(from, on) * kIn + walk.turn * kTurn;
  const angle = turned + angleDiff(on + walk.turn, to) * kOut;

  const radius = mix(
    mix(dist(ring.centre, start.p), ring.radius, kIn),
    dist(ring.centre, end.p),
    kOut,
  );
  const facing = angleLerp(
    angleLerp(start.facing, angle + walk.faceOffset, kIn),
    end.facing,
    kOut,
  );
  return { p: polar(ring.centre, angle, radius), facing };
}

/** The ring a plan's dancers start on. */
export const ringFor = (ctx: PlanContext, spacing = ctx.spacing): Ring =>
  ringOf(ctx.start, ctx.ids, spacing);
