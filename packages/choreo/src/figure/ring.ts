import type { Angle, Beat, Hand, MotionProfile, Side, Vec2 } from "@caller/core";
import {
  ARM_REACH_PX,
  angleDiff,
  angleLerp,
  angleOfVec,
  dist,
  mix,
  profileProgress,
  ramp,
  shouldersAt,
  sub,
} from "@caller/core";
import type { RoleName, RoleSet, StationId } from "../formation/Formation.js";
import type { EndPose } from "./FigureDef.js";
import { joinHands } from "./joinHands.js";

/**
 * The ring a group of dancers makes when they take hands round: where its
 * centre is, how big it is, who stands where round it, and which way round it
 * runs.
 *
 * The ring is regular — `n` places evenly spaced — even though the places the
 * dancers come from are a rectangle, because a ring of hands has to be the same
 * distance between every pair of neighbours or the arms cannot all reach. Its
 * radius is the one that puts neighbours exactly `spacing` apart, and its phase
 * is the circular mean of where everybody already stands, so nobody walks
 * further in than they have to.
 *
 * **Form-neutral, and deliberately so.** This was `@caller/contra`'s own
 * (`figures/ring.ts`), where `circle`, `star`, `petronella`, `balance` and the
 * figure-spec language all read it. B3 needs the same ring between two dances —
 * the literal hands four the caller asks for — from `@caller/choreo`'s own
 * script decider, which may not import `@caller/contra`. Rather than write a
 * second ring, the geometry moved down a layer: `@caller/contra`'s `ring.ts`
 * re-exports every name below unchanged, so nothing in the contra figure
 * library knows it moved.
 */
export interface Ring {
  centre: Vec2;
  radius: number;
  /** The stations, anticlockwise: the way a circle left travels. */
  order: readonly StationId[];
  /** Where each station stands on the ring, in degrees. */
  angle: Record<StationId, Angle>;
}

/** Where every dancer of a group stands, in whichever axes the caller is working in. */
export type RingPlaces = Record<StationId, EndPose>;

/**
 * How far a ring's arms reach, as a fraction of the arm's own full 15 px
 * reach: comfortably extended, elbows softly bent, not straight-armed and not
 * crammed shoulder to shoulder.
 *
 * The user, F11: "we need to fix the circle. it looks absurd with the elbows
 * out. they aren't shoulder to shoulder they are in a circle." The old ring put
 * neighbours the *couple* spacing apart (`HOLD_SPACING_PX`, 14 px) — barely
 * under half an arm's reach each — which crammed four people's elbows out
 * wide.
 *
 * Picked by the figure lab and the motion oracle's elbow ratio at 0.7, 0.8 and
 * 0.9 (see `packages/contra/src/figures/motionBounds.ts`'s F11 derivation) —
 * **and all three read identically** for a standard four-person ring: the
 * footprint clamp below saturates every one of them down to the same 12 px
 * radius, because a duple-improper or becket minor set's narrower half-extent
 * (10 px, along the hall) is smaller than any of the three candidates' natural
 * radius. 0.8 is kept as the readable middle of the range the brief asked for,
 * and is the number that governs the one case the clamp does *not* saturate:
 * a ring of two (a waiting couple's hold), where it sets the hold spacing
 * directly and unclamped.
 */
export const RING_ARM_EXTENSION = 0.8;

/**
 * The distance between neighbours on a ring of joined hands: two arms, each
 * extended to {@link RING_ARM_EXTENSION} of their full reach, meeting in the
 * middle.
 *
 * Every ring figure derives its spacing from this one constant — `circle`,
 * the hands-four ring (`takeHands.ts`), and every other figure that reads
 * `ringOf` at its default spacing (`balance-ring`, `star`) — so there is one
 * rule for how big a ring of hands is, not one per figure.
 */
export const RING_NEIGHBOR_SPACING_PX = 2 * ARM_REACH_PX * RING_ARM_EXTENSION;

/**
 * How far past the ring's own footprint (the narrower of the group's own
 * spread, across or along) the geometry may reach before it is clamped.
 *
 * Small on purpose, and added to the *narrower* half-extent rather than the
 * corner-to-corner circumradius: a figure that turns the ring more than a
 * step sweeps every angle round it, including the one pointing straight down
 * the narrower axis, so a ring sized to just reach a rectangle's corners
 * still swings past its shorter side — which is exactly the neighbouring
 * minor set's own space (AC6). Measured, not assumed: `circle`'s three-place
 * turn is what found this (F11).
 */
