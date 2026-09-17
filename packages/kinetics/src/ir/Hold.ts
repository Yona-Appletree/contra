/**
 * The name of a hold. A hold is the **only** way a hand is placed (D4): it
 * names the hand targets, the hand height, the elbow swivel, the spacing
 * between the two bodies and who is on top, and it is one shared instruction
 * between the two dancers rather than a line in either's script (D13).
 *
 * Only the *name* lives here. The postures those names stand for are P6's,
 * and each one is approved once by the user's eye and is then right
 * everywhere. Tonight's three figures need two of them; Butter needs the
 * whole gallery (`pull-by-R/L`, `two-hand`, `ballroom`, `courtesy`,
 * `promenade`, `ring`, `line`, `wave-R/L`, `arch`, `wrist-star`).
 */
export type HoldId = "free" | "allemande-R" | "allemande-L";

/** Every hold the IR can name today, for tests and the debugger's pickers. */
export const HOLD_IDS: readonly HoldId[] = ["free", "allemande-R", "allemande-L"];

/** Which hand a hold takes. */
export type Hand = "right" | "left";

/** Both hands, in the order the debugger lists them. */
export const HANDS: readonly Hand[] = ["right", "left"];
