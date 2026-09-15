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
 * The ends are the interesting part. A couple that has slid to the end of its
 * line has nowhere left to slide, so it spends one time through on a waiting
 * place beyond the end, crosses the set, and comes back in on the other line
 * one place along. That crossing is `wait-out`'s `'mirror'`: every dancer walks
 * to the point opposite their own through the frame's centre, which is placed
 * between the waiting place and the place they are coming back to — so the same
 * built-in figure does becket's end effect and duple improper's.
 *
 * ## The loop, and what an odd line does differently
 *
 * Every couple travels one closed loop: down one line, across at the end, back
 * up the other, across again. Write the loop out for a set with `places`
 * dancing places, reading each arrow as one time through:
 *
 * ```text
 *   ... → A@1 → A@0 → [the top end] → B@0 → B@1 → ...  → [the bottom end] → ...
 * ```
 *
 * where `A` is the line that slides toward the top (`direction: 1`) and `B` the
 * line that slides toward the bottom. Two couples dance at every place `0 …
 * places − 1`, one from each line, so the loop has as many slots as the set has
 * couples and the whole thing is a rotation: one step a time through, every
 * couple, for ever.
 *
 * **An end is either a waiting place or a plain cross-over, and which it is
 * follows from the arithmetic, not from taste.** `places` fours need `2 ×
 * places` couples on the floor; every couple left over stands at an end. So an
 * **even** line has two spare couples and both ends are waiting places (`-1`
 * and `places`): a couple runs off the end, spends a time through out, and
 * comes in on the other line one place along. An **odd** line has exactly one
 * spare couple, so only one end can be a waiting place, and at the other end the
 * couple that runs out of line **crosses straight over** — no time out, because
 * the place opposite has just been vacated by the couple that slid away from it.
 * This is forced: two couples out of an odd line would leave an odd number
 * dancing, which cannot make fours at all.
 *
 * Which end waits is the one a caller would pick. A hall takes hands four **from
 * the top**, so the couple with nobody to dance with is the one at the bottom;
 * an odd becket line therefore has its one waiting place beyond the **bottom**,
 * and the cross-over at the top. A different couple is out every time through
 * and every couple is out exactly once per loop, but it is always the bottom —
 * see this milestone's report for why alternating ends is not reachable.
 *
 * ### Seven couples, worked
 *
 * `places` is 3, so three fours dance and one couple is out. Line `A` holds
 * `c0 c2 c4` at places 0, 1, 2; line `B` holds `c1 c3 c5` at the same three
 * places and `c6` on the waiting place at 3.
 *
 * | time through | the three fours (place: A, B) | out, at place 3 |
 * | --- | --- | --- |
 * | 1 | 0: c0 c1 · 1: c2 c3 · 2: c4 c5 | **c6** |
 * | 2 | 0: c2 c0 · 1: c4 c1 · 2: c6 c3 | **c5** |
 * | 3 | 0: c4 c2 · 1: c6 c0 · 2: c5 c1 | **c3** |
 *
 * Read time 1 → 2 slot by slot: `c0` is at the top of line `A` with nowhere to
 * slide, so it crosses to `B@0`; `c2` and `c4` slide up one; `c1`, `c3`, `c5`
 * slide down one, `c5` taking the place `c3` left; and `c6`, out at the bottom,
 * does `wait-out`'s mirror on to `A@2`. Seven times through brings the set back
 * to time 1 with every couple having been out exactly once.
 *
 * So a becket set has **two** waiting places, `-1` and `places`, and
 * `2 × places + 2` couples when the hall is even; **one**, beyond the bottom,
 * and `2 × places + 1` couples when it is odd.
 */
export const COUPLE_PITCH_PX = PLACE_PITCH_PX * 2;

const HALF_ACROSS = ACROSS_PX / 2;
const HALF_COUPLE = PLACE_PITCH_PX / 2;

/**
 * How far down the hall a becket set's frame sits from the point a hall hands
 * it, px: one waiting place plus half a couple, which is where place `-1`'s
 * first dancer stands.
 *
 * **The same for both parities**, which is what keeps a hall's lines dancing in
 * step with each other. An odd line has no couple standing out at the top, so
 * its first dancer is the one at dancing place `0` and its line simply starts a
 * couple place lower down than an even line's — while every *dancing* place, and
 * the waiting place at the bottom, sits on exactly the row the line beside it
 * uses. Offsetting the odd set's frame to bring its first dancer up to
 * `spec.centre` was tried and reverted: it lines up the two lines' *ends* at the
 * cost of their fours, and the hall reads by its fours.
 */
