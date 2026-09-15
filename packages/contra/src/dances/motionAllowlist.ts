/**
 * The motion rows a dance is allowed to be over the library's bounds on, each
 * with a reason.
 *
 * Director debt 11 and R6: the motion oracle used to be **advisory** — the
 * motion report printed a number in bold and nothing failed. From `pnpm dance`
 * onwards it is a gate: a seam or figure row over `CONTRA_MOTION_BOUNDS` fails
 * the lab unless it is listed here, by dance, by row key and by metric, with a
 * sentence saying why it is tolerated and what would remove it.
 *
 * Nothing here is a tolerance being raised. The bounds themselves are derived
 * (see `figures/motionBounds.ts`) and do not move; this is the list of known
 * defects, so that a *new* defect is a failure and an old one is a debt with a
 * name. Every row below is the coded figure library's, and every one of them is
 * expected to disappear as its figure is rewritten as data (M2, M4, M5) — at
 * which point the entry is deleted and the lab starts failing if it comes back.
 */

/** Which column of a motion row an allowance is about. */
export type MotionMetric = "handSpeed" | "elbowSpeed" | "elbowPerHand" | "heightRate" | "dip";

/** One tolerated over-bound row. */
export interface MotionAllowance {
  /** The dance slug this is allowed in, or `"*"` for every dance. */
  dance: string;
  /** The motion row's key: a figure id, or a `"prev → next"` seam pair. */
  key: string;
  metric: MotionMetric;
  /** Why it is tolerated, and what would remove it. */
  reason: string;
}

/** Every allowance, by dance. */
export const MOTION_ALLOWLIST: readonly MotionAllowance[] = [
  {
    dance: "*",
    key: "swing",
    metric: "elbowPerHand",
    reason:
      "The swing's elbow swings hard under a nearly still hand at the take " +
      "(docs/motion-report.md: 11.94× against a bound of 8.06). M1 expected M2 to " +
      "take this row away with the rewrite; it did not, and could not: DD21 " +
      "protects the swing's *geometry*, so the data swing reproduces the coded " +
      "one to 0.01 px from the stations and reproduces this take with it. It is a " +
      "motion-profile row, not a figure-model row, and M10 is what owns it.",
  },
  {
    dance: "*",
    key: "swing",
    metric: "elbowSpeed",
    reason:
      "The same take as the row above, measured as a speed rather than a ratio. " +
      "M10, for the same reason.",
  },
  {
    dance: "*",
    key: "*",
    metric: "dip",
    reason:
      "The out-and-back bound is derived from a *hanging* hand — one swing of " +
      "2 x HAND_HANG_SWING_PX = 1.2 px, guarded at 3x to 3.6 px — and a figure " +
      "that places a hand and lets it go again inside one beat legitimately moves " +
      "it further than that and reads as a dip. The chain's courtesy turn is the " +
      "worst at 7.86 px (docs/motion-report.md). M10 is where the motion profiles " +
      "make this bound mean something; until then it is the one column no figure " +
      "in the library has ever met. Listed once rather than per figure so that the " +
      "list stays readable.",
  },
];

/** Whether this dance is allowed to be over this bound on this row, and why. */
export function motionAllowance(
  dance: string,
  key: string,
  metric: MotionMetric,
): MotionAllowance | undefined {
  return MOTION_ALLOWLIST.find(
    (a) =>
      (a.dance === "*" || a.dance === dance) &&
      (a.key === "*" || a.key === key || seamHas(key, a.key)) &&
      a.metric === metric,
  );
}

/**
 * Whether a `"prev → next"` seam key has `figure` on either side.
 *
 * A seam row's numbers are the *pair's*, and a defect that belongs to one of
 * the two figures shows up in every seam it is half of — so an allowance named
 * for a figure covers the figure's own row and the seams it is in, rather than
 * needing one entry per neighbour it happens to be called beside.
 */
const seamHas = (key: string, figure: string): boolean =>
  key.startsWith(`${figure} → `) || key.endsWith(` → ${figure}`);
