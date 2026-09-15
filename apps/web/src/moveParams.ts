import type { FigureDefinition, ParamValue } from "@caller/contra";

/**
 * **The caller's own vocabulary, as the Moves page reads a parameter spec**
 * (M12).
 *
 * A definition's parameter spec says what the shape reads and what each
 * parameter takes when a call is silent (`ParamSpec`'s `canonical` block). What
 * it does not say is which *other* value of a parameter is worth looking at —
 * and the brief asks for the variants to be generated from the spec rather than
 * hand-listed per figure.
 *
 * So the alternatives are read off the **value**, not off the figure. "Left"
 * has an opposite and "right" is it; a hand is `R` or `L`; a contra role is a
 * lark or a robin; a relation is a partner, a neighbour or one of the two
 * roles. None of that is a fact about a circle or a star — it is a fact about
 * the words a caller calls in, which is why one table here covers every
 * definition in the library and covers the next one too.
 *
 * Two entries know a parameter's **name** rather than only its value, and both
 * names are the library's own canonical vocabulary shared across every shape
 * kind rather than any one figure's:
 *
 * - `amount` — how much of the whole figure is danced. Half of it is a real
 *   move with its own name almost everywhere it appears: half a hey, a half
 *   allemande, half a do-si-do.
 * - `for` — how many dance it. A hey `for` **one fewer than the figure's cast**
 *   is the hey for three, and the count is read off `def.roles.length` rather
 *   than written down as four.
 *
 * Everything the vocabulary generates is a *candidate*: `variantTile` plans it
 * and a tuning that expands but cannot be drawn comes back as prose on its own
 * row. A hey for three is exactly that — a real hey with one dancer standing
 * out, in a tile that has nobody to stand out.
 */

/**
 * Words that come in opposed pairs, in both directions.
 *
 * Written once per pair and mirrored below, so the table cannot say that left's
 * opposite is right without saying that right's is left.
 */
const OPPOSITES: readonly (readonly [string, string])[] = [
  ["left", "right"],
  ["L", "R"],
  ["clockwise", "counterclockwise"],
  ["lark", "robin"],
  ["larks", "robins"],
  ["partners", "neighbors"],
  ["across", "along"],
  ["up", "down"],
  ["in", "out"],
  ["wrist", "hands-across"],
];

/** Every word with an opposite, to the opposite. */
const OPPOSITE = new Map<string, string>(
  OPPOSITES.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ]),
);

/**
 * **The other values of this parameter worth a row**, read off its own default.
 *
 * Empty for everything the vocabulary has nothing to say about, which is most
 * of a definition's parameters: `holdDrop`, `stackPx`, `passPx` and the rest
 * are tuning numbers, and a row showing a swing with its hands 1 px lower is
 * not a variant of anything.
 */
export function alternativeValues(
  name: string,
  value: ParamValue,
  def: FigureDefinition,
): ParamValue[] {
  const out: ParamValue[] = [];

  // A handed, directional or role word: its opposite, and nothing else. Every
  // one of these has exactly one, which is what makes it a word rather than a
  // number — "circle right" is the whole of what "circle left" leaves unsaid.
  if (typeof value === "string") {
    const other = OPPOSITE.get(value);
    if (other !== undefined) out.push(other);
  }

  // `direction` is written `1` and `-1` by the figures that read it as a sign
  // rather than as a word (the slide, the twirl), and the other way round is
  // the other value.
  if (typeof value === "number" && (name === "direction" || name === "spins") && value !== 0) {
    out.push(-value);
  }

  // How much of the whole figure is danced. Half of it, or — for a figure whose
  // own nominal *is* the half — the whole.
  if (name === "amount" && typeof value === "number") {
    out.push(value === HALF ? 1 : HALF);
  }

  // How many dance it: one fewer than the figure's own cast. The hey for three,
  // counted off the definition rather than written down.
  if (name === "for" && typeof value === "number" && value === def.roles.length && value > 2) {
    out.push(value - 1);
  }

  return out.filter((other) => JSON.stringify(other) !== JSON.stringify(value));
}

/** Half of a figure: the one fraction the vocabulary has a word for. */
const HALF = 0.5;

/**
 * One parameter value as a row writes it.
 *
 * Objects and lists are written out as JSON rather than `String`ed — a `pairs`
 * of station pairs is `[["1L","2L"]]`, and `String` makes that
 * `1L,2L`, which reads as one dancer with a comma in their name. A value too
 * long for a line is given as its shape instead.
 */
export function paramValueText(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return String(value);
  const written = JSON.stringify(value) ?? "?";
  if (written.length <= PARAM_VALUE_CHARS) return written;
  const keys = Object.keys(value);
  return `{${String(keys.length)} keys: ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""}}`;
}

/** The most this line will spend on one parameter's value. */
const PARAM_VALUE_CHARS = 40;

/** A whole bag of parameters as one short line. */
export function paramText(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k} ${paramValueText(v)}`)
    .join(", ");
}

/**
 * **Which contra role a figure-role letter names, if it names one.**
 *
 * The pass-list notation writes two capitals per pass — who, then which
 * shoulder — and the vision's D5 asks the app to disambiguate the two by
 * lightly colouring the *role* letter with the role colour
 * (`docs/role-colours.md`). The same rule reads a definition's own
 * `roles`: a swing's parts are named `lark` and `robin` because a swing really
 * is asymmetric, and those two words get the two colours; an allemande's are
 * `a` and `b` and get none, because the figure has no opinion about which is
 * which.
 */
export function roleColourOf(word: string): "lark" | "robin" | undefined {
  const lower = word.toLowerCase();
  if (lower === "lark" || lower === "larks" || lower === "1l" || lower === "2l") return "lark";
  if (lower === "robin" || lower === "robins" || lower === "1r" || lower === "2r") return "robin";
  return undefined;
}
