import { mulberry32, pick } from "./mulberry32.js";
import { roleShirtColour } from "./roleColours.js";
import { shade } from "./shade.js";

/**
 * Everything about how one dancer looks, as flat colours. Nothing here decides
 * anything about dancing: a caller hands `createAppearance` a role colour to
 * dress a dancer in, or a palette to dress a non-dancer from, and the renderer
 * only reads these fields.
 */
export interface Appearance {
  skin: string;
  skinDark: string;
  hair: string;
  hairLite: string;
  hairDark: string;
  hairStyle: HairStyle;
  shirt: string;
  shirtDark: string;
  shirtLite: string;
  /**
   * Always decided; never drawn, because a true overhead view of a standing
   * dancer shows two shoes and no legs. Kept so a lower camera is one renderer
   * away and so the seed already answers the question.
   */
  pants: string;
  /** The skirt and its shadow, always decided — see {@link Appearance.wearsSkirt}. */
  skirt: string;
  skirtDark: string;
  /**
   * Whether this person wears their skirt. Decided by the seed alone, never by
   * role (a user ruling of 2026-09-14), and only obeyed where the renderer is
   * drawing skirts at all — `DrawOptions.skirts`, which the hall turns on and
   * every other surface leaves off. Both the skirt and the trousers are always
   * decided, so the same person is the same person in both.
   */
  wearsSkirt: boolean;
  /** Only drawn when `hairStyle` is `"cap"`, but always decided, so a cap is one seed away. */
  cap: string;
  capDark: string;
  /** The colour this person's floor trail is drawn in. */
  trailColour: string;
}

/** The seven hair styles the procedural head draws. */
export type HairStyle = "short" | "long" | "bob" | "curly" | "bald" | "cap" | "bun";

export const HAIR_STYLES: readonly HairStyle[] = [
  "short",
  "long",
  "bob",
  "curly",
  "bald",
  "cap",
  "bun",
];

/**
 * The bag styles are drawn from: short and long are commoner, which is what the
 * spike's weighting says a hall looks like.
 */
export const HAIR_STYLE_BAG: readonly HairStyle[] = [
  "short",
  "short",
  "short",
  "long",
  "long",
  "bob",
  "curly",
  "bald",
  "cap",
  "bun",
];

/**
 * Six skin tones, the spikes' own palette. The milestone contract said three;
 * the director ruled (DD13) that a hall of thirty-six dancers drawn from three
 * skins reads as repetitive, and that the spikes' six are the look.
 */
export const SKIN_TONES: readonly string[] = [
  "#f3cfae",
  "#e6b48e",
  "#d29a70",
  "#b47a56",
  "#8a5a3c",
  "#5f3d28",
];

/**
 * Sixteen shirt colours, the spikes' own palette (director ruling DD13).
 *
 * These dress everybody who is **not** dancing a role: the band, the caller,
 * the sitters along the wall. A dancer's shirt comes from their role colour
 * instead (`roleShirtColour`), so the palette's old cool/warm halves — which
 * used to dress larks from one and robins from the other — are gone with the
 * blue-and-pink they encoded.
 */
export const SHIRT_COLOURS: readonly string[] = [
  "#4c7fc9",
  "#2e5d8a",
  "#3f8f8f",
  "#6aa84f",
  "#5fb0a0",
  "#5c8a3f",
  "#7a5cc9",
  "#8c8c8c",
  "#c94c4c",
  "#d97a3a",
  "#d9b23a",
  "#c95c9e",
  "#a33f5c",
  "#8a5c3f",
  "#e0a56a",
  "#e8e2d6",
];

export const HAIR_COLOURS: readonly string[] = [
  "#2a1a11",
  "#4a2e1b",
  "#8a5a2b",
  "#c98a3c",
  "#e8c67e",
  "#b8b1a6",
  "#d94f3a",
  "#1b1b1b",
  "#6b4a3a",
];

export const PANTS_COLOURS: readonly string[] = [
  "#2e2b46",
  "#3a3a3a",
  "#4a3b2e",
  "#5b6472",
  "#2b3e5b",
  "#6b5b4a",
  "#1f2a3a",
];

/**
 * Ten skirt colours. Drawn from by seed alone, never by role: a skirt is not a
 * role and never encodes one (a user ruling of 2026-09-14), which is why this
 * palette keeps its rose and its violet where the role colours could not.
 */
export const SKIRT_COLOURS: readonly string[] = [
  "#c95c9e",
  "#7a5cc9",
  "#d97a3a",
  "#6aa84f",
  "#e8e2d6",
  "#3f8f8f",
  "#a33f5c",
  "#d9b23a",
  "#5fb0a0",
  "#2e5d8a",
];

/** The shoe colour every dancer shares. */
export const SHOE_COLOUR = "#2b1d14";

/** Options that let a role set steer the seed without replacing it. */
export interface AppearanceOptions {
  /**
   * Force `wearsSkirt` on or off. Left out, the seed decides, half and half.
   * Whether the skirt is ever *drawn* is the renderer's `skirts` option, not
   * this one.
   */
  skirt?: boolean;
  /**
   * Dress this person in `role`'s colour with a per-person spread, rather than
   * from a flat palette. This is what every dancer gets; the palette is for
   * everybody else. See `roleColours.ts`.
   */
  roleShirt?: string;
  /** Shirt palette to draw from. Defaults to all of {@link SHIRT_COLOURS}. */
  shirts?: readonly string[];
  /** Trail colour. Defaults to the shirt. */
  trailColour?: string;
}

/**
 * Build a person's look from a seed. Same seed and options in, same colours
 * out, on every machine — which is what makes the golden frames stable.
 */
export function createAppearance(seed: number, opts: AppearanceOptions = {}): Appearance {
  const rng = mulberry32(seed);
  const skin = pick(rng, SKIN_TONES);
  const hair = pick(rng, HAIR_COLOURS);
  const hairStyle = pick(rng, HAIR_STYLE_BAG);
  const shirt =
    opts.roleShirt === undefined
      ? pick(rng, opts.shirts ?? SHIRT_COLOURS)
      : roleShirtColour(opts.roleShirt, rng);
  // Both are always drawn, and always from the same two draws, so that turning
  // the renderer's skirts on or off changes what is drawn and nothing else.
  const wearsSkirt = opts.skirt ?? rng() < 0.5;
  const skirt = pick(rng, SKIRT_COLOURS);
  const pants = pick(rng, PANTS_COLOURS);
  const cap = pick(rng, ["#8a2b2b", "#2b4a8a", "#3a3a3a", "#6a8a3a"]);

  return {
    skin,
    skinDark: shade(skin, 0.8),
    hair,
    hairLite: shade(hair, 1.28),
    hairDark: shade(hair, 0.78),
    hairStyle,
    shirt,
    shirtDark: shade(shirt, 0.72),
    shirtLite: shade(shirt, 1.18),
    pants,
    skirt,
    skirtDark: shade(skirt, 0.75),
    wearsSkirt,
    cap,
    capDark: shade(cap, 0.7),
    trailColour: opts.trailColour ?? shirt,
  };
}
