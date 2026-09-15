import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Balance the wave of four across the set** (M8).
 *
 * Anna's Reel's A1 and 2A1: *"(4) Balance wave of four (NL,WR)"* and
 * *"(4) Balance wave of four (N2R,ML)"*. M7 built the **long** wave — a whole
 * line of the set, hands along it, everybody looking across — and stopped at
 * this one, because it is a genuinely different shape with a genuinely different
 * hand rule and no transcript spells the rule out.
 *
 * ## What the two tokens say
 *
 * `(NL,WR)` is two facts: *the robins' right hands in the middle* and *your
 * neighbour's left hand on the end*. Only the first is a parameter here — which
 * role is in the middle, and which hand that pair joins — because **a wave
 * alternates**: the hand the middle pair is not using is the hand they give to
 * the ends, so the second token is the first one's consequence rather than a
 * second choice. `(N2R,ML)` is the same sentence with the larks in the middle
 * by the left, and the record writes both tokens anyway, in its `call` text, so
 * a reader sees the transcript's own words.
 *
 * ## Everything else is read off where the dancers are
 *
 * The row runs from one line of the set to the other, on the lattice rather than
 * on an angle. Each dancer keeps the **side** of the set they are already on;
 * the two of the middle role come to the middle and the other two take the ends;
 * and each dancer's facing follows from the hand they are giving and the
 * direction they are giving it (`kinds/wave.ts`). Nothing about the shape is
 * written down twice.
 *
 * ## `ends: "relative"`, deliberately
 *
 * A wave is not a place the formation has, and the figure that follows it in
 * Anna's Reel — a neighbour allemande three quarters — is a gatherer that
 * settles on the set's own places from wherever the wave left people. Settling
 * the wave itself would put the four back on the lines they came from and undo
 * the shape the very moment it was made.
 */
export const balanceWaveOfFourDefinition: FigureDefinition = {
  id: "balance-wave-of-four",
  call: "BALANCE THE WAVE OF FOUR",
  describe:
    "The four of you make one short line straight across the set, looking up and down it rather than at each other: the two named take hands in the middle, and each of them gives their other hand to the dancer on their own end of the row. Everybody is looking the opposite way to the dancers beside them, which is what makes it a wave. Rock forward together on to the first beat and back on the third. Nobody goes anywhere.",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      /** Which contra role stands in the middle of the row. */
      centre: "robin",
      /** The hand the middle pair joins; the ends get the other one. */
      hand: "R",
      /** How far the body rocks forward, px — a balance's own number. */
      rock: 4,
      /** How far apart the row's four places sit, px: a joined hand. */
      spacing: 14,
      closeBeats: 1,
      holdDrop: 2,
    },
  },
  shape: {
    kind: "wave",
    axis: "across",
    centre: "centre",
    hand: { param: "hand" },
    spacing: { param: "spacing" },
    // Read only by the long wave; a row across the set takes its facings from
    // its hands. Named anyway because the shape type is one type.
    facesIn: "centre",
    rock: { param: "rock" },
    closeBeats: { param: "closeBeats" },
    handDrop: { param: "holdDrop" },
    idleHands: { kind: "down" },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "pace", profile: "smooth" },
  // A wave of four in a mirror is a wave of four with the hands swapped — the
  // middle pair by the other hand and, by the alternation, the ends too — and
  // with the two roles exchanged it is the other pass of Anna's Reel: `(NL,WR)`
  // becomes `(N2R,ML)`, which is what the transcript writes out.
  symmetry: { mirror: { kind: "parameters", hands: ["hand"] }, roles: ["centre"] },
};
