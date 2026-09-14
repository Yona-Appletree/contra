import type { Beat, Vec2 } from "@caller/core";
import {
  HOLD_SPACING_PX,
  SEAM_BEATS,
  angleDiff,
  dirOf,
  dist,
  easeSeam,
  seamProgress,
} from "@caller/core";
import type { BeatWindow, Group, StationId, Track, TrajectoryResult } from "@caller/choreo";
import {
  createGroup,
  endsOn,
  frame as makeFrame,
  handsJoined,
  handsStill,
  joinWindow,
  passes,
  sampleTrack,
  shoulderOf,
  staysOnPlace,
  walksBackward,
  withDefaults,
} from "@caller/choreo";
import type { ContraFigure, ContraParams } from "./ContraFigure.js";
import { bearing, holdWindow, planContext, polar, worldSpot } from "./ContraFigure.js";
import type { ContraCall } from "./chain.js";
import { chainCalls } from "./chain.js";
import { CONTRA_FIGURES } from "./registry.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { IN_BEATS as STAR_IN_BEATS, OUT_BEATS as STAR_OUT_BEATS, WRIST_RADIUS_PX } from "./star.js";

/**
 * What each figure's `describe` says, turned into assertions.
 *
 * Every check below is one sentence of a figure's own `describe` with a number
 * attached. They are written to be **read**, not only run: the report script
 * prints all of them with their evidence, so a caller can see "the robins pass
 * right shoulders in the centre" next to the beat and the px that decided it.
 *
 * Several of them fail today. That is the point — see `knownWrong.ts`, which
 * names every one that does and why, and `figureChecks.test.ts`, which asserts
 * that everything not on that list passes **and** that everything on it still
 * fails, so a fix has to delete its row.
 */

/** Every assertion made about one figure or one seam. */
export interface FigureChecks {
  /** A figure id, or a `"prev → next"` seam key. */
  key: string;
  /** What the figure says it does, for the report to print beside the results. */
  describe?: string;
  results: TrajectoryResult[];
}

/** How finely a figure is sampled for its assertions: the oracle's own step. */
export const CHECK_STEP: Beat = 1 / 32;

/** The frame the checks run on: one minor set down the hall, on the origin. */
export const CHECK_FRAME = makeFrame([0, 0], 90);

/** The centre of that minor set, which is where a hey and a chain pass. */
export const SET_CENTRE: Vec2 = [0, 0];

/** One group of four, duple improper, on {@link CHECK_FRAME}. */
export function checkGroup(): Group {
  const stations = DUPLE_IMPROPER.group(4);
  const members: Record<StationId, string> = {};
  for (const station of stations) members[station.id] = station.id;
  return createGroup(
    { id: "checks", kind: "set", frame: CHECK_FRAME, stations, members, couples: [] },
    DUPLE_IMPROPER.roleSet,
  );
}

/** One figure sampled over its whole length, with the hands it says it joins. */
export function figureTrack(
  id: string,
  params: Partial<ContraParams> & Record<string, unknown> = {},
  step: Beat = CHECK_STEP,
): { track: Track; group: Group; beats: Beat; def: ContraFigure<ContraParams> } {
  const def = (CONTRA_FIGURES as Record<string, unknown>)[id] as ContraFigure<ContraParams>;
  if (!def) throw new Error(`no contra figure "${id}"`);
  const group = checkGroup();
  const resolved = withDefaults(def, params, (params.beats as Beat | undefined) ?? def.beats);
  const plan = def.plan(
    planContext(group.stations, group.roleSet, group.frame.spacing, resolved.from),
    resolved,
  );
  const ids = group.stations.map((s) => s.id);
  const track = sampleTrack(
    ids,
    resolved.beats,
    (station, t) => def.sample(group, station, t, resolved),
    (t) => plan.joinsAt(t),
    step,
  );
  return { track, group, beats: resolved.beats, def };
}

