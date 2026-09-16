import type { FigureDefinition } from "../FigureDefinition.js";
import type { PathStep } from "../kinds/waypoints.js";

/**
 * **Custom**: a call the library has no figure for, danced as a stand.
 *
 * The corpus is 12,000 dances and the library is sixty-odd figures, so almost
 * every record names something nothing here knows how to draw. `custom` is the
 * figure that says so **in the record** rather than in a comment: a call writes
 * `{ "figure": "custom", "beats": 8, "params": { "text": "Ladies chain" } }`
 * and the dance loads, plans, holds its phrase arithmetic and prints the
 * caller's own words on the card and in the walkthrough — the dancers simply do
 * not move while it runs.
 *
 * It is what `corpus/importCallersBox.ts` turns every line of a Caller's Box
 * transcript into, and what the index's `custom-only` status counts
 * (`docs/corpus-derived.md`): a dance whose every call is one of these is a
 * dance that has been *imported* and not yet *encoded*.
 *
 * ## Why it is a figure and not a hole in the record
 *
 * Every other answer costs more. A call naming a figure that does not exist
 * fails `checkCall` at load; a call left out loses the beats and breaks the
 * phrase; `walk-to-station` is the engine's own placeholder, has no `text`
 * parameter and belongs to resolution rather than to any dance. A first-class
 * figure resolves, draws, has its own Moves tile and is checked for its
 * parameters exactly like any other — which is what lets 12,000 records through
 * the same door the twenty-one encoded ones come in by.
 *
 * ## What it does
 *
 * Nothing, honestly. `actors: "each"` mints one instance per dancer the call
 * selected (`who` left out is everybody), so there is no pairing and nobody can
 * be left out of it; the route is one waypoint at the last beat, where the
 * dancer already stands and facing the way they already face; `holds: []` means
 * hands down for the whole of it. Its ends are the waypoint's own pose, which
 * is structural rather than a ramp, so **a zero-beat `custom` is legal** and
 * means "this line of the transcript takes no music" (`docs/dance-record.md`
 * §"Zero-beat calls").
 *
 * ## Its words are the transcript's
 *
 * `params.text` is the line as the Caller's Box printed it, and
 * `data/figures/custom.json` is four `{text}` slots — so the card's call is the
 * line upper-cased, the walkthrough teaches the line, and a record that writes
 * its own `call` still wins over all of them, as it does for every figure.
 */

/** Stand where you are, facing the way you face, until the call is over. */
const step: PathStep = {
  at: { fromEnd: 0 },
  pose: {
    p: { point: "start", role: { role: "self" } },
    facing: { angle: "facingOf", role: { role: "self" }, at: "start" },
  },
};

/** Custom, as a figure definition. */
export const customDefinition: FigureDefinition = {
  id: "custom",
  call: "CUSTOM",
  describe:
    "A call this library has no figure for yet. The dancers stand where they are for as long as it lasts, and the caller's own words are printed instead — the line is quoted from the dance's own source, count and all.",
  lead: 2,
  nominalBeats: 8,
  roles: ["one"],
  actors: "each",
  anchor: "centroid",
  params: {
    kind: "canonical",
    defaults: {
      /** The caller's own line, which is all four of this figure's texts. */
      text: "",
    },
  },
  shape: { kind: "waypoints", tracks: { "*": [step] } },
  holds: [],
  ends: "relative",
  // Nobody travels, so extra beats buy nothing at all; `pace` is the honest one.
  timing: { stretch: "pace", profile: "smooth" },
};