export const RING_FOOTPRINT_MARGIN_PX = 2;

/**
 * The ring the dancers of `places` make, with neighbours `spacing` apart —
 * clamped so it never reaches, in any direction, further from its own centre
 * than the group's own narrower half-extent (across or along, whichever is
 * smaller) plus {@link RING_FOOTPRINT_MARGIN_PX}. A ring that turns sweeps
 * every angle round it, so it is the group's *narrowest* dimension that
 * bounds it, not the distance to its own far corners.
 */
export function ringOf(places: RingPlaces, ids: readonly StationId[], spacing: number): Ring {
  const order = ringOrder(places, ids);
  const n = order.length;
  const centre = centreOf(order.map((id) => mustPlace(places, id)));
  const step = 360 / n;
  const naturalRadius = spacing / (2 * Math.sin(Math.PI / n));
  const footprint = Math.min(
    halfExtent(order.map((id) => mustPlace(places, id).p[0] - centre[0])),
    halfExtent(order.map((id) => mustPlace(places, id).p[1] - centre[1])),
  );
  const radius = Math.min(naturalRadius, footprint + RING_FOOTPRINT_MARGIN_PX);

  // The phase that turns the ring to where the dancers already are: the
  // circular mean of each dancer's own angle less their place round the ring.
  let sin = 0;
  let cos = 0;
  order.forEach((id, k) => {
    const off = ((bearing(centre, mustPlace(places, id).p) - k * step) * Math.PI) / 180;
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
 * Below this spread, in px, two values count as "the same" for
 * {@link halfExtent} — a frame's rotation puts a few `1e-15`-scale trig crumbs
 * into a coordinate that is exactly equal in the frame's own local axes, and
 * without a floor those crumbs read as a real (if minuscule) spread and clamp
 * a ring down to nothing. Far below the renderer's own `1/256` px quantum.
 */
const DEGENERATE_SPREAD_PX = 1e-6;

/**
 * Half the spread of a set of numbers either side of their own centre: `0` for
 * one value, and `Infinity` when every value is the same (within
 * {@link DEGENERATE_SPREAD_PX}) — a group with no spread along an axis puts no
 * ceiling on the ring in that direction (a ring of two facing each other along
 * one axis has nothing to say about the other).
 */
function halfExtent(values: readonly number[]): number {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return hi - lo > DEGENERATE_SPREAD_PX ? (hi - lo) / 2 : Infinity;
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
 * The stations in ring order: anticlockwise on the floor, which is the way a
 * **circle left** travels.
 *
 * With y increasing downward an angle increases from +x toward +y, so a dancer
 * facing the ring's centre moves to their own left as their angle about the
 * centre increases — the direction this order runs in.
 */
export function ringOrder(places: RingPlaces, ids: readonly StationId[]): StationId[] {
  const spots = ids.map((id) => mustPlace(places, id));
  const centre = centreOf(spots);
  return [...ids].sort(
    (a, b) =>
      wrap360(bearing(centre, mustPlace(places, a).p)) -
      wrap360(bearing(centre, mustPlace(places, b).p)),
  );
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
  /**
   * The beat the turn is finished by. Default `beats - outBeats`, which is what
   * every contra ring figure wants: turn for the whole middle and step out.
   *
   * B3's hands four wants a ring that is *still* for a while after it has
   * turned — the hall takes hands, the caller moves a becket set one place, and
   * then everybody stands in the finished ring while the band plays the
   * potatoes. That is a turn that ends before the step out begins, which is the
   * only shape this one number adds.
   */
  turnTo?: Beat;
  /**
   * How the **turn** spends its beats (M10); default `"smooth"`, so a caller
   * who says nothing is byte-identical.
   *
   * Only the turn. The step in and the step out keep their own ramps whatever
   * this says: they are a beat and a half of closing up on to a ring and
   * opening out of it, not travel, and the spike's own circle model cruised
   * the turn window alone.
   */
  profile?: MotionProfile;
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
  start: EndPose,
  end: EndPose,
  t: Beat,
  beats: Beat,
  walk: RingWalk,
): EndPose {
  const on = ring.angle[station];
  if (on === undefined) throw new Error(`station "${station}" is not on this ring`);

  const kIn = ramp(t, 0, Math.min(walk.inBeats, beats));
  const turnEnd = walk.turnTo ?? beats - walk.outBeats;
  const kTurn =
    walk.profile === undefined || walk.profile === "smooth"
      ? ramp(t, walk.inBeats, turnEnd)
      : profileProgress(walk.profile, t - walk.inBeats, turnEnd - walk.inBeats);
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
  const facing = angleLerp(angleLerp(start.facing, angle + walk.faceOffset, kIn), end.facing, kOut);
  return { p: polar(ring.centre, angle, radius), facing };
}

/** A place from a map, or a clear error. */
export function mustPlace(places: RingPlaces, id: StationId): EndPose {
  const place = places[id];
  if (!place) throw new Error(`no spot for station "${id}" in [${Object.keys(places).join(", ")}]`);
  return place;
}

/** The centre of a set of places. */
export function centreOf(places: readonly EndPose[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const s of places) {
    x += s.p[0];
    y += s.p[1];
  }
  return [x / places.length, y / places.length];
}

/** The angle from one point to another. */
export const bearing = (from: Vec2, to: Vec2): Angle => angleOfVec(sub(to, from));

/** A point `r` px from `centre` at `angle`. */
export const polar = (centre: Vec2, angle: Angle, r: number): Vec2 => {
  const t = (angle * Math.PI) / 180;
  return [centre[0] + Math.cos(t) * r, centre[1] + Math.sin(t) * r];
};

/** An angle in `[0, 360)`. */
export const wrap360 = (a: Angle): Angle => ((a % 360) + 360) % 360;

/** The shared floor point where two dancers' named hands meet. */
export function joinPoint(a: EndPose, aSide: Side, b: EndPose, bSide: Side): Vec2 {
  const sa = shouldersAt(a.p, a.facing)[aSide];
  const sb = shouldersAt(b.p, b.facing)[bSide];
  return [(sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2];
}

/** Two hands held as one shared floor point at this instant. */
export interface RingJoin {
  a: StationId;
  aSide: Side;
  b: StationId;
  bSide: Side;
}

/**
 * The joined hands round a ring: every dancer's left hand in the next dancer's
 * right, at one shared floor point each, the role set's top role on top.
 *
 * The points are computed once for the whole ring and read by both dancers of
 * each join, so a joined hand is literally one point rather than two that agree
 * to a tolerance (plan AC2). The hold itself is {@link joinHands} — the one
 * every contra ring figure already takes its hands from.
 */
export function ringHands(
  ring: Ring,
  at: (station: StationId) => EndPose,
  roleOf: (station: StationId) => RoleName,
  roleSet: RoleSet,
  drop: number,
  stackPx = 0,
): { hands: Record<StationId, { L: Hand; R: Hand }>; joins: RingJoin[] } {
  const hands: Record<StationId, { L: Hand; R: Hand }> = {};
  const joins: RingJoin[] = [];
  const order = ring.order;
  const hand = (id: StationId): { L: Hand; R: Hand } => {
    const found = hands[id];
    if (found) return found;
    const fresh = { L: { p: at(id).p, drop }, R: { p: at(id).p, drop } };
    hands[id] = fresh;
    return fresh;
  };
  // A ring of two is two dancers with both hands joined; a ring of one has
  // nobody to join with, and neither does a ring of none.
  if (order.length < 2) {
    for (const id of order) hand(id);
    return { hands, joins };
  }
  for (let k = 0; k < order.length; k++) {
    const a = order[k]!;
    const b = order[(k + 1) % order.length]!;
    const p = joinPoint(at(a), "L", at(b), "R");
    const joined = twoHands(a, b, p, roleOf, roleSet, drop, stackPx);
    hand(a).L = joined[a]!;
    hand(b).R = joined[b]!;
    joins.push({ a, aSide: "L", b, bSide: "R" });
  }
  return { hands, joins };
}

/**
 * The two hands of one join, as one floor point, stacked with the role set's
 * top role on top.
 *
 * Two dancers of the **same** role join at the same point with neither hand
 * raised: nothing in the role set distinguishes them, so there is no top.
 */
function twoHands(
  a: StationId,
  b: StationId,
  p: Vec2,
  roleOf: (station: StationId) => RoleName,
  roleSet: RoleSet,
  drop: number,
  stackPx: number,
): Record<StationId, Hand> {
  const roleA = roleOf(a);
  const roleB = roleOf(b);
  if (roleA === roleB) return { [a]: { p, drop }, [b]: { p, drop } };
  const byRole = joinHands(p, drop, [roleA, roleB], roleSet, stackPx);
  const handA = byRole[roleA];
  const handB = byRole[roleB];
  if (!handA || !handB) throw new Error(`no joined hand for roles ${roleA}/${roleB}`);
  return { [a]: handA, [b]: handB };
}
