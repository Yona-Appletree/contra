import type { Formation } from "@caller/choreo";
import { BECKET, BECKET_LATTICE, BECKET_RELATIONS } from "../formation/becket.js";
import { BECKET_RIGHT } from "../formation/becketRight.js";
import {
  DUPLE_IMPROPER,
  DUPLE_IMPROPER_LATTICE,
  DUPLE_IMPROPER_RELATIONS,
} from "../formation/dupleImproper.js";
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
  // A right-progressing becket is a becket in every way but which way its lines
  // slide, so it stands on the same lattice and relates by the same offsets.
  [BECKET_RIGHT.id]: {
    id: BECKET_RIGHT.id,
    lattice: BECKET_LATTICE,
    relations: BECKET_RELATIONS,
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
