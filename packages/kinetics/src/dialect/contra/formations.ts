import type { Vec2 } from "@caller/core";
import type { DancerId } from "../Dialect.js";

/**
 * The two contra formations engine 3 lays out: becket and duple improper.
 *
 * A formation is **where everybody stands at beat 0 and which slot of the
 * set's lattice they hold** — nothing else. Who is whose partner is
 * `relations.ts`, and the ring a circle is danced by is `groups.ts`; both read
 * the seating this file builds.
 *
 * **Axes** (the `Dialect` doc comment): x across the screen, y down it, a
 * facing is degrees with 0 = +x and a dancer's right is `facing + 90°`, which
 * is toward +y. The hall runs along y, the two lines are at
 * x = ∓{@link LINE_X_PX}, and "down the hall" is +y.
 *
 * **The numbers are engine 2's, retyped rather than imported** (the dependency
 * rule): `LINE_X_PX` is half of `ACROSS_PX` from
 * `packages/contra/src/formation/dupleImproper.ts` (`HOLD_SPACING_PX` 14 plus
 * `LINE_OFFSET_PX` 18, so the lines are 32 px apart and each sits 16 px off
 * the middle), `PLACE_PITCH_PX` is that file's own 20, and `COUPLE_PITCH_PX`
 * is becket's `PLACE_PITCH_PX * 2`.
 */
export type ContraFormation = "becket" | "duple-improper";

/** How far each line sits from the middle of the set, in px. */
export const LINE_X_PX = 16;

/** How far apart adjacent dancers stand along a line, in px. */
export const PLACE_PITCH_PX = 20;

/** How far apart a line's couples stand in becket, in px. */
export const COUPLE_PITCH_PX = PLACE_PITCH_PX * 2;

/** A place on the set's lattice: which line, and how far down the hall. */
export interface Slot {
  /** `0` is the −x line, `1` the +x one — `packages/contra/src/set/SetModel.ts`'s own numbering. */
  line: 0 | 1;
  /** Along the hall, +1 per {@link PLACE_PITCH_PX} toward +y. */
  position: number;
}

/** One dancer, seated: their slot, the way their couple progresses, and their place on the floor. */
export interface Seat extends Slot {
  id: DancerId;
  role: "lark" | "robin";
  /** 1-based, the way a caller numbers them: couple 1 is the first "ones". */
  couple: number;
  /** Which way this dancer's own couple progresses along the hall, +1 = +y. */
  travel: 1 | -1;
  p: Vec2;
  /** Degrees, 0 = +x, increasing toward +y. */
  facing: number;
}

/** Everybody seated, with the two lookups a selector needs. */
export interface Seating {
  formation: ContraFormation;
  couples: number;
  seats: readonly Seat[];
  /** Where this dancer sits, or `undefined` for a dancer who is not in the set. */
  seatOf(id: DancerId): Seat | undefined;
  /** Who is standing on this slot, or nobody — which is what the end of a line is. */
  at(slot: Slot): DancerId | undefined;
}

/** `1L`, `3R`: the couple's number and the role's initial. */
export const dancerId = (couple: number, role: "lark" | "robin"): DancerId =>
  `${String(couple)}${role === "lark" ? "L" : "R"}`;

/** A dancer's role, read off the suffix of their id. */
export const roleOfId = (id: DancerId): "lark" | "robin" => (id.endsWith("L") ? "lark" : "robin");

/**
 * Seat a set of `couples` couples in `formation`.
 *
 * Couples are numbered 1…N the way a caller numbers them, odd couples are the
 * "ones" and even the "twos", and `1L`/`1R` are couple 1's lark and robin. A
 * set is allowed to be ragged: an odd number of couples in either formation
 * leaves somebody at the end of a line with nobody to dance with, and that is
 * an answer (DA14), not an error.
 */
export function seating(formation: ContraFormation, couples: number): Seating {
  if (!Number.isInteger(couples) || couples < 1) {
    throw new Error(`a contra set needs a whole number of couples, not ${String(couples)}`);
  }
  const seats = formation === "becket" ? becketSeats(couples) : dupleImproperSeats(couples);
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  const bySlot = new Map(seats.map((seat) => [slotKey(seat), seat.id]));
  return {
    formation,
    couples,
    seats,
    seatOf: (id) => byId.get(id),
    at: (slot) => bySlot.get(slotKey(slot)),
  };
}

const slotKey = (slot: Slot): string => `${String(slot.line)}:${String(slot.position)}`;

/**
 * The seating after one progression: every seat moves `step` positions the
 * way its couple travels, and its place on the floor with it. Nobody is
 * removed — a couple that has run off the end of the line simply has no one
 * across, which is what the selectors answer; the wait-out is the language's
 * (P11), not the seating's.
 */
export function progressSeating(current: Seating, step: number): Seating {
  const seats = current.seats.map((seat) => {
    const position = seat.position + step * seat.travel;
    return { ...seat, position, p: placeOf(current.formation, seat.line, position) };
  });
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  const bySlot = new Map(seats.map((seat) => [slotKey(seat), seat.id]));
  return {
    formation: current.formation,
    couples: current.couples,
    seats,
    seatOf: (id) => byId.get(id),
    at: (slot) => bySlot.get(slotKey(slot)),
  };
}

