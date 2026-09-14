import type {
  CoupleState,
  DancerId,
  Formation,
  Frame,
  GroupKind,
  GroupPlan,
  GroupSelector,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  frame,
  framePoint,
  localAngle,
  localPoint,
  reverseFrame,
  stationPose,
} from "@caller/choreo";
import { CONTRA_ROLES } from "../roles.js";
import type { ShadowPart } from "./shadowSeam.js";
import { partitionShadowSeams } from "./shadowSeam.js";

/**
 * Duple improper: two long lines, couples alternating down each line, the ones
 * travelling down and the twos travelling up.
 *
 * The lines are `HOLD_SPACING_PX + LINE_OFFSET_PX` apart — the plan's AC3
 * number, "the two lines 18 px further apart than a single pair's spacing" —
 * and adjacent dancers along a line stand {@link PLACE_PITCH_PX} apart, which
 * is the hall spike's own 10 px per half-place, retyped rather than imported.
 *
 * Improper means the larks alternate down each line: the one-lark stands in the
 * robins' line at `+x`, the two-lark in the larks' line at `−x`. A station's
 * `role` is therefore who *starts* there; a one-lark ends the dance standing on
 * the two-robin's station, which is exactly the progression.
 */
export const ACROSS_PX = HOLD_SPACING_PX + LINE_OFFSET_PX;
/** How far apart adjacent dancers stand along a line, in px. */
export const PLACE_PITCH_PX = 20;

const HALF_ACROSS = ACROSS_PX / 2;
const HALF_ALONG = PLACE_PITCH_PX / 2;

/**
 * What the caller says between two dances to get a hall standing in duple
 * improper: the one line every contra caller says, and the one the hall has
 * been hearing since M7.
 */
export const DUPLE_IMPROPER_LINE_UP_CALLS: readonly string[] = ["HANDS FOUR FROM THE TOP"];

/** Down the hall in frame-local degrees; the ones face this way. */
const DOWN = 90;
/** Up the hall in frame-local degrees; the twos face this way. */
const UP = 270;

/** The four stations of a minor set: ones at the top, twos below, larks alternating. */
export const DUPLE_IMPROPER_STATIONS: readonly Station[] = [
  { id: "1L", role: "lark", facing: DOWN, p: [HALF_ACROSS, -HALF_ALONG] },
  { id: "1R", role: "robin", facing: DOWN, p: [-HALF_ACROSS, -HALF_ALONG] },
  { id: "2L", role: "lark", facing: UP, p: [-HALF_ACROSS, HALF_ALONG] },
  { id: "2R", role: "robin", facing: UP, p: [HALF_ACROSS, HALF_ALONG] },
];

/**
 * The two stations of a couple waiting at the end of the line, facing each
 * other across the set. `wait-out` swaps them, which is the cross-over: the
 * lark comes back on the other line, which is where the next time through
 * wants it. The frame is turned end for end for the couple waiting at the
 * bottom, so one layout serves both ends.
 */
export const DUPLE_IMPROPER_WAIT_STATIONS: readonly Station[] = [
  { id: "WL", role: "lark", facing: 0, p: [-HALF_ACROSS, 0] },
  { id: "WR", role: "robin", facing: 180, p: [HALF_ACROSS, 0] },
];

/**
 * The `"shadow-pair"` seam group's four stations (M2, D7): the couple whose
 * own progression faces this seam from above (`N`, always the couple
 * travelling `direction: -1` — a "twos" in its own minor set), paired with
 * the couple facing it from below (`F`, always `direction: 1`, a "ones" in
 * its own). See `shadowSeam.ts` for why this is always the pairing, and
 * `NL`/`NR`/`FL`/`FR` (near/far, not the seam-local couple's own "1"/"2"
 * labels, since either couple may be a "ones" or a "twos" of its own set
 * depending which end of the seam it sits on) for the naming this milestone
 * settled on instead of the brief's own `1L+`/`2R-` sketch — see the M2
 * report for why.
 */
const SHADOW_SEAM_STATIONS: readonly Station[] = [
  { id: "NL", role: "lark", facing: DOWN, p: [-HALF_ACROSS, -HALF_ALONG] },
  { id: "NR", role: "robin", facing: DOWN, p: [HALF_ACROSS, -HALF_ALONG] },
  { id: "FL", role: "lark", facing: UP, p: [HALF_ACROSS, HALF_ALONG] },
  { id: "FR", role: "robin", facing: UP, p: [-HALF_ACROSS, HALF_ALONG] },
];

