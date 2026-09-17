import type { Vec2 } from "@caller/core";
import { angleOf, dist } from "@caller/core";
import type { DancerId, Dialect } from "../dialect/Dialect.js";
import type { Hand, HoldId } from "../ir/Hold.js";

/** Where one dancer is and which way they point, on the floor. */
export interface Pose {
  p: Vec2;
  facing: number;
}

/** What one hand is doing: held with someone, or free. */
export interface HandState {
  hold: HoldId;
  with: DancerId;
}

/** One dancer's floor state as the scheduler advances it. */
export interface DancerFloor extends Pose {
  hands: { right?: HandState; left?: HandState };
}

/** Everyone's floor state: the set as the shared memory, mutable while scheduling. */
export type Floor = Record<DancerId, DancerFloor>;

export const initialFloor = (dialect: Dialect): Floor => {
  const floor: Floor = {};
  const state = dialect.initial();
  for (const id of dialect.dancers) {
    const d = state.dancers[id];
    if (!d) throw new Error(`dialect ${dialect.id} has no initial state for ${id}`);
    floor[id] = { p: d.p, facing: d.facing, hands: {} };
  }
  return floor;
};

export const bearing = (from: Vec2, to: Vec2): number => angleOf(to[0] - from[0], to[1] - from[1]);

export const spacing = (a: Pose, b: Pose): number => dist(a.p, b.p);

export const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export const handState = (d: DancerFloor, hand: Hand): HandState | undefined =>
  hand === "right" ? d.hands.right : d.hands.left;

export const setHand = (d: DancerFloor, hand: Hand, state: HandState | undefined): void => {
  if (hand === "right") d.hands.right = state;
  else d.hands.left = state;
};

export const sameHold = (a: HandState | undefined, b: HandState | undefined): boolean =>
  a !== undefined && b !== undefined && a.hold === b.hold && a.with === b.with;
