import type { DancerId, Dialect, SetState } from "../Dialect.js";
import { unknownSelector } from "../Dialect.js";
import type { ContraFormation } from "./formations.js";
import type { Seating } from "./formations.js";
import { progressSeating, roleOfId, seating } from "./formations.js";
import { CONTRA_GROUPS, handsFour, isContraGroup } from "./groups.js";
import {
  BECKET_PROGRESSION_STEP,
  CONTRA_SELECTORS,
  isContraSelector,
  slotFor,
} from "./relations.js";

/**
 * The contra dialect: two long lines of N couples, roles lark and robin, and
 * the words a contra program uses to name the people it dances with.
 *
 * One program is every dancer's script (DA14). The text a caller writes says
 * `neighbor = select(neighbor)` once; this dialect resolves it twelve
 * different ways for a set of six couples, and resolves it to **nobody** for
 * the dancers at the end of a line who have no neighbour — which is what an
 * end effect is, written in the language rather than cased in the engine.
 *
 * - `formations.ts` seats the set: the places, the facings and the slots.
 * - `relations.ts` is the selector table, as lattice offsets, per formation.
 * - `groups.ts` resolves `hands-four` to the ring of four.
 *
 * **Which way people go.** In **becket** everybody faces across the set: the
 * odd couples stand on the −x line and progress up the hall (−y), the even
 * couples stand on the +x line and progress down it (+y), each to their own
 * left. In **duple improper** everybody faces along the hall: the odd couples
 * are the ones, facing and progressing **down** the hall (+y), and the even
 * couples are the twos, facing and progressing up it.
 *
 * Progression itself is P11's: this dialect seats the set at beat 0 and
 * answers every selector from that seating.
 */
export function contraDialect(options: ContraOptions): Dialect {
  const set = seating(options.formation, options.couples);
  /** The seating a state carries, or the set's own at beat 0. */
  const seatingOf = (state: SetState): Seating =>
    state.seating !== undefined ? (state.seating as Seating) : set;
  const stateOf = (seats: Seating): SetState => ({
    dancers: Object.fromEntries(
      seats.seats.map((seat) => [seat.id, { p: seat.p, facing: seat.facing }]),
    ),
    seating: seats,
  });
  const dialect: Dialect = {
    id: `contra-${options.formation}`,
    dancers: set.seats.map((seat) => seat.id),
    roleOf: roleOfId,
    roleNames: ["larks", "robins"],
    // Every place in a contra line faces across; `home` is that facing.
    homeFacing: (dancer) => set.seatOf(dancer)?.facing ?? 0,
    // As a couple facing across, the lark stands on the robin's left.
    sideOf: (dancer, other) =>
      roleOfId(dancer) === roleOfId(other)
        ? undefined
        : roleOfId(dancer) === "lark"
          ? "left"
          : "right",
    // At rest a becket set is **aligned**: every couple faces a couple. The
    // lattice's own beat 0 (Butter's `startPlaces`, half a place back) is one
    // progression before that, so the rest seating is the lattice progressed
    // once — and the first time through needs no shift.
    initial: (): SetState =>
      stateOf(options.formation === "becket" ? progressSeating(set, BECKET_PROGRESSION_STEP) : set),
    select: (selector, from, state): DancerId | undefined => {
      if (!isContraSelector(selector)) throw unknownSelector(dialect, selector);
      const seats = seatingOf(state);
      const seat = seats.seatOf(from);
      if (seat === undefined) return undefined;
      // A couple waiting out at an end has its partner and nobody else.
      if (seat.waiting && selector !== "self" && selector !== "partner") return undefined;
      const found = seats.at(slotFor(seats.formation, selector, seat));
      if (found !== undefined && seats.seatOf(found)?.waiting && selector !== "partner")
        return undefined;
      return found;
    },
    selectors: CONTRA_SELECTORS,
    groups: CONTRA_GROUPS,
    group: (word, from, state): DancerId[] | undefined => {
      if (!isContraGroup(word)) throw unknownSelector(dialect, word);
      const seats = seatingOf(state);
      if (seats.seatOf(from)?.waiting) return undefined;
      const four = handsFour(seats, from);
      return four?.some((id) => seats.seatOf(id)?.waiting) ? undefined : four;
    },
    // One progression: every couple one position the way it travels (a
    // becket's shift left is one dancer place, 20 px, on each line — the two
    // lines moving opposite ways is what brings the next couple across).
    progress: (state) => stateOf(progressSeating(seatingOf(state), BECKET_PROGRESSION_STEP)),
  };
  return dialect;
}

/** A set: which formation it stands in, and how many couples long it is. */
export interface ContraOptions {
  formation: ContraFormation;
  /** Couples numbered 1…N the way a caller numbers them; odd are ones, even twos. */
  couples: number;
}
