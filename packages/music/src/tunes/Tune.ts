import { JIG, REEL, type Meter } from "@caller/core";

/**
 * A single tune: the melody as four lines of bare ABC (one per 16-beat
 * phrase, A1/A2/B1/B2, eight bars each), a hand chord chart over it, and the
 * arrangement the band plays it with. `abc` is **written** from those by
 * {@link writeAbc} — `%%MIDI` programs, chord symbols and all — so the player
 * and the notation keep reading one ABC string while the chart and the
 * arrangement stay data that tests and the harmoniser can read without
 * parsing anything back out. `beatsPerCycle` is always 64 (one AABB pass) for
 * every tune this package bundles.
 */
export interface Tune extends TuneSource {
  arrangement: Arrangement;
  /** The whole tune as ABC: headers, `%%MIDI` directives, chord symbols, four body lines. */
  abc: string;
  meter: Meter;
  beatsPerCycle: 64;
  source: "traditional, transcribed by hand";
}

/** What a tune file writes; {@link defineTune} fills in the rest. */
export interface TuneSource {
  slug: string;
  title: string;
  type: "reel" | "jig";
  /** The ABC key field: a tonic letter, an optional accidental, an optional mode (`D`, `G`, `Em`, `AMix`). */
  key: string;
  defaultBpm: number;
  /**
   * The melody, one phrase a line, eight `|`-terminated bars a line, written
   * out in full (AABB) with no repeat signs. Every bar has a space at the
   * half-bar — four eighths in for a reel, three for a jig — which is where a
   * bar's second chord goes.
   */
  lines: readonly [string, string, string, string];
  /** The hand chord chart: one entry per bar, in the same 4 × 8 layout as `lines`. */
  chords: ChordChart;
  /** The band. Default {@link BAND}: fiddle, piano, acoustic bass. */
  arrangement?: Arrangement;
}

/** A chord symbol as abcjs prints and plays it: `D`, `A7`, `G`, `Em`, `Bm`. */
export type Chord = string;
/** One chord for the bar, or one per half-bar. */
export type BarChords = Chord | readonly [Chord, Chord];
/** Four lines of eight bars, matching `Tune.lines`. */
export type ChordChart = readonly (readonly BarChords[])[];

/** One instrument of the band: a General MIDI program and a MIDI velocity. */
export interface Voice {
  program: number;
  volume: number;
}

/**
 * The band, as abcjs plays it: the melody voice, the chord ("chick") voice and
 * the bass ("boom") voice of the accompaniment abcjs writes from the chord
 * symbols.
 */
export interface Arrangement {
  melody: Voice;
  chords: Voice;
  bass: Voice;
}

/**
 * The default band, matching the stage the hall draws: a fiddle on the tune,
 * a piano on the chords, an acoustic bass on the beat. The volumes are abcjs'
 * own defaults (105 is its downbeat velocity for the melody; 48 and 64 are
 * its chick and boom), written into the ABC so the arrangement has one home.
 */
export const BAND: Arrangement = {
  melody: { program: 40, volume: 105 },
  chords: { program: 0, volume: 48 },
  bass: { program: 32, volume: 64 },
};

/**
 * The old-time backup: the same fiddle over a steel-string guitar (25) instead
 * of a piano. A guitar chops where a piano booms, which is what the American
 * reels in this bundle are usually backed by.
 */
export const STRING_BAND: Arrangement = {
  melody: { program: 40, volume: 105 },
  chords: { program: 25, volume: 48 },
  bass: { program: 32, volume: 64 },
};

/**
 * A banjo (105) on the tune, guitar behind it. The minstrel-era and old-time
 * reels; the banjo is also what makes their potatoes *plucked* rather than
 * bowed, with nothing said about potatoes anywhere but here.
 */
export const BANJO_BAND: Arrangement = {
  melody: { program: 105, volume: 105 },
  chords: { program: 25, volume: 48 },
  bass: { program: 32, volume: 64 },
};

