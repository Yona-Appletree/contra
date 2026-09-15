import { defineTune } from "./Tune.js";

/**
 * Provenance: typed from the agent's own memory of the traditional tune,
 * not copied from any transcription site. High confidence — this is one of
 * the most standard American fiddle reels, played constantly at contra
 * dances; the melody is essentially canonical. The chart is the one the
 * music-sound spike's `tunes.js` carried (2026-09-15), the standard D–A7
 * with the G on the B part's second bar; high confidence.
 *
 * Written out in full (AABB, 32 bars) rather than with `|: :|` repeat
 * signs, so the ABC's bar count is exactly 32 and the synth renders one
 * full 64-beat cycle without depending on how abcjs expands repeats. Split
 * across four source lines (8 bars each = one phrase), which is what lets
 * `Notation` map beat -> `.abcjs-l{0-3}.abcjs-m{0-7}` deterministically
 * (see `packages/music/README.md`).
 */
export const soldiersJoy = defineTune({
  slug: "soldiers-joy",
  title: "Soldier's Joy",
  type: "reel",
  key: "D",
  defaultBpm: 112,
  lines: [
    "d2dc d2fa|d2fa d2fa|e2ec e2ga|e2ga e2ga|d2dc d2fa|d2fa d2fa|e2ga fedc|d4 d4|",
    "d2dc d2fa|d2fa d2fa|e2ec e2ga|e2ga e2ga|d2dc d2fa|d2fa d2fa|e2ga fedc|d4 d4|",
    "a2fa a2fa|b2gb b2gb|a2fa a2fa|e2ge e2fg|a2fa a2fa|b2gb b2gb|e2ga fedc|d2f2 d4|",
    "a2fa a2fa|b2gb b2gb|a2fa a2fa|e2ge e2fg|a2fa a2fa|b2gb b2gb|e2ga fedc|d2f2 d4|",
  ],
  chords: [
    ["D", "D", "A7", "A7", "D", "D", "A7", "D"],
    ["D", "D", "A7", "A7", "D", "D", "A7", "D"],
    ["D", "G", "D", "A7", "D", "G", "A7", "D"],
    ["D", "G", "D", "A7", "D", "G", "A7", "D"],
  ],
});