/** A true end's own two stations — nobody on the far side of this seam. */
const SHADOW_END_STATIONS: readonly Station[] = [
  { id: "NL", role: "lark", facing: 0, p: [-HALF_ACROSS, 0] },
  { id: "NR", role: "robin", facing: 180, p: [HALF_ACROSS, 0] },
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
 * A true-end waiting couple's two stations, re-expressed in `into`'s own
 * frame and suffixed by which end it is at — `"top"`/`"bottom"`, the same two
 * words `GroupPlan.kind`'s own two outs use.
 *
 * Reuses the plain wait `GroupPlan`'s own frame (`reverseFrame` at the
 * bottom, exactly as `groupsFor("hands-four", ...)` already builds it) and
 * converts its stations' world poses into `into`'s local axes
 * (`localPoint`/`localAngle`, `@caller/choreo`'s inverse of `framePoint`/
 * `frameAngle`) rather than re-deriving the geometry a second time.
 */
function widenedWaitStations(
  set: SetState,
  couple: CoupleState,
  into: Frame,
): { stations: Station[]; members: Record<StationId, DancerId> } {
  const base = at(set, couple.place);
  const waitFrame = couple.direction === 1 ? reverseFrame(base) : base;
  const suffix = waitKindOf(couple) === "wait-top" ? "top" : "bottom";
  const stations = DUPLE_IMPROPER_WAIT_STATIONS.map((s) => {
    const world = stationPose(waitFrame, s);
    return { id: `${s.id}-${suffix}`, role: s.role, p: localPoint(into, world.p), facing: localAngle(into, world.facing) };
  });
  const members: Record<StationId, DancerId> = {
    [`WL-${suffix}`]: dancerOn(couple, "lark"),
    [`WR-${suffix}`]: dancerOn(couple, "robin"),
  };
  return { stations, members };
}

/**
 * `groupsFor("line", set)`: each minor set's own four stations, widened —
 * only at a true end, only there — to fold in the waiting couple beyond it.
 *
 * Always exactly one `kind: "set"` plan per minor set, never a separate wait
 * plan for the couple it absorbs: `"line"` is defined to widen maximally
 * regardless of any one call's own `ends`, and a call that does not want a
 * given end excludes those stations for itself
 * (`createScriptDecider`'s `excludedByEnds`, reading the `"wait-top"`/
 * `"wait-bottom"` tags below) rather than `groupsFor` producing two different
 * partitions for the same selector.
 */
function lineGroupsFor(set: SetState): GroupPlan[] {
  const parts = partitionDupleImproper(set);
  const setIdx = parts.map((p, i) => (p.kind === "set" ? i : -1)).filter((i) => i >= 0);
  const firstIdx = setIdx[0];
  const lastIdx = setIdx[setIdx.length - 1];
  const plans: GroupPlan[] = [];
  parts.forEach((part, i) => {
    if (part.kind !== "set") return;
    const [ones, twos] = part.couples as [CoupleState, CoupleState];
    const dancingFrame = at(set, (ones.place + twos.place) / 2);
    const stations: Station[] = DUPLE_IMPROPER_STATIONS.map((s) => ({ ...s }));
    const members: Record<StationId, DancerId> = {
      "1L": dancerOn(ones, "lark"),
      "1R": dancerOn(ones, "robin"),
      "2L": dancerOn(twos, "lark"),
      "2R": dancerOn(twos, "robin"),
    };
    const couples = [ones.id, twos.id];
    const top = parts[0]!;
    const bottom = parts[parts.length - 1]!;
    if (i === firstIdx && top.kind !== "set") {
      const w = widenedWaitStations(set, top.couples[0]!, dancingFrame);
      stations.push(...w.stations);
      Object.assign(members, w.members);
      couples.push(top.couples[0]!.id);
    }
    if (i === lastIdx && bottom.kind !== "set" && bottom !== top) {
      const w = widenedWaitStations(set, bottom.couples[0]!, dancingFrame);
      stations.push(...w.stations);
      Object.assign(members, w.members);
      couples.push(bottom.couples[0]!.id);
    }
    plans.push({
      id: `${set.id}/line${ones.place}`,
      kind: "set",
      frame: dancingFrame,
      stations,
      members,
      couples,
    });
  });
  return plans;
}

