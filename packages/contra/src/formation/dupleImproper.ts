import type {
  CoupleState,
  DancerId,
  Formation,
  Frame,
  GroupPlan,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "@caller/choreo";
import { HOLD_SPACING_PX, LINE_OFFSET_PX, frame, framePoint, reverseFrame } from "@caller/choreo";
import { CONTRA_ROLES } from "../roles.js";

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

/** One part of a set for one time through: a minor set, or a couple waiting. */
interface Part {
  kind: "set" | "wait";
  couples: CoupleState[];
}

/**
 * Hands four from the top: scan down the line, pair each couple travelling
 * down with the couple travelling up below it, and let anyone left over wait.
 *
 * With an even number of couples this alternates between pairing from place 0
 * and pairing from place 1, so a couple waits at each end every other time
 * through; with an odd number one couple waits every time through. Both fall
 * out of the scan, which is why there is no special case for either.
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
      parts.push({ kind: "wait", couples: [ones] });
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

  groups(set: SetState): GroupPlan[] {
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
        kind: "wait",
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

  tags(n: number): Record<string, StationId[]> {
    if (n === 4) {
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
    }
    if (n === 2) {
      const all = DUPLE_IMPROPER_WAIT_STATIONS.map((s) => s.id);
      return { all, larks: ["WL"], robins: ["WR"], partners: all, neighbors: all };
    }
    throw new Error(`duple improper dances in fours, or waits in twos, not ${n}`);
  },
};
