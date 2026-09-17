import type { Beat, Vec2 } from "@caller/core";
import {
  HOLD_SPACING_PX,
  SEAM_BEATS,
  angleDiff,
  dirOf,
  dist,
  easeSeam,
  seamProgress,
  shouldersAt,
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
  velocity,
  walksBackward,
  withDefaults,
} from "@caller/choreo";
import type { ContraFigure, ContraParams } from "./ContraFigure.js";
import { bearing, holdWindow, planContext, worldSpot } from "./ContraFigure.js";
import type { ContraCall } from "./chain.js";
import { chainCalls } from "./chain.js";
import { CHAIN_JOIN_BEAT } from "./robins-chain.js";
import { CONTRA_FIGURES } from "./registry.js";
import { heyDefinition } from "../library/figures/hey.js";
import { interpretDefinition } from "../library/interpret.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import {
  IN_BEATS as STAR_IN_BEATS,
  OUT_BEATS as STAR_OUT_BEATS,
  WRIST_ALONG,
  wristPoint,
} from "./star.js";

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

/**
 * A figure-id-to-defaults-override map, as `createContraRegistry`'s second
 * argument takes it. The empty map — the default everywhere — is the shipped
 * figure, and since M4 migrated the carriers it is also the only map that
 * reaches one: a data figure arrives in the registry as an interpreted figure
 * rather than through `contraFigureList()`, past where the overrides merge.
 */
export type CheckOverrides = Readonly<Record<string, object>>;