/** One part of a set for one time through: a minor set, or a couple standing out. */
interface Part {
  kind: GroupKind;
  couples: CoupleState[];
}

/**
 * Which end of the line a couple with nobody to dance with is standing out at.
 *
 * Its own travelling direction says so, and says so for free: the scan below
 * pairs a couple travelling down with the couple travelling up *below* it, so
 * the only couple travelling up that can be left over is the one at the top
 * with nobody above it, and the only couple travelling down that can be left
 * over is the one at the bottom with nobody below. It is the same signal the
 * group's frame is already turned by — the bottom out's frame is reversed, so
 * one wait layout serves both ends — surfaced rather than derived twice.
 *
 * A set built by hand rather than by {@link DUPLE_IMPROPER}'s own `start` and
 * progression can put a leftover couple in the middle of the line (everybody
 * travelling the same way, say). There is no top or bottom to such a couple;
 * it is read as the end its direction names, and a formation asked to partition
 * a set it never produces gets an answer of the same quality as the question.
 */
const waitKindOf = (couple: CoupleState): GroupKind =>
  couple.direction === 1 ? "wait-bottom" : "wait-top";

/**
 * Hands four from the top: scan down the line, pair each couple travelling
 * down with the couple travelling up below it, and let anyone left over wait.
 *
 * With an even number of couples this alternates between pairing from place 0
 * and pairing from place 1, so a couple waits at each end every other time
 * through; with an odd number one couple waits every time through, and it is
 * the other end each time. Both fall out of the scan, which is why there is no
 * special case for either.
 */