export const BECKET_TOP_OFFSET_PX = COUPLE_PITCH_PX + HALF_COUPLE;

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
 * line, one place along.
 */
export const BECKET_WAIT_STATIONS: readonly Station[] = [
  { id: "WL", role: "lark", facing: ACROSS, p: [-HALF_ACROSS, -COUPLE_PITCH_PX / 2 - HALF_COUPLE] },
  {
    id: "WR",
    role: "robin",
    facing: ACROSS,
    p: [-HALF_ACROSS, -COUPLE_PITCH_PX / 2 + HALF_COUPLE],
  },
];

/**
 * Where everybody stands at beat 0 of a becket dance that **shifts left in its
 * own first figure**, in each group's own frame-local px.
 *
 * A becket dance that progresses early — Butter, Tika Tika Timing, A-1 Reel —
 * dances the body of the time through with the couple it shifted *to*, so the
 * minor set the decider plans is the one the shift makes and every dancer
 * begins one couple place back along their own line. That is `-1` place for the
 * line that slides toward `-y` (stations `1L`/`1R`, so their start is one pitch
 * further along `+y`) and `+1` for the line that slides the other way.
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
        p: [s.p[0], s.p[1] + (s.id === "2L" || s.id === "2R" ? -1 : 1) * COUPLE_PITCH_PX] as Vec2,
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
 * Its own slide direction says so: a dancing couple slides to `place -
 * direction`, so the couple that has run out of line travelling toward the top
 * is the one beyond the top, and the couple travelling the other way is the one
 * beyond the bottom. It is the same signal the wait frame is already turned by
 * — reversed at the bottom, so one layout serves both ends — surfaced rather
 * than derived twice.
 *
 * An odd set only ever has the one waiting couple, beyond the bottom, so it only
 * ever produces `wait-bottom`; an even set has one of each, every time through.
 */
const waitKindOf = (couple: CoupleState): GroupKind =>
  couple.direction === 1 ? "wait-top" : "wait-bottom";