/**
 * A piano (0) leading, guitar on the chords: a jig taken by the piano player
 * while the fiddle sits out. Its potatoes are struck, which is the hammer the
 * count-in had before any arrangement existed.
 */
export const PIANO_BAND: Arrangement = {
  melody: { program: 0, volume: 105 },
  chords: { program: 25, volume: 48 },
  bass: { program: 32, volume: 64 },
};

/**
 * Every band a bundled tune may name. The melody is the loudest voice in all
 * of them, deliberately: {@link Arrangement} has no notion of a lead, so the
 * loudest voice is what {@link import("../player/potatoes.js").potatoesFor}
 * reads the count-in's instrument from, and a chord voice that out-shouted the
 * melody would quietly take the potatoes with it. The volumes themselves are
 * abcjs' own defaults (105 downbeat, 48 chick, 64 boom) in every band — the
 * per-instrument balance is a taste call that wants an ear, not a guess.
 */
export const BANDS: readonly Arrangement[] = [BAND, STRING_BAND, BANJO_BAND, PIANO_BAND];

/** An ordered list of tunes to play, each repeated `timesThroughEach` times. */
export interface Medley {
  slug: string;
  tunes: Tune[];
  timesThroughEach: number;
}

/** Build a {@link Tune} from its source: the meter from its type, the ABC from the rest. */
export function defineTune(source: TuneSource): Tune {
  const arrangement = source.arrangement ?? BAND;
  const tune: Tune = {
    ...source,
    arrangement,
    meter: source.type === "reel" ? REEL : JIG,
    beatsPerCycle: 64,
    source: "traditional, transcribed by hand",
    abc: "",
  };
  tune.abc = writeAbc(tune);
  return tune;
}

/**
 * The tune as ABC, the way the music-sound spike wrote it: the headers, the
 * `%%MIDI` programs and volumes of the arrangement, then each line's bars with
 * `"C"` chord symbols before the half-bar they start on. A bar with one chord
 * carries it once, at the start; a bar with a pair carries the second before
 * its second half, unless the two are the same.
 */
export function writeAbc(
  tune: Pick<TuneSource, "title" | "type" | "key" | "lines" | "chords"> & {
    arrangement: Arrangement;
  },
): string {
  const { arrangement: band } = tune;
  const header = [
    "X:1",
    `T:${tune.title}`,
    `R:${tune.type}`,
    `M:${tune.type === "reel" ? "2/2" : "6/8"}`,
    "L:1/8",
    `%%MIDI program ${String(band.melody.program)}`,
    `%%MIDI chordprog ${String(band.chords.program)}`,
    `%%MIDI bassprog ${String(band.bass.program)}`,
    `%%MIDI chordvol ${String(band.chords.volume)}`,
    `%%MIDI bassvol ${String(band.bass.volume)}`,
    `K:${tune.key}`,
  ];
  const body = tune.lines.map((line, li) =>
    barsOf(line)
      .map((bar, bi) => {
        const [first, second] = halvesOf(bar);
        const chart = tune.chords[li]?.[bi];
        if (chart === undefined) return `${first} ${second}`;
        const [c1, c2] = chordPair(chart);
        return `"${c1}"${first} ${c2 === c1 ? "" : `"${c2}"`}${second}`;
      })
      .join("|"),
  );
  return `${header.join("\n")}\n${body.map((line) => `${line}|`).join("\n")}\n`;
}

/** A line's bars: everything between its `|` delimiters. */
export function barsOf(line: string): string[] {
  return line
    .split("|")
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0);
}

/** A bar's two halves — the whitespace-separated parts, which must be exactly two. */
export function halvesOf(bar: string): [string, string] {
  const parts = bar.trim().split(/\s+/);
  const [first, second] = parts;
  if (parts.length !== 2 || first === undefined || second === undefined) {
    throw new Error(`@caller/music: a bar needs exactly two halves, got "${bar}"`);
  }
  return [first, second];
}

/** A bar's chords as a pair, one per half. */
export function chordPair(chords: BarChords): readonly [Chord, Chord] {
  return typeof chords === "string" ? [chords, chords] : chords;
}
