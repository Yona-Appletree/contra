import type { FigureDefinition } from "../FigureDefinition.js";
import { LANE_ROLES } from "../../set/resolve.js";

/**
 * **Balance the long wave** (M7, handed over from M6).
 *
 * Whoosh's A2: *"(4) Balance long wave (N1R, men face in)"*. A whole line of the
 * set joins hands along itself, everybody facing alternately in and out, and the
 * lot of them rock forward and back together.
 *
 * M6 left it unwritten and said what was missing — *"a wave-hold rule inside the
 * shape kind: the named hand to the lane neighbour you are facing, the other
 * hand to the one behind you"* — and also said why it was worth waiting for:
 * *"it unblocks no dance on its own"* and *"Anna's Reel is the next dance that
 * wants it"*. Both of those are M7's dances, so here it is, as the `wave` shape
 * kind.
 *
 * ## Why it is a whole line
 *
 * `actors: "line"` and `roles: ["*"]`: a long wave has one part per dancer of one
 * line of the set, and how many that is is how long the hall is, so no definition
 * can write their names down. Resolution casts the whole lane, one part per
 * dancer named for the slot they stand on, in order along the set — which is what
 * lets "the named hand to the dancer one place along the way I travel" mean the
 * same thing to everybody in it.
 *
 * ## "Men face in"
 *
 * A wave of four across the set and a long wave down it differ only in which of
 * the two roles is looking which way, so it is a parameter. Which way "in" is,
 * though, is a fact about the **set**: it is `+x` from one line and `−x` from the
 * other, and the shape reads it off the lattice rather than off an angle.
 */
export const balanceWaveDefinition: FigureDefinition = {
  id: "balance-wave",
  call: "BALANCE THE WAVE",
  describe:
    "You are in a wave: take the named hand of the dancer one place along the set from you, and your other hand to the one behind you, so the whole line is joined up and everybody is looking the opposite way to the dancers beside them. Step forward on to the first beat and back to the line on the third. It is a small step and it never carries you through the line, because the dancers either side of you are stepping the other way and your arms are joined down it. Nobody goes anywhere.",
  lead: 4,
  nominalBeats: 4,
  roles: [LANE_ROLES],
  actors: "line",
  anchor: "lane",
  params: {
    kind: "canonical",
    defaults: {
      /**
       * **The wave across the set reads this; the long wave derives it** (M7b).
       *
       * The transcripts write the hand — Whoosh's `N1R`, Anna's Reel's `NL,WR` —
       * and M8's wave *across* the set takes its facings from it. Down the set it
       * cannot be an input: which hand you really give the dancer beside you is a
       * fact about your body, following from where the two of you stand and which
       * way you are looking, and `facesIn` is what says the second of those. So
       * the long wave in `kinds/wave.ts` derives every hand and this stays as the
       * caller's word there, turned into a **measurement** by
       * `balance-wave.test.ts`: Whoosh's wave really does put right hands into
       * every N1 pair, at every line length.
       */
      hand: "R",
      /** Which contra role looks in, toward the other line. */
      facesIn: "lark",
      /**
       * How far the body rocks off the line of the wave, px.
       *
       * **One px, like every other balance in the library** (FR-A2), where it
       * used to be four. The user, looking at the wave the Moves page drew:
       * *"people don't move past each other when balancing, that would break
       * their arms. the move towards and then back, but not past."* A wave's
       * dancers look opposite ways, so a rock shears the line by twice this
       * number; at four the two bodies offset by most of a shoulder width and
       * read as sliding past one another. `kinds/wave.ts` bounds it as well as
       * defaulting it, so a dance cannot ask for the old look back.
       */
      rock: 1,
      closeBeats: 1,
      holdDrop: 2,
    },
  },
  shape: {
    kind: "wave",
    hand: { param: "hand" },
    facesIn: "facesIn",
    rock: { param: "rock" },
    closeBeats: { param: "closeBeats" },
    handDrop: { param: "holdDrop" },
    idleHands: { kind: "down" },
  },
  holds: [],
  // The wave is a shape of the set, and the set is told so: a balance leaves it
  // standing in the wave it balanced, which is what the circulate that follows
  // it in Whoosh starts from.
  ends: { target: { shape: "wave" } },
  timing: { stretch: "pace", profile: "smooth" },
};
