import type { Angle, Vec2 } from "@caller/core";
import type {
  CoupleState,
  DancerId,
  EndPose,
  Frame,
  RoleName,
  SetId,
  SetState,
  Side,
} from "@caller/choreo";
import { frameAngle, framePoint } from "@caller/choreo";
import { relate } from "./relations.js";
import { setRulesOf } from "./SetRules.js";

/**
 * **Set state**: what the engine knows about a whole set at every figure
 * boundary — who is where, holding whom, on which slot of the line, and bound
 * to whom.
 *
 * This is the hub of the figure model (`vision.md` §"Set state"). It is the
 * generalisation of what lives in two unreconciled places today: `chain.ts`'s
 * load-time threading of `params.from` on the hands-four *template*, and the
 * script decider's per-dancer world-space `standingAt`. A figure call resolves
 * against one of these (`resolve.ts`), and a whole time through of a dance is
 * planned from one per set (`planCycle.ts`).
 *
 * Everything here is **plain data** and survives
 * `JSON.parse(JSON.stringify(model))`: no functions, no class instances, no
 * reference to a formation object. What a model needs from its formation — the
 * lattice its slots index and the relation table its words resolve through — is
 * reached by {@link SetModel.formation}, an id, through `setRulesOf` in
 * `SetRules.ts`. That is what lets `homeOf(model, dancer)` take the two
 * arguments the design gives it and still leave the model serialisable.
 */

/**
 * A place on the set's own lattice: which of the two lines, and how far along.
 *
 * `position` counts **dancer places** along the set, not couples, and its pitch
 * is `SetModel.pitch` (`PLACE_PITCH_PX`). Each formation decides how a couple's
 * two dancers land on it: duple improper puts a couple's two dancers on the two
 * lines at *one* position, becket puts them side by side on *one* line at two
 * adjacent positions. Which is exactly the trap `vision.md` Q1 names — "across"
 * means a different thing in the two formations — and exactly why the mapping
 * is the formation's (see {@link SetLattice}) and never the model's.
 */
export interface Slot {
  line: 0 | 1;
  position: number;
}

/** One hand held: whose hand it is in, and which of *their* hands. */
export interface Hold {
  with: DancerId;
  side: Side;
}

/** One dancer, as the set knows them at a figure boundary. */
export interface DancerState {
  /** `@caller/choreo`'s own id, stable for the evening. */
  id: DancerId;
  role: RoleName;
  /** Home this time through, and the origin of every relation. */
  slot: Slot;
  /** Which way along the set this dancer progresses. */
  travel: 1 | -1;
  /**
   * Where they actually stand now, in **world px**, with their facing.
   *
   * The design calls this a `Spot`; `@caller/contra` already uses that name for
   * the *frame-local* one every coded figure does its geometry in
   * (`figures/ContraFigure.ts`), so this is `@caller/choreo`'s `EndPose` —
   * the same two fields, in the same units the decider's `standingAt` uses.
   */
  spot: EndPose;
  /** Which hands are joined, by this dancer's own side. First-class state. */
  holds: Partial<Record<Side, Hold>>;
  /** A binding, not a geometric fact: a figure's ends may rebind it (M6). */
  partner: DancerId;
}

/**
 * What shape the set is in. `"lines"` is the only one M1 builds; M7 adds a line
 * of four with an order, a ring, a wave and a diamond.
 */
export type SetShape = "lines";

/** One whole set, at one figure boundary. */
export interface SetModel {
  id: SetId;
  /** The formation id this model's slots and relations are read with. */
  formation: string;
  /** The set's own frame: `+y` runs down the set. */
  frame: Frame;
  /** Px per `Slot.position` along the set. */
  pitch: number;
  /** How many positions the lattice spans, lowest occupied to highest. */
  positions: number;
  dancers: Record<DancerId, DancerState>;
  shape: SetShape;
}

/**
 * How one formation lays its dancers out on the lattice.
 *
 * Supplied by the contra formations (`dupleImproper.ts`, `becket.ts`) and
 * reached through `SetRules.ts`, never built here: the whole reason the new
 * layer lives in `@caller/contra` rather than `@caller/choreo` is that "which
 * line is across from me" is a contra fact (AC7, and `square.test.ts` is what
 * enforces it).
 */