/** Where a station stands on {@link CHECK_FRAME}, in world px. */
export function stationAt(group: Group, id: StationId): Vec2 {
  const station = group.stations.find((s) => s.id === id);
  if (!station) throw new Error(`no station "${id}"`);
  return worldSpot(group.frame, { p: station.p, facing: station.facing }).p;
}

const win = (from: Beat, to: Beat): BeatWindow => ({ from, to });

/**
 * `handsJoined` over the span the figure itself declares the join, so a
 * failure is about the hands and never about a window somebody guessed.
 *
 * When the figure never declares the join at all, the check still runs over
 * `fallback` — which is how "a star's four hands are one point" can fail on a
 * star that only declares two pairs.
 */
function joinedThroughout(
  track: Track,
  a: string,
  aSide: "L" | "R",
  b: string,
  bSide: "L" | "R",
  fallback: BeatWindow,
): TrajectoryResult {
  return handsJoined(track, a, aSide, b, bSide, joinWindow(track, a, aSide, b, bSide) ?? fallback);
}

/**
 * How close two dancers have to come to have *passed* rather than circled:
 * one hold spacing, the library's own number for two dancers standing close
 * enough to take hands. Two people passing shoulder to shoulder are nearer
 * than that, so it is a generous reading and a failure is unambiguous.
 */
const CLOSE_PX = HOLD_SPACING_PX;

/** How near the set's centre a pass has to be to be "in the centre": half a hold. */
const CENTRE_PX = HOLD_SPACING_PX / 2;

/**
 * Every figure's assertions, in the registry's order.
 *
 * Nothing here throws and nothing here is skipped: a figure that is wrong
 * produces a failing result with the number that says so.
 */
export function figureChecks(): FigureChecks[] {
  return [
    heyChecks(),
    robinsChainChecks(),
    longLinesChecks(),
    starChecks(),
    circleChecks(),
    allemandeChecks(),
    doSiDoChecks(),
    rightAndLeftThroughChecks(),
    petronellaChecks(),
    balanceChecks(),
    swingChecks(),
    balanceAndSwingChecks(),
    balanceToSwingSeam(),
  ];
}

const describeOf = (id: string): string | undefined =>
  ((CONTRA_FIGURES as Record<string, { describe?: string }>)[id] ?? {}).describe;

/**
 * A hey is four passes in the centre of the set, right shoulders, at about
 * counts 2, 6, 10 and 14.
 *
 * The user: "some moves, like the hey are just totally wrong. that's a weaving
 * figure, they should be passing shoulders in the center of the set."
 */
function heyChecks(): FigureChecks {
  const { track } = figureTrack("hey");
  // The four passes in the centre alternate robins, larks, robins, larks, and
  // every one of them is by the right; the passes on the *sides* are the left
  // ones. 1R and 2R are the robins of a duple improper minor set, 1L and 2L
  // the larks.
  const centre = (a: string, b: string, count: Beat) =>
    passes(track, a, b, {
      within: CLOSE_PX,
      near: SET_CENTRE,
      nearPx: CENTRE_PX,
      shoulder: "R",
      beatWindow: win(count - 2, count + 2),
    });
  // And between them, each robin passes a lark on the side, by the left.
  const side = (a: string, b: string, count: Beat) =>
    passes(track, a, b, {
      within: CLOSE_PX,
      shoulder: "L",
      beatWindow: win(count - 2, count + 2),
    });
  const results = [
    centre("1R", "2R", 2),
    side("1R", "1L", 4),
    centre("1L", "2L", 6),
    side("1R", "2L", 8),
    centre("1R", "2R", 10),
    side("2R", "2L", 12),
    centre("1L", "2L", 14),
  ];
  return { key: "hey", describe: describeOf("hey"), results };
}

/**
 * A chain is a pull by in the centre, then a courtesy turn in which the lark
 * walks backward with his left hand in her left throughout.
 *
 * The user: "robins chain is totally wrong too. robins pull by in the center,
 * then the larks scoop them and walk backwards or they twirl them."
 */
