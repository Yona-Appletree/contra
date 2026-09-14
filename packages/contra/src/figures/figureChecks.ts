import type { Beat, Vec2 } from "@caller/core";
import { HOLD_SPACING_PX, SEAM_BEATS, easeSeam, seamProgress } from "@caller/core";
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
  staysOnPlace,
  walksBackward,
  withDefaults,
} from "@caller/choreo";
import type { ContraFigure, ContraParams } from "./ContraFigure.js";
import { planContext, worldSpot } from "./ContraFigure.js";
import type { ContraCall } from "./chain.js";
import { chainCalls } from "./chain.js";
import { CONTRA_FIGURES } from "./registry.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";

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
  const results = [
    passes(track, "1R", "2R", {
      within: CLOSE_PX,
      near: SET_CENTRE,
      nearPx: CENTRE_PX,
      shoulder: "R",
      beatWindow: win(1, 4),
    }),
    walksBackward(track, "1L", win(6.3, 7.4)),
    walksBackward(track, "2L", win(6.3, 7.4)),
    // 2R lands on 1R's place, and the lark she is a couple with there is the
    // one across the set from it — 1L. 1R lands on 2R's place and pairs with
    // 2L. A courtesy turn is with the lark of the place you arrive at, not the
    // nearest lark on the floor.
    handsJoined(track, "1L", "L", "2R", "L", win(6.3, 7.4)),
    handsJoined(track, "2L", "L", "1R", "L", win(6.3, 7.4)),
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

/** A star: the giving hands are one point in the middle, held the whole way. */
function starChecks(): FigureChecks {
  const { track } = figureTrack("star");
  // A star is *one* hold in the middle: all four right hands on one point, not
  // two pairs of hands near one another.
  const held = joinWindow(track, "1R", "R", "2R", "R") ?? win(1, 7);
  const results = [
    joinedThroughout(track, "1R", "R", "2R", "R", held),
    joinedThroughout(track, "1L", "R", "2L", "R", held),
    handsJoined(track, "1L", "R", "1R", "R", held),
  ];
  return { key: "star", describe: describeOf("star"), results };
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
  const results = [
    passes(track, "1L", "2R", { within: CLOSE_PX, shoulder: "R", beatWindow: win(0.5, 3.5) }),
    walksBackward(track, "1L", win(4.5, 7)),
    walksBackward(track, "2L", win(4.5, 7)),
    handsJoined(track, "1L", "L", "1R", "L", win(5, 7)),
  ];
  return { key: "right-and-left-through", describe: describeOf("right-and-left-through"), results };
}

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
