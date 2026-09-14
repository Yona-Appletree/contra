import type { Appearance, AppearanceOptions } from "../appearance/Appearance.js";
import { COOL_SHIRTS, WARM_SHIRTS, createAppearance } from "../appearance/Appearance.js";

/**
 * One dancer's identity and look. `role` is a role name from whatever role set
 * the dance uses — the renderer only compares it with `Frame.roleSet.top` and
 * uses it to colour the trail, so `@caller/hall` stays form-neutral.
 */
export interface Person {
  id: string;
  role: string;
  seed: number;
  appearance: Appearance;
}

/** What {@link createPerson} needs. */
export interface PersonSpec extends AppearanceOptions {
  id: string;
  role: string;
  seed: number;
  /**
   * Whether this dancer is one of the ones. Only the trail colour reads it:
   * the ones' trails are the darker pair, as in the hall spike.
   */
  ones?: boolean;
  /**
   * Colour the shirt by role — cool shirts for the role set's `top` role's
   * opposite, warm for the `top` role — the two-dancers spike's default look.
   * Off by default: dress is not role.
   */
  roleShirts?: { top: string };
}

/**
 * Build a person from a seed. Everything about how they look follows from the
 * seed, so a hall is reproducible from a list of `{ id, role, seed }`.
 */
export function createPerson(spec: PersonSpec): Person {
  const { id, role, seed, ones, roleShirts, ...appearanceOpts } = spec;
  const shirts =
    appearanceOpts.shirts ??
    (roleShirts === undefined ? undefined : role === roleShirts.top ? WARM_SHIRTS : COOL_SHIRTS);
  return {
    id,
    role,
    seed,
    appearance: createAppearance(seed, {
      ...appearanceOpts,
      ...(shirts === undefined ? {} : { shirts }),
      trailColour: appearanceOpts.trailColour ?? roleTrailColour(role, ones),
    }),
  };
}

/**
 * Trail colours from the hall spike: larks blue, robins rose, the ones darker
 * than the twos. An unknown role gets the neutral trail, so a square formation
 * still leaves tracks.
 */
export const TRAIL_COLOURS = {
  lark: { ones: "#3f6fb8", twos: "#8cc0ec" },
  robin: { ones: "#d04f70", twos: "#f4a8bc" },
  other: { ones: "#8a7f6a", twos: "#c2b8a4" },
} as const;

/** The trail colour for a role name. See {@link TRAIL_COLOURS}. */
export function roleTrailColour(role: string, ones = false): string {
  const entry =
    role === "lark"
      ? TRAIL_COLOURS.lark
      : role === "robin"
        ? TRAIL_COLOURS.robin
        : TRAIL_COLOURS.other;
  return ones ? entry.ones : entry.twos;
}
