import type { FigureDefinition, ParamValue } from "./FigureDefinition.js";

/**
 * **Symmetry as a transform.**
 *
 * A circle right is a circle left in a mirror. A star left is a star right in
 * one. "Larks roll away with the robins" is "robins roll away with the larks"
 * with the two role words exchanged. The library could write each of those
 * twice; instead a definition says **how its own parameters flip** and the two
 * transforms below produce the other figure from the one that is written.
 *
 * Both are pure `FigureDefinition → FigureDefinition`, which is the whole
 * reason a definition is plain data: `interpretDefinition` memoises on object
 * identity, so a transformed definition is interpreted once and keeps its own
 * plan cache, and nothing downstream can tell it from a hand-written one.
 *
 * ### What the call carries
 *
 * A figure's handedness lives in **its parameters**, not in its geometry —
 * `direction`, `hand`, `roller`, `chains`, the bow a dancer takes to their own
 * left — so mirroring a figure is mirroring the parameter values a call gives
 * it. {@link Symmetry} is the little table that says which parameter is which
 * kind of thing: a hand, a signed direction, a word with an opposite, or the
 * name of a contra role.
 *
 * ### The figures that have no mirror image
 *
 * Two do not, and saying so is the point of {@link HandedMirror}. A courtesy
 * turn is **handed**: the robin ends on the lark's right, she walks forward and
 * he backs up, and that is a fact about the dance rather than a choice the
 * figure makes — `COURTESY_HALF_TURN` is a constant with a sign for exactly
 * that reason (`figures/courtesyTurn.ts`). Mirroring right and left through or
 * the chain would produce a figure nobody dances. So they declare themselves
 * handed, with the reason, and `symmetry.test.ts` holds the list to being
 * exactly those two: a figure that quietly stopped commuting would fail, and so
 * would one that was listed and did.
 */

/** What a definition says about its own symmetries. */
export interface Symmetry {
  /** Whether the figure has a mirror image, and what a call must say to dance it. */
  mirror: MirrorRule;
  /**
   * Parameters whose value names a **contra role** (`"lark"`, `"robin"`).
   *
   * A role swap exchanges them, which is what makes "larks roll away with the
   * robins" the same figure as the robins' version rather than a second one.
   */
  roles?: readonly string[];
  /**
   * How many places round its own ring the figure may be turned without
   * changing, or `undefined` for none.
   *
   * A petronella's four dancers all do the same thing a quarter turn apart, so
   * turning the whole arrangement one place round and dancing it gives the same
   * dance turned one place round. Nothing else in the library claims it.
   */
  rotates?: number;
}

/** How a figure's parameters flip when it is mirrored. */
export type MirrorRule = ParameterMirror | HandedMirror;

/** The figure mirrors, and these parameters are what flip. */
export interface ParameterMirror {
  kind: "parameters";
  /** Parameters whose value is a hand, `"L"` or `"R"`: swapped. */
  hands?: readonly string[];
  /**
   * Parameters whose value is a **signed** direction: negated.
   *
   * A bow is one of these and it is easy to miss. Two dancers pass right
   * shoulders when each bows to their own **left**, which is a handedness; in a
   * mirror the same bow passes them left shoulders, so the number has to change
   * sign for the figure to be its own reflection.
   */
  signs?: readonly string[];
  /** Parameters whose value is a word, and the word its mirror image uses. */
  words?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** The figure has no mirror image, and this is why. */
export interface HandedMirror {
  kind: "handed";
  why: string;
}

/** Whether this figure has a mirror image at all. */
export const mirrors = (def: FigureDefinition): boolean =>
  def.symmetry?.mirror.kind === "parameters";

/**
 * The same figure, mirrored: every handed parameter of its defaults flipped.
 *
 * A figure with no declared symmetry is returned unchanged rather than guessed
 * at — a transform that silently did nothing would be worse than one that
 * refuses — and a handed one throws, because asking for the mirror image of a
 * courtesy turn is a mistake about the dance and not about the code.
 */
export function mirror(def: FigureDefinition): FigureDefinition {
  const rule = def.symmetry?.mirror;
  if (!rule) return def;
  if (rule.kind === "handed") {
    throw new Error(`"${def.id}" has no mirror image: ${rule.why}`);
  }
  if (def.params.kind !== "canonical") return def;
  return {
    ...def,
    params: { kind: "canonical", defaults: mirrorParams(rule, def.params.defaults) },
  };
}

/** One call's parameters, mirrored. */
export function mirrorParams(
  rule: ParameterMirror,
  params: Readonly<Record<string, ParamValue>>,
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = { ...params };
  for (const name of rule.hands ?? []) {
    const value = params[name];
    if (value === "L") out[name] = "R";
    else if (value === "R") out[name] = "L";
  }
  for (const name of rule.signs ?? []) {
    const value = params[name];
    if (typeof value === "number") out[name] = -value;
  }
  for (const [name, table] of Object.entries(rule.words ?? {})) {
    const value = params[name];
    if (typeof value !== "string") continue;
    const other = table[value];
    if (other !== undefined) out[name] = other;
  }
  return out;
}

/**
 * The same figure with the two contra roles exchanged.
 *
 * "Larks roll away with the robins" and "robins roll away with the larks" are
 * one figure and one definition: swap the role each parameter names, swap which
 * dancer is which role in the set, and **nothing on the floor moves at all**.
 * That is the property `symmetry.test.ts` asserts, and it is a real claim about
 * the library — a figure that had "robin" written into its geometry rather than
 * into a parameter would fail it.
 */
export function roleSwap(
  def: FigureDefinition,
  roles: readonly [string, string],
): FigureDefinition {
  const named = def.symmetry?.roles ?? [];
  if (named.length === 0 || def.params.kind !== "canonical") return def;
  return {
    ...def,
    params: { kind: "canonical", defaults: roleSwapParams(named, roles, def.params.defaults) },
  };
}

/** One call's parameters, with every role-naming one exchanged. */
export function roleSwapParams(
  named: readonly string[],
  [a, b]: readonly [string, string],
  params: Readonly<Record<string, ParamValue>>,
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = { ...params };
  for (const name of named) {
    const value = params[name];
    if (value === a) out[name] = b;
    else if (value === b) out[name] = a;
  }
  return out;
}
