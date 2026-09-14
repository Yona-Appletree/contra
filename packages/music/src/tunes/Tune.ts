import type { Meter } from "@caller/core";

/**
 * A single tune, as ABC notation plus the metadata the player and the UI
 * need. `beatsPerCycle` is always 64 (one AABB pass: four 16-beat phrases,
 * A1/A2/B1/B2) for every tune this package bundles.
 */
export interface Tune {
  slug: string;
  title: string;
  type: "reel" | "jig";
  abc: string;
  meter: Meter;
  beatsPerCycle: 64;
  defaultBpm: number;
  source: "traditional, transcribed by hand";
}

/** An ordered list of tunes to play, each repeated `timesThroughEach` times. */
export interface Medley {
  slug: string;
  tunes: Tune[];
  timesThroughEach: number;
}
