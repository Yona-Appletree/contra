/** A couple's spacing in the line: one dancer place, as the formation lays it out. */
const PLACE_PITCH_PX = 20;
import type { FigureIR } from "../ir/Figure.js";

/**
 * A becket's **shift left** (Butter's A1, "(2) Shift left"): the couple, side
 * by side facing across, slides one dancer place along its own line — 20 px,
 * half a couple width; the two lines sliding opposite ways is what brings the
 * next couple across (`data/dances/butter.json`'s notes, FR-C2). Inside hands
 * joined with the partner (a placeholder `couple` hold until the gallery).
 *
 * **This figure is the progression** (`progresses`): the seating moves with
 * it, so a `neighbor = select(neighbor)` written after it finds the new
 * couple. With nobody to shift toward — the first time through, or the end of
 * the line — its beats go to the next call (D8: Butter's *"you just don't
 * slide. you wait. (or circle slower)"*).
 */
export const shift: FigureIR = {
  id: "shift",
  params: [
    { name: "with", kind: "dancer" },
    { name: "direction", kind: "enum", choices: ["left", "right"], default: "left" },
    { name: "beats", kind: "number", default: 2 },
  ],
  beats: { nominal: 2, min: 1 },
  pre: {
    arrangement: [
      { kind: "facing", who: "self", toward: "home" },
      {
        kind: "beside",
        who: "self",
        of: "partner",
        side: "as-couple",
        spacingPx: PLACE_PITCH_PX,
        facing: "same",
      },
    ],
    // Inside hands joined with the partner is the user's ruling; tonight the
    // shift goes hands-free, because a take costs the entry beat a two-beat
    // figure has not got. A G1 note, and bite B's `couple` hold.
    holds: [],
  },
  post: {
    arrangement: [
      { kind: "facing", who: "self", toward: "home" },
      {
        kind: "beside",
        who: "self",
        of: "partner",
        side: "as-couple",
        spacingPx: PLACE_PITCH_PX,
        facing: "same",
      },
    ],
    holds: [],
  },
  windows: [{ kind: "walk", direction: "left", distancePx: 20 }],
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { partner: "elide" },
  progresses: true,
};