export interface SetLattice {
  /** The formation this lattice belongs to. */
  id: string;
  /** Px between adjacent `Slot.position`s along the set. */
  pitch: number;
  /** Which slot the dancer of `couple` taking `role` calls home. */
  slotOf(couple: CoupleState, role: RoleName): Slot;
  /**
   * Where a slot's home is, in the **set frame's** own local px, and which way
   * its dancer faces there.
   *
   * `travel` is the dancer's own progression direction, which duple improper
   * needs (a ones faces down the hall and a twos up it from the same line) and
   * becket does not (a becket dancer faces across, and which way across is the
   * line's).
   */
  homeAt(slot: Slot, travel: 1 | -1): { p: Vec2; facing: Angle };
}

/**
 * The model of one set: every dancer's slot, travel, partner, holds and spot.
 *
 * `standingAt` says where each dancer actually is; a dancer it does not name
 * stands on their own home. Holds start empty — a hold is created by a figure
 * and read at the next boundary, so a model derived from a `SetState` (which
 * carries none) has none, which is exactly what `chainCalls` does today at the
 * top of every time through.
 */
export function modelFromSet(
  formation: { id: string },
  set: SetState,
  standingAt: ReadonlyMap<DancerId, EndPose>,
): SetModel {
  const { lattice, relations } = setRulesOf(formation.id);
  const dancers: Record<DancerId, DancerState> = {};
  let lowest = Infinity;
  let highest = -Infinity;

  for (const couple of set.couples) {
    for (const [role, id] of Object.entries(couple.dancers)) {
      const slot = lattice.slotOf(couple, role);
      lowest = Math.min(lowest, slot.position);
      highest = Math.max(highest, slot.position);
      dancers[id] = {
        id,
        role,
        slot,
        travel: couple.direction,
        spot: standingAt.get(id) ?? worldHome(set.frame, lattice, slot, couple.direction),
        holds: {},
        // Filled in below: a partner is found by relating over the finished
        // lattice, which needs every dancer's slot to be known first.
        partner: id,
      };
    }
  }

  const model: SetModel = {
    id: set.id,
    formation: formation.id,
    frame: set.frame,
    pitch: lattice.pitch,
    positions: Number.isFinite(lowest) ? highest - lowest + 1 : 0,
    dancers,
    shape: "lines",
  };

  for (const dancer of Object.values(dancers)) {
    dancer.partner = relate(model, relations, dancer.id, { kind: "partner" }) ?? dancer.id;
  }
  return model;
}

/** Where this dancer's slot puts them, in world px: their home this time through. */
export function homeOf(model: SetModel, dancer: DancerId): EndPose {
  const state = mustDancer(model, dancer);
  const { lattice } = setRulesOf(model.formation);
  return worldHome(model.frame, lattice, state.slot, state.travel);
}

/** One dancer's state, or a clear error naming the set. */
export function mustDancer(model: SetModel, dancer: DancerId): DancerState {
  const state = model.dancers[dancer];
  if (!state) throw new Error(`set "${model.id}" has no dancer "${dancer}"`);
  return state;
}

/** Whether two slots are the same place on the lattice. */
export const sameSlot = (a: Slot, b: Slot): boolean =>
  a.line === b.line && a.position === b.position;

/** The dancer standing on this slot, or `undefined` when nobody does. */
export function dancerOnSlot(model: SetModel, slot: Slot): DancerId | undefined {
  for (const dancer of Object.values(model.dancers)) {
    if (sameSlot(dancer.slot, slot)) return dancer.id;
  }
  return undefined;
}

/** A slot's home, in world px. */
const worldHome = (frame: Frame, lattice: SetLattice, slot: Slot, travel: 1 | -1): EndPose => {
  const local = lattice.homeAt(slot, travel);
  return { p: framePoint(frame, local.p), facing: frameAngle(frame, local.facing) };
};
