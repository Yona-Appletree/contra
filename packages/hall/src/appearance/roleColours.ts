import { hexToHsl, hslToHex, shade } from "./shade.js";

/**
 * **The two role colours: larks gold, robins red.**
 *
 * A user ruling of 2026-09-14, and the one constant every renderer reads.
 * Nothing that distinguishes the roles may be blue-ish for larks or pink-ish
 * for robins — in any renderer, view, trace, chart, card or document. The
 * blue-and-pink of the exploration post read as a claim about gender, which is
 * exactly what contra's role names exist to avoid. See AGENTS.md's rendering
 * contract and `docs/role-colours.md`.
 *
 * `other` is what a role outside the contra set gets — the band, the caller,
 * the sitters, a square formation's heads and sides — a warm neutral that is
 * neither of the two.
 */
export const ROLE_COLOURS = {
  lark: "#e0a32e",
  robin: "#c8362f",
  other: "#9c8f7a",
} as const;

/** How much darker the ones' ink and trail are than the base role colour. */
export const ONES_SHADE = 0.72;
/** How much lighter the twos' are. */
export const TWOS_SHADE = 1.24;

/** The role colour for a role name. See {@link ROLE_COLOURS}. */
export function roleColour(role: string): string {
  return role === "lark"
    ? ROLE_COLOURS.lark
    : role === "robin"
      ? ROLE_COLOURS.robin
      : ROLE_COLOURS.other;
}

/**
 * The role colour shaded by rank: the ones darker, the twos lighter, so a plate
 * or a floor trail reads the two ranks apart without borrowing a second hue.
 * `rank` is 1 for the ones, 2 for the twos, 0 for unranked.
 */
export function rankShade(colour: string, rank = 0): string {
  if (rank === 1) return shade(colour, ONES_SHADE);
  if (rank >= 2) return shade(colour, TWOS_SHADE);
  return colour;
}

/**
 * How far one dancer's shirt may wander from their role's colour.
 *
 * Wide enough that thirty dancers in a hall do not look like a uniform, narrow
 * enough that gold still reads as gold and red as red from directly above at
 * 1×. Hue moves least — it is the part that carries the ruling — and lightness
 * most, because from above a shirt is a nine-pixel ellipse and value is the
 * difference the eye picks up at that size.
 *
 * Measured over three thousand seeds, against gold `hsl(39.4, 74.2%, 52.9%)`
 * and red `hsl(2.7, 61.9%, 48.4%)`, this gives larks hue 31.3–47.6°,
 * saturation 66.5–87.9%, lightness 39.0–58.2%; robins hue 354.4–10.9°,
 * saturation 55.6–73.4%, lightness 35.7–53.3%. Both windows clear
 * {@link FORBIDDEN_ROLE_HUE_BANDS} — the robin's low edge by 4.4°, which is the
 * tight one, and `roleColours.test.ts` is what keeps it that way.
 */
export const SHIRT_HUE_SPREAD_DEG = 8;
/** Multipliers on the role colour's saturation, and the range it is held in. */
export const SHIRT_SATURATION_SPREAD = { min: 0.9, max: 1.18, floor: 0.5, ceiling: 0.95 } as const;
/** Multipliers on the role colour's lightness, and the range it is held in. */
export const SHIRT_LIGHTNESS_SPREAD = { min: 0.74, max: 1.1, floor: 0.24, ceiling: 0.7 } as const;

/**
 * One dancer's shirt: their role's colour, moved by three draws from their own
 * seed. Same seed in, same shirt out, which is what makes a golden frame stable.
 */
export function roleShirtColour(role: string, rng: () => number): string {
  const [h, s, l] = hexToHsl(roleColour(role));
  const hue = h + (rng() * 2 - 1) * SHIRT_HUE_SPREAD_DEG;
  const sat = hold(s * spread(rng(), SHIRT_SATURATION_SPREAD), SHIRT_SATURATION_SPREAD);
  const lit = hold(l * spread(rng(), SHIRT_LIGHTNESS_SPREAD), SHIRT_LIGHTNESS_SPREAD);
  return hslToHex(hue, sat, lit);
}

/**
 * The hue bands nothing that distinguishes a role may fall in, in degrees:
 * blue-ish is cyan through violet-blue, pink-ish is magenta through rose. These
 * are the ruling written as numbers, and `roleColours.test.ts` checks every
 * colour any renderer puts on a role against them.
 */
export const FORBIDDEN_ROLE_HUE_BANDS: readonly { name: string; from: number; to: number }[] = [
  { name: "blue", from: 190, to: 270 },
  { name: "pink", from: 290, to: 350 },
];

/** Whether a `#rrggbb` colour's hue falls in a {@link FORBIDDEN_ROLE_HUE_BANDS} band. */
export function forbiddenRoleHue(hex: string): string | undefined {
  const [h, s] = hexToHsl(hex);
  // A colour with no chroma left has no hue to judge: black, white and the
  // greys are not blue and not pink.
  if (s < 0.08) return undefined;
  return FORBIDDEN_ROLE_HUE_BANDS.find((b) => h >= b.from && h <= b.to)?.name;
}

const spread = (t: number, s: { min: number; max: number }): number => s.min + t * (s.max - s.min);
const hold = (v: number, s: { floor: number; ceiling: number }): number =>
  Math.max(s.floor, Math.min(s.ceiling, v));