function robinsChainChecks(): FigureChecks {
  const { track, group } = figureTrack("robins-chain");
  // The chain's own default timing: the pull by is the first half and the
  // courtesy turn the second, and the turn lets go over its last 1.5 beats.
  const take: Beat = 4.5;
  const held = win(5.5, 6.5);
  const results = [
    passes(track, "1R", "2R", {
      within: CLOSE_PX,
      near: SET_CENTRE,
      nearPx: CENTRE_PX,
      shoulder: "R",
      beatWindow: win(1, 4),
    }),
    // He backs out of the set from the moment the couple has closed up; the
    // first beat and a half of the turn is the closing, where he is still
    // stepping in to meet her.
    walksBackward(track, "1L", win(6, 7.5)),
    walksBackward(track, "2L", win(6, 7.5)),
    // 2R lands on 1R's place, and the lark she is a couple with there is the
    // one across the set from it — 1L. 1R lands on 2R's place and pairs with
    // 2L. A courtesy turn is with the lark of the place you arrive at, not the
    // nearest lark on the floor.
    handsJoined(track, "1L", "L", "2R", "L", held, HAND_TOLERANCE_PX),
    handsJoined(track, "2L", "L", "1R", "L", held, HAND_TOLERANCE_PX),
    // The half turn itself: both bodies turn 180° between the take and the end,
    // and it leaves her on his right facing back into the set.
    turnsHalf(track, "1L", "2R", take),
    turnsHalf(track, "2L", "1R", take),
    endsBesideOnTheRight(track, "1L", "2R"),
    endsBesideOnTheRight(track, "2L", "1R"),
    // AC6: the couple turning beside you gets left room.
    clearsEveryone(track, win(take, 8)),
    // The pull by's own right hands, over the window the figure declares.
    joinedThroughout(track, "1R", "R", "2R", "R", win(1.6, 2.4)),
    endsOn(track, "1R", { id: "2R", p: stationAt(group, "2R") }, 0.5),
    endsOn(track, "2R", { id: "1R", p: stationAt(group, "1R") }, 0.5),
  ];
  return { key: "robins-chain", describe: describeOf("robins-chain"), results };
}

/**
 * Long lines: every hand is still on the body for the whole hold, and the
 * hands stay joined throughout.
 *
 * The user: "the arms flair around a bit in the long lines — arms don't really
 * move in that figure, everyone's just holding hands."
 */
function longLinesChecks(): FigureChecks {
  const { track } = figureTrack("long-lines");
  const results = [
    handsStill(track, "1L", win(1, 7), 1.5),
    handsStill(track, "1R", win(1, 7), 1.5),
    handsStill(track, "2L", win(1, 7), 1.5),
    handsStill(track, "2R", win(1, 7), 1.5),
    // 1L and 2R stand in the same line, so the hands they hold toward each
    // other are one point; the same for 1R and 2L.
    joinedThroughout(track, "1L", "L", "2R", "R", win(1, 7)),
    joinedThroughout(track, "1R", "R", "2L", "L", win(1, 7)),
  ];
  return { key: "long-lines", describe: describeOf("long-lines"), results };
}

/**
 * A star: the default hold is a wrist grip — each giving hand rests on the
 * wrist of the dancer ahead of them round the ring, not at a shared centre —
 * and `hold: "hands-across"` is the older shape, one point per diagonal pair.
 *
 * The user: "in our area the star is done by putting the hand on the wrist of
 * the person in front of you... doing all in a pile in the center (that's
 * awkward)."
 */
