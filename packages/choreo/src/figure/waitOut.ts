import type { Beat, PoseSample, Vec2 } from "@caller/core";
import { angleOfVec, dot, hangingHand, lerpHand, norm, ramp, shouldersAt, sub } from "@caller/core";
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
  /**
   * Whether this instance opens by stepping together to take hands.
   *
   * Defaults `true`, today's only usage. `false` is for a waiting couple's
   * cycle that a `"line"`-selector call has already swept part of: the gap
   * this instance fills does not start at the couple's own beat 0, so there is
   * nothing to step in *from* — they arrive at their own resting place (in
   * `@caller/contra`'s wrapper, wherever the sweep left them, since a call
   * that reaches a waiting couple returns it to its own station) already
   * standing where the crossing itself starts from. `sample`/`geometry` skip
   * the step-together ramp entirely and hold there instead.
   */
  join: boolean;
  /**
   * Whether this instance closes by stepping back out and crossing over.
   *
   * Defaults `true`. `false` is for a gap that a later call in the same cycle
   * still has to sweep the couple out of — a leading gap before a sweep, most
   * concretely — so there is nothing to cross *to* yet: `ends` reports the
   * held pose, not a crossed one, and the couple stays there for the rest of
   * this instance's own beats.
   */
  cross: boolean;
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
    join: true,
    cross: true,
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

    if (params.cross && t >= g.crossStart) {
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

    // Where the body is: stepping together, waiting, or stepping back out. A
    // gap that does not join (a "line" call has already claimed this couple's
    // opening beats, so there is no "in" to step together from) never runs the
    // first ramp at all — it holds at `home` for as long as `join` stays
    // false, which is exactly where a call that sweeps a waiting couple in
    // leaves it. The part-out ramp always runs on schedule regardless of
    // `cross`, so a gap this instance's own beats run out on — whether or not
    // it goes on to cross — ends at `home` too.
    const walk = !params.join
      ? undefined
      : t < g.joinBeats
        ? walkStep(self.start, self.hold, t, g.joinBeats, 0)
        : t >= g.partStart
          ? walkStep(self.hold, self.home, t - g.partStart, g.partBeats, 0)
          : undefined;
    // The fallback is reached mid-hold (`join` true, between the two ramps) or
    // for the whole span (`join` false, which never ramps in at all) — `hold`
    // in the first case, `home` in the second.
    const restPose = params.join ? self.hold : self.home;
    const pose = walk ? standing(walk.p, walk.facing) : standing(restPose.p, restPose.facing);

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

  /**
   * **Which end of the hold each dancer takes: the one they are standing at.**
   *
   * The two ends and the point where the hands meet are the *stations*' — the
   * couple ends up `frame.spacing` apart, centred on the same midpoint, on the
   * same axis, whoever is where. What the stations cannot say is which of the
   * two dancers takes which end, because a dance may leave the couple on each
   * other's sides: Anna's Reel's swap-sides progression does it across the set,
   * Fatal Attraction's mid-cycle shift does it along the line. Assigned by
   * station, the two then walk straight lines that cross, and the couple steps
   * *through itself* on the way to its own hold — measured at 0.0000 px (the
   * 0.17 and 0.45 px a 1/8-beat grid reports are the samples either side of the
   * crossing), 44 times over three dances and every line length they are
   * checked at.
   *
   * So the near end, which is the one they would take: `u` runs from `b`'s
   * station to `a`'s, and a couple standing the other way round along it swaps
   * ends. The inside hand follows the end rather than the station — it is
   * whichever hand is nearer the mate — and `joinPoint` does not move, because
   * it is the midpoint of the two shoulders of the two ends and neither end has
   * moved. `home` follows too, so the step back out and the crossing that
   * follows it are reckoned from the end the dancer is actually standing at;
   * `target` reads `start`, so where the couple *lands* is untouched either way.
   *
   * Inert for a couple that arrives the way its stations expect, which is every
   * dance in the programme.
   */
  const swapped = dot(sub(startA.p, startB.p), u) < 0;
  const endOfA: Omit<WaitSide, "start"> = {
    home: homeA,
    hold: { p: holdA, facing: faceA },
    inside: "L",
  };
  const endOfB: Omit<WaitSide, "start"> = {
    home: homeB,
    hold: { p: holdB, facing: faceB },
    inside: "R",
  };
  const sides: Record<StationId, WaitSide> = {
    [a.id]: { ...(swapped ? endOfB : endOfA), start: startA },
    [b.id]: { ...(swapped ? endOfA : endOfB), start: startB },
  };

  // `join` false means there is no ramp *in*: a gap that does not open at the
  // couple's own beat 0 has nothing to step together from, so that beat count
  // collapses to zero. `cross` only gates the very last phase — the walk *to*
  // the far station — never the part-out that precedes it: a gap a later call
  // is going to sweep the couple out of still steps back out of the hold on
  // schedule, landing them at their own resting place (`home`) exactly when
  // this instance's beats run out, which is what lets the call that sweeps
  // them in next pick them up from a station rather than from a hand hold.
  const joinBeats = params.join ? Math.min(params.joinBeats, params.beats) : 0;
  const crossBeats = params.cross ? Math.min(params.crossBeats, params.beats - joinBeats) : 0;
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
     * Where this station's dancer stands once this instance is done.
     *
     * When `cross` is false there is nothing to cross to yet — a later call
     * this cycle still owns that — so this is `home`, exactly where the
     * part-out ramp above always lands by `t = beats` regardless of `cross`:
     * a station, not a hand hold, which is what a call that sweeps the couple
     * in next needs to start from.
     *
     * Otherwise it is reckoned from where the couple *started*, not from the
     * waiting place. The two are the same unless the dance progresses in its
     * own first figure, in which case the waiting couple slid into the
     * waiting place with everybody else and has to land one place short of
     * it, ready to slide again.
     */
    target(id: StationId): EndPose {
      if (!params.cross) {
        const home = side(id).home;
        return { p: home.p, facing: home.facing };
      }
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
