import { HOLD_SPACING_PX, dirOf, rightOf } from "@caller/core";
import type {
  CoupleState,
  Formation,
  GroupPlan,
  GroupSelector,
  RoleSet,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "../formation/Formation.js";
import { HANDS_FOUR_GROUP, stationPose } from "../formation/Formation.js";
import { frame, framePoint, localAngle, localPoint, reverseFrame } from "../formation/Frame.js";

/**
 * The neutral `"line"`-equivalent selector M2's own brief asks the square
 * fixture to prove the waiting-couple sweep with: the square's one dancing
 * group, widened — when a couple stands out at either end — to include that
 * couple's two stations too, so a call can sweep it in for part of a cycle
 * exactly as `@caller/contra`'s `"line"` sweeps a waiting couple into
 * `long-lines`/`down-the-hall`. No contra knowledge anywhere in it: a square
 * has no lines, only a couple standing out beyond either end of its own axis.
 */
export const LINE_GROUP: GroupSelector = "line";

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

/** How many couples fit in the square itself; anybody else stands out. */
export const SQUARE_PLACES = 4;
/** Half the distance between the two dancers of a couple standing out, in px. */
export const SQUARE_WAIT_HALF_PX = 16;

/**
 * The two stations of a couple with no place in the square, standing out beyond
 * one end of the set's own axis and facing each other across it.
 *
 * A square does not really have couples standing out — this is the fixture
 * doing on purpose what a longways set does by accident, so that the engine's
 * two outs, its waiting groups and `wait-out` are all exercised by something
 * that is not a contra. `wait-out` swaps the two, and the fixture's own
 * progression turns the frame end for end each time through so the swap lands
 * them back on their own stations.
 */
export const SQUARE_WAIT_STATIONS: readonly Station[] = [
  { id: "WL", role: "lark", facing: 0, p: [-SQUARE_WAIT_HALF_PX, 0] },
  { id: "WR", role: "robin", facing: 180, p: [SQUARE_WAIT_HALF_PX, 0] },
];

/**
 * Which end of the set a couple standing out is at.
 *
 * The square's signal is its `place`: below the square's own four places is the
 * top of the set, beyond them the bottom. (A longways formation reads the same
 * thing off a waiting couple's own progression direction instead; the interface
 * asks for the answer, not for how it was reached.) `undefined` is a couple
 * with a place in the square, which is not standing out at all.
 */
export const squareWaitKind = (place: number): "wait-top" | "wait-bottom" | undefined => {
  if (place < 0) return "wait-top";
  if (place >= SQUARE_PLACES) return "wait-bottom";
  return undefined;
};

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

const dancerOn = (couple: CoupleState, role: string): string => {
  const dancer = couple.dancers[role];
  if (dancer === undefined) throw new Error(`couple "${couple.id}" has no ${role}`);
  return dancer;
};

/** The frame a couple standing out at `place` waits in. */
const waitFrame = (set: SetState, couple: CoupleState) => {
  const base = frame(
    framePoint(set.frame, [0, couple.place * set.pitch]),
    set.frame.axis,
    set.frame.spacing,
  );
  // Turned end for end every other time through, so `wait-out`'s swap puts each
  // dancer down where the next time through picks them up — the same trick a
  // longways formation plays on the couple waiting at the far end of the line.
  return couple.direction === 1 ? base : reverseFrame(base);
};

/** The plain `"hands-four"` partition: one eight-station square, plus any outs. */
function handsFourGroupsFor(set: SetState): GroupPlan[] {
  const ordered = [...set.couples].sort((a, b) => a.place - b.place);
  const dancing = ordered.filter((c) => squareWaitKind(c.place) === undefined);
  if (dancing.length !== SQUARE_PLACES) {
    throw new Error(`a square has four couples in it, not ${dancing.length}`);
  }
  const members: Record<StationId, string> = {};
  for (const couple of dancing) {
    const number = couple.place + 1;
    for (const role of SQUARE_ROLES.roles) {
      members[`${number}${role === "lark" ? "L" : "R"}`] = dancerOn(couple, role);
    }
  }
  const square: GroupPlan = {
    id: `${set.id}/square`,
    kind: "set",
    frame: set.frame,
    stations: squareStations(),
    members,
    couples: dancing.map((c) => c.id),
  };

  // In place order down the set, so the whole partition reads top to bottom.
  const plans: GroupPlan[] = [];
  for (const couple of ordered) {
    const kind = squareWaitKind(couple.place);
    if (kind === undefined) {
      if (!plans.includes(square)) plans.push(square);
      continue;
    }
    plans.push({
      id: `${set.id}/w${couple.place}`,
      kind,
      frame: waitFrame(set, couple),
      stations: SQUARE_WAIT_STATIONS.map((s) => ({ ...s })),
      members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
      couples: [couple.id],
    });
  }
  return plans;
}

/**
 * The `"line"` partition: the same one dancing group, widened to fold in
 * whichever couple(s) stand out beyond either end — never a separate
 * `"wait-*"` plan of its own, because `"line"` is defined to widen maximally
 * regardless of any one call's own `ends`; a call that does not want a given
 * end excludes those stations itself (`createScriptDecider`'s
 * `excludedByEnds`), reading the `"wait-top"`/`"wait-bottom"` tags below. This
 * is always a single `kind: "set"` plan — a true partition, since folding a
 * standing-out couple's two stations in here is what keeps them from *also*
 * appearing in a separate wait plan.
 */
function lineGroupFor(set: SetState): GroupPlan {
  const ordered = [...set.couples].sort((a, b) => a.place - b.place);
  const dancing = ordered.filter((c) => squareWaitKind(c.place) === undefined);
  if (dancing.length !== SQUARE_PLACES) {
    throw new Error(`a square has four couples in it, not ${dancing.length}`);
  }
  const members: Record<StationId, string> = {};
  for (const couple of dancing) {
    const number = couple.place + 1;
    for (const role of SQUARE_ROLES.roles) {
      members[`${number}${role === "lark" ? "L" : "R"}`] = dancerOn(couple, role);
    }
  }
  const stations: Station[] = squareStations();
  const couples = [...dancing.map((c) => c.id)];
  for (const couple of ordered) {
    const kind = squareWaitKind(couple.place);
    if (kind === undefined) continue;
    couples.push(couple.id);
    const suffix = kind === "wait-top" ? "top" : "bottom";
    const wf = waitFrame(set, couple);
    for (const s of SQUARE_WAIT_STATIONS) {
      const world = stationPose(wf, s);
      const id = `${s.id}-${suffix}`;
      stations.push({
        id,
        role: s.role,
        p: localPoint(set.frame, world.p),
        facing: localAngle(set.frame, world.facing),
      });
      members[id] = dancerOn(couple, s.role);
    }
  }
  return { id: `${set.id}/line`, kind: "set", frame: set.frame, stations, members, couples };
}

/**
 * The square formation. A square dance ends where it began, so nothing
 * progresses — except a couple standing out, which turns over so it can cross.
 */
export const SQUARE: Formation = {
  id: "square",
  roleSet: SQUARE_ROLES,

  group(n: number): Station[] {
    if (n === 8) return squareStations();
    if (n === 2) return SQUARE_WAIT_STATIONS.map((s) => ({ ...s }));
    throw new Error(`a square dances in groups of eight, or waits in twos, not ${n}`);
  },

  groupFor(selector: GroupSelector): Station[] {
    if (selector === HANDS_FOUR_GROUP) return squareStations();
    if (selector === LINE_GROUP) {
      // The widest case, unconditionally, per M2's contract for `groupFor`: a
      // representative six-couple square (one couple out at each end) run
      // through the real `groupsFor` gives the abstract shape directly,
      // rather than re-deriving the wait geometry by hand a second time.
      const wide = SQUARE.start({ id: "_line-template", couples: 6, centre: [0, 0], axis: 90 });
      return SQUARE.groupsFor(LINE_GROUP, wide)[0]!.stations.map((s) => ({ ...s }));
    }
    throw new Error(`a square knows no group selector "${selector}"`);
  },

  progression: {
    next(set: SetState): SetState {
      // Nobody standing out: the square really does end where it began, and the
      // very same object comes back.
      if (set.couples.every((c) => squareWaitKind(c.place) === undefined)) return set;
      return {
        ...set,
        couples: set.couples.map((couple) =>
          squareWaitKind(couple.place) === undefined
            ? couple
            : { ...couple, direction: couple.direction === 1 ? -1 : 1 },
        ),
      };
    },
  },

  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[] {
    if (selector === HANDS_FOUR_GROUP) return handsFourGroupsFor(set);
    if (selector === LINE_GROUP) return [lineGroupFor(set)];
    throw new Error(`a square knows no group selector "${selector}"`);
  },

  start(spec: SetSpec): SetState {
    if (spec.couples < SQUARE_PLACES) {
      throw new Error(`a square needs at least four couples, not ${spec.couples}`);
    }
    const couples: CoupleState[] = [];
    for (let i = 0; i < spec.couples; i++) {
      couples.push({
        id: `${spec.id}/c${i}`,
        dancers: { lark: `${spec.id}/c${i}/lark`, robin: `${spec.id}/c${i}/robin` },
        // The first four fill the square; a fifth couple stands out beyond the
        // bottom of the set, a sixth beyond the top, and there is no room for a
        // seventh. An odd-couple set is what gives the fixture its two outs.
        place: i < SQUARE_PLACES ? i : extraPlace(i - SQUARE_PLACES, spec.couples),
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

  tags(selector: GroupSelector): Record<string, StationId[]> {
    const stations = squareStations().map((s) => s.id);
    if (selector === HANDS_FOUR_GROUP) {
      return {
        all: stations,
        heads: [...SQUARE_HEADS],
        sides: [...SQUARE_SIDES],
        larks: stations.filter((id) => id.endsWith("L")),
        robins: stations.filter((id) => id.endsWith("R")),
      };
    }
    if (selector === LINE_GROUP) {
      // `"wait-top"`/`"wait-bottom"` are what `createScriptDecider`'s
      // `excludedByEnds` reads for a call whose `ends` is not `"both"` — the
      // same two names `GroupPlan.kind`'s own two outs use, not a new
      // vocabulary. `resolveSelector` filters every tag down to the ids a
      // given instance's own group actually has, so this one abstract table
      // (the widest case, both ends) is correct at the interior (neither
      // present) and at either true end (only that end's pair present) alike.
      const waitTop = ["WL-top", "WR-top"];
      const waitBottom = ["WL-bottom", "WR-bottom"];
      return {
        all: [...stations, ...waitTop, ...waitBottom],
        heads: [...SQUARE_HEADS],
        sides: [...SQUARE_SIDES],
        larks: [...stations.filter((id) => id.endsWith("L")), "WL-top", "WL-bottom"],
        robins: [...stations.filter((id) => id.endsWith("R")), "WR-top", "WR-bottom"],
        "wait-top": waitTop,
        "wait-bottom": waitBottom,
      };
    }
    throw new Error(`a square knows no group selector "${selector}"`);
  },
};

/** Where the `n`th couple with no place in the square stands: bottom, then top. */
function extraPlace(n: number, couples: number): number {
  if (n === 0) return SQUARE_PLACES;
  if (n === 1) return -1;
  throw new Error(`a square seats four, five or six couples, not ${couples}`);
}
