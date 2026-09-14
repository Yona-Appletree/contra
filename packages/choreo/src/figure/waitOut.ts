import type { Beat, Hand, PoseSample, Side, Vec2 } from "@caller/core";
import { angleOfVec, hangingHand, lerpHand, norm, ramp, shouldersAt, sub } from "@caller/core";
import type { StationId } from "../formation/Formation.js";
import { frameAngle, framePoint } from "../formation/Frame.js";
import type { Group } from "../group/Group.js";
import { groupStation, groupStationPose } from "../group/Group.js";
import type { EndPose, FigureDef, FigureParams } from "./FigureDef.js";
import { joinHands } from "./joinHands.js";
import { standing } from "./standing.js";
import { DEFAULT_BOW_PX, walkStep } from "./walkPath.js";

/**
 * What "cross over" means for this formation.
 *
 * `'swap'`: the two dancers trade stations. That is a duple-improper couple
 * facing each other across the set, and it is what puts the lark back on the
 * side the next time through expects.
 *
 * `'mirror'`: each dancer walks to the point opposite their own station through
 * the frame centre, turning to face back. That is a couple standing side by
 * side that has to reach the other line, as a becket end couple does.
 */
export type CrossOver = "swap" | "mirror";

/**
 * Beats the inside hand spends coming up off the hip to the hold, and going
 * back down again: one beat each, which is what every take in the library
 * takes.
 *
 * The take runs *after* the couple has stepped together, and the release
 * *before* it steps back out, rather than overlapping either. A hand on its way
 * to a point 16 px away while its dancer is still 16 px from it is a hand
 * outside the 15 px arm, and AC1 says a hand is never drawn where the arm
 * cannot reach.
 */
const TAKE_BEATS: Beat = 1;

/** `wait-out`'s parameters. */
export interface WaitOutParams extends FigureParams {
  /** How the couple gets to where the next time through wants it. */
  crossTo: CrossOver;
  /**
   * Station → where its dancer stands when the figure starts, in the group
   * frame's **own axes**. Empty — the default — means the waiting places.
   *
   * A dance whose first figure is the progression starts everybody one place
   * off the stations, the waiting couple included: it slides off the end of the
   * line with everybody else. The crossing is then reckoned from where the
   * couple *started*, not from the waiting place, which is what puts it down on
   * the place the next time through begins from. With the default it is the
   * waiting place either way, so nothing moves for a dance that progresses at
   * the end.
   */
  startPlaces: Record<StationId, EndPose>;
  /** Beats spent stepping together to take hands. */
  joinBeats: Beat;
  /** Beats spent letting go and stepping back out, just before the crossing. */
  partBeats: Beat;
  /** Beats spent crossing over, at the end of the figure. */
  crossBeats: Beat;
  /** How far below shoulder height the joined hands are, in px. */
  holdDrop: number;
  /** How far each dancer bows to their own right while crossing, in px. */
  bowPx: number;
  /** How much higher the role set's `top` role's hand sits, in px. */
  stackPx: number;
}

/**
 * `wait-out`: the couple with nobody to dance with steps together, holds hands
 * for the whole time through, lets go, and crosses over during the last eight
 * beats so it comes back in facing the right way.
 *
 * Form-neutral: it works on any group of exactly two stations, taking the
 * inside hands (the first station's left, the second's right). In a contra set
 * the group's frame is turned end for end for the couple waiting at the bottom,
 * so both waiters finish facing along the frame's own axis and the same figure
 * serves both ends of the line.
 *
 * Two deviations from the hall spike, both forced by the plan's numbers:
 *
 * - The couple **steps together** to `frame.spacing` before taking hands. The
 *   spike holds hands at the stations, a line's width apart, which is further
 *   than a 15 px arm reaches; the inviolable invariant says a hand is never
 *   drawn where the arm cannot go, so `short` would not be 0 (AC1).
 * - It **steps back out** over the last couple of beats of the hold, so the
 *   crossing runs station to station over the last eight beats exactly as the
 *   spike's does. Crossing from the closed-up hold would take the two within
 *   8 px of each other (AC6).
 */