function starChecks(): FigureChecks {
  const { track: wrist, beats } = figureTrack("star");
  // The figure's own take/release window: `WRIST_JOIN_WINDOW`-shaped, but read
  // straight off `star.ts`'s own constants so a change there cannot go stale
  // here.
  const held = holdWindow(beats, STAR_IN_BEATS + 0.4, STAR_OUT_BEATS);
  const wristHeld = win(held.takeTo, held.releaseFrom);
  const { track: across } = figureTrack("star", { hold: "hands-across" });
  const acrossHeld = joinWindow(across, "1R", "R", "2R", "R") ?? win(1, 7);
  const results = [
    // The wrist hold: a four-person star's ring alternates role at every
    // place, so going round it once visits every giver-and-leader pair.
    wristJoined(wrist, "2R", "R", "2L", wristHeld),
    wristJoined(wrist, "2L", "R", "1R", wristHeld),
    wristJoined(wrist, "1R", "R", "1L", wristHeld),
    wristJoined(wrist, "1L", "R", "2R", wristHeld),
    // hands-across: unchanged from before this milestone — one point per
    // diagonal pair, both pairs over the centre.
    joinedThroughout(across, "1R", "R", "2R", "R", acrossHeld),
    joinedThroughout(across, "1L", "R", "2L", "R", acrossHeld),
    handsJoined(across, "1L", "R", "1R", "R", acrossHeld),
  ];
  return { key: "star", describe: describeOf("star"), results };
}

/**
 * A giving hand stays on the wrist of the dancer ahead of it round the star: a
 * forearm's length out from the ring's centre, in the direction of wherever
 * the leader actually is at each instant.
 *
 * This is not a `handsJoined` call: the leader's own hand is busy on somebody
 * else's wrist, so there is no second *hand* to compare against, only a point
 * built from the leader's sampled body. `@caller/choreo`'s `trajectory.ts`
 * models a `HandJoin` as two named hands meeting at one point, which is not
 * this shape, so this stays local to `figureChecks.ts` rather than adding a
 * wrist-target helper to a package this milestone does not own.
 */
function wristJoined(
  track: Track,
  giver: string,
  side: "L" | "R",
  leader: string,
  window: BeatWindow,
): TrajectoryResult {
  const label = `${giver}'s ${side} stays on ${leader}'s wrist from beat ${window.from} to ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  let worst = 0;
  let beat = track.beats[first] ?? 0;
  for (let i = first; i <= last; i++) {
    const hand = track.pose(giver, i).hands[side];
    const at = track.beats[i] ?? 0;
    if (hand === "down") {
      return fail(label, `${giver}'s ${side} hand is down, not on a wrist`, at, Infinity, "px");
    }
    const target = polar(SET_CENTRE, bearing(SET_CENTRE, track.pose(leader, i).p), WRIST_RADIUS_PX);
    const gap = dist(hand.p, target);
    if (gap > worst) {
      worst = gap;
      beat = at;
    }
  }
  if (worst > HAND_TOLERANCE_PX) {
    return fail(label, `${worst.toFixed(4)} px off the wrist point`, beat, worst, "px");
  }
  return {
    label,
    pass: true,
    note: `${worst.toFixed(4)} px off the wrist point, within ${HAND_TOLERANCE_PX} px`,
    worst: { beat, value: worst, unit: "px" },
  };
}

/** A circle: hands joined all the way round, all the way through. */
function circleChecks(): FigureChecks {
  const { track } = figureTrack("circle");
  const results = [
    joinedThroughout(track, "1L", "L", "2R", "R", win(1, 7)),
    joinedThroughout(track, "1R", "L", "1L", "R", win(1, 7)),
    joinedThroughout(track, "2L", "L", "1R", "R", win(1, 7)),
    joinedThroughout(track, "2R", "L", "2L", "R", win(1, 7)),
  ];
  return { key: "circle", describe: describeOf("circle"), results };
}

/** An allemande: one joined hand over one spot, never let go of. */
function allemandeChecks(): FigureChecks {
  const { track } = figureTrack("allemande");
  const results = [
    joinedThroughout(track, "1L", "L", "2R", "L", win(1.5, 6.5)),
    joinedThroughout(track, "1R", "L", "2L", "L", win(1.5, 6.5)),
  ];
  return { key: "allemande", describe: describeOf("allemande"), results };
}

/**
 * A do-si-do: pass right shoulders on the way out, nobody takes hands, and
 * nobody turns round — you end facing the way you started.
 */