/** Where a slot sits on the floor, in either formation: the line's x, and the position's y. */
const placeOf = (formation: ContraFormation, line: 0 | 1, position: number): Vec2 => {
  const x = line === 0 ? -LINE_X_PX : LINE_X_PX;
  const y =
    formation === "becket"
      ? position * PLACE_PITCH_PX - PLACE_PITCH_PX / 2
      : position * PLACE_PITCH_PX;
  return [x, y];
};

/**
 * **Becket**: partners side by side on the same line, each couple facing the
 * couple across the set, and every dancer facing across rather than along the
 * hall.
 *
 * The odd couples stand on the −x line facing 0 and **progress toward −y**
 * (up the hall); the even couples stand on the +x line facing 180 and progress
 * toward +y. Both progress to their own **left** — that is what a
 * left-progressing becket is, and it is
 * `packages/contra/src/formation/becket.ts`'s `becketLattice("becket", -1)`:
 * one position per time through, against the dancer's own travel.
 *
 * **Where beat 0 is, and why the lines are out of step.** The four places for
 * the first hands four are `data/dances/butter.json`'s own `startPlaces`,
 * verbatim: `1L (−16, 10)` facing 0, `1R (−16, 30)` facing 0, `2L (16, −10)`
 * facing 180, `2R (16, −30)` facing 180. That record is engine 2's
 * `BECKET_BEFORE_SLIDE` — a becket dance whose first figure is a shift begins
 * **half a couple place back along its own line**, so the two lines' grids are
 * one couple place apart and the couples at the far end of each line face
 * nobody at beat 0. Butter is the spec, and that is where Butter starts: after
 * its shift, the couple a dancer faces is the one their `N2` names here.
 *
 * Further hands fours are laid down the hall at {@link COUPLE_PITCH_PX} per
 * couple on each line, so couple 3 sits at `1`'s places + 40 px and couple 4
 * at `2`'s + 40 px.
 */
function becketSeats(couples: number): readonly Seat[] {
  const seats: Seat[] = [];
  for (let couple = 1; couple <= couples; couple += 1) {
    const ones = couple % 2 === 1;
    const line: 0 | 1 = ones ? 0 : 1;
    const travel: 1 | -1 = ones ? 1 : -1;
    // Where this couple sits along its own line: the i-th couple of the line
    // is one COUPLE_PITCH_PX — two positions — further down the hall.
    const i = ones ? (couple - 1) / 2 : (couple - 2) / 2;
    // The robin stands on the lark's right, which is +y on the −x line and −y
    // on the +x one, because the two lines face opposite ways.
    const larkPosition = ones ? 2 * i + 1 : 2 * i;
    const robinPosition = ones ? larkPosition + 1 : larkPosition - 1;
    for (const [role, position] of [
      ["lark", larkPosition],
      ["robin", robinPosition],
    ] as const) {
      seats.push({
        id: dancerId(couple, role),
        role,
        couple,
        line,
        position,
        travel,
        p: [line === 0 ? -LINE_X_PX : LINE_X_PX, position * PLACE_PITCH_PX - PLACE_PITCH_PX / 2],
        facing: line === 0 ? 0 : 180,
      });
    }
  }
  return seats;
}

/**
 * **Duple improper**: couples across from each other, partner across the set,
 * everybody facing along the hall.
 *
 * The odd couples are the "ones": they face **down the hall** (+y, 90°) and
 * progress that way; the even couples are the "twos", facing up (270°) and
 * progressing toward −y. Improper is the lark alternation — the ones' lark
 * stands on the +x line and the twos' lark on the −x line, so each line has a
 * lark and a robin alternating down it. Copied from
 * `packages/contra/src/formation/dupleImproper.ts`
 * (`DUPLE_IMPROPER_STATIONS`, `DUPLE_IMPROPER_LATTICE`): `slotOf` puts a
 * dancer on the +x line exactly when their role and their couple's direction
 * agree, `DOWN` is 90 and `UP` is 270, and one couple place is one position.
 *
 * Couple `n` stands at `position = n − 1`, so a set runs from y = 0 down the
 * hall at {@link PLACE_PITCH_PX} a couple — half becket's pitch, because in
 * duple improper a couple is one place across the set rather than two along a
 * line.
 */
function dupleImproperSeats(couples: number): readonly Seat[] {
  const seats: Seat[] = [];
  for (let couple = 1; couple <= couples; couple += 1) {
    const ones = couple % 2 === 1;
    const travel: 1 | -1 = ones ? 1 : -1;
    const position = couple - 1;
    for (const role of ["lark", "robin"] as const) {
      // `(role === "lark") === (direction === 1)` is the +x line: improper.
      const line: 0 | 1 = (role === "lark") === ones ? 1 : 0;
      seats.push({
        id: dancerId(couple, role),
        role,
        couple,
        line,
        position,
        travel,
        p: [line === 0 ? -LINE_X_PX : LINE_X_PX, position * PLACE_PITCH_PX],
        facing: ones ? 90 : 270,
      });
    }
  }
  return seats;
}
