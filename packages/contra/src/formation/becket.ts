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
import { ACROSS_PX, PLACE_PITCH_PX } from "./dupleImproper.js";
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
 * A becket set therefore has two waiting places, `-1` and `places`, and
 * `2 × places + 2` couples, exactly as a hall of contra dancers really stands.
 */
export const COUPLE_PITCH_PX = PLACE_PITCH_PX * 2;

const HALF_ACROSS = ACROSS_PX / 2;
const HALF_COUPLE = PLACE_PITCH_PX / 2;

/**
 * How far down the hall a becket set's frame sits from the point a hall hands
 * it, px: one waiting place plus half a couple, which is where place `-1`'s
 * first dancer stands.
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
 * beyond the bottom. (An odd-couple set puts two couples beyond the bottom, and
 * both read as `wait-bottom`, which is where they are.) It is the same signal
 * the wait frame is already turned by — reversed at the bottom, so one layout
 * serves both ends — surfaced rather than derived twice.
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
 * waiting couple immediately beyond it. An odd becket set can have *two*
 * couples waiting beyond the bottom (`start`'s own second waiting place);
 * `"line"` widens with only the one immediately adjacent to the last dancing
 * place, leaving the further one a plain (unwidened) true end — flagged in
 * the M2 report, since no corpus dance in this milestone's scope exercises
 * that shape.
 */
function lineGroupsFor(set: SetState): GroupPlan[] {
  const parts = partitionBecket(set);
  const setIdx = parts.map((p, i) => (p.kind === "set" ? i : -1)).filter((i) => i >= 0);
  const firstIdx = setIdx[0];
  const lastIdx = setIdx[setIdx.length - 1];
  const plans: GroupPlan[] = [];
  // The one wait part immediately adjacent to the first/last dancing place —
  // never a further one: an odd becket set can have a *second* waiting place
  // beyond the bottom (`start`'s own extra waiting couple), and `"line"`
  // widens only as far as the couple actually standing at the true end of
  // the *dancing* line, leaving the further one its own plain true end
  // (flagged in the M2 report; no corpus dance in this milestone's scope
  // exercises that shape).
  const topAdjacent = firstIdx !== undefined && firstIdx > 0 ? parts[firstIdx - 1] : undefined;
  const bottomAdjacent =
    lastIdx !== undefined && lastIdx < parts.length - 1 ? parts[lastIdx + 1] : undefined;
  const widened = new Set<Part>();
  parts.forEach((part, i) => {
    if (part.kind !== "set") return;
    const [a, b] = part.couples as [CoupleState, CoupleState];
    const dancingFrame = at(set, a.place);
    const stations: Station[] = BECKET_STATIONS.map((s) => ({ ...s }));
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
          stations: BECKET_STATIONS.map((s) => ({ ...s })),
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
      const couples: CoupleState[] = [];
      for (const part of partitionBecket(set)) {
        if (part.kind === "set") {
          // Slide to your own left: the `+1` line toward `-y`, the other back.
          for (const couple of part.couples) {
            couples.push({ ...couple, place: couple.place - couple.direction });
          }
        } else {
          const couple = part.couples[0]!;
          couples.push({
            ...couple,
            place: couple.place + couple.direction,
            direction: couple.direction === 1 ? -1 : 1,
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
    const places = Math.floor((spec.couples - 2) / 2);
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
    add(-1, 1);
    for (let place = 0; place < places; place++) {
      add(place, 1);
      add(place, -1);
    }
    add(places, -1);
    // An odd number of couples cannot fill a becket set — two couples stand at
    // every dancing place, one from each line — so the odd one out takes a
    // second waiting place beyond the bottom end. The set then alternates
    // between `places` dancing places and `places − 1`, which is what a real
    // line of five couples does: somebody is always out, and it is never the
    // same couple twice running.
    if (spec.couples % 2 !== 0) add(places + 1, -1);
    return {
      id: spec.id,
      // `spec.centre` is where the *first* dancer of a line stands — that is what
      // it means for a duple improper set, and a hall hands the same point to
      // both formations. A becket set's first dancer is at place `-1`, so the
      // frame sits one waiting place plus half a couple down the hall from it,
      // and the two formations lay their lines out from the same place.
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