export const WAIT_OUT: FigureDef<WaitOutParams> = {
  id: "wait-out",
  call: "WAIT IT OUT AND CROSS OVER",
  describe:
    "A couple with nobody to dance with steps together, takes two hands and waits out a whole time through, then steps back out and crosses to the other line so they come back in on the other side. This is the engine's form-neutral version; a form that knows how its own end couples cross registers its own over this id.",
  lead: 0,
  beats: 64,
  defaults: {
    crossTo: "swap",
    startPlaces: {},
    joinBeats: 4,
    partBeats: 2,
    crossBeats: 8,
    holdDrop: 10,
    bowPx: DEFAULT_BOW_PX,
    stackPx: 0,
  },

  sample(group: Group, station: StationId, t: Beat, params: WaitOutParams): PoseSample {
    const g = geometry(group, params);
    const self = g.side(station);

    if (t >= g.crossStart) {
      const step = walkStep(
        self.home,
        g.target(station),
        t - g.crossStart,
        g.crossBeats,
        params.bowPx,
      );
      return {
        ...standing(step.p, step.facing),
        stepRate: step.moving ? 1 : 0,
        amp: step.moving ? 1 : 0,
      };
    }

    // Where the body is: stepping together, waiting, or stepping back out.
    const walk =
      t < g.joinBeats
        ? walkStep(self.start, self.hold, t, g.joinBeats, 0)
        : t >= g.partStart
          ? walkStep(self.hold, self.home, t - g.partStart, g.partBeats, 0)
          : undefined;
    const pose = walk ? standing(walk.p, walk.facing) : standing(self.hold.p, self.hold.facing);

    const myRole = groupStation(group, station).role;
    const theirRole = groupStation(group, g.otherId(station)).role;
    const joined = joinHands(
      g.joinPoint,
      params.holdDrop,
      [myRole, theirRole],
      group.roleSet,
      params.stackPx,
    );
    const hand = joined[myRole];
    if (!hand) throw new Error(`wait-out: no joined hand for role "${myRole}"`);

    // The take and the release animate, a beat each, once the couple is
    // standing at the hold. Before F3c this hand appeared out of nothing the
    // instant they arrived and vanished the instant they parted: 140 state
    // flips and 216.7 px/beat of hand speed, which made `wait-out` the
    // second-worst figure in the library — and it is the one on screen for 64
    // beats at a time, danced by the couple nobody is watching.
    const down = hangingHand(pose.p, pose.facing, self.inside, t, pose.amp);
    const half = (g.partStart - g.joinBeats) / 2;
    const take = Math.min(TAKE_BEATS, Math.max(0, half));
    const rising = lerpHand(down, hand, ramp(t, g.joinBeats, g.joinBeats + take));
    const inside = lerpHand(rising, down, ramp(t, g.partStart - take, g.partStart));
    return {
      ...pose,
      hands: self.inside === "L" ? { L: inside, R: "down" } : { L: "down", R: inside },
    };
  },

  ends(group: Group, params: WaitOutParams): Record<StationId, EndPose> {
    const g = geometry(group, params);
    const out: Record<StationId, EndPose> = {};
    for (const s of group.stations) out[s.id] = g.target(s.id);
    return out;
  },
};

interface WaitSide {
  /** Where the dancer stands when the figure starts; the waiting place by default. */
  start: EndPose;
  /** The waiting place itself, which is where the crossing sets off from. */
  home: EndPose;
  hold: EndPose;
  inside: "L" | "R";
}

/**
 * Where a waiting couple's two dancers stand when the figure starts, in world
 * px: `startPlaces` when the dance gave one, the waiting places otherwise.
 *
 * Exported because a form may replace the crossing (contra does, to walk the
 * couple across as a couple) and has to reckon it from the same two places.
 */
export function waitOutStart(group: Group, params: WaitOutParams, station: StationId): EndPose {
  const local = params.startPlaces[station];
  if (local === undefined) return groupStationPose(group, station);
  return { p: framePoint(group.frame, local.p), facing: frameAngle(group.frame, local.facing) };
}

function geometry(group: Group, params: WaitOutParams) {
  if (group.stations.length !== 2) {
    throw new Error(`wait-out needs a group of two, got ${group.stations.length}`);
  }
  const a = group.stations[0]!;
  const b = group.stations[1]!;
  const homeA = groupStationPose(group, a.id);
  const homeB = groupStationPose(group, b.id);
  const startA = waitOutStart(group, params, a.id);
  const startB = waitOutStart(group, params, b.id);
  const half = group.frame.spacing / 2;
  const u = norm(sub(homeA.p, homeB.p));
  const mid: Vec2 = [(homeA.p[0] + homeB.p[0]) / 2, (homeA.p[1] + homeB.p[1]) / 2];
  const holdA: Vec2 = [mid[0] + u[0] * half, mid[1] + u[1] * half];
  const holdB: Vec2 = [mid[0] - u[0] * half, mid[1] - u[1] * half];
  const faceA = angleOfVec(sub(holdB, holdA));
  const faceB = faceA + 180;

  // The joined hands are one floor point: the midpoint of the two inside
  // shoulders, which both dancers compute from this same frame.
  const shA = shouldersAt(holdA, faceA).L;
  const shB = shouldersAt(holdB, faceB).R;
  const joinPoint: Vec2 = [(shA[0] + shB[0]) / 2, (shA[1] + shB[1]) / 2];

  const sides: Record<StationId, WaitSide> = {
    [a.id]: { start: startA, home: homeA, hold: { p: holdA, facing: faceA }, inside: "L" },
    [b.id]: { start: startB, home: homeB, hold: { p: holdB, facing: faceB }, inside: "R" },
  };

  const joinBeats = Math.min(params.joinBeats, params.beats);
  const crossBeats = Math.min(params.crossBeats, params.beats - joinBeats);
  const crossStart = params.beats - crossBeats;
  const partBeats = Math.min(params.partBeats, crossStart - joinBeats);
  const centre = group.frame.centre;
  const side = (id: StationId): WaitSide => {
    const s = sides[id];
    if (!s) throw new Error(`wait-out: no station "${id}"`);
    return s;
  };
  const otherId = (id: StationId): StationId => (id === a.id ? b.id : a.id);

  return {
    joinBeats,
    crossBeats,
    crossStart,
    partBeats,
    partStart: crossStart - partBeats,
    joinPoint,
    side,
    otherId,
    /**
     * Where this station's dancer stands once the crossing is done.
     *
     * Reckoned from where the couple *started*, not from the waiting place. The
     * two are the same unless the dance progresses in its own first figure, in
     * which case the waiting couple slid into the waiting place with everybody
     * else and has to land one place short of it, ready to slide again.
     */
    target(id: StationId): EndPose {
      if (params.crossTo === "mirror") {
        const from = side(id).start;
        return {
          p: [2 * centre[0] - from.p[0], 2 * centre[1] - from.p[1]],
          facing: from.facing + 180,
        };
      }
      // A swap leaves both dancers facing along the frame's own axis, which is
      // turned end for end for the couple waiting at the other end of the set,
      // so one figure serves both ends.
      return { p: side(otherId(id)).start.p, facing: group.frame.axis };
    },
  };
}
