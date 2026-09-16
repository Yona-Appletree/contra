import type { Angle, Vec2 } from "@caller/choreo";
import type {
  CoupleState,
  DancerId,
  Formation,
  Frame,
  GroupKind,
  GroupPlan,
  GroupSelector,
  LineUpShift,
  RoleName,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "@caller/choreo";
import {
  HANDS_FOUR_CALLS,
  HANDS_FOUR_GROUP,
  HOLD_SPACING_PX,
  frame,
  framePoint,
  localAngle,
  localPoint,
  reverseFrame,
  stationPose,
} from "@caller/choreo";
import { CONTRA_ROLES } from "../roles.js";
import type { Relation, RelationTable } from "../set/relations.js";
import type { DancerState, SetLattice, Slot } from "../set/SetModel.js";
import type { LatticeSpan } from "../set/span.js";
import { ACROSS_PX, PLACE_PITCH_PX, partnerSide } from "./dupleImproper.js";
import type { ShadowPart } from "./shadowSeam.js";
import { partitionShadowSeams } from "./shadowSeam.js";

/**
 * Becket: partners stand side by side in a line, facing the couple across the
 * set, and progress by sliding to their own left to a new couple.
 *
 * Two lines the same width apart as duple improper, with the couples along each
 * line {@link COUPLE_PITCH_PX} apart, so adjacent dancers are the same
 * {@link PLACE_PITCH_PX} apart as in a duple line.
 *
 * ## The shift is **half a couple width per line** (FR-C2, DD54)
 *
 * The user's own words, reasoning it through from Butter: *"the progression is
 * shift left. everyone shifts one place to the left and then the people who
 * were on your left diagonal are your new neighbors... but... wait. its really
 * shift half-way, isn't it?"* — yes. A becket line slides **one dancer
 * position**, {@link PLACE_PITCH_PX}, not one couple place; the two lines face
 * opposite ways, so they pass each other exactly **one couple width** a time
 * through and the couple that was on your diagonal is the couple you now face.
 *
 * A couple therefore straddles the old couple grid on every other time through,
 * which is why {@link CoupleState.place} is a **half-integer** for a becket set
 * half the time: line 0 slides to `place − 0.5` and line 1 to `place + 0.5`, and
 * the two meet again on a shared place because they moved toward each other.
 * Everything that reads a place — the group frames, the hall's seating,
 * `lineUpShiftOf` — multiplies by {@link COUPLE_PITCH_PX} and does not care
 * whether the number is whole.
 *
 * Until FR-C2 each line slid a whole couple place, so the lines passed each
 * other **two** couple widths a time through. Measured (A-meas, 2026-09-15),
 * that partitions an even hall permanently into two interleaved sets that never
 * meet — which is real, but it is what a **double** progression does, not a
 * single one. The user again: *"in double progression dances, even numbered sets
 * have this parity thing where there's actually two independent sets that are
 * interwoven but never interact. callers usually point this out and suggest odd
 * numbered lines."* `becketMeeting.test.ts` is that sentence as a table.
 *
 * ## The ends
 *
 * With a half-width shift a becket set has **exactly duple improper's** end
 * effects, because the relative motion is the same one couple place a time
 * through. Both lines start on the same couple places and every couple dances
 * (an even hall); a time through later the two grids are half a place out of
 * step, the couple at each end has nobody across from it and stands out; a time
 * through after that the grids line up again and the two couples that stood out
 * have crossed the set and come back in on the other line. An odd hall has one
 * line a couple longer, so exactly one couple is out every time through and it
 * is the other end each time.
 *
 * A couple standing out is at a **half** place beyond the last dancing one, and
 * it crosses to `place + direction / 2` on the other line — the same half width
 * everybody else slides, taken across the set instead of along it. That crossing
 * is `wait-out`'s `'mirror'`: every dancer walks to the point opposite their own
 * through the wait frame's centre, which sits half way between where they stand
 * and where they are going, so the same built-in figure does becket's end effect
 * and duple improper's.
 *
 * **Nothing crosses straight over any more.** S2's odd-line model needed a
 * couple to cross with no time out because a whole-place slide left an odd line
 * one couple short of two waiting places; a half-place slide never does, and
 * `crossedOver` is now a mechanism the formation never sets (`slide-left` keeps
 * it for a formation that does).
 *
 * ### Six couples, worked
 *
 * Line `A` (`direction: 1`, sliding toward the top) holds `c0 c2 c4` and line
 * `B` (`direction: -1`) holds `c1 c3 c5`, both on places 0, 1, 2.
 *
 * | time through | the fours (place: A, B) | out |
 * | --- | --- | --- |
 * | 1 | 0: c0 c1 · 1: c2 c3 · 2: c4 c5 | — |
 * | 2 | 0.5: c2 c1 · 1.5: c4 c3 | **c0** at −0.5 (top), **c5** at 2.5 (bottom) |
 * | 3 | 0: c2 c0 · 1: c4 c1 · 2: c5 c3 | — |
 *
 * Read time 1 → 2: everybody on line `A` slides half a place toward the top and
 * everybody on `B` half a place toward the bottom, so `c0` runs past the top of
 * the set and `c5` past the bottom and the other four re-pair one couple along.
 * Read 2 → 3: the four dancing couples slide another half place, `c0` crosses on
 * to line `B` at place 0 and `c5` on to line `A` at place 2.
 */
export const COUPLE_PITCH_PX = PLACE_PITCH_PX * 2;

const HALF_ACROSS = ACROSS_PX / 2;
const HALF_COUPLE = PLACE_PITCH_PX / 2;

/**
 * How far this formation's own progression slides one line, in couple places:
 * **half a couple width**, one dancer position, {@link PLACE_PITCH_PX} on the
 * floor (FR-C2, DD54). The two lines slide opposite ways, so they pass each
 * other one whole couple width a time through.
 */
export const BECKET_SHIFT_PLACES = 0.5;

/**
 * How far down the hall a becket set's frame sits from the point a hall hands
 * it, px: one waiting position plus half a place, which is where the topmost
 * dancer of the set ever stands.
 *
 * The topmost dancer is the lark of the couple standing out beyond the top,
 * which is at position `−1` on the times through when there is one — dancing
 * place `−0.5`, half a couple width above the first dancing place. So the set's
 * whole reach begins at the point the hall handed it, exactly as a duple
 * improper line's does, and the line breathes half a couple place either way as
 * the two grids fall in and out of step.
 *
 * **The same for both parities**, which is what keeps a hall's lines dancing in
 * step with each other.
 */
export const BECKET_TOP_OFFSET_PX = PLACE_PITCH_PX + HALF_COUPLE;

/**
 * What the caller says between two dances to get a hall standing in becket.
 *
 * The same words as every other formation: a becket hall lines up **improper**
 * and takes hands four like anybody else. What is different is what happens
 * next, which is {@link becketHandsFourCalls}.
 */
export const BECKET_LINE_UP_CALLS: readonly string[] = HANDS_FOUR_CALLS;

/**
 * What the caller says while a becket hall walks to its places and takes hands
 * four — the user's own three sentences, word for word:
 *
 * > "if its becket, you still line up improper, but the caller will say 'move
 * > one place to the left. this is a becket dance. your partner should be on
 * > the side of the set with you.'"
 *
 * A becket line is a duple improper line that every hands-four ring has turned
 * a quarter out of: you take hands four the ordinary way, the ring moves one
 * place round, and that leaves your partner beside you and a new couple across
 * the set.
 *
 * **Which way round is not written here.** The user again: "_technically_ if
 * its a right-progressing becket dance, you should move one place _to the
 * right_ … it means you progress the 'wrong' way from the direction you were
 * facing when you took hands four." So the direction is the one
 * `@caller/choreo`'s `lineUpShiftOf` measures off this formation's own
 * progression, and a becket that progresses the other way says "RIGHT" without
 * anybody editing a string.
 *
 * Three short bubbles rather than one long one, because the caller's bubble is
 * sixteen columns wide (DD16).
 */
export const becketHandsFourCalls = (shift: LineUpShift): readonly string[] => {
  if (shift === null) return [];
  return [
    `MOVE ONE PLACE TO YOUR ${shift === "left" ? "LEFT" : "RIGHT"}`,
    "THIS IS A BECKET DANCE",
    "YOUR PARTNER IS ON THE SIDE OF THE SET WITH YOU",
  ];
};

/** Facing across the set, in frame-local degrees; the `+1` line faces this way. */
const ACROSS = 0;
/** The other way across, for the `-1` line. */
const BACK = 180;

/**
 * The four stations of a becket minor set: the `+1` couple on the `−x` line,
 * the `-1` couple on the `+x` line, each with its robin on its lark's right.
 */
export const BECKET_STATIONS: readonly Station[] = [
  { id: "1L", role: "lark", facing: ACROSS, p: [-HALF_ACROSS, -HALF_COUPLE] },
  { id: "1R", role: "robin", facing: ACROSS, p: [-HALF_ACROSS, HALF_COUPLE] },
  { id: "2L", role: "lark", facing: BACK, p: [HALF_ACROSS, HALF_COUPLE] },
  { id: "2R", role: "robin", facing: BACK, p: [HALF_ACROSS, -HALF_COUPLE] },
];

/**
 * The two stations of a couple on a waiting place, in a frame centred halfway
 * between that place and the place it comes back in on. `wait-out`'s `'mirror'`
 * sends each dancer to the opposite point, which is their station on the other
 * line, **half** a couple place along (FR-C2).
 *
 * The frame's centre is `place + direction / 4` — the midpoint of a half-place
 * step — and the two stations sit at `−PLACE_PITCH_PX` and `0` from it rather
 * than symmetrically either side, because the couple's two dancers do not cross
 * symmetrically: the robin's landing on the other line is straight across from
 * where she waits, and the lark's is two positions along. That is the same
 * asymmetry the couple's own role order has (the robin leads on one line and the
 * lark on the other), reflected through one point, which is what makes the
 * mirror a mirror.
 */
export const BECKET_WAIT_STATIONS: readonly Station[] = becketWaitStations(-1);

/**
 * {@link BECKET_WAIT_STATIONS} for a becket whose lines slide `step` positions
 * per unit of travel: `-1` for an ordinary becket, `+1` for `becket-right`.
 *
 * The dancer nearer the end of the set is the one who crosses two positions
 * along and the other stays where they are, and which role that is depends on
 * which line the waiting couple is on — which is the slide's sign. So the two
 * stations are the same pair of points a place apart, hung one place the other
 * way round. Both ends of a set of either handedness share one layout, because
 * the wait frame is turned end for end for a couple on line 1.
 */
export function becketWaitStations(step: 1 | -1): readonly Station[] {
  return [
    {
      id: "WL",
      role: "lark",
      facing: ACROSS,
      p: [-HALF_ACROSS, ((step - 1) / 2) * PLACE_PITCH_PX],
    },
    {
      id: "WR",
      role: "robin",
      facing: ACROSS,
      p: [-HALF_ACROSS, ((step + 1) / 2) * PLACE_PITCH_PX],
    },
  ];
}

/**
 * Where everybody stands at beat 0 of a becket dance that **shifts left in its
 * own first figure**, in each group's own frame-local px.
 *
 * A becket dance that progresses early — Butter, Tika Tika Timing, A-1 Reel —
 * dances the body of the time through with the couple it shifted *to*, so the
 * minor set the decider plans is the one the shift makes and every dancer
 * begins **half** a couple place back along their own line (FR-C2; it was a
 * whole one while the model slid a whole one). That is `−0.5` place for the
 * line that slides toward `-y` (stations `1L`/`1R`, so their start is one
 * {@link PLACE_PITCH_PX} further along `+y`) and `+0.5` for the line that slides
 * the other way.
 *
 * The waiting couple is in it too, and with the same sign at both ends of the
 * set: the bottom end's group frame is turned end for end, so "one place back
 * along my own line" is `+y` in both wait frames. It slides off the end of the
 * line with everybody else, which is exactly what a real end couple does.
 *
 * This is `Dance.startPlaces` for such a dance, and `contraDance` threads the
 * four dancing places into the first figure's `from`.
 */
export const BECKET_BEFORE_SLIDE: Record<StationId, { p: Vec2; facing: Angle }> =
  Object.fromEntries(
    [...BECKET_STATIONS, ...BECKET_WAIT_STATIONS].map((s) => [
      s.id,
      {
        p: [s.p[0], s.p[1] + (s.id === "2L" || s.id === "2R" ? -1 : 1) * PLACE_PITCH_PX] as Vec2,
        facing: s.facing,
      },
    ]),
  );

/**
 * The `"shadow-pair"` seam group's four stations (M2, D7), for becket.
 *
 * The near couple (`direction: -1`, always `"shadowSeam.ts"`'s near half of
 * a seam) is shaped exactly like `BECKET_STATIONS`' own `"2"` couple —
 * becket's shadow is on the *same line* the seam-adjacent couple already
 * stands on, since becket (unlike duple improper) never alternates lark and
 * robin by line — and the far couple (`direction: 1`) like its `"1"`. This is
 * literally the same four-station shape as an ordinary becket minor set,
 * just centred on the seam between two different ones instead of on one.
 */
const SHADOW_SEAM_STATIONS: readonly Station[] = [
  { id: "NL", role: "lark", facing: BACK, p: [HALF_ACROSS, HALF_COUPLE] },
  { id: "NR", role: "robin", facing: BACK, p: [HALF_ACROSS, -HALF_COUPLE] },
  { id: "FL", role: "lark", facing: ACROSS, p: [-HALF_ACROSS, -HALF_COUPLE] },
  { id: "FR", role: "robin", facing: ACROSS, p: [-HALF_ACROSS, HALF_COUPLE] },
];

/** A true end's own two stations — nobody on the far side of this seam. */
const SHADOW_END_STATIONS: readonly Station[] = [
  { id: "NL", role: "lark", facing: ACROSS, p: [-HALF_ACROSS, -HALF_COUPLE] },
  { id: "NR", role: "robin", facing: ACROSS, p: [-HALF_ACROSS, HALF_COUPLE] },
];

/** One `"shadow-pair"` seam group, or a true end's smaller element. */
function shadowGroupPlan(set: SetState, part: ShadowPart): GroupPlan {
  if (part.kind === "end") {
    const couple = part.near;
    return {
      id: `${set.id}/shadow-end${couple.place}`,
      kind: "set",
      frame: at(set, couple.place),
      stations: SHADOW_END_STATIONS.map((s) => ({ ...s })),
      members: { NL: dancerOn(couple, "lark"), NR: dancerOn(couple, "robin") },
      couples: [couple.id],
    };
  }
  const { near, far } = part;
  return {
    id: `${set.id}/shadow${near.place}`,
    kind: "set",
    frame: at(set, (near.place + far.place) / 2),
    stations: SHADOW_SEAM_STATIONS.map((s) => ({ ...s })),
    members: {
      NL: dancerOn(near, "lark"),
      NR: dancerOn(near, "robin"),
      FL: dancerOn(far, "lark"),
      FR: dancerOn(far, "robin"),
    },
    couples: [near.id, far.id],
  };
}

/**
 * A dancing place's four stations, with {@link Station.crossedOver} set on
 * whichever couple's two got here by crossing the set rather than sliding
 * along it. `a` is the `+1` couple (stations `1L`/`1R`), `b` the `-1`
 * (`2L`/`2R`); only an odd line ever has either flag set.
 */
function dancingStations(a: CoupleState, b: CoupleState): Station[] {
  return BECKET_STATIONS.map((s) => {
    const crossed = s.id.startsWith("1") ? a.crossedOver : b.crossedOver;
    return crossed === true ? { ...s, crossedOver: true } : { ...s };
  });
}

/** One part of a becket set for one time through. */
interface Part {
  kind: GroupKind;
  couples: CoupleState[];
}

/**
 * Which end of the set a becket couple with nowhere to slide is standing out at.
 *
 * Its own slide direction says so: a couple slides `-step × direction` half
 * places a time through, so the couple that has run past the top of the set is
 * the one whose travel takes it that way. For an ordinary (left-progressing)
 * becket that is the `+1` line at the top and the `-1` line at the bottom, and
 * for `becket-right` it is the other way round — one expression, because the one
 * thing that differs between the two formations is the sign of the slide.
 */
const waitKindOf = (couple: CoupleState, step: 1 | -1): GroupKind =>
  couple.direction * step === -1 ? "wait-top" : "wait-bottom";

/**
 * Group the couples at each place: two facing each other, or one waiting.
 *
 * `step` is the formation's own slide sign and only reaches
 * {@link waitKindOf} — which end a couple standing out is at.
 */
export function partitionBecket(set: SetState, step: 1 | -1 = -1): Part[] {
  const byPlace = new Map<number, CoupleState[]>();
  for (const couple of set.couples) {
    const list = byPlace.get(couple.place) ?? [];
    list.push(couple);
    byPlace.set(couple.place, list);
  }
  const parts: Part[] = [];
  for (const place of [...byPlace.keys()].sort((a, b) => a - b)) {
    const here = byPlace.get(place)!;
    if (here.length === 1) {
      parts.push({ kind: waitKindOf(here[0]!, step), couples: here });
      continue;
    }
    if (here.length !== 2) {
      throw new Error(`becket place ${place} holds ${here.length} couples, not one or two`);
    }
    const ordered = [...here].sort((a, b) => b.direction - a.direction);
    if (ordered[0]!.direction !== 1 || ordered[1]!.direction !== -1) {
      throw new Error(`becket place ${place} has two couples in the same line`);
    }
    parts.push({ kind: "set", couples: ordered });
  }
  return parts;
}

const dancerOn = (couple: CoupleState, role: string): DancerId => {
  const dancer = couple.dancers[role];
  if (dancer === undefined) throw new Error(`couple "${couple.id}" has no ${role}`);
  return dancer;
};

const at = (set: SetState, place: number): Frame =>
  frame(framePoint(set.frame, [0, place * set.pitch]), set.frame.axis, set.frame.spacing);

/**
 * The place a waiting couple's crossing is mirrored through: half way along the
 * half-place step it takes to come back in on the other line, so `place ∓
 * direction / 4` (FR-C2 — it was `place + direction / 2` while the step was a
 * whole couple place).
 */
const waitCentre = (couple: CoupleState, step: 1 | -1): number =>
  couple.place - (step * couple.direction * BECKET_SHIFT_PLACES) / 2;

/**
 * A true-end waiting couple's two stations, re-expressed in `into`'s own
 * frame and suffixed `"top"`/`"bottom"`. See `dupleImproper.ts`'s own
 * `widenedWaitStations`, the same idea: reuse the plain wait `GroupPlan`'s
 * own frame and convert its stations' world poses with `localPoint`/
 * `localAngle` rather than re-deriving becket's own (more involved,
 * {@link waitCentre}-centred) wait geometry a second time.
 */
function widenedWaitStations(
  set: SetState,
  couple: CoupleState,
  into: Frame,
  step: 1 | -1,
): { stations: Station[]; members: Record<StationId, DancerId> } {
  const base = at(set, waitCentre(couple, step));
  const waitFrame = couple.direction === 1 ? base : reverseFrame(base);
  const suffix = waitKindOf(couple, step) === "wait-top" ? "top" : "bottom";
  const stations = becketWaitStations(step).map((s) => {
    const world = stationPose(waitFrame, s);
    return {
      id: `${s.id}-${suffix}`,
      role: s.role,
      p: localPoint(into, world.p),
      facing: localAngle(into, world.facing),
    };
  });
  const members: Record<StationId, DancerId> = {
    [`WL-${suffix}`]: dancerOn(couple, "lark"),
    [`WR-${suffix}`]: dancerOn(couple, "robin"),
  };
  return { stations, members };
}

/**
 * `groupsFor("line", set)` for becket: each dancing place's own four
 * stations, widened only at a true end — only there — to fold in the one
 * waiting couple immediately beyond it.
 *
 * An odd set has one waiting couple, beyond the bottom, and an even set one at
 * each end, so there is never a second waiting place for the widening to skip
 * past. (M2 reported that shape as unexercised; S2's odd-line model removes it
 * altogether. The catch-all loop below is kept for a hand-built set, which the
 * partition must still be total over.)
 */
function lineGroupsFor(set: SetState, step: 1 | -1): GroupPlan[] {
  const parts = partitionBecket(set, step);
  const setIdx = parts.map((p, i) => (p.kind === "set" ? i : -1)).filter((i) => i >= 0);
  const firstIdx = setIdx[0];
  const lastIdx = setIdx[setIdx.length - 1];
  const plans: GroupPlan[] = [];
  // The one wait part immediately adjacent to the first/last dancing place.
  // A set this formation builds has at most one at each end, so this is every
  // wait part; a hand-built set with more falls through to the catch-all below.
  const topAdjacent = firstIdx !== undefined && firstIdx > 0 ? parts[firstIdx - 1] : undefined;
  const bottomAdjacent =
    lastIdx !== undefined && lastIdx < parts.length - 1 ? parts[lastIdx + 1] : undefined;
  const widened = new Set<Part>();
  parts.forEach((part, i) => {
    if (part.kind !== "set") return;
    const [a, b] = part.couples as [CoupleState, CoupleState];
    const dancingFrame = at(set, a.place);
    const stations: Station[] = dancingStations(a, b);
    const members: Record<StationId, DancerId> = {
      "1L": dancerOn(a, "lark"),
      "1R": dancerOn(a, "robin"),
      "2L": dancerOn(b, "lark"),
      "2R": dancerOn(b, "robin"),
    };
    const couples = [a.id, b.id];
    if (i === firstIdx && topAdjacent && topAdjacent.kind !== "set") {
      const w = widenedWaitStations(set, topAdjacent.couples[0]!, dancingFrame, step);
      stations.push(...w.stations);
      Object.assign(members, w.members);
      couples.push(topAdjacent.couples[0]!.id);
      widened.add(topAdjacent);
    }
    if (i === lastIdx && bottomAdjacent && bottomAdjacent.kind !== "set") {
      const w = widenedWaitStations(set, bottomAdjacent.couples[0]!, dancingFrame, step);
      stations.push(...w.stations);
      Object.assign(members, w.members);
      couples.push(bottomAdjacent.couples[0]!.id);
      widened.add(bottomAdjacent);
    }
    plans.push({
      id: `${set.id}/line${a.place}`,
      kind: "set",
      frame: dancingFrame,
      stations,
      members,
      couples,
    });
  });
  // Any wait-kind part the widening above did not absorb still needs its own
  // (unwidened) place in the partition — `"line"` never returns a `"wait-*"`
  // kind, so this is a plain `kind: "set"` two-station element, the same
  // shape `"shadow-pair"`'s own true ends use.
  for (const part of parts) {
    if (part.kind === "set" || widened.has(part)) continue;
    const couple = part.couples[0]!;
    const base = at(set, waitCentre(couple, step));
    plans.push({
      id: `${set.id}/line-end${couple.place}`,
      kind: "set",
      frame: couple.direction === 1 ? base : reverseFrame(base),
      stations: becketWaitStations(step).map((s) => ({ ...s })),
      members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
      couples: [couple.id],
    });
  }
  return plans;
}

/** Becket, and the second formation the demo's dances may be written in. */
export const BECKET: Formation = becketFormation("becket", -1);

/**
 * A becket formation, with the sign of its slide as the one parameter.
 *
 * `step` is {@link SetLattice.progressionStep}: `-1` for an ordinary
 * left-progressing becket and `+1` for `becket-right` (`becketRight.ts`). It
 * reaches exactly three things — which way a dancing couple slides, which end a
 * couple standing out is at, and which way round the two wait stations hang —
 * and everything else about the two formations is one body of code, which is
 * what stops the right-progressing branch being a branch nothing exercises.
 */
export function becketFormation(id: string, step: 1 | -1): Formation {
  return {
    id,
    roleSet: CONTRA_ROLES,
    lineUpCalls: BECKET_LINE_UP_CALLS,
    handsFourCalls: becketHandsFourCalls,
    // A minor set's two couples share one place; the slide moves a couple
    // exactly one place, `COUPLE_PITCH_PX`, so that is the along-hall period
    // (T6) — unlike duple improper, whose minor set spans two places.
    hallPitch: COUPLE_PITCH_PX,

    group(n: number): Station[] {
      if (n === 4) return BECKET_STATIONS.map((s) => ({ ...s }));
      if (n === 2) return becketWaitStations(step).map((s) => ({ ...s }));
      throw new Error(`becket dances in fours, or waits in twos, not ${n}`);
    },

    groupFor(selector: GroupSelector): Station[] {
      if (selector === SHADOW_PAIR_GROUP) return SHADOW_SEAM_STATIONS.map((s) => ({ ...s }));
      if (selector === LINE_GROUP) {
        // The plain four-station shape, not the widest six-station one — see
        // duple improper's own `groupFor("line")` note; no dance calls `"line"`
        // in this milestone, so nothing threads a dance's `from` against it.
        return BECKET_STATIONS.map((s) => ({ ...s }));
      }
      onlyHandsFour(selector);
      return BECKET_STATIONS.map((s) => ({ ...s }));
    },

    groupsFor(selector: GroupSelector, set: SetState): GroupPlan[] {
      if (selector === SHADOW_PAIR_GROUP) {
        return partitionShadowSeams(set).map((part) => shadowGroupPlan(set, part));
      }
      if (selector === LINE_GROUP) return lineGroupsFor(set, step);
      onlyHandsFour(selector);
      return partitionBecket(set, step).map((part): GroupPlan => {
        if (part.kind === "set") {
          const [a, b] = part.couples as [CoupleState, CoupleState];
          return {
            id: `${set.id}/p${a.place}`,
            kind: "set",
            frame: at(set, a.place),
            stations: dancingStations(a, b),
            members: {
              "1L": dancerOn(a, "lark"),
              "1R": dancerOn(a, "robin"),
              "2L": dancerOn(b, "lark"),
              "2R": dancerOn(b, "robin"),
            },
            couples: [a.id, b.id],
          };
        }
        const couple = part.couples[0]!;
        // Halfway between the waiting place and the place it comes back in on.
        const base = at(set, waitCentre(couple, step));
        return {
          id: `${set.id}/w${couple.place}`,
          kind: part.kind,
          frame: couple.direction === 1 ? base : reverseFrame(base),
          stations: becketWaitStations(step).map((s) => ({ ...s })),
          members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
          couples: [couple.id],
        };
      });
    },

    progression: {
      /**
       * One time through: **half a couple place** each way (FR-C2, DD54).
       *
       * A couple that is dancing slides half a place to its own left — for an
       * ordinary becket the `+1` line toward `-y`, the other back — and lands
       * facing the couple that was on its diagonal, because that couple slid half
       * a place the other way. A couple that is *standing out* has already run
       * past the end of its own line, so it crosses the set: the same half place,
       * taken across instead of along, which puts it on the other line facing the
       * couple that has just slid into the place opposite. Nobody ever slides past
       * the end of the set, so there is no third case and nothing is marked
       * `crossedOver`.
       */
      next(set: SetState): SetState {
        const couples: CoupleState[] = [];
        for (const part of partitionBecket(set, step)) {
          if (part.kind === "set") {
            for (const couple of part.couples) {
              couples.push({
                ...couple,
                place: couple.place + step * couple.direction * BECKET_SHIFT_PLACES,
                crossedOver: false,
              });
            }
          } else {
            const couple = part.couples[0]!;
            couples.push({
              ...couple,
              place: couple.place - step * couple.direction * BECKET_SHIFT_PLACES,
              direction: couple.direction === 1 ? -1 : 1,
              crossedOver: false,
            });
          }
        }
        return { ...set, couples: couples.sort((a, b) => a.place - b.place) };
      },
    },

    start(spec: SetSpec): SetState {
      if (spec.couples < 4) {
        throw new Error(`a becket set needs at least four couples, not ${spec.couples}`);
      }
      // Both lines start on the same couple places, which is where a hall that has
      // taken hands four and moved one place round is standing: every couple has a
      // couple across from it and nobody is out. An odd hall cannot do that, so the
      // spare couple goes on whichever line runs out at the **bottom** — a hall
      // takes hands four from the top, so the couple left over is the one at the
      // bottom. A time through later the two grids are half a place out of step and
      // the couple at each end is the one standing out; see this file's header for
      // the six-couple table.
      const shortLine = Math.floor(spec.couples / 2);
      const longLine = spec.couples - shortLine;
      /** The line the spare couple of an odd hall goes on: the one out at the bottom. */
      const spare: 1 | -1 = step === -1 ? -1 : 1;
      const couples: CoupleState[] = [];
      let i = 0;
      const add = (place: number, direction: 1 | -1): void => {
        couples.push({
          id: `${spec.id}/c${i}`,
          dancers: { lark: `${spec.id}/c${i}/lark`, robin: `${spec.id}/c${i}/robin` },
          place,
          direction,
        });
        i += 1;
      };
      for (let place = 0; place < longLine; place++) {
        if (spare === -1) {
          if (place < shortLine) add(place, 1);
          add(place, -1);
        } else {
          add(place, 1);
          if (place < shortLine) add(place, -1);
        }
      }
      return {
        id: spec.id,
        // `spec.centre` is where the *first* dancer of a line stands — that is what
        // it means for a duple improper set, and a hall hands the same point to
        // both formations. The topmost dancer a becket set ever has is the lark of
        // a couple standing out beyond the top, at position `-1`, so the frame sits
        // one waiting position plus half a place down the hall from it and the two
        // formations lay their lines out from the same place — see
        // {@link BECKET_TOP_OFFSET_PX}.
        frame: frame(
          framePoint(frame(spec.centre, spec.axis, HOLD_SPACING_PX), [0, BECKET_TOP_OFFSET_PX]),
          spec.axis,
          HOLD_SPACING_PX,
        ),
        pitch: COUPLE_PITCH_PX,
        couples,
      };
    },

    tags(selector: GroupSelector): Record<string, StationId[]> {
      if (selector === SHADOW_PAIR_GROUP) {
        const all = SHADOW_SEAM_STATIONS.map((s) => s.id);
        return {
          all,
          larks: ["NL", "FL"],
          robins: ["NR", "FR"],
          shadow: all,
          // Becket's shadow is the same-line, same-role couple across the
          // seam — a straight pairing, not a genuine diagonal (see the M2
          // report): "left"/"right" here name the two lines, not two crossing
          // diagonals, kept for the same tag names duple improper offers.
          "left-diagonal": ["NL", "FR"],
          "right-diagonal": ["NR", "FL"],
        };
      }
      if (selector === LINE_GROUP) {
        const all = BECKET_STATIONS.map((s) => s.id);
        const waitTop = ["WL-top", "WR-top"];
        const waitBottom = ["WL-bottom", "WR-bottom"];
        return {
          all: [...all, ...waitTop, ...waitBottom],
          larks: [...all.filter((id) => id.endsWith("L")), "WL-top", "WL-bottom"],
          robins: [...all.filter((id) => id.endsWith("R")), "WR-top", "WR-bottom"],
          ones: ["1L", "1R"],
          twos: ["2L", "2R"],
          neighbors: all,
          partners: all,
          "wait-top": waitTop,
          "wait-bottom": waitBottom,
        };
      }
      onlyHandsFour(selector);
      const all = BECKET_STATIONS.map((s) => s.id);
      return {
        all,
        larks: ["1L", "2L"],
        robins: ["1R", "2R"],
        ones: ["1L", "1R"],
        twos: ["2L", "2R"],
        neighbors: all,
        partners: all,
      };
    },
  };
}

/**
 * Becket on the set's own lattice (the figure model's M1).
 *
 * Two dancer places per couple place, because a becket couple stands **side by
 * side along its own line** rather than across the set: the `+1` line (stations
 * `1L`/`1R`, at `−x`) is `line: 0` and the `-1` line (`2L`/`2R`, at `+x`) is
 * `line: 1`, and a couple at dancing place `P` occupies positions `2P` and
 * `2P + 1` of its own line. Which of the two each dancer takes is the same
 * role-and-direction question duple improper asks about which *line* they are
 * on — the robin is on the lark's right, and right is the other way along the
 * set for the line travelling the other way.
 *
 * `homeAt` reproduces {@link BECKET_STATIONS} exactly: a group's frame sits on
 * its own dancing place (`at(set, P)`, pitch {@link COUPLE_PITCH_PX}) and its
 * stations are ±{@link PLACE_PITCH_PX}/2 from that, which is
 * `position × PLACE_PITCH_PX − PLACE_PITCH_PX/2` from the set's own origin.
 */
export const BECKET_LATTICE: SetLattice = becketLattice("becket", -1);

/**
 * Which slot the dancer of `role` in a couple at `place` travelling `direction`
 * stands on: a couple place is two positions and the couple's two dancers take
 * them in the order their own line runs, the lark leading on line 0 and the
 * robin on line 1.
 *
 * `place` is a **half-integer** on the times through when the two lines' grids
 * are out of step, which is what makes `2 * place` a whole position either way.
 */
const becketSlotOf = (place: number, direction: 1 | -1, role: RoleName): Slot => ({
  line: direction === 1 ? 0 : 1,
  position: 2 * place + ((role === "lark") === (direction === 1) ? 0 : 1),
});

/** {@link becketSlotOf}'s inverse. */
function becketPlaceOf(slot: Slot, role: RoleName): { place: number; direction: 1 | -1 } {
  const direction: 1 | -1 = slot.line === 0 ? 1 : -1;
  const first = (role === "lark") === (direction === 1);
  return { place: (slot.position - (first ? 0 : 1)) / 2, direction };
}

/**
 * A becket lattice: the shared geometry, with the sign of the slide as the one
 * parameter.
 *
 * `step` is {@link SetLattice.progressionStep} — `-1` for an ordinary
 * left-progressing becket, `+1` for `becket-right`. Everything else about the
 * two is identical, and the sign is what makes `N_k` count toward the way the
 * asking dancer's own couple is really going rather than toward a hard-coded
 * left (`becketRight.ts`).
 */
export function becketLattice(id: string, step: 1 | -1): SetLattice {
  return {
    id,
    pitch: PLACE_PITCH_PX,
    // A becket couple slides **half** a couple place to its own left (FR-C2,
    // DD54) — `place - direction / 2` — and a couple place is two positions, so
    // one progression is one position per unit of travel, against the travel.
    progressionStep: step,
    slotOf: (couple: CoupleState, role: RoleName) =>
      becketSlotOf(couple.place, couple.direction, role),
    placeOf: (slot, role: RoleName) => becketPlaceOf(slot, role),
    /**
     * One progression on the slots, reproducing {@link BECKET}'s own
     * `Progression.next` dancer for dancer, ends included (FR-C2).
     *
     * A dancer is **standing out** when the other line has nobody opposite them
     * — each line is one contiguous run of positions, so the span says so — and
     * a couple standing out crosses the set, half a couple place along, rather
     * than sliding further past the end. Everybody else slides one position.
     * That two-step end effect is exactly what the lattice's own "run off the
     * end of your line and keep your place" rule cannot say, which is why becket
     * has this and duple improper does not.
     */
    progressSlot(dancer, span) {
      const other = span.line[dancer.slot.line === 0 ? 1 : 0];
      const out =
        other === undefined ||
        dancer.slot.position < other.lowest ||
        dancer.slot.position > other.highest;
      if (!out) {
        const position = dancer.slot.position + step * dancer.travel;
        return { slot: { ...dancer.slot, position }, travel: dancer.travel };
      }
      const here = becketPlaceOf(dancer.slot, dancer.role);
      // The crossing is the slide taken **across** the set instead of along it,
      // so it is the same half place the other way round from the way this
      // couple has been travelling.
      const place = here.place - step * here.direction * BECKET_SHIFT_PLACES;
      const travel: 1 | -1 = here.direction === 1 ? -1 : 1;
      return { slot: becketSlotOf(place, travel, dancer.role), travel };
    },
    homeAt(slot) {
      return {
        p: [
          slot.line === 0 ? -HALF_ACROSS : HALF_ACROSS,
          slot.position * PLACE_PITCH_PX - HALF_COUPLE,
        ],
        facing: slot.line === 0 ? ACROSS : BACK,
      };
    },
  };
}

/**
 * **A becket set's own loop**: the one closed ring of the couples on the floor,
 * in the order they stand round the set.
 *
 * This is the doc comment at the top of this file — *"down one line, across at
 * the end, back up the other, across again"* — turned into arithmetic, because
 * M8b found that becket's shadow cannot be written without it: a shadow is the
 * dancer you keep for the whole dance, and a couple that runs off the end of one
 * line comes back in on the other, so the offset that names them has to go round
 * the end rather than stop at it.
 *
 * Number the couples `j = 0 … length − 1` **up line 0 and back down line 1**:
 *
 * ```text
 *   A@(bottom) → … → A@(top) → B@(top) → … → B@(bottom) → A@(bottom)
 *      j = 0            j = countA − 1       j = length − 1   wraps to 0
 * ```
 *
 * where `A` is line 0 and `B` line 1. `countA − 1` and `countA` are the two
 * couples nearest the **top** of the set, and `length − 1` and `0` the two
 * nearest the bottom, so consecutive `j` really are neighbours round the ring at
 * both ends.
 *
 * **One progression is no longer one step round it** (FR-C2). A becket line
 * slides half a couple place, so a couple keeps its `j` on the times through
 * when the two grids fall out of step and advances one on the times through when
 * they fall back in. What the rows that use it need is that the whole ring turns
 * **together**, which it does at every progression at both ends — so a
 * difference of `j`, which is what a shadow and a trail buddy are, names the
 * same pair of dancers for the whole dance.
 *
 * Read off the occupied lattice rather than a couple count, so a set the
 * formation did not build answers for itself, and a set the arithmetic does not
 * recognise gets `undefined` and falls back to the plain offsets.
 */
interface BecketLoop {
  /** How many couples the ring has: the set's own couple count. */
  length: number;
  /** How many of them are on line 0 — the ring's first stretch. */
  countA: number;
  /** Line 0's own bottom couple, as `2 × place`: the ring's origin. */
  baseA: number;
  /** Line 1's own top couple, as `2 × place`: where the second stretch starts. */
  baseB: number;
}

/**
 * The loop this occupied lattice describes, or `undefined` for a set that is not
 * one.
 *
 * A couple takes two adjacent positions of its own line, the lower of them
 * `2 × place`, so a line running `lowest … highest` holds its couples on
 * `lowest, lowest + 2, … , highest − 1`. `place` is a half-integer half the
 * time, which is exactly what leaves `2 × place` a whole number either way.
 */
function becketLoop(span: LatticeSpan): BecketLoop | undefined {
  const a = span.line[0];
  const b = span.line[1];
  if (a === undefined || b === undefined) return undefined;
  const countA = (a.highest - a.lowest + 1) / 2;
  const countB = (b.highest - b.lowest + 1) / 2;
  if (!Number.isInteger(countA) || !Number.isInteger(countB) || countA + countB <= 0) {
    return undefined;
  }
  return { length: countA + countB, countA, baseA: a.highest - 1, baseB: b.lowest };
}

/** The lower of the two positions the couple standing on `position` occupies. */
const coupleAt = (position: number, base: number): number =>
  position - ((((position - base) % 2) + 2) % 2);

/** Which couple of the loop this dancer's slot is. */
function loopIndexOf(loop: BecketLoop, slot: Slot): number {
  const onA = slot.line === 0;
  const u = coupleAt(slot.position, onA ? loop.baseA : loop.baseB);
  return onA ? (loop.baseA - u) / 2 : loop.countA + (u - loop.baseB) / 2;
}

/** Any number of steps round the loop, brought back into `0 … length − 1`. */
const ring = (loop: BecketLoop, j: number): number =>
  ((j % loop.length) + loop.length) % loop.length;

/** The slot the dancer of `role` stands on in loop couple `j`. */
function slotAtLoop(loop: BecketLoop, j: number, role: RoleName): Slot {
  const k = ring(loop, j);
  const onA = k < loop.countA;
  const u = onA ? loop.baseA - 2 * k : loop.baseB + 2 * (k - loop.countA);
  return becketSlotOf(u / 2, onA ? 1 : -1, role);
}

/** The other contra role, which is who every one of becket's cross-set rows names. */
const otherRole = (role: RoleName): RoleName => (role === "lark" ? "robin" : "lark");

/**
 * Becket's relations — and the trap the relation table exists for. Complete
 * since M6; put on the set's own loop in M8b (DD28); the **neighbour** rows
 * taken back off it and made one couple place a step in **FR-C1 (E3, DD49)**.
 *
 * Two positions per couple place, two lines, and a couple place is therefore
 * `2` positions while duple improper's is `1`. `partner`, `shadow` and
 * `trail-buddy` are steps round {@link BecketLoop} — the dancers you keep for
 * the whole dance, wherever the set turns round at an end. `neighbor`,
 * `opposite` and `corner` are plain offsets on the two lines, and answer
 * **nobody** where the offset runs off the end of the other line.
 *
 * - **Partner** is the other role of your own couple: in becket your partner is
 *   beside you, not across from you.
 * - **Neighbour k** is, since FR-C1, the **k-th couple along the set in the
 *   direction your own couple progresses**, counted across the set: `N1` is the
 *   couple you face, `N2` the couple across and one couple place on the way you
 *   are going, `N3` two, and `N0` the couple across and one place behind you.
 *   On the lattice that is {@link nextNeighbourStep} positions a step along
 *   the other line, which is that function's whole subject; it is its own
 *   inverse because the dancer it names travels the other way, so their step is
 *   the mirror of yours, and it names **nobody** where the step runs off the
 *   end of the other line — which, on a bare lattice, is the couples at the
 *   ends and only them.
 * - **Opposite** is the dancer straight across the set, which in becket is
 *   neighbour 1. (In an improper set it is your partner.)
 *
 * **What the loop was for, and why the neighbour rows came off it (FR-C1,
 * DD49).** M8b wrote neighbour k as a step round {@link BecketLoop}, on the
 * reading that `N_k` *means* "the couple you face `k − 1` progressions from
 * now". That reading is measurable and this file measured it: while the model
 * slid a whole couple place a line the two lines passed each other two couple
 * places a time through, so it made `N_k` two couple places a step, which put a
 * "diagonal" foursome two couples wide in the middle of a line and collinear at
 * the end of a short one (M9e measured both). The user was asked which of the
 * two readings the dances mean (E3) and answered with the caller's one: *"N2
 * would be your next neighbor"*, one couple place along.
 *
 * **Since FR-C2 the two readings are the same reading.** A half-width slide
 * passes the lines one couple place a time through, so the couple across-and-one
 * in the direction you are going *is* the couple you face next, and
 * {@link nextNeighbourStep} is `2 × progressionStep` again — M6's sign invariant,
 * which FR-C1 had to break and `lattice.test.ts` now asserts.
 *
 * - **Shadow k** is, as in duple improper, the opposite-role dancer who
 *   progresses the way you do, on the opposite side of you from your partner —
 *   which in becket is *along your own line*, since your own line is what
 *   travels with you. One couple place along the line in the direction
 *   {@link partnerSide} gives is one step round the loop, so shadow k is the
 *   other role of couple `j + partnerSide(role) × k`. Its own inverse, by the
 *   same argument the improper row gives, and — on the loop — it names
 *   somebody for **everybody**, which is what a shadow is: the dancer you keep
 *   for the whole dance.
 *
 * **The `"shadow-pair"` seam group is a different partition, and this row is
 * the one that is right (M8b, the ruling M6 asked for).** `groupsFor(
 * "shadow-pair", set)` pairs a dancer with the one *across* the set one couple
 * place along. That dancer is on the other line and therefore travels the other
 * way, so the pair breaks up at the very next progression, which is the one
 * thing a shadow never does; measured, the seam group's pairing is not stable
 * across `BECKET.progression.next` and this row's is, for every dancer at every
 * round (`relations.test.ts`). The seam group stays what it is — a partition
 * built to reach across a seam, which several figures want — and it should not
 * be called a shadow. Q15 replaces the selector with `who:` plus a relation.
 *
 * - **Trail buddy k** (the same role `k` couple places back along the loop) and
 *   **corner k** (the two dancers of the couple across from you) are
 *   **(unsure)**: nothing calls them, and M7/M9 own the figures that will pin
 *   them down. The trail buddy keeps M6's arithmetic re-expressed on the loop;
 *   corner k is back on M6's own offset, with the neighbour rows.
 *
 * **`becket-right` has its own copy of this table**, made by the same factory
 * with the other sign (FR-C2). A right-progressing becket is a becket in every
 * way but which way its lines slide, and every row that is a step round the loop
 * or reads `travel` as *facing* is the same for it; the neighbour row, which
 * reads `travel` as *the way you progress*, is mirrored — so the step comes off
 * the formation's own lattice rather than a shared constant.
 */
export const BECKET_RELATIONS: RelationTable = becketRelations("becket", -1);

/**
 * A becket relation table, with the sign of the slide as its one parameter —
 * the same `step` {@link becketLattice} takes.
 */
export function becketRelations(id: string, step: 1 | -1): RelationTable {
  const neighbourStep = nextNeighbourStep(step);
  return {
    id,
    slotFor(rel, from, span) {
      if (rel.kind === "self") return from.slot;
      const loop = becketLoop(span);
      if (loop === undefined) return offsetOnly(rel, from, neighbourStep);
      const j = ring(loop, loopIndexOf(loop, from.slot));
      switch (rel.kind) {
        // **Your partner is a plain offset** (FR-C2): in becket they are the
        // other dancer of your own couple, one position along your own line on
        // the side {@link partnerSide} gives — which can never run off the end,
        // because your couple is two adjacent positions wherever it stands. M8b
        // read it off the loop, and a loop whose steps are couples cannot
        // answer it once a couple's own place may be a half-integer.
        case "partner":
        // The cross-set rows are **offsets on the two lines** again (FR-C1): a
        // neighbour k couple places along is a place on the floor, and a place
        // that is off the end of the other line is nobody, which is what the end
        // of a set is. The loop below is kept for the two rows that really are
        // steps round it — your shadow and your trail buddy — because those are
        // the same dancer for the whole dance however often the set turns round
        // at an end.
        case "neighbor":
        case "opposite":
        case "corner":
          return offsetOnly(rel, from, neighbourStep);
        case "shadow":
          return slotAtLoop(loop, j + partnerSide(from.role) * rel.k, otherRole(from.role));
        case "trail-buddy":
          return slotAtLoop(loop, j - rel.k, from.role);
      }
    },
  };
}

/**
 * **One step from `N_k` to `N_(k+1)`, in lattice positions, for a dancer whose
 * `travel` is `+1`**: `2 × progressionStep`, which for an ordinary becket is
 * `−2` — **one couple place along the other line in the direction the asking
 * dancer's own couple progresses**.
 *
 * `N_k` walks the neighbours in the order a dancer meets them: `N0` one place
 * behind you, `N1` straight across, `N2` one place ahead, `N3` two. The user's
 * ruling of 2026-09-15 (E3, DD49): *"N2 would be your next neighbor. in a
 * left-progressing becket, your right diagonal is your next neighbors because
 * your right is their left, and that's the direction of progression"*.
 *
 * **Why `2 ×` the progression step, rather than a number of its own.** M6's sign
 * invariant is "`N(k+1)` today is `N(k)` after one progression". Write `N_k =
 * across + (k − 1) × s` positions along the other line; one time through moves
 * the asking dancer `p` positions and the other line `−p`, so the couple standing
 * where `N_k` pointed has been replaced by the one that was `2p` further on, and
 * the invariant reads `(k − 1)s + 2p = k·s` — that is, `s = 2p`, uniquely.
 *
 * FR-C1 had to break that invariant, because the model then slid a whole couple
 * place a line (`p = −2`) and the caller's "next neighbour" is one couple place
 * (`s = −2`), and `−2 ≠ 2 × −2`. **FR-C2 restores it**: the slide is half a
 * couple place (`p = −1`), so the caller's word and the geometry agree and
 * `lattice.test.ts` asserts the invariant for becket instead of counting how far
 * it is off. The couple on your diagonal really is the couple you face next.
 */
function nextNeighbourStep(progressionStep: number): number {
  return 2 * progressionStep;
}

/**
 * M6's own offsets, for a set whose lattice is not a becket loop at all — and,
 * since FR-C1, the row every **neighbour** answer comes from.
 *
 * A hand-built model in a test, or a line nobody stands on one side of, still
 * gets an answer rather than a throw — the same answer it got before M8b — and
 * `becketLoop` is what decides which of the two is in play for the rows that
 * still run on the loop. Every set either formation builds is a loop.
 */
function offsetOnly(rel: Relation, from: DancerState, neighbourStep: number): Slot {
  const { line, position } = from.slot;
  const other = line === 1 ? 0 : 1;
  const t = from.travel;
  switch (rel.kind) {
    case "partner":
      return { line, position: position + partnerSide(from.role) * t };
    case "neighbor":
      return { line: other, position: position + (rel.k - 1) * neighbourStep * t };
    case "opposite":
      return { line: other, position };
    case "shadow":
      return { line, position: position - partnerSide(from.role) * (2 * rel.k - 1) * t };
    case "trail-buddy":
      return { line, position: position + 2 * rel.k * t };
    case "corner":
      return rel.k === 1
        ? { line: other, position }
        : { line: other, position: position + partnerSide(from.role) * t };
    case "self":
      return from.slot;
  }
}

/** The group selectors becket defines beyond `"hands-four"`. */
export const SHADOW_PAIR_GROUP: GroupSelector = "shadow-pair";
export const LINE_GROUP: GroupSelector = "line";

/** A selector becket does not know is an error, not an empty group. */
function onlyHandsFour(selector: GroupSelector): void {
  if (selector === HANDS_FOUR_GROUP) return;
  throw new Error(
    `becket has no group selector "${selector}" (has: "${HANDS_FOUR_GROUP}", "${SHADOW_PAIR_GROUP}", "${LINE_GROUP}")`,
  );
}
