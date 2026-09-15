import type { Angle, Beat, Hand, PoseSample, Side } from "@caller/core";
import { hangingHand, lerpHand, ramp } from "@caller/core";
import type { RoleName, StationId } from "../formation/Formation.js";
import { frameAngle, framePoint } from "../formation/Frame.js";
import type { Group } from "../group/Group.js";
import { groupStationPose } from "../group/Group.js";
import type { EndPose, FigureDef, FigureParams } from "./FigureDef.js";
import type { Ring, RingPlaces } from "./ring.js";
import { ringHands, ringOf, ringShift, ringWalk } from "./ring.js";
import { standing, walking } from "./standing.js";
import { walkStep } from "./walkPath.js";

/** `take-hands`' parameters. All data, so a dance carrying them still serialises. */
export interface TakeHandsParams extends FigureParams {
  /** Station → where it actually stands when the ring is called, world px. */
  origins: Record<StationId, EndPose>;
  /**
   * Station → where it steps out of the ring to, in the group frame's own axes.
   *
   * The next dance's own first places, which are the formation's stations
   * unless that dance progresses in its first figure. Left out, a station steps
   * out to wherever the ring's own turn has carried it.
   */
  endPlaces: Record<StationId, EndPose>;
  /**
   * How many places round the ring everybody travels before letting go.
   *
   * `0` for every ordinary formation: take hands, hold them, let go. `+1` is
   * one place to each dancer's **left** and `-1` one place to their right —
   * which is the becket shift, and the only thing in this figure that is not
   * the same for every formation. See `formation/lineUpShift.ts` for where the
   * number comes from; it is never written down by hand.
   */
  places: number;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the role set's top role's hand sits, px. */
  stackPx: number;
  /** Beats spent stepping in to the ring and taking hands. */
  inBeats: Beat;
  /** Beats spent letting go and stepping out to the end places. */
  outBeats: Beat;
  /** Beats the shift itself takes, starting once the ring is made. */
  turnBeats: Beat;
}

/**
 * Hands four, literally: the group steps into a ring, takes hands, holds it —
 * shifting one place round if the formation asks — and lets go again.
 *
 * The user's ruling, B3: "hands four is literal. they should take hands four in
 * a ring." Before this the caller said the words and the hall walked to its
 * stations with its hands by its sides; now it does what it is told.
 *
 * The ring is the same ring, and the hold the same hold, that `circle` uses:
 * `@caller/choreo`'s `ring.ts`, a regular ring of `n` places with neighbours
 * exactly a hold spacing apart so every arm reaches, and one shared floor point
 * per pair of joined hands with the role set's top role stacked on it (AC2).
 * A group of two — the couple waiting out at either end of a line — makes a
 * ring of two, which is both hands joined, "as far as their membership allows".
 *
 * Form-neutral, like everything else in this package. `places` is a number the
 * decider derives from the formation's own progression; this figure neither
 * knows nor asks what becket is.
 */
export const TAKE_HANDS: FigureDef<TakeHandsParams> = {
  id: "take-hands",
  call: "TAKE HANDS FOUR",
  describe:
    "Step in to the four you are dancing with and take hands in a ring — your left hand in the next person's right, all the way round — and hold it while the caller finishes talking. If the caller says this is a becket dance, the whole ring moves one place round, to the side the dance progresses to, and everybody lets go on the last couple of beats and steps out to their own place for the start of the dance.",
  lead: 0,
  beats: 12,
  defaults: {
    origins: {},
    endPlaces: {},
    places: 0,
    holdDrop: 6,
    stackPx: 1,
    inBeats: 2,
    outBeats: 2,
    turnBeats: 6,
  },

  sample(group: Group, station: StationId, t: Beat, params: TakeHandsParams): PoseSample {
    const shape = shapeOf(group, params);
    const self = shape.at(station, t);
    const pose = shape.moving(t) ? walking(self.p, self.facing) : standing(self.p, self.facing);
    if (shape.ring === null) return pose;
    const joined = shape.handsAt(t)[station];
    if (joined === undefined) return pose;
    return {
      ...pose,
      hands: {
        L: heldOrDown(self, "L", t, joined.L, params),
        R: heldOrDown(self, "R", t, joined.R, params),
      },
    };
  },

  ends(group: Group, params: TakeHandsParams): Record<StationId, EndPose> {
    const shape = shapeOf(group, params);
    const out: Record<StationId, EndPose> = {};
    for (const s of group.stations) out[s.id] = shape.at(s.id, params.beats);
    return out;
  },
};

/** How far into the figure a hold is fully taken, beyond the step in. */
const TAKE_TAIL = 0.4;