export function partitionDupleImproper(set: SetState): Part[] {
  const ordered = [...set.couples].sort((a, b) => a.place - b.place);
  const parts: Part[] = [];
  let i = 0;
  while (i < ordered.length) {
    const ones = ordered[i]!;
    const twos = ordered[i + 1];
    if (ones.direction === 1 && twos !== undefined && twos.direction === -1) {
      parts.push({ kind: "set", couples: [ones, twos] });
      i += 2;
    } else {
      parts.push({ kind: waitKindOf(ones), couples: [ones] });
      i += 1;
    }
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

/** Duple improper, the formation most of the demo's dances are in. */
export const DUPLE_IMPROPER: Formation = {
  id: "duple-improper",
  roleSet: CONTRA_ROLES,
  lineUpCalls: DUPLE_IMPROPER_LINE_UP_CALLS,

  group(n: number): Station[] {
    if (n === 4) return DUPLE_IMPROPER_STATIONS.map((s) => ({ ...s }));
    if (n === 2) return DUPLE_IMPROPER_WAIT_STATIONS.map((s) => ({ ...s }));
    throw new Error(`duple improper dances in fours, or waits in twos, not ${n}`);
  },

  groupFor(selector: GroupSelector): Station[] {
    if (selector === SHADOW_PAIR_GROUP) return SHADOW_SEAM_STATIONS.map((s) => ({ ...s }));
    if (selector === LINE_GROUP) {
      // The plain four-station shape, not the widest six/eight-station one:
      // no dance calls `"line"` in this milestone, so `chainCalls` never
      // threads a dance's `from` against this template, and duple improper
      // (unlike becket) can never have a wait couple at *both* true ends at
      // once, so there is no single representative instance to derive the
      // widest case from the way the square fixture's `groupFor` does.
      // Flagged in the M2 report as owed to whichever milestone first
      // authors a `"line"`-selector dance in duple improper.
      return DUPLE_IMPROPER_STATIONS.map((s) => ({ ...s }));
    }
    onlyHandsFour(selector);
    return DUPLE_IMPROPER_STATIONS.map((s) => ({ ...s }));
  },

  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[] {
    if (selector === SHADOW_PAIR_GROUP) {
      return partitionShadowSeams(set).map((part) => shadowGroupPlan(set, part));
    }
    if (selector === LINE_GROUP) return lineGroupsFor(set);
    onlyHandsFour(selector);
    return partitionDupleImproper(set).map((part): GroupPlan => {
      if (part.kind === "set") {
        const [ones, twos] = part.couples as [CoupleState, CoupleState];
        return {
          id: `${set.id}/p${ones.place}`,
          kind: "set",
          frame: at(set, (ones.place + twos.place) / 2),
          stations: DUPLE_IMPROPER_STATIONS.map((s) => ({ ...s })),
          members: {
            "1L": dancerOn(ones, "lark"),
            "1R": dancerOn(ones, "robin"),
            "2L": dancerOn(twos, "lark"),
            "2R": dancerOn(twos, "robin"),
          },
          couples: [ones.id, twos.id],
        };
      }
      const couple = part.couples[0]!;
      const base = at(set, couple.place);
      return {
        id: `${set.id}/w${couple.place}`,
        kind: part.kind,
        // A couple waiting at the bottom is a ones; turning its frame end for
        // end puts its lark back on the +x line and leaves it facing up the
        // hall when the crossing is done.
        frame: couple.direction === 1 ? reverseFrame(base) : base,
        stations: DUPLE_IMPROPER_WAIT_STATIONS.map((s) => ({ ...s })),
        members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
        couples: [couple.id],
      };
    });
  },

  progression: {
    next(set: SetState): SetState {
      const couples: CoupleState[] = [];
      for (const part of partitionDupleImproper(set)) {
        if (part.kind === "set") {
          const [ones, twos] = part.couples as [CoupleState, CoupleState];
          couples.push({ ...ones, place: twos.place });
          couples.push({ ...twos, place: ones.place });
        } else {
          const couple = part.couples[0]!;
          couples.push({ ...couple, direction: couple.direction === 1 ? -1 : 1 });
        }
      }
      return { ...set, couples: couples.sort((a, b) => a.place - b.place) };
    },
  },

  start(spec: SetSpec): SetState {
    if (spec.couples < 2) throw new Error(`a line needs at least two couples, not ${spec.couples}`);
    const couples: CoupleState[] = [];
    for (let i = 0; i < spec.couples; i++) {
      couples.push({
        id: `${spec.id}/c${i}`,
        dancers: { lark: `${spec.id}/c${i}/lark`, robin: `${spec.id}/c${i}/robin` },
        place: i,
        direction: i % 2 === 0 ? 1 : -1,
      });
    }
    return {
      id: spec.id,
      frame: frame(spec.centre, spec.axis, HOLD_SPACING_PX),
      pitch: PLACE_PITCH_PX,
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
        // Pairing tags: everybody in the seam group has a shadow, exactly as
        // everybody in a hands-four group has a neighbour and a partner —
        // resolved to the whole group, with the pairing itself a figure's own
        // business (M6). See this package's README/M2 report for the
        // near/far, same-physical-line reasoning and the open question over
        // which column reads as "left" vs "right".
        shadow: all,
        "left-diagonal": ["NL", "FR"],
        "right-diagonal": ["NR", "FL"],
      };
    }
    if (selector === LINE_GROUP) {
      const all = DUPLE_IMPROPER_STATIONS.map((s) => s.id);
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
        // Read by `createScriptDecider`'s `excludedByEnds` for a call whose
        // `ends` is not `"both"`; empty at the interior and at the other true
        // end, via `resolveSelector`'s own filter-to-present-ids.
        "wait-top": waitTop,
        "wait-bottom": waitBottom,
      };
    }
    onlyHandsFour(selector);
    const all = DUPLE_IMPROPER_STATIONS.map((s) => s.id);
    return {
      all,
      larks: ["1L", "2L"],
      robins: ["1R", "2R"],
      ones: ["1L", "1R"],
      twos: ["2L", "2R"],
      // Pairing tags name who you dance it with, not who dances: everybody in
      // the minor set has a neighbour and a partner. Which of them a figure
      // takes is a figure parameter, which is M8's business.
      neighbors: all,
      partners: all,
    };
  },
};

/** The group selectors duple improper defines beyond `"hands-four"`. */
export const SHADOW_PAIR_GROUP: GroupSelector = "shadow-pair";
export const LINE_GROUP: GroupSelector = "line";

/**
 * A selector duple improper does not know is an error, not an empty group:
 * one it has not built yet should say so rather than quietly dancing in
 * fours.
 */
function onlyHandsFour(selector: GroupSelector): void {
  if (selector === HANDS_FOUR_GROUP) return;
  throw new Error(
    `duple improper has no group selector "${selector}" (has: "${HANDS_FOUR_GROUP}", "${SHADOW_PAIR_GROUP}", "${LINE_GROUP}")`,
  );
}