/** Group the couples at each place: two facing each other, or one waiting. */
export function partitionBecket(set: SetState): Part[] {
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
      parts.push({ kind: waitKindOf(here[0]!), couples: here });
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
 * A true-end waiting couple's two stations, re-expressed in `into`'s own
 * frame and suffixed `"top"`/`"bottom"`. See `dupleImproper.ts`'s own
 * `widenedWaitStations`, the same idea: reuse the plain wait `GroupPlan`'s
 * own frame and convert its stations' world poses with `localPoint`/
 * `localAngle` rather than re-deriving becket's own (more involved, `place +
 * direction / 2`-centred) wait geometry a second time.
 */
function widenedWaitStations(
  set: SetState,
  couple: CoupleState,
  into: Frame,
): { stations: Station[]; members: Record<StationId, DancerId> } {
  const base = at(set, couple.place + couple.direction / 2);
  const waitFrame = couple.direction === 1 ? base : reverseFrame(base);
  const suffix = waitKindOf(couple) === "wait-top" ? "top" : "bottom";
  const stations = BECKET_WAIT_STATIONS.map((s) => {
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
function lineGroupsFor(set: SetState): GroupPlan[] {
  const parts = partitionBecket(set);
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
      const w = widenedWaitStations(set, topAdjacent.couples[0]!, dancingFrame);
      stations.push(...w.stations);
      Object.assign(members, w.members);
      couples.push(topAdjacent.couples[0]!.id);
      widened.add(topAdjacent);
    }
    if (i === lastIdx && bottomAdjacent && bottomAdjacent.kind !== "set") {
      const w = widenedWaitStations(set, bottomAdjacent.couples[0]!, dancingFrame);
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
    const base = at(set, couple.place + couple.direction / 2);
    plans.push({
      id: `${set.id}/line-end${couple.place}`,
      kind: "set",
      frame: couple.direction === 1 ? base : reverseFrame(base),
      stations: BECKET_WAIT_STATIONS.map((s) => ({ ...s })),
      members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
      couples: [couple.id],
    });
  }
  return plans;
}

/** Becket, and the second formation the demo's dances may be written in. */
export const BECKET: Formation = {
  id: "becket",
  roleSet: CONTRA_ROLES,
  lineUpCalls: BECKET_LINE_UP_CALLS,
  handsFourCalls: becketHandsFourCalls,
  // A minor set's two couples share one place; the slide moves a couple
  // exactly one place, `COUPLE_PITCH_PX`, so that is the along-hall period
  // (T6) — unlike duple improper, whose minor set spans two places.
  hallPitch: COUPLE_PITCH_PX,

  group(n: number): Station[] {
    if (n === 4) return BECKET_STATIONS.map((s) => ({ ...s }));
    if (n === 2) return BECKET_WAIT_STATIONS.map((s) => ({ ...s }));
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
    if (selector === LINE_GROUP) return lineGroupsFor(set);
    onlyHandsFour(selector);
    return partitionBecket(set).map((part): GroupPlan => {
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
      const base = at(set, couple.place + couple.direction / 2);
      return {
        id: `${set.id}/w${couple.place}`,
        kind: part.kind,
        frame: couple.direction === 1 ? base : reverseFrame(base),
        stations: BECKET_WAIT_STATIONS.map((s) => ({ ...s })),
        members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
        couples: [couple.id],
      };
    });
  },

  progression: {
    next(set: SetState): SetState {
      // The ends of the set: nobody slides past them. For an even line these
      // are the two waiting places; for an odd line the top one is the topmost
      // *dancing* place, which is what makes the couple there cross over
      // instead of running off into nothing. Read off the set rather than
      // recomputed from a couple count, so a hand-built set answers for itself.
      let top = Infinity;
      let bottom = -Infinity;
      for (const couple of set.couples) {
        top = Math.min(top, couple.place);
        bottom = Math.max(bottom, couple.place);
      }
      const couples: CoupleState[] = [];
      for (const part of partitionBecket(set)) {
        if (part.kind === "set") {
          for (const couple of part.couples) {
            // Slide to your own left: the `+1` line toward `-y`, the other back.
            const to = couple.place - couple.direction;
            if (to >= top && to <= bottom) {
              couples.push({ ...couple, place: to, crossedOver: false });
            } else {
              // Nowhere left to slide and no waiting place at this end, so the
              // couple crosses straight over to the place opposite — which the
              // couple that was there has just slid away from. Only an odd line
              // ever reaches this: an even one has a waiting place at both ends.
              // `crossedOver` is how the shift that carries them there knows to
              // bring them across rather than along.
              couples.push({
                ...couple,
                direction: couple.direction === 1 ? -1 : 1,
                crossedOver: true,
              });
            }
          }
        } else {
          const couple = part.couples[0]!;
          couples.push({
            ...couple,
            place: couple.place + couple.direction,
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
    // `places` fours need `2 × places` couples on the floor and every couple
    // over that stands at an end — two of them for an even hall, one for an
    // odd one. Both parities read the same way round: as many fours as the
    // couples will make.
    const places = Math.floor((spec.couples - 1) / 2);
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
    // The waiting place beyond the top, which only an even hall has a couple
    // spare for. An odd hall's one spare couple waits beyond the bottom
    // instead, because a hall takes hands four *from the top* and the couple
    // left over is the one at the bottom.
    if (spec.couples % 2 === 0) add(-1, 1);
    for (let place = 0; place < places; place++) {
      add(place, 1);
      add(place, -1);
    }
    add(places, -1);
    return {
      id: spec.id,
      // `spec.centre` is where the *first* dancer of a line stands — that is what
      // it means for a duple improper set, and a hall hands the same point to
      // both formations. A becket set's first dancer is at place `-1`, so the
      // frame sits one waiting place plus half a couple down the hall from it,
      // and the two formations lay their lines out from the same place. An odd
      // line, which has nobody at `-1`, keeps the same frame and starts a couple
      // place lower — see {@link BECKET_TOP_OFFSET_PX}.
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
export const BECKET_LATTICE: SetLattice = {
  id: "becket",
  pitch: PLACE_PITCH_PX,
  // A becket couple slides to its own left — `place - direction` — and a couple
  // place is two positions, so one progression is minus two positions per unit
  // of travel.
  progressionStep: -2,
  slotOf(couple: CoupleState, role: RoleName) {
    const first = (role === "lark") === (couple.direction === 1);
    return {
      line: couple.direction === 1 ? 0 : 1,
      position: 2 * couple.place + (first ? 0 : 1),
    };
  },
  placeOf(slot, role: RoleName) {
    const direction: 1 | -1 = slot.line === 0 ? 1 : -1;
    const first = (role === "lark") === (direction === 1);
    return { place: (slot.position - (first ? 0 : 1)) / 2, direction };
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

/**
 * **A becket set's own loop**: the one closed ring every couple travels round,
 * one step per time through.
 *
 * This is the doc comment at the top of this file — *"down one line, across at
 * the end, back up the other, across again"* — turned into arithmetic, because
 * M8b found that becket's relations cannot be written without it.
 *
 * Number the couple slots `j = 0 … length − 1` so that **one progression is
 * `j → j + 1` (mod length)**, for every couple, at both ends, in both
 * parities:
 *
 * ```text
 *   A@(places−1) → … → A@0 → A@(topA) → B@0 → B@1 → … → B@places → A@(places−1)
 *        j = 0             j = places−1−topA          j = length−1     wraps to 0
 * ```
 *
 * where `A` is line 0 (the couples travelling `+1`), `B` line 1, `places` the
 * highest dancing place, and `topA` the lowest place line `A` reaches — `−1`
 * for an even hall, whose top end is a waiting place, and `0` for an odd one,
 * whose top couple crosses straight over. Both are read off the occupied
 * lattice rather than off a couple count, so a set the formation did not build
 * answers for itself, and a set the arithmetic does not recognise gets
 * `undefined` and falls back to the plain offsets.
 *
 * The length comes out at `2 × places + 2` for an even hall and
 * `2 × places + 1` for an odd one, which is the couple count in both cases —
 * so the loop really is *every* couple, exactly once.
 */
interface BecketLoop {
  /** How many couple slots the ring has: the set's own couple count. */
  length: number;
  /** The lowest dancing place line 0 reaches: `−1` even, `0` odd. */
  topA: number;
  /** The highest dancing place, which only line 1 reaches. */
  places: number;
}

/** The loop this occupied lattice describes, or `undefined` for a set that is not one. */
function becketLoop(span: LatticeSpan): BecketLoop | undefined {
  const a = span.line[0];
  const b = span.line[1];
  if (a === undefined || b === undefined) return undefined;
  const topA = Math.floor(a.lowest / 2);
  const places = Math.floor(b.highest / 2);
  const length = 2 * places + 1 - topA;
  return length > 0 ? { length, topA, places } : undefined;
}

/** Which slot of the loop this dancer's slot is: `place`, read the loop's way round. */
function loopIndexOf(loop: BecketLoop, slot: Slot): number {
  const place = Math.floor(slot.position / 2);
  return slot.line === 0 ? loop.places - 1 - place : loop.places - loop.topA + place;
}

/** Any number of steps round the loop, brought back into `0 … length − 1`. */
const ring = (loop: BecketLoop, j: number): number =>
  ((j % loop.length) + loop.length) % loop.length;

/** The slot the dancer of `role` stands on in loop slot `j`. */
function slotAtLoop(loop: BecketLoop, j: number, role: RoleName): Slot {
  const k = ring(loop, j);
  const lastOnA = loop.places - 1 - loop.topA;
  const onA = k <= lastOnA;
  const place = onA ? loop.places - 1 - k : k - (loop.places - loop.topA);
  const direction = onA ? 1 : -1;
  const first = (role === "lark") === (direction === 1);
  return { line: onA ? 0 : 1, position: 2 * place + (first ? 0 : 1) };
}

/** The other contra role, which is who every one of becket's cross-set rows names. */
const otherRole = (role: RoleName): RoleName => (role === "lark" ? "robin" : "lark");

/**
 * Becket's relations, on the set's own loop (Q1) — and the trap the relation
 * table exists for. Complete since M6; **rewritten on the loop in M8b (DD28)**.
 *
 * Two positions per couple place, two lines, and a couple place is therefore
 * `2` positions while duple improper's is `1`. Every row below is a step round
 * {@link BecketLoop}, and `undefined` — nobody — where the step lands back on
 * the asking dancer's own couple.
 *
 * - **Partner** is the other role of your own couple: in becket your partner is
 *   beside you, not across from you.
 * - **Neighbour k** is the couple you face `k − 1` progressions from now, and
 *   the dancer of the other role in it. Since a progression is `j → j + 1` and
 *   two couples face each other when `jA + jB ≡ length − 2`, that is
 *   `N_k(j) = length − 2 − j − 2(k − 1)`, mod the loop. `N0` is the neighbour
 *   you had last time through, which the same formula gives at `k = 0`. Each is
 *   its own inverse by construction — apply it twice and the `−j` and the
 *   `−2(k−1)` cancel — and it names **nobody** exactly when `N_k(j) = j`, which
 *   is a couple that will be standing out at an end that time through.
 * - **Opposite** is the dancer straight across the set, which in becket is
 *   neighbour 1. (In an improper set it is your partner.)
 *
 * **Why the loop and not an offset (DD28, and the measurement that settled
 * it).** M6 wrote neighbour k as `−(k − 1) × 4 × travel` positions along the
 * other line, reasoning that one progression slides the two lines two couple
 * places relative to each other. That reasoning is *correct in the middle of an
 * unbounded line* and this row reproduces it exactly there — asserted in
 * `relations.test.ts`. What it cannot see is the **end**: the couple you will
 * face next time through may be one that has just run off the end of its own
 * line and come back on the other, and no signed offset on two straight lines
 * can name it. Measured on a bare eight-couple becket lattice, M6's offsets
 * paired `N1 6/8, N2 2/8, N3 0/8` where the hall — the set progressed by
 * becket's own `Progression.next`, then asked who is across from whom — pairs
 * `6/8` at every k. The offsets were never *wrong*, in 1,728 checked cases they
 * never named the wrong dancer; they said **nobody** where the hall says
 * somebody, 8 times of 12 at N2 and 12 of 12 at N3. The loop is those same
 * offsets with the ends joined up.
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
 *   them down. Both keep exactly M6's arithmetic, re-expressed on the loop so
 *   that they too are total.
 */
export const BECKET_RELATIONS: RelationTable = {
  id: "becket",
  slotFor(rel, from, span) {
    if (rel.kind === "self") return from.slot;
    const loop = becketLoop(span);
    if (loop === undefined) return offsetOnly(rel, from);
    const j = ring(loop, loopIndexOf(loop, from.slot));
    /**
     * The couple you face `k − 1` progressions from now, or `undefined` when
     * that is your own couple — which is what a couple standing out at an end
     * that time through looks like on the loop.
     */
    const neighbour = (k: number): number | undefined => {
      const facing = ring(loop, loop.length - 2 - j - 2 * (k - 1));
      return facing === j ? undefined : facing;
    };
    switch (rel.kind) {
      case "partner":
        return slotAtLoop(loop, j, otherRole(from.role));
      case "neighbor":
      case "opposite": {
        const facing = neighbour(rel.kind === "opposite" ? 1 : rel.k);
        return facing === undefined ? undefined : slotAtLoop(loop, facing, otherRole(from.role));
      }
      case "shadow":
        return slotAtLoop(loop, j + partnerSide(from.role) * rel.k, otherRole(from.role));
      case "trail-buddy":
        return slotAtLoop(loop, j - rel.k, from.role);
      case "corner": {
        // The two dancers of the couple across from you: your neighbour, and
        // their partner. (unsure)
        const facing = neighbour(1);
        if (facing === undefined) return undefined;
        return slotAtLoop(loop, facing, rel.k === 1 ? otherRole(from.role) : from.role);
      }
    }
  },
};

/**
 * M6's own offsets, for a set whose lattice is not a becket loop at all.
 *
 * A hand-built model in a test, or a line nobody stands on one side of, still
 * gets an answer rather than a throw — the same answer it got before M8b — and
 * `becketLoop` is what decides which of the two is in play. Every set either
 * formation builds is a loop.
 */
function offsetOnly(rel: Relation, from: DancerState): Slot {
  const { line, position } = from.slot;
  const other = line === 1 ? 0 : 1;
  const t = from.travel;
  switch (rel.kind) {
    case "partner":
      return { line, position: position + partnerSide(from.role) * t };
    case "neighbor":
      return { line: other, position: position - (rel.k - 1) * 4 * t };
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