/** The hand `t` beats in: up from the dancer's side to the join, and back down. */
function heldOrDown(
  self: EndPose,
  side: Side,
  t: Beat,
  joined: Hand,
  params: TakeHandsParams,
): Hand {
  const down = hangingHand(self.p, self.facing, side, t, 1);
  const take = ramp(t, 0, Math.min(params.inBeats + TAKE_TAIL, params.beats / 2));
  const release = ramp(t, Math.max(params.beats - params.outBeats, params.beats / 2), params.beats);
  return lerpHand(lerpHand(down, joined, take), down, release);
}

/** Everything about one group's ring, worked out once per sample. */
interface Shape {
  ring: Ring | null;
  at(station: StationId, t: Beat): EndPose;
  moving(t: Beat): boolean;
  handsAt(t: Beat): Record<StationId, { L: Hand; R: Hand }>;
}

function shapeOf(group: Group, params: TakeHandsParams): Shape {
  const ids = group.stations.map((s) => s.id);
  const starts: RingPlaces = {};
  const roles: Record<StationId, RoleName> = {};
  for (const s of group.stations) {
    starts[s.id] = params.origins[s.id] ?? groupStationPose(group, s.id);
    roles[s.id] = s.role;
  }

  const turnEnd = params.inBeats + params.turnBeats;
  const movingOut = Math.max(params.beats - params.outBeats, 0);
  const moving = (t: Beat): boolean =>
    t < params.inBeats || (params.places !== 0 && t < turnEnd) || t > movingOut;

  // Two dancers are the smallest ring there is; one has nobody to join with,
  // so there is no ring at all and the figure is a plain walk.
  if (ids.length < 2) {
    const walk = (station: StationId, t: Beat): EndPose => {
      const from = starts[station] ?? groupStationPose(group, station);
      const to = endOf(group, station, params, from);
      const step = walkStep(from, to, t, params.beats, 0);
      return { p: step.p, facing: step.facing };
    };
    return { ring: null, at: walk, moving, handsAt: () => ({}) };
  }

  const ring = ringOf(starts, ids, group.frame.spacing);
  const turn = (params.places * 360) / ids.length;
  const ends: RingPlaces = {};
  for (const id of ids) {
    const carried = starts[ringShift(ring, id, params.places)];
    ends[id] = endOf(group, id, params, carried ?? starts[id]!);
  }

  const at = (station: StationId, t: Beat): EndPose =>
    ringWalk(ring, station, starts[station]!, ends[station]!, t, params.beats, {
      inBeats: params.inBeats,
      outBeats: params.outBeats,
      turn,
      faceOffset: FACE_THE_CENTRE,
      turnTo: turnEnd,
    });

  const handsAt = (t: Beat): Record<StationId, { L: Hand; R: Hand }> =>
    ringHands(
      ring,
      (id) => at(id, t),
      (id) => roles[id] ?? "",
      group.roleSet,
      params.holdDrop,
      params.stackPx,
    ).hands;

  return { ring, at, moving, handsAt };
}

/** A dancer on a ring faces its centre, which is half a turn from their ring angle. */
const FACE_THE_CENTRE: Angle = 180;

/** Where a station steps out to: its own end place, or wherever the ring left it. */
function endOf(
  group: Group,
  station: StationId,
  params: TakeHandsParams,
  carried: EndPose,
): EndPose {
  const local = params.endPlaces[station];
  if (local === undefined) return carried;
  return { p: framePoint(group.frame, local.p), facing: frameAngle(group.frame, local.facing) };
}

/**
 * Where the hall stands to take hands four, in the group frame's own axes:
 * every station's place, turned back round the ring by the shift it is about
 * to make.
 *
 * This is what makes the user's "you still line up improper" true rather than
 * described. A becket hall walks into a line whose partners are **across** the
 * set — which is a duple improper line — and the shift is what turns it becket.
 * With no shift (`places` 0) it is the stations themselves, unchanged, which is
 * what every other formation lines up on.
 */
export function lineUpPlaces(
  stations: readonly { id: StationId; p: EndPose["p"]; facing: Angle }[],
  places: number,
  spacing: number,
): Record<StationId, EndPose> {
  const at: RingPlaces = {};
  for (const s of stations) at[s.id] = { p: s.p, facing: s.facing };
  if (places === 0 || stations.length < 2) return at;
  const ring = ringOf(at, Object.keys(at), spacing);
  const out: Record<StationId, EndPose> = {};
  for (const id of Object.keys(at)) out[id] = at[ringShift(ring, id, -places)]!;
  return out;
}
