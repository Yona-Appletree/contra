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
export type HoldId =
  | "free"
  | "allemande-R"
  | "allemande-L"
  | "couple"
  | "ring"
  | "ballroom"
  | "line"
  | "pull-by-R"
  | "pull-by-L"
  | "courtesy"
  | "two-hand";

/**
 * Every hold the IR can name today, for tests and the debugger's pickers.
 * `free` and the allemandes were approved-in-principle by P6's tests; the
 * rest are **placeholders** Butter needs at floor level, each to be ruled on
 * by the user at the holds gallery (roadmap bite B).
 */
export const HOLD_IDS: readonly HoldId[] = [
  "free",
  "allemande-R",
  "allemande-L",
  "couple",
  "ring",
  "ballroom",
  "line",
  "pull-by-R",
  "pull-by-L",
  "courtesy",
  "two-hand",
];

/** Which hand a hold takes. */
export type Hand = "right" | "left";

/** Both hands, in the order the debugger lists them. */
export const HANDS: readonly Hand[] = ["right", "left"];
