import type { FigureDefinition } from "../FigureDefinition.js";
import { CLOSE_BEATS, OPEN_BEATS, TAKE_TO } from "./balance.js";
import { MINOR_SET_ROLES } from "./carriers.js";
import { SQUARE_THROUGH_DEFAULTS, squareThroughPass } from "./square-through.js";

/**
 * **Interrupted square through** (M9): a square through with a balance put in
 * front of its first hand.
 *
 * A **named composite** — Isaac Banner writes their own figures as a name and
 * an indented expansion, and both Banner dances write this one the same way:
 *
 * ```text
 * (8) Interrupted square through 2 [with N3]:
 *       (4) N3 neighbor balance (RH)
 *       (4) Square through 2 (N3R;PL)
 * ```
 *
 * So it is one call of eight beats with three parts, not two calls: you take the
 * right hand you are about to pull by with, **balance on it**, and then pull by
 * — which is what "interrupted" means. The hand the balance takes is the hand
 * the first pull-by gives, and `kinds/sequence.ts` carries a hold across a part
 * boundary rather than dropping and retaking it, so the hand really is one floor
 * point from the balance through the pull-by.
 *
 * ## Whom each of the three parts is with, and why it is three parameters
 *
 * The two transcripts disagree about every one of them, which is the whole
 * reason they are parameters:
 *
 * - The Set Monster balances with `N3`, pulls by right with `N3` and pulls by
 *   left with a **partner**.
 * - Jeremy Corners balances with a neighbour and pulls by `(NR;SRNL)` — see the
 *   dance's own `notes` for the reading taken of that second token, which I could
 *   not settle.
 *
 * Each is written the way `kinds/pairing.ts` reads a pairing: `"partners"`,
 * `"neighbors"`, or the station pairs written out.
 *
 * ## It is done in a diamond, and that is the author's own note
 *
 * Jeremy Corners says so outright — *"Square through is done in a diamond
 * formation"* — which is why nothing here names a lane or a line: every pull-by
 * walks to **where its own mate is standing**, so the figure is the same figure
 * whatever shape the four are in when it starts. The diamond is what
 * `diamond`'s cast leaves behind and this reads off the floor.
 */

/** Interrupted square through, as a figure definition. */
export const interruptedSquareThroughDefinition: FigureDefinition = {
  id: "interrupted-square-through",
  call: "INTERRUPTED SQUARE THROUGH",
  describe:
    "Take right hands with the dancer you are facing and balance: step in toward them and back out. Then pull by on that same hand, give your left to the dancer you are facing now, and pull by again. Eight beats: four of balance and two hands of two beats each.",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      ...SQUARE_THROUGH_DEFAULTS,
      /** Whom the balance is with; the first pull-by's people by default. */
      balanceWith: "neighbors",
      /** How far the rock goes, as a share of the balance's own. */
      rock: 1.0,
      /** How much higher the role set's top role's hand sits, px. */
      stackPx: 1,
    },
  },
  shape: {
    kind: "sequence",
    parts: [
      {
        // Half the figure: four beats of the eight, and half of whatever else a
        // card gives it.
        beats: { share: 0.5 },
        casts: { param: "balanceWith" },
        shape: {
          kind: "rock",
          close: "pair",
          rock: { param: "rock" },
          closeBeats: CLOSE_BEATS,
          openBeats: OPEN_BEATS,
          openOut: false,
        },
        holds: [
          {
            // **One hand, and it is the hand the pull-by is about to give.**
            kind: "mate",
            side: { param: "firstHand" },
            point: { kind: "joinPoint" },
            drop: { param: "holdDrop" },
            stackPx: { param: "stackPx" },
            window: { kind: "holdWindow", take: TAKE_TO, release: 0 },
          },
        ],
      },
      // A quarter of the figure each: four beats of balance and two of each
      // hand, at the eight beats both transcripts call it in.
      squareThroughPass("firstPass", "firstHand", 0.25),
      squareThroughPass("secondPass", "secondHand", 0.25),
    ],
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  symmetry: {
    mirror: {
      kind: "handed",
      why: "the balance is on the hand the first pull-by gives and a square through alternates right and then left; the mirror image is a figure nobody calls",
    },
  },
};
