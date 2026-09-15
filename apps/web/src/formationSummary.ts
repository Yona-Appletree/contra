import type { Dance, Formation, SetState } from "@caller/choreo";
import { lineUpShiftOf } from "@caller/choreo";
import { formationFor } from "@caller/contra";

/**
 * A dance's formation, plus "progresses left/right" where the formation's own
 * progression shifts a line-up sideways (U3's brief: "formation (and 'becket,
 * progresses left/right' where the formation knows)").
 *
 * Derived, never declared: `lineUpShiftOf` measures what one time through does
 * to a set of the formation's own building — the same arithmetic
 * `createScriptDecider` reads to choose the caller's line-up words — rather
 * than a fact this function assumes about "becket". A formation that lines up
 * where it dances (duple improper) gets no clause at all.
 */
export function formationSummary(dance: Dance): string {
  const formation = formationFor(dance);
  const shift = lineUpShiftOf(formation, probe(formation));
  return shift === null ? formation.id : `${formation.id}, progresses ${shift}`;
}

/**
 * A line long enough that some couple is still dancing a time through later —
 * the same probe size `lineUpShiftOf`'s own fallback uses internally when a
 * real hall's every dancer waits out.
 */
function probe(formation: Formation): SetState {
  return formation.start({ id: "formation-summary-probe", couples: 8, centre: [0, 0], axis: 90 });
}