/** One figure sampled over its whole length, with the hands it says it joins. */
export function figureTrack(
  id: string,
  params: Partial<ContraParams> & Record<string, unknown> = {},
  step: Beat = CHECK_STEP,
): { track: Track; group: Group; beats: Beat; def: ContraFigure<ContraParams> } {
  const def = checkFigure(id);
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
export function figureChecks(overrides: CheckOverrides = {}): FigureChecks[] {
  /** One figure's override, as the extra params its own track is built with. */
  const of = (id: string): Record<string, unknown> => ({ ...overrides[id] });
  return [
    heyChecks(of("hey")),
    robinsChainChecks(of("robins-chain")),
    longLinesChecks(of("long-lines")),
    starChecks(of("star")),
    circleChecks(of("circle")),
    allemandeChecks(of("allemande")),
    doSiDoChecks(of("do-si-do")),
    rightAndLeftThroughChecks(of("right-and-left-through")),
    petronellaChecks(of("petronella")),
    balanceChecks(of("balance")),
    swingChecks(of("swing")),
    balanceAndSwingChecks(of("balance-and-swing")),
    balanceToSwingSeam(),
  ];
}

/** What one builder is handed: the extra params its figure's track is built with. */
type CheckParams = Record<string, unknown>;

const describeOf = (id: string): string | undefined => checkFigure(id)?.describe;

/**
 * The figures **only the library has**, which these checks still run on.
 *
 * M5 deleted `figures/hey.ts`: the hey is a `FigureDefinition` now and has no
 * coded twin, so `CONTRA_FIGURES` no longer holds it. Its checks are the user's
 * own account of what a hey is ("that's a weaving figure, they should be passing
 * shoulders in the center of the set") and they are worth more against the
 * figure that ships than against one that does not exist, so they run against
 * the interpreted definition — the same object the registry, the timeline and
 * every oracle sample.
 *
 * M11 does this for the whole coded layer; this is the one figure that is ahead
 * of it.
 */
const DATA_ONLY_CHECKED: Readonly<Record<string, ContraFigure<ContraParams>>> = {
  hey: interpretDefinition(heyDefinition) as unknown as ContraFigure<ContraParams>,
};

/** The figure these checks run on: the coded one, or the library's own. */
const checkFigure = (id: string): ContraFigure<ContraParams> | undefined =>
  ((CONTRA_FIGURES as Record<string, unknown>)[id] as ContraFigure<ContraParams> | undefined) ??
  DATA_ONLY_CHECKED[id];

/**
 * A hey is four passes in the centre of the set, right shoulders, at about
 * counts 2, 6, 10 and 14.
 *
 * The user: "some moves, like the hey are just totally wrong. that's a weaving
 * figure, they should be passing shoulders in the center of the set."
 */
function heyChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("hey", params);
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
 * A chain is a right-shoulder pull by in the centre, then the lark's orbit: he
 * backs a whole turn round the point between his own place and the place
 * beside him, and she joins him at the antipode of that circle at the join
 * beat, riding it the rest of the way as one rigid pair.
 *
 * F13 replaces the four rigid-half-turn assertions that only made sense of
 * the earlier default (a courtesy turn between beats 4.5 and 6.5) with the
 * orbit's own: F10's report is what proved each of these, over the two
 * candidates it measured; this is what makes them the tests.
 */
function robinsChainChecks(params: CheckParams): FigureChecks {
  const { track, group, beats } = figureTrack("robins-chain", params);
  // From the join beat the pair is rigid about the orbit's own centre until
  // the couple opens out over the last 1.5 beats — `CHAIN_JOIN_BEAT` and
  // `OPEN_BEATS` are `robins-chain.ts`'s own numbers for the shipped default.
  const rigid = win(CHAIN_JOIN_BEAT, 6.5);
  /**
   * The lark's own turn: from the join to the end of the figure.
   *
   * **M10c**, and it is the user's ruling of 2026-09-16 — "in the chain the
   * pull-by is still too fast and the turn too slow. it should be about 4 beats
   * each" — that moved it. The orbit used to span the whole eight beats, so
   * every number below that was written as a beat of the *figure* (the couple
   * facing out at beat 4, three samples of his circle spread over 0 to 8) is
   * now a beat of his *turn*. None of the assertions changed; where they are
   * read did.
   */
  const turn = win(CHAIN_JOIN_BEAT, beats);
  /** Half way through that turn, which is where the couple faces out of the set. */
  const facesOut = (CHAIN_JOIN_BEAT + beats) / 2;
  // Each lark's own circle centre, measured rather than recomputed from the
  // figure's own formula: `orbitTurn` puts it `hold / 2` off the lark's place
  // toward the robin's, not at the true midpoint of the two original places
  // (F10's own deviation 4) — so this reads it off three points on his own
  // circle instead of assuming the number. The lark's radius is constant for
  // the whole eight beats (only the robin's opens out), so any three distinct
  // samples of his own track determine it.
  const centre1L = circumcentre(track, "1L", turn.from, turn.to);
  const centre2L = circumcentre(track, "2L", turn.from, turn.to);
  const results = [
    // The pull by crosses right shoulders near the set's own centre, at some
    // point in the four beats the robins have to cross it (M10c).
    passes(track, "1R", "2R", {
      within: CLOSE_PX,
      near: SET_CENTRE,
      nearPx: CENTRE_PX,
      shoulder: "R",
      beatWindow: win(0, CHAIN_JOIN_BEAT),
    }),
    // The lark walks backward at every sample he moves on: an orbit has no
    // separate turn phase the way a rigid pivot does. M10c: he receives her
    // rather than orbiting from beat one, so the samples that count are his
    // turn's.
    walksBackwardThroughout(track, "1L", turn),
    walksBackwardThroughout(track, "2L", turn),
    // He sweeps the whole circle once, about the point between the two places.
    orbitsWholeTurn(track, "1L", centre1L, turn),
    orbitsWholeTurn(track, "2L", centre2L, turn),
    // She joins his orbit at its antipode, at the join beat exactly.
    joinsAtAntipode(track, "1L", "2R", centre1L, CHAIN_JOIN_BEAT),
    joinsAtAntipode(track, "2L", "1R", centre2L, CHAIN_JOIN_BEAT),
    // 2R lands on 1R's place, and the lark she is a couple with there is the
    // one across the set from it — 1L. 1R lands on 2R's place and pairs with
    // 2L. A courtesy turn is with the lark of the place you arrive at, not the
    // nearest lark on the floor.
    handsJoined(track, "1L", "L", "2R", "L", rigid, HAND_TOLERANCE_PX),
    handsJoined(track, "2L", "L", "1R", "L", rigid, HAND_TOLERANCE_PX),
    // From the join she is on his right throughout, and the four hands ride
    // the bodies that carry them, exactly as a rigid pivot's own turn does.
    onHisRightThroughout(track, "1L", "2R", rigid),
    onHisRightThroughout(track, "2L", "1R", rigid),
    handsRideTheBodies(track, "1L", "2R", rigid),
    handsRideTheBodies(track, "2L", "1R", rigid),
    // Both dancers of both couples face out of the set half way through the
    // turn — beat 6 of 8 since M10c, where it was beat 4 while the orbit still
    // spanned the whole figure. A half turn from the take is a half turn from
    // the take whenever the take is.
    facesRelativeToCentre(track, "1L", facesOut, "out"),
    facesRelativeToCentre(track, "2R", facesOut, "out"),
    facesRelativeToCentre(track, "2L", facesOut, "out"),
    facesRelativeToCentre(track, "1R", facesOut, "out"),
    // And both face in again at the end, the robin on the lark's right.
    endsBesideOnTheRight(track, "1L", "2R"),
    endsBesideOnTheRight(track, "2L", "1R"),
    // AC6: the couple turning beside you gets left room.
    clearsEveryone(track, win(rigid.from, 8)),
    // The pull by's own right hands, over the window the figure declares.
    joinedThroughout(track, "1R", "R", "2R", "R", win(0.5, 1.5)),
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
function longLinesChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("long-lines", params);
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
function starChecks(params: CheckParams): FigureChecks {
  const { track: wrist, beats } = figureTrack("star", params);
  // The figure's own take/release window: `WRIST_JOIN_WINDOW`-shaped, but read
  // straight off `star.ts`'s own constants so a change there cannot go stale
  // here.
  const held = holdWindow(beats, STAR_IN_BEATS + 0.4, STAR_OUT_BEATS);
  const wristHeld = win(held.takeTo, held.releaseFrom);
  const { track: across } = figureTrack("star", { ...params, hold: "hands-across" });
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
 * A giving hand stays on the wrist of the dancer ahead of it round the star:
 * `WRIST_ALONG` of the way down that dancer's own giving arm, wherever the two
 * of them actually are at each instant.
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
    const ahead = track.pose(leader, i);
    const target = wristPoint(
      SET_CENTRE,
      track.pose(giver, i).p,
      shouldersAt(ahead.p, ahead.facing)[side],
      ahead.p,
      WRIST_ALONG,
    );
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
function circleChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("circle", params);
  const results = [
    joinedThroughout(track, "1L", "L", "2R", "R", win(1, 7)),
    joinedThroughout(track, "1R", "L", "1L", "R", win(1, 7)),
    joinedThroughout(track, "2L", "L", "1R", "R", win(1, 7)),
    joinedThroughout(track, "2R", "L", "2L", "R", win(1, 7)),
  ];
  return { key: "circle", describe: describeOf("circle"), results };
}

/** An allemande: one joined hand over one spot, never let go of. */
function allemandeChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("allemande", params);
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
function doSiDoChecks(params: CheckParams): FigureChecks {
  const { track, group } = figureTrack("do-si-do", params);
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
function rightAndLeftThroughChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("right-and-left-through", params);
  // Its own default timing: the pass through is 3.5 beats, the couple closes up
  // over the next one, the rigid half turn is beats 4.5 to 6.5, and the last
  // 1.5 beats open out.
  const turn = win(4.5, 6.5);
  const results = [
    passes(track, "1L", "2R", { within: CLOSE_PX, shoulder: "R", beatWindow: win(0.5, 3.5) }),
    walksBackward(track, "1L", turn),
    walksBackward(track, "2L", turn),
    handsJoined(track, "1L", "L", "1R", "L", turn, HAND_TOLERANCE_PX),
    handsJoined(track, "2L", "L", "2R", "L", turn, HAND_TOLERANCE_PX),
    sweepsHalf(track, "1L", "1R", turn),
    sweepsHalf(track, "2L", "2R", turn),
    turnsHalf(track, "1L", "1R", turn),
    turnsHalf(track, "2L", "2R", turn),
    onHisRightThroughout(track, "1L", "1R", turn),
    onHisRightThroughout(track, "2L", "2R", turn),
    handsRideTheBodies(track, "1L", "1R", turn),
    handsRideTheBodies(track, "2L", "2R", turn),
    backsRoundASmallCircle(track, "1L", "1R", turn),
    backsRoundASmallCircle(track, "2L", "2R", turn),
    endsBesideOnTheRight(track, "1L", "1R"),
    endsBesideOnTheRight(track, "2L", "2R"),
    clearsEveryone(track, win(turn.from, 8)),
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
 * Both dancers of a courtesy turn turn a **half** over the turn.
 *
 * The user: "then they pivot around the center point (both walking, lark
 * backwards, robin forwards) to put the robin back on the right." A rigid body
 * has one angular velocity, so this and {@link sweepsHalf} have to agree — and
 * because they are measured separately, a couple that shears instead of
 * pivoting fails one of them and not the other.
 */
function turnsHalf(
  track: Track,
  lark: string,
  robin: string,
  window: BeatWindow,
): TrajectoryResult {
  const label = `${lark} and ${robin} each turn a half between beat ${window.from} and ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
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
 * The couple's own **line** sweeps a half over the turn: the pair pivots rather
 * than spinning on the spot.
 *
 * This is the assertion F5 did not have and could not have had. Its chain's
 * robin arrived on the lark's *left* and left on his right, and a body that
 * turns 180° swaps which of its sides a fixed direction is on, so the line had
 * to sweep nothing at all: the couple span in place. The user's ruling is that
 * the couple pivots as one rigid unit, and a rigid unit's line turns with its
 * bodies. `bearing(lark, robin) − larkFacing` is which side she is on and it
 * changes by `sweep − bodyTurn`, so this passing *and* {@link turnsHalf}
 * passing is exactly {@link onHisRightThroughout} passing.
 */
function sweepsHalf(
  track: Track,
  lark: string,
  robin: string,
  window: BeatWindow,
): TrajectoryResult {
  const label = `the line from ${lark} to ${robin} sweeps a half between beat ${window.from} and ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  const from = bearing(track.pose(lark, first).p, track.pose(robin, first).p);
  const to = bearing(track.pose(lark, last).p, track.pose(robin, last).p);
  const swept = Math.abs(angleDiff(from, to));
  const off = Math.abs(180 - swept);
  const beat = track.beats[last] ?? 0;
  if (off > HALF_TURN_SLACK_DEG) {
    return fail(label, `it sweeps ${swept.toFixed(3)}°, not a half`, beat, off, "deg");
  }
  return {
    label,
    pass: true,
    note: `it sweeps 180.000°, within ${off.toFixed(4)}°`,
    worst: { beat, value: off, unit: "deg" },
  };
}

/**
 * The robin is on the lark's right at **every sample** of the turn, not only at
 * the end.
 *
 * The user: "to put the robin back on the right." A rigid pivot never takes her
 * off it, which is what this measures: the least she is ever to his right, in
 * px, over the whole turn.
 */
function onHisRightThroughout(
  track: Track,
  lark: string,
  robin: string,
  window: BeatWindow,
): TrajectoryResult {
  const label = `${robin} is on ${lark}'s right for the whole turn, beat ${window.from} to ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  let least = Infinity;
  let beat = track.beats[first] ?? 0;
  for (let i = first; i <= last; i++) {
    const him = track.pose(lark, i);
    const right = dirOf(him.facing + 90);
    const her = track.pose(robin, i).p;
    const off = right[0] * (her[0] - him.p[0]) + right[1] * (her[1] - him.p[1]);
    if (off < least) {
      least = off;
      beat = track.beats[i] ?? 0;
    }
  }
  if (least <= 0) {
    return fail(label, `she is ${(-least).toFixed(3)} px to his left`, beat, least, "px");
  }
  return {
    label,
    pass: true,
    note: `she is never less than ${least.toFixed(3)} px to his right`,
    worst: { beat, value: least, unit: "px" },
  };
}

/**
 * Every hand of the hold keeps the same place on the body that carries it, for
 * the whole turn.
 *
 * The user: "the arm basically stay put during the move." Two bodies whose
 * relative pose never changes carry every point they hold with them, so on a
 * rigid pivot each hand's offset — forward and to the right of its own dancer —
 * is a constant. This measures the spread of those four offsets, and the brief
 * asks for 0.05 px.
 */
function handsRideTheBodies(
  track: Track,
  lark: string,
  robin: string,
  window: BeatWindow,
): TrajectoryResult {
  const label = `the four hands of ${lark} and ${robin} stay put on their bodies from beat ${window.from} to ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  let worst = 0;
  let beat = track.beats[first] ?? 0;
  let who = "";
  for (const id of [lark, robin]) {
    for (const side of ["L", "R"] as const) {
      let from: Vec2 | undefined;
      for (let i = first; i <= last; i++) {
        const pose = track.pose(id, i);
        const hand = pose.hands[side];
        if (hand === "down") {
          return fail(label, `${id}'s ${side} hand is down`, track.beats[i] ?? 0, Infinity, "px");
        }
        const ahead = dirOf(pose.facing);
        const right = dirOf(pose.facing + 90);
        const v: Vec2 = [hand.p[0] - pose.p[0], hand.p[1] - pose.p[1]];
        const here: Vec2 = [v[0] * ahead[0] + v[1] * ahead[1], v[0] * right[0] + v[1] * right[1]];
        from ??= here;
        const moved = Math.hypot(here[0] - from[0], here[1] - from[1]);
        if (moved > worst) {
          worst = moved;
          beat = track.beats[i] ?? 0;
          who = `${id}'s ${side}`;
        }
      }
    }
  }
  if (worst > HAND_RIDE_TOLERANCE_PX) {
    return fail(label, `${who} moves ${worst.toFixed(4)} px on the body`, beat, worst, "px");
  }
  return {
    label,
    pass: true,
    note: `no hand moves more than ${worst.toFixed(4)} px on its own body`,
    worst: { beat, value: worst, unit: "px" },
  };
}

/** How far a held hand may wander on the body that carries it, px: the brief's number. */
const HAND_RIDE_TOLERANCE_PX = 0.05;

/**
 * `id` faces away from its own velocity at **every sample** of the window, not
 * only on net.
 *
 * {@link walksBackward} measures the *net* displacement over a window
 * projected on the facing at its midpoint, which is right for a courtesy
 * turn's short pivot but reads a whole circle as standing still — an orbit
 * ends back on its own start, so its net displacement is zero. This measures
 * the thing F10's report actually found: the dot of facing and the unit
 * velocity, sampled throughout, staying negative. Samples where the dancer is
 * nearly still (the orbit's own eased ends) are skipped rather than counted,
 * because a direction is noise once the speed that defines it is gone.
 */
function walksBackwardThroughout(track: Track, id: string, window: BeatWindow): TrajectoryResult {
  const label = `${id} faces away from the way they are walking at every sample from beat ${window.from} to ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  let worst = -1;
  let beat = track.beats[first] ?? 0;
  for (let i = first; i <= last; i++) {
    const v = velocity(track, id, i);
    const speed = Math.hypot(v[0], v[1]);
    if (speed < STILL_SPEED_PX_PER_BEAT) continue;
    const face = dirOf(track.pose(id, i).facing);
    const dot = (face[0] * v[0] + face[1] * v[1]) / speed;
    if (dot > worst) {
      worst = dot;
      beat = track.beats[i] ?? 0;
    }
  }
  if (worst > -BACKWARD_DOT_TOLERANCE) {
    return fail(
      label,
      `facing·velocity reaches ${worst.toFixed(4)} at its worst, not walking backward there`,
      beat,
      worst,
      "dot",
    );
  }
  return {
    label,
    pass: true,
    note: `facing·velocity never rises above ${worst.toFixed(4)}`,
    worst: { beat, value: worst, unit: "dot" },
  };
}

/** Below this floor speed a direction is noise, not evidence, px/beat. */
const STILL_SPEED_PX_PER_BEAT = 0.1;

/** How near `-1` facing·velocity must stay to count as walking dead astern. */
const BACKWARD_DOT_TOLERANCE = 0.99;

/**
 * The centre of the circle through three floor points, by the standard
 * determinant formula.
 */
function circumcentreOf(a: Vec2, b: Vec2, c: Vec2): Vec2 {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const sq = (p: Vec2) => p[0] * p[0] + p[1] * p[1];
  const ux = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
  const uy = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
  return [ux, uy];
}

/**
 * `id`'s own orbit centre, read off three of its own floor points rather than
 * recomputed from the figure's formula — see the note on
 * {@link robinsChainChecks}'s own `centre1L`/`centre2L`. A circle needs three
 * points and the lark's radius is constant for the whole figure, so three
 * samples spread across the window pin it down exactly.
 *
 * **The window matters since M10c.** A chain's lark stands on his place while
 * the robins pull by and turns over the last four beats, so three samples
 * spread across the whole *figure* put two of them on the same stationary
 * point, and three points that are not distinct have no circumcentre at all —
 * the assertion read `NaN°` and passed vacuously. The window handed in is his
 * own turn.
 */
function circumcentre(track: Track, id: string, from: Beat, to: Beat): Vec2 {
  const span = to - from;
  return circumcentreOf(
    track.pose(id, track.indexAt(from)).p,
    track.pose(id, track.indexAt(from + span / 3)).p,
    track.pose(id, track.indexAt(from + (2 * span) / 3)).p,
  );
}

/**
 * `id` sweeps a whole turn about `centre` over the window: the cumulative
 * signed angle from `centre` to `id`'s own floor point totals a full circle.
 *
 * The endpoint facing alone cannot tell a whole turn from no turn at all — a
 * dancer who never moves also "turns" 0° net — so this sums the small signed
 * step between consecutive samples, which is safe at the oracle's own 1/32
 * beat resolution because no single step approaches the ±180° a signed sum
 * would need unwrapping for.
 */
function orbitsWholeTurn(
  track: Track,
  id: string,
  centre: Vec2,
  window: BeatWindow,
): TrajectoryResult {
  const label = `${id} orbits a whole turn about his own circle's centre, beat ${window.from} to ${window.to}`;
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  let total = 0;
  let prev = bearing(centre, track.pose(id, first).p);
  let minR = Infinity;
  let maxR = -Infinity;
  for (let i = first; i <= last; i++) {
    const p = track.pose(id, i).p;
    const r = dist(centre, p);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (i === first) continue;
    const here = bearing(centre, p);
    total += angleDiff(prev, here);
    prev = here;
  }
  const off = Math.abs(Math.abs(total) - 360);
  const beat = track.beats[last] ?? 0;
  if (off > HALF_TURN_SLACK_DEG) {
    return fail(
      label,
      `he sweeps ${total.toFixed(3)}° about it, not a whole turn`,
      beat,
      off,
      "deg",
    );
  }
  return {
    label,
    pass: true,
    note: `he sweeps ${total.toFixed(3)}° about the centre, radius ${minR.toFixed(2)}–${maxR.toFixed(2)} px`,
    worst: { beat, value: off, unit: "deg" },
  };
}

/**
 * `robin` arrives exactly on the antipode of `lark`'s own position on his
 * circle — the point reflection of where he is through `centre` — at `beat`.
 *
 * This is the join itself: the user's "the robin has pulled by and is just
 * about to let go of the other robin... as she does so, the lark is still
 * pivoting backwards around that point, which puts his right hand right about
 * where hers is, because she's basically joining the backwards pivot."
 */
function joinsAtAntipode(
  track: Track,
  lark: string,
  robin: string,
  centre: Vec2,
  beat: Beat,
): TrajectoryResult {
  const label = `${robin} joins ${lark}'s orbit at its antipode, beat ${beat}`;
  const i = track.indexAt(beat);
  const larkP = track.pose(lark, i).p;
  const robinP = track.pose(robin, i).p;
  const antipode: Vec2 = [2 * centre[0] - larkP[0], 2 * centre[1] - larkP[1]];
  const off = dist(antipode, robinP);
  if (off > HAND_TOLERANCE_PX) {
    return fail(label, `she is ${off.toFixed(3)} px from his antipode there`, beat, off, "px");
  }
  return {
    label,
    pass: true,
    note: `she is ${off.toFixed(4)} px from his antipode, within ${HAND_TOLERANCE_PX} px`,
    worst: { beat, value: off, unit: "px" },
  };
}

/**
 * `id` faces `which` the set's own centre at `beat`: the dot of their facing
 * with the radial direction from {@link SET_CENTRE} to where they stand.
 *
 * Used for "both face out of the set at the halfway point" — {@link
 * endsBesideOnTheRight} already makes the same measurement, inward, for the
 * figure's last frame.
 */
function facesRelativeToCentre(
  track: Track,
  id: string,
  beat: Beat,
  which: "in" | "out",
): TrajectoryResult {
  const label = `${id} faces ${which} of the set at beat ${beat}`;
  const i = track.indexAt(beat);
  const pose = track.pose(id, i);
  const look = dirOf(pose.facing);
  const radial: Vec2 = [pose.p[0] - SET_CENTRE[0], pose.p[1] - SET_CENTRE[1]];
  const dot = look[0] * radial[0] + look[1] * radial[1];
  const value = which === "out" ? dot : -dot;
  if (value <= 0) {
    const other = which === "out" ? "in" : "out";
    return fail(
      label,
      `facing ${(-value).toFixed(3)} px ${other} of the set instead`,
      beat,
      value,
      "px",
    );
  }
  return {
    label,
    pass: true,
    note: `facing ${value.toFixed(2)} px ${which} of the set`,
    worst: { beat, value, unit: "px" },
  };
}

/**
 * The pivot sits **near the lark**: he backs round a circle smaller than the
 * couple's own hold spacing while she walks the big arc round him.
 *
 * The user, asked where the courtesy turn's pivot sits: "I think its near the
 * lark, but its a little hard for me to imagine without doing the dance with 4
 * people." Near the lark is not a distance, so this measures the two things
 * that are true at every distance the user could mean and false at the one they
 * corrected — F7's pivot midway between the two bodies, where the two of them
 * walk the same arc and his is 18.06 px long.
 *
 * `HOLD_SPACING_PX` is the yardstick because it is the library's own number for
 * how far apart two dancers stand to take hands: a lark who walks further than
 * that to turn a robin has left his place, and the whole point of the ruling is
 * that he does not.
 */
function backsRoundASmallCircle(
  track: Track,
  lark: string,
  robin: string,
  window: BeatWindow,
): TrajectoryResult {
  const label = `${lark} backs round a circle smaller than a hold spacing while ${robin} walks the arc, beat ${window.from} to ${window.to}`;
  const his = walked(track, lark, window);
  const hers = walked(track, robin, window);
  const beat = window.to;
  if (his > HOLD_SPACING_PX) {
    return fail(label, `he walks ${his.toFixed(2)} px round the pivot`, beat, his, "px");
  }
  if (his > hers) {
    return fail(
      label,
      `he walks ${his.toFixed(2)} px and she walks ${hers.toFixed(2)}, so the pivot is nearer her`,
      beat,
      his - hers,
      "px",
    );
  }
  return {
    label,
    pass: true,
    note: `he walks ${his.toFixed(2)} px of circle — under the ${HOLD_SPACING_PX} px hold spacing — and she walks ${hers.toFixed(2)} px of arc`,
    worst: { beat, value: his, unit: "px" },
  };
}

/** How far one dancer's feet travel over a window, px. */
function walked(track: Track, id: string, window: BeatWindow): number {
  const first = track.indexAt(window.from);
  const last = track.indexAt(window.to);
  let sum = 0;
  for (let i = first + 1; i <= last; i++) {
    sum += dist(track.pose(id, i - 1).p, track.pose(id, i).p);
  }
  return sum;
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
function petronellaChecks(params: CheckParams): FigureChecks {
  const { track, group } = figureTrack("petronella", params);
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
function balanceChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("balance", params);
  const results = [
    handsJoined(track, "1L", "L", "2R", "R", win(1.5, 4)),
    handsJoined(track, "1L", "R", "2R", "L", win(1.5, 4)),
    staysOnPlace(track, "1L", win(1.5, 4), 3),
  ];
  return { key: "balance", describe: describeOf("balance"), results };
}

/** A swing: the outside hands are one point, held for the whole turn. */
function swingChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("swing", params);
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
function balanceAndSwingChecks(params: CheckParams): FigureChecks {
  const { track } = figureTrack("balance-and-swing", { ...params, pairs: "neighbors", beats: 16 });
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
