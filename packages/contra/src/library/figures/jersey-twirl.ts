import type { AngleExpr, FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Jersey twirl** (M9): the same trade of places a California twirl is, danced
 * with the dancer beside you and turning the *other* one under the arch.
 *
 * The Set Monster's B1 ends with it — *"(4) In long lines, go forward (facing
 * out) / (4) N4 neighbor Jersey twirl"* — which is the figure's own job in every
 * dance that calls one: a line that has walked forward is facing out of the
 * set, and the twirl trades the pair and brings them back facing in.
 *
 * ## It has no predecessor, so here is the floor description it is written from
 *
 * Two dancers stand side by side facing the same way. They join their inside
 * hands and raise them; one walks forward and round the outside while the other
 * turns under the arch; they end having traded places and facing back the way
 * they came. Four beats, hands joined the whole way, nobody letting go.
 *
 * **(unsure), and there are three marks, not one:**
 *
 * - **Which of the two turns under.** A California twirl turns the dancer on
 *   the **right** under and walks the other round; this turns the dancer on the
 *   **left** under, which is the only difference any caller I can find states
 *   between the two figures, and it is why this is `direction: -1` where
 *   `california-twirl` is `direction: 1`. The two places the pair ends on are
 *   the same either way round — it is half a turn about the point between them —
 *   so a hall that has it the other way round dances the same four beats with
 *   the mirror-image arc.
 * - **Whom you dance it with.** The transcript names a **neighbour** (The Set
 *   Monster's is `N4`), and `pairs` still defaults to `partners`, because the
 *   default has to be a pairing the figure can actually be danced by: a twirl
 *   joins **inside hands**, which only two dancers standing side by side have,
 *   and in both contra formations the pairing that stands side by side is the
 *   one `california-twirl` also uses. Written with `neighbors` in duple
 *   improper the figure refuses itself by name — *"1L and 2R are not standing
 *   side by side, so they have no inside hands"* — which is the library saying
 *   the same thing. A call that means somebody else writes the relation, and
 *   what it gets is whatever that relation names where the dancers are.
 * - **Which hands.** Written as the inside hands, the way the California twirl
 *   is, because the pair is side by side and that is the only hand that reaches.
 *
 * Marked here in the doc comment and not in the texts: `figureText.test.ts`'s
 * voice rule bans the brackets and the word from a walkthrough, and M5 and M7
 * put their own `(unsure)` marks in exactly this place.
 */

/** Half a turn, the way `direction` says. */
const HALF: AngleExpr = { number: "mul", of: [180, { param: "direction" }] };

/** Jersey twirl, as a figure definition. */
export const jerseyTwirlDefinition: FigureDefinition = {
  id: "jersey-twirl",
  call: "JERSEY TWIRL",
  describe:
    "Take inside hands with the dancer beside you and raise them. One of you walks forward and round the outside while the other turns under the arch, so the two of you trade places and end facing back the way you came. Four beats, hands joined the whole way through. (unsure: this turns the dancer on the left under, which is the one thing that tells a Jersey twirl from a California twirl.)",
  lead: 4,
  nominalBeats: 4,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: { pairs: "partners", holdDrop: 0, direction: -1 } },
  shape: {
    kind: "path",
    pairing: { kind: "param", param: "pairs" },
    track: {
      // Their place, facing back the way you came.
      ends: {
        p: { point: "start", role: { role: "mate" } },
        facing: {
          angle: "sum",
          of: [{ angle: "facingOf", role: { role: "self" }, at: "start" }, HALF],
        },
      },
      curve: { kind: "arc", sweep: HALF },
      facing: { kind: "withArc" },
      idleHands: { kind: "down" },
    },
    idle: { idleHands: { kind: "down" }, amp: 0 },
  },
  holds: [
    {
      // The arch: both inside hands on one floor point over the pair's centre.
      kind: "mate",
      side: { nearest: { role: "mate" }, facing: "start" },
      point: { kind: "joinPoint" },
      drop: { param: "holdDrop" },
      window: { kind: "holdWindow", take: 1, release: 1 },
    },
  ],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  // The two places a twirl ends on are the same either way round; the arc
  // between them is the mirror image, which is `direction`.
  symmetry: { mirror: { kind: "parameters", signs: ["direction"] } },
};