function doSiDoChecks(): FigureChecks {
  const { track, group } = figureTrack("do-si-do");
  const results = [
    passes(track, "1L", "2R", { within: CLOSE_PX, shoulder: "R", beatWindow: win(0.5, 3) }),
    endsOn(track, "1L", { id: "1L", p: stationAt(group, "1L") }, 0.5),
    endsOn(track, "2R", { id: "2R", p: stationAt(group, "2R") }, 0.5),
  ];
  return { key: "do-si-do", describe: describeOf("do-si-do"), results };
}

/**
 * Right and left through: pass right shoulders across, then a courtesy turn in
 * which the lark walks backward with the robin's left hand in his left.
 */
function rightAndLeftThroughChecks(): FigureChecks {
  const { track } = figureTrack("right-and-left-through");
  // Its own default timing: the pass through is 3.5 beats and the turn the
  // remaining 4.5, letting go over the last 1.5 of them.
  const take: Beat = 3.5;
  const held = win(5, 6.5);
  const results = [
    passes(track, "1L", "2R", { within: CLOSE_PX, shoulder: "R", beatWindow: win(0.5, 3.5) }),
    walksBackward(track, "1L", held),
    walksBackward(track, "2L", held),
    handsJoined(track, "1L", "L", "1R", "L", held, HAND_TOLERANCE_PX),
    handsJoined(track, "2L", "L", "2R", "L", held, HAND_TOLERANCE_PX),
    turnsHalf(track, "1L", "1R", take),
    turnsHalf(track, "2L", "2R", take),
    endsBesideOnTheRight(track, "1L", "1R"),
    endsBesideOnTheRight(track, "2L", "2R"),
    clearsEveryone(track, win(take, 8)),
  ];
  return { key: "right-and-left-through", describe: describeOf("right-and-left-through"), results };
}

/**
 * How near two hands a figure calls one point may actually be, px.
 *
 * The brief's number. Everything in the library that joins hands is exact to
 * floating point; this leaves room for a figure that arrives at the point by
 * two routes without leaving room for a figure that misses.
 */
const HAND_TOLERANCE_PX = 0.01;

/** How far a body may be off a half turn and still be dancing one, degrees. */
const HALF_TURN_SLACK_DEG = 1;

/**
 * Both dancers of a courtesy turn turn a **half** between the take and the end.
 *
 * The user: "robins walk forward a half turn while larks walk backwards until
 * both face in again, with robin on the right." This is that sentence's first
 * half, and {@link endsBesideOnTheRight} is its second. It is the bodies that
 * turn 180°; what the line between them does is geometry and depends on which
 * side she arrived on — see `courtesyTurn`.
 */
function turnsHalf(track: Track, lark: string, robin: string, take: Beat): TrajectoryResult {
  const label = `${lark} and ${robin} each turn a half between beat ${take} and the end`;
  const first = track.indexAt(take);
  const last = track.beats.length - 1;
  let worst = 0;
  let who = lark;
  for (const id of [lark, robin]) {
    const turned = Math.abs(angleDiff(track.pose(id, first).facing, track.pose(id, last).facing));
    const off = Math.abs(180 - turned);
    if (off > worst) {
      worst = off;
      who = id;
    }
  }
  const beat = track.beats[last] ?? 0;
  if (worst > HALF_TURN_SLACK_DEG) {
    return fail(label, `${who} turns ${(180 - worst).toFixed(3)}°, not a half`, beat, worst, "deg");
  }
  return {
    label,
    pass: true,
    note: `both of them turn 180.000°, within ${worst.toFixed(4)}°`,
    worst: { beat, value: worst, unit: "deg" },
  };
}

/**
 * The turn leaves the robin on the lark's right, the two of them facing the
 * same way, and that way is into the set.
 */
