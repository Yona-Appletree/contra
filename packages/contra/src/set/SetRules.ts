import type { Formation } from "@caller/choreo";
import { BECKET, BECKET_LATTICE, BECKET_RELATIONS } from "../formation/becket.js";
import {
  BECKET_RIGHT,
  BECKET_RIGHT_LATTICE,
  BECKET_RIGHT_RELATIONS,
} from "../formation/becketRight.js";
import {
  DUPLE_IMPROPER,
  DUPLE_IMPROPER_LATTICE,
  DUPLE_IMPROPER_RELATIONS,
} from "../formation/dupleImproper.js";
import { PROPER, PROPER_LATTICE, PROPER_RELATIONS } from "../formation/proper.js";
import type { RelationTable } from "./relations.js";
import type { SetLattice } from "./SetModel.js";

/**
 * What one formation contributes to the set model: its lattice and its relation
 * table.
 *
 * The one place a formation **id** becomes the two pieces of contra knowledge
 * the hub needs. Keeping it a lookup on an id rather than a field on the
 * `Formation` object is what lets a `SetModel` be plain data
 * (`JSON.parse(JSON.stringify(model))`) and still answer `homeOf(model,
 * dancer)` — and it keeps `@caller/choreo`'s `Formation` interface untouched,
 * which matters because `square.test.ts` implements it and a square has neither
 * a lattice nor a relation of any kind (AC7).
 */
export interface SetRules {
  /** The formation id these rules answer for. */
  id: string;
  lattice: SetLattice;
  relations: RelationTable;
}

/** Every contra formation's rules, by formation id. */
export const CONTRA_SET_RULES: Readonly<Record<string, SetRules>> = {
  [DUPLE_IMPROPER.id]: {
    id: DUPLE_IMPROPER.id,
    lattice: DUPLE_IMPROPER_LATTICE,
    relations: DUPLE_IMPROPER_RELATIONS,
  },
  [BECKET.id]: { id: BECKET.id, lattice: BECKET_LATTICE, relations: BECKET_RELATIONS },
  // M7: larks in one line and robins in the other, all the way through — which
  // is a different lattice and a different neighbour, not a flag on improper.
  [PROPER.id]: { id: PROPER.id, lattice: PROPER_LATTICE, relations: PROPER_RELATIONS },
  // A right-progressing becket is a becket in every way but which way its lines
  // slide — so it stands on the same geometry with the slide's sign turned round
  // (FR-C2), which is what puts its `N_k` on the other diagonal.
  [BECKET_RIGHT.id]: {
    id: BECKET_RIGHT.id,
    lattice: BECKET_RIGHT_LATTICE,
    relations: BECKET_RIGHT_RELATIONS,
  },
};

/** The rules for a formation id, or a clear error naming the ones there are. */
export function setRulesOf(id: string): SetRules {
  const rules = CONTRA_SET_RULES[id];
  if (!rules) {
    throw new Error(
      `formation "${id}" has no set rules (have: ${Object.keys(CONTRA_SET_RULES).join(", ")})`,
    );
  }
  return rules;
}

/** The rules for a formation. */
export const setRulesFor = (formation: Formation): SetRules => setRulesOf(formation.id);
