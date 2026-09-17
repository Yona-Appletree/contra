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
export type MotionMetric =
  | "handSpeed"
  | "elbowSpeed"
  | "elbowPerHand"
  | "heightRate"
  | "dip"
  | "travel"
  | "roleSpread"
  | "partSpread";

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
      "(docs/motion-report.md: 11.94× run alone and 12.04× inside a dance, " +
      "against a bound of 8.06). M1 expected M2 to " +
      "take this row away with the rewrite; it did not, and could not: DD21 " +
      "protects the swing's *geometry*, so the data swing reproduces the coded " +
      "one to 0.01 px from the stations and reproduces this take with it. It is a " +
      "motion-profile row, not a figure-model row, and M10 is what owns it.",
  },
  // **`swing elbowSpeed` is gone** (FR-D2b). It was the row above measured as a
  // speed rather than a ratio, and the hanging elbow pole takes it away: the
  // swing's open-out lowers a hand from shoulder height to a hang, and with the
  // elbow now staying in the arm's own vertical plane instead of being pushed
  // sideways out of it, the fastest that take moves the elbow inside a dance
  // falls under the guard. The ratio row above is still needed.
  {
    dance: "*",
    key: "pull-by",
    metric: "elbowPerHand",
    reason:
      "A pull-by's joined hand is one shared floor point half way between two " +
      "dancers walking straight through each other, so at the middle of the pass " +
      "the hand is **exactly** still while both arms swing round it from ahead to " +
      "behind. Every number in this column for a pass is the elbow's own speed " +
      "over STILL_HAND_PX (2 pi x 0.6 = 3.77), which is the ratio's floor for a " +
      "hand that is not moving at all: 19.44x over an elbow of 73.3 px/beat where " +
      "the dancer was already facing the way they were going, and 44.61x over " +
      "168.2 where A Rare Bird's second pass along the sides asks for a half turn " +
      "as well, because the six beats of shoulder round before it belong to an N3 " +
      "that does not exist and left the dancer standing the other way. The elbow " +
      "is inside its own bound of 188.3 either way. M10's motion profiles are " +
      "what should give the ratio a hand-is-parked case; the half turn in two " +
      "beats is the end-effects rule (the outs do what the ins need), which this " +
      "plan has only the simplest form of.",
  },
  {
    dance: "*",
    key: "grand-right-and-left",
    metric: "elbowPerHand",
    reason:
      "Three pull-bys in a row, and the same measurement: in Whoosh, 19.44x at " +
      "beat 1.0 — the middle of the first pass — where c1/robin's right hand sits " +
      "on the shared point between her and c1/lark and does not move while her " +
      "elbow swings past it at 73.3 px/beat, and 44.61x over 168.2 at the top of " +
      "the second time through, where the dancers come out of B2's do-si-do " +
      "looking across the set and turn to face along it as the first hand goes " +
      "up. See the pull-by row above; M10 owns both.",
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
  {
    dance: "*",
    key: "circle",
    metric: "travel",
    reason:
      "M10's sustained-travel bound is 23.32 px/beat — one and a half swings " +
      "(`figures/motionBounds.ts`). A circle three places round the ring takes " +
      "25.13 px/beat when the card gives it **six** beats rather than the " +
      "figure's own eight, which is how Airpants, Butter, The Nice " +
      "Combination, The Carousel, After the Solstice and A Rare Bird all call " +
      "it. Run alone at its nominal count the same circle is 14.14 px/beat, " +
      "comfortably inside. So this is not the figure being wrong: it is a call " +
      "asking four dancers to cover three quarters of a ring in six beats, " +
      "which really is a fast circle, and the levers are the card's count or " +
      "the ring's radius (`RING_NEIGHBOR_SPACING_PX`, the circle's own " +
      "footprint clamp) — not the motion profile, which already took 2.6 " +
      "px/beat off it.",
  },
  {
    dance: "are-you-most-done",
    key: "allemande",
    metric: "travel",
    reason:
      "The same call-count arithmetic as the circle above, in the dance the " +
      "card is hardest on. Are You 'Most Done?'s B2 is *(4) Men allemande " +
      "right 1*: a whole turn in **four** beats, between the two larks of a " +
      "becket minor set, who stand on a **diagonal** 37.74 px apart (the set " +
      "is 32 px wide and a becket couple stands half a couple place along its " +
      "own line). Measured at six couples, beats 48-52: the lark's whole path " +
      "is 73.40 px — walk in to the middle, once round, walk out — and the " +
      "worst one-beat window of it is 33.91 px/beat against M10's 23.32. The " +
      "same allemande run alone is 10.1 px/beat (docs/motion-report.md), and " +
      "A1's, which is once and a half over **eight** beats between the same " +
      "two dancers, is 15.15. So it is not the figure and it is not the cycle " +
      "boundary — M9g's straightening hey took the boundary's own walk-in " +
      "away and this row did not move a digit (33.9 before and after, while " +
      "`swing` went 27.4 -> 21.5 and `long-lines` 24.7 -> 3.8). The levers are " +
      "the card's four beats or how far apart a becket minor set's two larks " +
      "stand, and neither is the motion profile's.",
  },
  {
    dance: "*",
    key: "star",
    metric: "travel",
    reason:
      "The same call-count arithmetic as the circle above, and M10's own " +
      "bound: a star called over fewer beats than the figure's own count " +
      "travels 25.13 px/beat where the figure alone is 18.85. A Rare Bird is " +
      "the dance. The user's review has an open question about how wide a star " +
      "should be (`figure-review.md`, the director's note of 09:58), and the " +
      "ring's radius is the lever that would move this row — the figure review " +
      "milestone that answers it, not the motion profile, which already took " +
      "3.5 px/beat off the figure's own number.",
  },
  // **E27's `wait-out travel` row is gone** (FR-C2). It read "a couple waiting
  // out at the end of the set slides a whole place — 32 px — to rejoin, which
  // is 28.7 px/beat sustained and the fastest travel in the programme". A becket
  // slide is half a couple place since DD54, so the crossing no longer drags the
  // couple a whole place and the row has nothing to allow: the allowlist test
  // ("holds nothing that no loaded dance actually needs") is what took it away.
  // ---- M10b: the two evenness columns, bound 1.60x (the minor set's own
  // rectangle; `figures/motionBounds.ts`). Every row below is a figure whose
  // roles or whose halves are *meant* to be uneven, or whose unevenness is a
  // measured consequence of a ruling already taken, with the lever named.
  {
    dance: "*",
    key: "wait-out",
    metric: "partSpread",
    reason:
      "**E27 again, as a shape rather than a speed.** A couple waiting out at " +
      "the end of the set stands still for part of the figure and crosses it " +
      "in the rest, so its two halves are far apart — 3.07x in Butter since " +
      "FR-C2 halved the slide, and up to 17.40x in a lab dance. That is what " +
      "waiting out *is*: you wait, then you come in. The levers are the " +
      "transitions model, or the width of the set; M10b measured it and owns " +
      "neither, and a transitions milestone is what would take this row away. " +
      "Its `travel` twin is gone, which is what FR-C2's half-width slide " +
      "bought: the crossing no longer drags the couple a whole couple place.",
  },
  {
    dance: "*",
    key: "robins-chain",
    metric: "roleSpread",
    reason:
      "**The chain's robins walk 1.76x as far as its larks, and the hold is " +
      "why.** Run alone: the lark's whole figure is one circle of " +
      "2 pi x 5.75 = 36.13 px, and the robin crosses the set and opens out on " +
      "to a place a set's width away for 63.73 px, over the same eight beats. " +
      "The circle's radius is half `COURTESY_REACH_HOLD_PX` (11.5 px, the " +
      "widest hold at which the lark's right hand is still on the robin's back " +
      "rather than past the end of his arm), so it cannot grow: evening the " +
      "two means his circle at 6.27 px of radius, which is a 12.54 px hold. " +
      "M10b measured every other lever and none of them moves it: `openBeats` " +
      "over 0.5-3 spans 1.744-1.953, `passPx` over 0-8 does not move it at " +
      "all, and `joinBeat` is the user's own two beats and the lark's 77deg. " +
      "The one lever that does even it - the orbit's pivot at 0.75 of the " +
      "hold, which gives 1.0086 - stops the robin dead at 2.58 px/beat while " +
      "the lark walks 7.74, so it is worse by the user's own criterion. " +
      "The number is 1.94x in the programme, where the chain's two places are " +
      "further apart than in a duple improper four. See the M10b report.",
  },
  {
    dance: "*",
    key: "robins-chain",
    metric: "partSpread",
    reason:
      "The same figure from the dancer's side: the robin's two halves are " +
      "1.23x apart alone and 1.85x in the programme, because her second half " +
      "carries the opening out on to a place a set's width from the couple's " +
      "hold. M10b took the worst of it off - the last beat of a chain was the " +
      "fastest beat in the library at 17.09 px/beat and is now 15.37 - by " +
      "making the opening out a chord instead of a spiral. What is left is " +
      "the 20.5 px she has to cover, which is the set's own width against the " +
      "hold, and the same lever as the row above.",
  },
  {
    dance: "*",
    key: "right-and-left-through",
    metric: "partSpread",
    reason:
      "The pass over is a walk and the courtesy turn is a pivot, so the two " +
      "halves of the figure are 1.90x apart in a dance (1.20x run alone). " +
      "This is the chain's complaint in the figure the chain's turn is " +
      "borrowed from, and the user has **not** been asked about it: M10b's " +
      "brief says to report the number and change nothing. The levers are " +
      "`passBeats` (3.5 of 8) and `COURTESY_PIVOT_FROM_LARK_PX`, both of " +
      "which the user ruled, so moving either is a question for them.",
  },
  {
    dance: "*",
    key: "down-the-hall",
    metric: "partSpread",
    reason:
      "Walk down the hall, then turn as a couple at the bottom: two parts, " +
      "and the turn covers less ground than the walk. 1.70x run alone and in " +
      "The Nice Combination, 2.86x for `lead-down`/`lead-up` in Chorus Jig " +
      "where the card gives the turn fewer beats. A figure that is two " +
      "different things is not a figure danced unevenly, which is the one " +
      "case this column cannot tell apart; M5's schedule is where a " +
      "down-the-hall could be written as a sequence and have each part " +
      "measured on its own.",
  },
  {
    dance: "*",
    key: "up-the-hall",
    metric: "partSpread",
    reason:
      "The same figure, coming back, and the same two parts: see " +
      "`down-the-hall` above. M5's schedule is the milestone that would " +
      "measure each part on its own and take this row away.",
  },
  {
    dance: "*",
    key: "lead-down",
    metric: "partSpread",
    reason:
      "The same two parts as `down-the-hall`: see above. Chorus Jig, where " +
      "the card gives the turn fewer beats than The Nice Combination does. " +
      "M5's schedule is the milestone that would take this row away.",
  },
  {
    dance: "*",
    key: "lead-up",
    metric: "partSpread",
    reason:
      "The same two parts as `down-the-hall`, coming back up: see above. " +
      "Chorus Jig. M5's schedule is the milestone that would take this row " +
      "away.",
  },
  {
    dance: "*",
    key: "hey",
    metric: "partSpread",
    reason:
      "1.64x, barely over: a hey's four dancers each walk one lane across the " +
      "set and one loop round an end, and a loop at the end of a line is a " +
      "tighter curve than the lane that leads into it. Neighbor Neighbor on " +
      "the Wall. Run alone the same hey is 1.06x, so this is the dance's own " +
      "geometry (which end, how long the lane) and not the figure's shape. " +
      "M10b measured it; M5's own schedule is where a hey's lanes and loops " +
      "would be given beats by their distance and this row would go.",
  },
  {
    dance: "*",
    key: "circulate",
    metric: "roleSpread",
    reason:
      "2.64x in Whoosh. A circulate moves every dancer to the place of the " +
      "dancer in front of them, and in a minor set those places are a " +
      "rectangle: the two who go the long way travel 32 px and the two who go " +
      "the short way 20. That is the **floor's own aspect**, which is where " +
      "this column's bound comes from - but a circulate over a *quarter* of " +
      "the way round takes only one of the two, so the ratio the figure shows " +
      "is not the ring's 1.6 but the pairing the dance happened to ask for. " +
      "The lever is the set's shape, not the figure's, so M10b does not own " +
      "it and no figure-model milestone would move it.",
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
