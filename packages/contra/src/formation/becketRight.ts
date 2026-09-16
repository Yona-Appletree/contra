import type { Formation } from "@caller/choreo";
import type { RelationTable } from "../set/relations.js";
import type { SetLattice } from "../set/SetModel.js";
import { becketFormation, becketLattice, becketRelations } from "./becket.js";

/**
 * A **right-progressing** becket.
 *
 * The user's own words:
 *
 * > "_technically_ if its a right-progressing becket dance, you should move one
 * > place _to the right_. callers don't always do this... but it means you
 * > progress the 'wrong' way from the direction you were facing when you took
 * > hands four."
 *
 * This is a becket in every way but one: its lines slide the other way along the
 * set, so `lineUpShiftOf` measures `"right"` off its progression and the
 * caller's words come out right without anybody editing a string — and its `N_k`
 * counts along the **other** diagonal, because `N_k` is the k-th couple in the
 * direction *your own couple progresses*.
 *
 * **Registered as a formation a dance record may name since FR-C2.** Are You
 * 'Most Done? is one: its transcript calls the hey *"on right diagonal"* and its
 * author's note says *"Dance begins with same neighbors as in the hey"*, and
 * those two sentences are consistent only if the couple on your right diagonal
 * is the couple you meet next — which is what a right-progressing becket makes
 * it.
 */
export const BECKET_RIGHT: Formation = becketFormation("becket-right", 1);

/** Becket's lattice with the slide's sign turned round (FR-C2). */
export const BECKET_RIGHT_LATTICE: SetLattice = becketLattice(BECKET_RIGHT.id, 1);

/** Becket's relations with the slide's sign turned round: `N_k` on the other diagonal. */
export const BECKET_RIGHT_RELATIONS: RelationTable = becketRelations(BECKET_RIGHT.id, 1);
