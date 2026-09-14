import type { Appearance, AppearanceOptions } from "../appearance/Appearance.js";
import { createAppearance } from "../appearance/Appearance.js";
import { ROLE_COLOURS, rankShade, roleColour } from "../appearance/roleColours.js";

/**
 * One dancer's identity and look. `role` is a role name from whatever role set
 * the dance uses — the renderer only compares it with `Frame.roleSet.top` and
 * uses it to colour the shirt and the trail, so `@caller/hall` stays
 * form-neutral: a role it does not know gets the neutral colour and dances on.
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
   * Whether this dancer is one of the ones. The shirt ignores it — a one and a
   * two wear the same gold — but the trail reads it: the ones' trails are the
   * darker pair, as in the hall spike and on the trace plates.
   */
  ones?: boolean;
  /**
   * Dress this person in their **role's** colour (larks gold, robins red) with
   * a per-person spread, rather than from the sixteen-colour palette. On for
   * every dancer; off for the band, the caller and the sitters, who are not
   * dancing a role and keep the palette.
   */
  roleShirts?: boolean;
}

/**
 * Build a person from a seed. Everything about how they look follows from the
 * seed, so a hall is reproducible from a list of `{ id, role, seed }`.
 */
export function createPerson(spec: PersonSpec): Person {
  const { id, role, seed, ones, roleShirts, ...appearanceOpts } = spec;
  const roleShirt = appearanceOpts.roleShirt ?? (roleShirts === true ? role : undefined);
  return {
    id,
    role,
    seed,
    appearance: createAppearance(seed, {
      ...appearanceOpts,
      ...(roleShirt === undefined ? {} : { roleShirt }),
      trailColour: appearanceOpts.trailColour ?? roleTrailColour(role, ones),
    }),
  };
}

/**
 * Trail colours: the role colours, the ones darker than the twos, exactly the
 * pens the trace plates draw with. An unknown role gets the neutral trail, so a
 * square formation still leaves tracks.
 *
 * These were the hall spike's larks-blue and robins-rose until the user's
 * ruling of 2026-09-14; the colour that says which role you are is gold or red
 * now, wherever it is drawn. See `appearance/roleColours.ts`.
 */
export const TRAIL_COLOURS = {
  lark: { ones: rankShade(ROLE_COLOURS.lark, 1), twos: rankShade(ROLE_COLOURS.lark, 2) },
  robin: { ones: rankShade(ROLE_COLOURS.robin, 1), twos: rankShade(ROLE_COLOURS.robin, 2) },
  other: { ones: rankShade(ROLE_COLOURS.other, 1), twos: rankShade(ROLE_COLOURS.other, 2) },
} as const;

/** The trail colour for a role name. See {@link TRAIL_COLOURS}. */
export function roleTrailColour(role: string, ones = false): string {
  return rankShade(roleColour(role), ones ? 1 : 2);
}
