// A leaf, on purpose: the relation tables (`becket.ts`, `dupleImproper.ts`,
// `proper.ts`) need to know how far the occupied lattice reaches, and so does
// `lattice.ts`. A formation file cannot import `lattice.ts` — that would close
// the cycle `becket → lattice → SetRules → becket` — so the one computation
// lives here, importing nothing but types.
import type { SetModel } from "./SetModel.js";

/**
 * The lowest and highest position anybody stands on, per line.
 *
 * What makes an **end** an end. Everything a relation has to say about the end
 * of a set is said in terms of this: a becket line's own loop is derived from
 * it ({@link becketLoop} in `becket.ts`), and `progressModel`'s crossing-over
 * asks it whether a shift has run somebody off the end.
 */
export interface LatticeSpan {
  /** By `Slot.line`; `undefined` for a line nobody stands on. */
  line: Readonly<Record<number, { lowest: number; highest: number }>>;
  lowest: number;
  highest: number;
}

/**
 * How far the occupied lattice reaches.
 *
 * Read from the dancers rather than from `SetModel.positions`, which is the
 * *span* (highest minus lowest plus one) and says nothing about where the span
 * sits — settled in M6 rather than redefined, because `positions` is what M1
 * built, nothing reads it for arithmetic, and a count is a poor thing to do
 * arithmetic with. `plan.md`'s parenthetical "2 × couples for improper" matches
 * neither formation and is not what either lattice does.
 */
export function latticeSpan(model: SetModel): LatticeSpan {
  const line: Record<number, { lowest: number; highest: number }> = {};
  let lowest = Infinity;
  let highest = -Infinity;
  for (const dancer of Object.values(model.dancers)) {
    const { line: l, position } = dancer.slot;
    const seen = line[l];
    line[l] =
      seen === undefined
        ? { lowest: position, highest: position }
        : { lowest: Math.min(seen.lowest, position), highest: Math.max(seen.highest, position) };
    lowest = Math.min(lowest, position);
    highest = Math.max(highest, position);
  }
  return { line, lowest, highest };
}
