import { STRING_BAND, defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. Moderate-to-high confidence — the
 * E minor (dorian-leaning) setting with the B part on the high G is the
 * standard session one. The chart (2026-09-15) is Em with the D and G a band
 * plays under the descending runs; moderate confidence.
 *
 * Band: STRING_BAND. A guitar under the jig, which is what gives the
 * Swallowtail set its change of colour when the Washerwoman follows on the
 * house band.
 *
 * Written out in full (AABB, 32 bars) with no repeat signs; four source
 * lines of eight bars, one per phrase (see `packages/music/README.md`).
 */
export const swallowtailJig = defineTune({
  slug: "swallowtail-jig",
  title: "Swallowtail Jig",
  type: "jig",
  key: "Em",
  defaultBpm: 116,
  about:
    "An Irish jig in E minor, one of the first jigs most session players learn, and a staple of the jig set at a contra dance.",
  references: [
    {
      label: "Swallowtail Jig on thesession.org",
      url: "https://thesession.org/tunes/search?q=Swallowtail+Jig",
    },
  ],
  arrangement: STRING_BAND,
  lines: [
    "EFG FED|EFG B3|EFG FED|EFG B3|Bcd efg|fed cBA|Bcd efg|fed E3|",
    "EFG FED|EFG B3|EFG FED|EFG B3|Bcd efg|fed cBA|Bcd efg|fed E3|",
    "g2f gfe|dBG B3|g2f gfe|dBG B3|efg agf|gfe dBA|efg agf|dcB E3|",
    "g2f gfe|dBG B3|g2f gfe|dBG B3|efg agf|gfe dBA|efg agf|dcB E3|",
  ],
  chords: [
    [["Em", "D"], "Em", ["Em", "D"], "Em", "Em", "D", "Em", ["D", "Em"]],
    [["Em", "D"], "Em", ["Em", "D"], "Em", "Em", "D", "Em", ["D", "Em"]],
    ["Em", ["G", "Em"], "Em", ["G", "Em"], ["Em", "D"], ["Em", "D"], ["Em", "D"], ["D", "Em"]],
    ["Em", ["G", "Em"], "Em", ["G", "Em"], ["Em", "D"], ["Em", "D"], ["Em", "D"], ["D", "Em"]],
  ],
});
