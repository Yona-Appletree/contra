import { HOLD_SPACING_PX, dirOf, rightOf } from "@caller/core";
import type {
  CoupleState,
  Formation,
  GroupPlan,
  RoleSet,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "../formation/Formation.js";
import { frame } from "../formation/Frame.js";

/**
 * A square: four couples on the sides of a square, facing the middle.
 *
 * This is the neutrality fixture. It shares nothing with contra but the model
 * itself — no lines, no ones and twos, no progression, groups of eight rather
 * than four — and it runs through the same `Formation`, the same decider and
 * the same `poseAt`. If `@caller/choreo` ever grows a contra assumption, this
 * is what catches it.
 *
 * The role names happen to be lark and robin, because that is what square
 * dancers in this tradition call them too; nothing in `choreo` reads them.
 */
export const SQUARE_ROLES: RoleSet = { roles: ["lark", "robin"], top: "robin" };

/** How far each couple stands from the middle of the square, in px. */
export const SQUARE_RADIUS_PX = 26;
/** How far each dancer stands from the middle of their own side, in px. */
export const SQUARE_HALF_COUPLE_PX = 10;

/** Couples 1 and 3. */
export const SQUARE_HEADS = ["1L", "1R", "3L", "3R"];
/** Couples 2 and 4. */
export const SQUARE_SIDES = ["2L", "2R", "4L", "4R"];

/** The eight stations, couple 1 at local −y and the rest a quarter-turn apart. */
export function squareStations(): Station[] {
  const stations: Station[] = [];
  for (let couple = 1; couple <= 4; couple++) {
    // Couple 1 faces local +y from local −y; each later couple is 90° round.
    const facing = 90 + (couple - 1) * 90;
    const inward = dirOf(facing);
    const centre: [number, number] = [-inward[0] * SQUARE_RADIUS_PX, -inward[1] * SQUARE_RADIUS_PX];
    // The robin stands on the lark's right.
    const right = rightOf(facing);
    stations.push({
      id: `${couple}L`,
      role: "lark",
      facing,
      p: [
        centre[0] - right[0] * SQUARE_HALF_COUPLE_PX,
        centre[1] - right[1] * SQUARE_HALF_COUPLE_PX,
      ],
    });
    stations.push({
      id: `${couple}R`,
      role: "robin",
      facing,
      p: [
        centre[0] + right[0] * SQUARE_HALF_COUPLE_PX,
        centre[1] + right[1] * SQUARE_HALF_COUPLE_PX,
      ],
    });
  }
  return stations;
}

/** The square formation. A square dance ends where it began, so nothing progresses. */
export const SQUARE: Formation = {
  id: "square",
  roleSet: SQUARE_ROLES,

  group(n: number): Station[] {
    if (n !== 8) throw new Error(`a square dances in groups of eight, not ${n}`);
    return squareStations();
  },

  progression: { next: (set: SetState): SetState => set },

  groups(set: SetState): GroupPlan[] {
    if (set.couples.length !== 4) {
      throw new Error(`a square has four couples, not ${set.couples.length}`);
    }
    const stations = squareStations();
    const members: Record<StationId, string> = {};
    for (const couple of set.couples) {
      const number = couple.place + 1;
      for (const role of SQUARE_ROLES.roles) {
        const dancer = couple.dancers[role];
        if (dancer === undefined) throw new Error(`couple "${couple.id}" has no ${role}`);
        members[`${number}${role === "lark" ? "L" : "R"}`] = dancer;
      }
    }
    return [
      {
        id: `${set.id}/square`,
        kind: "set",
        frame: set.frame,
        stations,
        members,
        couples: set.couples.map((c) => c.id),
      },
    ];
  },

  start(spec: SetSpec): SetState {
    if (spec.couples !== 4) throw new Error(`a square needs four couples, not ${spec.couples}`);
    const couples: CoupleState[] = [];
    for (let i = 0; i < 4; i++) {
      couples.push({
        id: `${spec.id}/c${i}`,
        dancers: { lark: `${spec.id}/c${i}/lark`, robin: `${spec.id}/c${i}/robin` },
        place: i,
        direction: 1,
      });
    }
    return {
      id: spec.id,
      frame: frame(spec.centre, spec.axis, HOLD_SPACING_PX),
      pitch: SQUARE_RADIUS_PX * 2,
      couples,
    };
  },

  tags(n: number): Record<string, StationId[]> {
    if (n !== 8) throw new Error(`a square dances in groups of eight, not ${n}`);
    const stations = squareStations().map((s) => s.id);
    return {
      all: stations,
      heads: [...SQUARE_HEADS],
      sides: [...SQUARE_SIDES],
      larks: stations.filter((id) => id.endsWith("L")),
      robins: stations.filter((id) => id.endsWith("R")),
    };
  },
};