function endsBesideOnTheRight(track: Track, lark: string, robin: string): TrajectoryResult {
  const label = `${robin} ends on ${lark}'s right, both facing in`;
  const last = track.beats.length - 1;
  const beat = track.beats[last] ?? 0;
  const him = track.pose(lark, last);
  const her = track.pose(robin, last);
  const side = shoulderOf(him, her.p);
  if (side !== "R") return fail(label, `she ends on his ${side}`, beat, 0, "px");
  const apart = Math.abs(angleDiff(him.facing, her.facing));
  if (apart > HALF_TURN_SLACK_DEG) {
    return fail(label, `they face ${apart.toFixed(3)}° apart`, beat, apart, "deg");
  }
  const look = dirOf(him.facing);
  const inward = look[0] * (SET_CENTRE[0] - him.p[0]) + look[1] * (SET_CENTRE[1] - him.p[1]);
  if (inward <= 0) {
    return fail(label, `they face out of the set, not in`, beat, inward, "px");
  }
  return {
    label,
    pass: true,
    note: `she is on his right, both facing ${inward.toFixed(2)} px toward the middle of the set`,
    worst: { beat, value: inward, unit: "px" },
  };
}

/**
 * Nobody in the set comes closer to anybody else than AC6's clearance over the
 * window.
 *
 * Two couples courtesy turn at once with their centres one place pitch apart,
 * which is what `courtesyHold` shrinks the hold for; this is the measurement
 * that says whether it worked.
 */
