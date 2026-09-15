import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **The hey for four**, as data: a schedule of meetings laid along the lane.
 *
 * The figure is seven meetings — the robins in the middle, everybody at the
 * lanes' edges, the larks in the middle, everybody at the edges, and so on to
 * count 14 — and everything a caller can ask of a hey is a variation on that
 * list. The geometry is `kinds/schedule.ts`'s, and it is `figures/hey.ts`'s own
 * weave (F4's) promoted from a figure to a kind: every dancer walks the *same*
 * closed weave across the set, the four of them a quarter of it apart, and the
 * side-step swings once between the middle of the set and the end of the lane so
 * that a dancer who kept to their own left through the centre is keeping to
 * their own right by the time they reach the side. Right shoulders in the
 * middle, left at the sides: what a caller says a hey is.
 *
 * ## What is a parameter, and why
 *
 * Every variety of hey in the corpus is this figure with different numbers
 * (D4) — half a hey is a prefix of the same pass list, a ricochet is a modifier
 * on one pass, a hey for three stands one dancer out — so there is one `hey` and
 * no `half-hey`, `ricochet-hey` or `hey-for-three`.
 *
 * - **`passes`** — the canonical form: the pass list, `RR NL LR PL RR NL LR`,
 *   or the same thing with the words spelled out. A record that writes one gets
 *   exactly the hey it wrote, including which shoulder each pass is by, whether
 *   anybody ricochets and whether it ends short.
 * - **`start` and `by`** — the shorthand a record writes when its hey is
 *   ordinary: which **contra role** steps off into the middle, and by which
 *   shoulder. A written pass list says both in its first token and wins.
 * - **`amount`** — how much of the weave, `1/8` to `1`, when no pass list says.
 * - **`ricochet`** — `"robins@2"`: those dancers bounce out of the middle on
 *   that pass instead of passing through. Role-scoped, so the other role's list
 *   is untouched.
 * - **`for` and `idle`** — a hey for three: how many dance it, and which
 *   figure-role stands out. The other three weave the same weave with a gap in
 *   it, which is what a dancer standing out of a hey leaves behind.
 * - **`axis`** — which way the lane runs: off the dancers' own spread by
 *   default, or named outright. `"diagonal"` parses and names M8, which is where
 *   a hey whose four dancers span two minor sets can be resolved at all.
 * - **`hands`** — a hey with hands, where every meeting is a pull by rather than
 *   a pass. 48 dances in the corpus write one.
 *
 * ## Where this is a model rather than a transcription
 *
 * The weave's ends reach `√2 ×` the set's own half width, so a dancer loops
 * about 6 px outside the line before coming back — dancers really do loop
 * outside the set, but here it is a consequence of the cosine rather than a
 * choice. And the four places are off the weave (a duple improper set's two
 * lines are 32 px apart and the weave a fifth of that), so everybody steps on to
 * it over `joinBeats` at the start and off it again at the end.
 */
export const heyDefinition: FigureDefinition = {
  id: "hey",
  call: "HEY FOR FOUR",
  describe:
    "The weave. All four dancers travel the same closed figure of eight across the set, passing each other by alternate shoulders and never taking hands: right shoulders with the one you meet in the centre of the set, left shoulders with the one you meet at the side, and a loop round the end before you come back. The robins start it, passing right shoulders in the centre; the larks loop at the ends and follow them in. Sixteen beats, four passes in the centre at counts 2, 6, 10 and 14 and three at the sides at 4, 8 and 12, and everybody is home where they started.",
  lead: 4,
  nominalBeats: 16,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      passes: "",
      start: "robin",
      by: "right",
      amount: 1,
      ricochet: "",
      for: 4,
      idle: "",
      axis: "spread",
      hands: false,
      weavePx: 6.5,
      joinBeats: 2,
      passDrop: 6,
    },
  },
  shape: {
    kind: "schedule",
    passPx: { param: "weavePx" },
    // The weave's quarter points are at `U·cos 45°` along it, so it has to be
    // `√2` as long as the set is wide for them to land on the four places.
    loopReach: Math.SQRT2,
    joinBeats: { param: "joinBeats" },
    passDrop: { param: "passDrop" },
    shorthand: {
      passes: "passes",
      start: "start",
      by: "by",
      amount: "amount",
      ricochet: "ricochet",
      for: "for",
      idle: "idle",
      axis: "axis",
      hands: "hands",
    },
  },
  holds: [],
  // A hey leaves you where its last meeting leaves you — on somebody's place
  // after a whole one or a half one, and beside the dancer you met after one
  // that ends short. Never on the formation's own places by fiat.
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  // **A hey by the left is a hey by the right in a mirror**, and nothing else
  // about it changes: reflecting the set adds a half turn to every dancer's
  // phase on the weave, which flips their place along the lane, and flipping
  // the side-step with it is exactly what `by` does. The role that steps off is
  // the role that steps off either way round, and is a role word rather than
  // geometry, which is what makes the role swap move nobody.
  //
  // **Two parameters the transforms do not reach**, said out loud because a
  // silent gap is worse than a known one: a written `passes` list carries its
  // own shoulders, and `ricochet` carries a role inside a compound word
  // (`robins@2`). A call that writes either and wants its mirror image has to
  // write the mirrored one — `symmetry.ts` rewrites parameter *values*, not
  // notations. Neither is in the defaults, so what the property test asserts is
  // the whole of what is claimed here.
  symmetry: {
    mirror: { kind: "parameters", words: { by: { right: "left", left: "right" } } },
    roles: ["start"],
  },
};
