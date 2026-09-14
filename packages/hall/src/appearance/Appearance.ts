import { mulberry32, pick } from "./mulberry32.js";
import { shade } from "./shade.js";

/**
 * Everything about how one dancer looks, as flat colours. Nothing here knows
 * about roles or dancing: a role set decides which shirt palette a person draws
 * from, and the renderer only reads these fields.
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
  /** Set when this person is not wearing a skirt. */
  pants?: string;
  /** Set when this person is wearing a skirt; `skirtDark` comes with it. */
  skirt?: string;
  skirtDark?: string;
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
 * Sixteen shirt colours, the spikes' own palette (director ruling DD13),
 * ordered eight cool then eight warm so a role set can dress one role from
 * each half.
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

/** The cool half of {@link SHIRT_COLOURS} — the two-dancers spike's lark look. */
export const COOL_SHIRTS: readonly string[] = SHIRT_COLOURS.slice(0, 8);

/** The warm half of {@link SHIRT_COLOURS} — the two-dancers spike's robin look. */
export const WARM_SHIRTS: readonly string[] = SHIRT_COLOURS.slice(8);

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
  /** Force a skirt on or off. Left out, the seed decides, half and half. */
  skirt?: boolean;
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
  const shirt = pick(rng, opts.shirts ?? SHIRT_COLOURS);
  const wearsSkirt = opts.skirt ?? rng() < 0.5;
  const skirt = wearsSkirt ? pick(rng, SKIRT_COLOURS) : undefined;
  const pants = wearsSkirt ? undefined : pick(rng, PANTS_COLOURS);
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
    ...(pants === undefined ? {} : { pants }),
    ...(skirt === undefined ? {} : { skirt, skirtDark: shade(skirt, 0.75) }),
    cap,
    capDark: shade(cap, 0.7),
    trailColour: opts.trailColour ?? shirt,
  };
}