function clearsEveryone(track: Track, window: BeatWindow): TrajectoryResult {
  const label = `nobody comes within ${AC6_CLEARANCE_PX} px of anybody from beat ${window.from} to ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  let closest = Infinity;
  let beat = track.beats[first] ?? 0;
  let who = "";
  for (let i = first; i <= last; i++) {
    for (let a = 0; a < track.ids.length; a++) {
      for (let b = a + 1; b < track.ids.length; b++) {
        const gap = dist(track.pose(track.ids[a]!, i).p, track.pose(track.ids[b]!, i).p);
        if (gap < closest) {
          closest = gap;
          beat = track.beats[i] ?? 0;
          who = `${track.ids[a]!} and ${track.ids[b]!}`;
        }
      }
    }
  }
  if (closest < AC6_CLEARANCE_PX) {
    return fail(label, `${who} are ${closest.toFixed(3)} px apart`, beat, closest, "px");
  }
  return {
    label,
    pass: true,
    note: `the closest anybody gets is ${who} at ${closest.toFixed(3)} px`,
    worst: { beat, value: closest, unit: "px" },
  };
}

/** AC6's number: two dancers never come closer than this, px. */
const AC6_CLEARANCE_PX = 8;

/** A failing result, shaped the way `@caller/choreo`'s own assertions shape one. */
const fail = (
  label: string,
  note: string,
  beat: Beat,
  value: number,
  unit: string,
): TrajectoryResult => ({ label, pass: false, note, worst: { beat, value, unit } });

/** A petronella: nobody holds anybody, and everybody lands one place on. */
function petronellaChecks(): FigureChecks {
  const { track, group } = figureTrack("petronella");
  const results = [
    endsOn(track, "1L", { id: "1R", p: stationAt(group, "1R") }, 1),
    endsOn(track, "1R", { id: "2L", p: stationAt(group, "2L") }, 1),
    endsOn(track, "2L", { id: "2R", p: stationAt(group, "2R") }, 1),
    endsOn(track, "2R", { id: "1L", p: stationAt(group, "1L") }, 1),
  ];
  return { key: "petronella", describe: describeOf("petronella"), results };
}

/**
 * A balance: two hands joined for the whole rock, and nobody travels far.
 *
 * "Nobody travels" is generous here on purpose: a balance in the lines has to
 * close 9 px to the hold spacing before it can hold hands at all, which is a
 * deliberate deviation of M8's and not the thing being checked.
 */
function balanceChecks(): FigureChecks {
  const { track } = figureTrack("balance");
  const results = [
    handsJoined(track, "1L", "L", "2R", "R", win(1.5, 4)),
    handsJoined(track, "1L", "R", "2R", "L", win(1.5, 4)),
    staysOnPlace(track, "1L", win(1.5, 4), 3),
  ];
  return { key: "balance", describe: describeOf("balance"), results };
}

/** A swing: the outside hands are one point, held for the whole turn. */
function swingChecks(): FigureChecks {
  const { track } = figureTrack("swing");
  const results = [joinedThroughout(track, "1L", "L", "2R", "R", win(1.5, 6))];
  return { key: "swing", describe: describeOf("swing"), results };
}

/**
 * The balance → swing seam: the hands that were joined at the end of the
 * balance are the hands the swing holds, so they must not be let go of.
 *
 * The user: "the arms still disappear between the balance and the swing."
 * This is the one check that spans two figures, so it samples the two of them
 * back to back the way `poseAt` does — the balance's last beat and the swing's
 * first, with `easeSeam` in between.
 */
function balanceToSwingSeam(): FigureChecks {
  // Threaded the way a dance threads it, so the carried hold in the params is
  // the one `chainCalls` actually works out rather than one written here.
  const seam = seamTrack(
    [
      { figure: "balance", beats: 4, params: { pairs: "neighbors" } },
      { figure: "swing", beats: 8, params: { pairs: "neighbors" } },
    ],
    1,
  );
  const results = [handsJoined(seam.track, "1L", "L", "2R", "R", win(0, 2))];
  return {
    key: "balance → swing",
    describe:
      "A balance ends with the pair holding two hands and the swing that follows takes the same hands, so nothing should be let go of across the boundary.",
    results,
  };
}

/**
 * `balance-and-swing`: the hold the rock takes is the hold the turn uses, and
 * it is one floor point from the moment it is taken until the pair opens out.
 */
function balanceAndSwingChecks(): FigureChecks {
  const { track } = figureTrack("balance-and-swing", { pairs: "neighbors", beats: 16 });
  const results = [
    joinedThroughout(track, "1L", "L", "2R", "R", win(1.5, 14)),
    // And the rock's own second pair of hands, which the turn does let go of:
    // they are joined for the balance and on the back and the shoulder after.
    handsJoined(track, "1L", "R", "2R", "L", win(1.5, 4)),
  ];
  return { key: "balance-and-swing", describe: describeOf("balance-and-swing"), results };
}

/**
 * Two calls, back to back, sampled the way a timeline samples them.
 *
 * `span` beats either side of the boundary, with the boundary at beat `span`.
 * The calls are threaded through {@link chainCalls} first — which is what gives
 * the second one its places *and* whatever hold crosses the boundary — and the
 * seam ease is applied over `@caller/core`'s own `SEAM_BEATS`, which is what
 * `poseAt` does.
 */
function seamTrack(calls: readonly ContraCall[], span: Beat): { track: Track } {
  const group = checkGroup();
  const threaded = chainCalls(DUPLE_IMPROPER, calls, {
    stations: group.stations,
    spacing: group.frame.spacing,
  });
  const first = threaded.calls[0]!;
  const second = threaded.calls[1]!;
  const firstDef = (CONTRA_FIGURES as Record<string, ContraFigure<ContraParams>>)[first.figure]!;
  const secondDef = (CONTRA_FIGURES as Record<string, ContraFigure<ContraParams>>)[second.figure]!;
  const firstParams = withDefaults<ContraParams>(firstDef, first.params, first.beats);
  const secondParams = withDefaults<ContraParams>(secondDef, second.params, second.beats);
  const ids = group.stations.map((s) => s.id);
  const track = sampleTrack(
    ids,
    2 * span,
    (station, t) => {
      if (t < span) {
        return firstDef.sample(group, station, first.beats - span + t, firstParams);
      }
      const into = t - span;
      const here = secondDef.sample(group, station, into, secondParams);
      if (into >= SEAM_BEATS) return here;
      const there = firstDef.sample(group, station, first.beats, firstParams);
      return easeSeam(there, here, seamProgress(into), first.beats + into);
    },
    () => [],
    CHECK_STEP,
  );
  return { track };
}
