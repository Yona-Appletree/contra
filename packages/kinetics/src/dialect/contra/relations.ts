import type { ContraFormation, Seat, Slot } from "./formations.js";

/**
 * The selector words a contra program says, as **signed offsets on the set's
 * lattice** — derived from where a dancer stands, never stored (DA14).
 *
 * Every offset below is copied from engine 2's own relation tables —
 * `packages/contra/src/set/relations.ts` for what the words mean,
 * `packages/contra/src/formation/becket.ts` (`becketRelations`, its
 * `offsetOnly` rows and `nextNeighbourStep`) and
 * `packages/contra/src/formation/dupleImproper.ts`
 * (`DUPLE_IMPROPER_RELATIONS`, `partnerSide`) for the numbers — read and
 * retyped, because this package may not import them. Where those tables have
 * rows this phase does not use (`trail-buddy`, `N0`, `S2`…) they are left
 * there.
 *
 * **The two formations disagree, which is why the table is the formation's.**
 * In becket your partner is beside you on your own line and the dancer
 * straight across is your neighbour; in duple improper your partner *is* the
 * dancer straight across and your neighbour is the one along your own line,
 * one place the way you travel.
 *
 * A word always resolves to a slot; whether anybody is standing on it is
 * {@link Seating.at}'s question, and at the end of a line the honest answer is
 * nobody.
 */
export type ContraSelector =
  "self" | "partner" | "neighbor" | "across" | "N2" | "shadow" | "left-diagonal" | "right-diagonal";

/** The words, in the order the error message lists them. */
export const CONTRA_SELECTORS: readonly ContraSelector[] = [
  "self",
  "partner",
  "neighbor",
  "across",
  "N2",
  "shadow",
  "left-diagonal",
  "right-diagonal",
];

/** Whether this word is one of them. */
export const isContraSelector = (word: string): word is ContraSelector =>
  (CONTRA_SELECTORS as readonly string[]).includes(word);

/**
 * Which way along the set a dancer's own partner side runs, `+1` or `−1`.
 *
 * `partnerSide` in `packages/contra/src/formation/dupleImproper.ts`, and the
 * one number that makes `shadow` its own inverse: a relation that steps along
 * the set toward a dancer of the other role cannot be symmetric with a single
 * sign, so the sign has to be something the two dancers disagree about, and
 * the only such thing they both know is which role they take.
 */
export const partnerSide = (role: "lark" | "robin"): 1 | -1 => (role === "lark" ? 1 : -1);

/**
 * One becket progression, in lattice positions per unit of travel: `−1`, the
 * left-progressing becket's `becketLattice("becket", -1)`. Both lines slide
 * half a couple place to their own left.
 */
export const BECKET_PROGRESSION_STEP = -1;

/**
 * One step from `N_k` to `N_(k+1)` for a dancer whose travel is `+1`:
 * `2 × progressionStep`, becket's own `nextNeighbourStep`. One couple place
 * along the other line, in the direction the asking dancer's couple
 * progresses — the user's ruling that *"N2 would be your next neighbor"*.
 */
const BECKET_NEIGHBOUR_STEP = 2 * BECKET_PROGRESSION_STEP;

/**
 * The slot a selector word names, from where this dancer stands.
 *
 * `self` is the asking dancer's own slot; every other row is an offset, and
 * the caller looks up who — if anybody — is standing on the result.
 */
export function slotFor(formation: ContraFormation, selector: ContraSelector, from: Seat): Slot {
  const { line, position, role, travel: t } = from;
  const other: 0 | 1 = line === 1 ? 0 : 1;
  const side = partnerSide(role);
  if (selector === "self") return { line, position };
  return formation === "becket"
    ? becketSlot(selector, { line, other, position, side, t })
    : dupleImproperSlot(selector, { line, other, position, side, t });
}

interface Offsets {
  line: 0 | 1;
  other: 0 | 1;
  position: number;
  side: 1 | -1;
  t: 1 | -1;
}

/**
 * Becket's rows (`becketRelations`'s `offsetOnly`, and its doc comment for
 * what each means).
 *
 * - **partner** — beside you on your own line, on the side {@link partnerSide}
 *   gives; it can never run off the end, because your couple is two adjacent
 *   positions wherever it stands.
 * - **neighbor** (`N1`) and **across** (engine 2's `opposite`) — the dancer
 *   straight across the set, which in becket is the same dancer by two names.
 * - **N2** — one couple place along the other line in the direction your own
 *   couple progresses: `position + 2 × step × travel`.
 * - **shadow** — the other-role dancer one couple along **your own line**, on
 *   the opposite side of you from your partner. Your own line is what travels
 *   with you, so a shadow is the dancer you keep for the whole dance.
 * - **the diagonals** — the other-role dancer across the set and one couple
 *   place (two positions) to your left or your right, left being `facing −
 *   90°` and right `facing + 90°`. Both are their own inverse: two dancers
 *   facing opposite ways across a set are each other's *right* diagonal. In
 *   this left-progressing becket the left diagonal and `N2` are the same
 *   offset, which is what "the couple on your diagonal is the couple you face
 *   next" means.
 */
function becketSlot(selector: Exclude<ContraSelector, "self">, o: Offsets): Slot {
  switch (selector) {
    case "partner":
      return { line: o.line, position: o.position + o.side * o.t };
    case "neighbor":
    case "across":
      return { line: o.other, position: o.position };
    case "N2":
      return { line: o.other, position: o.position + BECKET_NEIGHBOUR_STEP * o.t };
    case "shadow":
      return { line: o.line, position: o.position - o.side * o.t };
    case "right-diagonal":
      return { line: o.other, position: o.position + 2 * o.t };
    case "left-diagonal":
      return { line: o.other, position: o.position - 2 * o.t };
  }
}

/**
 * Duple improper's rows (`DUPLE_IMPROPER_RELATIONS`).
 *
 * - **partner** and **across** (`opposite`) — the other line at the same
 *   position: you stand across the set from your partner, which is what
 *   improper means, and "the dancer straight across" is therefore the same
 *   dancer by two names here too, just not the same *one* as in becket.
 * - **neighbor** (`N1`) — your own line, one place the way you travel: the
 *   couple you are dancing with. **N2** is the neighbour you have next, three
 *   places along, since `neighbor k` is `(2k − 1) × travel`.
 * - **shadow** — the other-role dancer who progresses the way you do, two
 *   couple places along the set on the other line, on the opposite side of you
 *   from your partner.
 * - **the diagonals** — engine 2's two **corners**, which duple improper pins
 *   from the user's own account of turn contra corners: the first corner
 *   (`C1`) is "located on the right diagonal" and the second (`C0`) on the
 *   left. Both are across the set and one dancing place along it, and the sign
 *   is {@link partnerSide} so that a couple's two dancers reach the couples
 *   above and below rather than both reaching the same one. Unlike becket's,
 *   these name a dancer of **your own role**: the lines alternate role by
 *   place, so across-and-one-along is the role you are.
 */
function dupleImproperSlot(selector: Exclude<ContraSelector, "self">, o: Offsets): Slot {
  switch (selector) {
    case "partner":
    case "across":
      return { line: o.other, position: o.position };
    case "neighbor":
      return { line: o.line, position: o.position + o.t };
    case "N2":
      return { line: o.line, position: o.position + 3 * o.t };
    case "shadow":
      return { line: o.other, position: o.position - o.side * 2 * o.t };
    case "right-diagonal":
      return { line: o.other, position: o.position + o.side * o.t };
    case "left-diagonal":
      return { line: o.other, position: o.position - o.side * o.t };
  }
}
