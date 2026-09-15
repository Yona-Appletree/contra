import type { CSSProperties } from "react";

/**
 * **The four parts of a caller's line, as four quiet hues** (D26).
 *
 * The user, on the old contra card program: "lets add color coding to the words
 * in the main call … Robins - who, allemande - what, right - which way, once and
 * a half - how far. something like that, not too bold."
 *
 * Two rules, and both are checked rather than remembered
 * (`cards.test.tsx`):
 *
 * - **Nothing is coloured by role** (D8). The `who` colour is the same colour
 *   whether the word is ROBINS or LARKS, and none of the four is anywhere near
 *   lark gold (`#e0a32e`, hue 40°) or robin red (`#c8362f`, hue 3°) — fifteen
 *   degrees is the margin, and these are more than a hundred away.
 * - **`what` is the ordinary ink.** The figure's own name is the thing you are
 *   reading; colouring it as well would leave nothing plain to read it against.
 *
 * In TypeScript rather than in `hall.css` for one reason: a rule about a colour
 * that nothing can check is a rule that drifts, and vitest stubs a CSS import
 * to the empty string, so a test that read the stylesheet would pass on an empty
 * file. The cards set them as custom properties on their own root and the
 * stylesheet reads `var(--call-who)` as it would from anywhere else.
 */
export const CALL_COLOURS = {
  /** Who is dancing it: a muted slate blue. */
  who: "#4a6a9c",
  /** What the figure is: the card's own ink. */
  what: "inherit",
  /** Which way it goes: a muted green. */
  way: "#3f7d68",
  /** How far: a muted violet. */
  far: "#7a5f9c",
} as const;

/** The four as the custom properties the two cards' stylesheets read. */
export const CALL_COLOUR_VARS: CSSProperties = {
  "--call-who": CALL_COLOURS.who,
  "--call-what": CALL_COLOURS.what,
  "--call-way": CALL_COLOURS.way,
  "--call-far": CALL_COLOURS.far,
} as CSSProperties;
