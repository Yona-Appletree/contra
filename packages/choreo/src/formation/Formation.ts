import type { Angle, Vec2 } from "@caller/core";
import type { Frame } from "./Frame.js";
import { frameAngle, framePoint } from "./Frame.js";

/** A dancer, stable for the life of a hall. */
export type DancerId = string;
/** A place in a formation's group layout, e.g. contra's `"1L"`. */
export type StationId = string;
/** One instance of a group on the floor, minted fresh every time through. */
export type GroupId = string;
/** One couple in a set, stable for the life of a hall. */
export type CoupleId = string;
/** One longways set, square, or other independent unit of dancers. */
export type SetId = string;
/** A role in a role set, e.g. contra's `"lark"`. */
export type RoleName = string;

/**
 * The roles a formation's dancers take. `top` names the role whose hand stacks
 * on top of a joined pair; `@caller/core`'s `stackJoined` reads only that, so
 * neither `core` nor `choreo` ever mentions larks or robins.
 */
export interface RoleSet {
  roles: readonly RoleName[];
  top: RoleName;
}

/**
 * One place in a group's layout. `p` and `facing` are in the group frame's
 * local axes (see {@link Frame}); `role` is the role of the dancer bound here
 * **at the start of a time through**, not a claim about who stands here later —
 * a duple-improper lark ends the dance standing on the two-robin's station.
 */
export interface Station {
  id: StationId;
  p: Vec2;
  facing: Angle;
  role: RoleName;
}

/** Where a station sits in the world, given the frame its group runs in. */
export const stationPose = (f: Frame, s: Station): { p: Vec2; facing: Angle } => ({
  p: framePoint(f, s.p),
  facing: frameAngle(f, s.facing),
});

/** One couple, wherever it currently stands in its set. */
export interface CoupleState {
  id: CoupleId;
  /** Which dancer takes each role. */
  dancers: Readonly<Record<RoleName, DancerId>>;
  /** Index along the set: 0 is the top of a contra line. */
  place: number;
  /** Which way the couple travels. Contra: `1` for the ones, `-1` for the twos. */
  direction: 1 | -1;
}

/**
 * One independent set of dancers — a longways set, a square — and where it
 * stands. `frame.axis` points down the set; `pitch` is the distance between
 * adjacent places along it, in px.
 */
export interface SetState {
  id: SetId;
  frame: Frame;
  pitch: number;
  couples: readonly CoupleState[];
}

/** Every set on the floor. */
export interface HallState {
  sets: readonly SetState[];
}

/** How many couples a set starts with and where it stands. */
export interface SetSpec {
  id: SetId;
  couples: number;
  centre: Vec2;
  axis: Angle;
}

/** How a set state is partitioned into the groups that dance one time through. */
export interface GroupPlan {
  id: GroupId;
  /** `"set"` groups dance the dance; `"wait"` groups dance `wait-out`. */
  kind: "set" | "wait";
  frame: Frame;
  stations: readonly Station[];
  members: Readonly<Record<StationId, DancerId>>;
  couples: readonly CoupleId[];
}

/** A formation-specific rule for what one time through does to a set. */
export interface Progression {
  /** The set as it stands after one time through. */
  next(set: SetState): SetState;
}

/**
 * A formation: the stations a group of `n` stands on, the roles they take, how
 * a set breaks into groups, and what a time through does to the set.
 *
 * Everything here is form-neutral. `@caller/contra` supplies duple improper and
 * becket; `src/testing/square.ts` supplies a square, which is what proves it.
 */
export interface Formation {
  id: string;
  roleSet: RoleSet;
  /** The layout of a group of `n` dancers, in frame-local px. */
  group(n: number): Station[];
  progression: Progression;
  /** The groups that dance one time through, in set order. */
  groups(set: SetState): GroupPlan[];
  /** A fresh set, with couples and dancers named from `spec.id`. */
  start(spec: SetSpec): SetState;
  /** Station subsets a {@link Selector} tag names, for a group of `n`. */
  tags(n: number): Record<string, StationId[]>;
}

/** Every dancer in a hall, in set then place then role order. */
export function hallDancers(hall: HallState): DancerId[] {
  const out: DancerId[] = [];
  for (const set of hall.sets) {
    for (const couple of [...set.couples].sort((a, b) => a.place - b.place)) {
      for (const role of Object.keys(couple.dancers).sort()) {
        const id = couple.dancers[role];
        if (id !== undefined) out.push(id);
      }
    }
  }
  return out;
}

/** Look a station up by id, or throw with the ids that do exist. */
export function stationById(stations: readonly Station[], id: StationId): Station {
  const found = stations.find((s) => s.id === id);
  if (!found) {
    throw new Error(`no station "${id}" in [${stations.map((s) => s.id).join(", ")}]`);
  }
  return found;
}

/** A hall of one set per spec, all in the same formation. */
export const createHall = (formation: Formation, specs: readonly SetSpec[]): HallState => ({
  sets: specs.map((spec) => formation.start(spec)),
});
