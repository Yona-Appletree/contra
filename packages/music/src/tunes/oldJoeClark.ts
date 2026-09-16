import { BANJO_BAND, defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate-to-high confidence — the
 * A mixolydian setting with the G naturals in the B part is the standard
 * old-time one; the A part as typed is a plain version of it. The chart
 * (2026-09-15) is the two-chord mixolydian A–G a band plays it with, the G
 * landing where the melody's G naturals do; moderate confidence.
 *
 * Band: BANJO_BAND. The banjo tune, so the banjo takes it — and takes the
 * potatoes with it, which are plucked here rather than bowed.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const oldJoeClark = defineTune({
  slug: "old-joe-clark",
  title: "Old Joe Clark",
  type: "reel",
  key: "AMix",
  defaultBpm: 112,
  arrangement: BANJO_BAND,
  lines: [
    "A2AA cAA2|BcdB A2A2|A2AA cAA2|BcdB cAA2|e2ed cAA2|dcAG A2A2|e2ed cAA2|dcAG A2A2|",
    "A2AA cAA2|BcdB A2A2|A2AA cAA2|BcdB cAA2|e2ed cAA2|dcAG A2A2|e2ed cAA2|dcAG A2A2|",
    "a2ag ecAc|BcdB A2A2|a2ag ecAc|BcdB cAA2|c2cB A2A2|BAGE A2A2|c2cB A2A2|A4 A4|",
    "a2ag ecAc|BcdB A2A2|a2ag ecAc|BcdB cAA2|c2cB A2A2|BAGE A2A2|c2cB A2A2|A4 A4|",
  ],
  chords: [
    ["A", "A", "A", "A", "A", ["G", "A"], "A", ["G", "A"]],
    ["A", "A", "A", "A", "A", ["G", "A"], "A", ["G", "A"]],
    ["A", "A", "A", "A", "A", ["G", "A"], "A", "A"],
    ["A", "A", "A", "A", "A", ["G", "A"], "A", "A"],
  ],
});
