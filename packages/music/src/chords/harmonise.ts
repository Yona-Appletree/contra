import {
  barsOf,
  chordPair,
  halvesOf,
  type BarChords,
  type Chord,
  type ChordChart,
  type Tune,
} from "../tunes/Tune.js";

/**
 * A draft chord chart for a tune, one or two chords a bar, from its melody
 * alone: the music-sound spike's section 0 harmoniser, moved in.
 *
 * Each half-bar's notes are scored against the key's five stock chords (a
 * chord tone +1, the dominant's seventh +0.5, anything else −0.6, weighted by
 * duration with the half's first note counting double), and a Viterbi pass
 * over the sixteen halves of each line picks the path with the best total
 * score minus a cost for every change — a change mid-bar costs more than one
 * at the bar line — with the tonic forced on each phrase's last half. Minor
 * chords carry a negative prior: a contra band plays C where the notes would
 * also fit Am.
 *
 * This is a **draft generator** for a tune that arrives without a chart, and
 * the scorer behind {@link plausibility}. It is not the chart: the hand chart
 * on every bundled tune is the data.
 */
export function harmonise(tune: Pick<Tune, "key" | "lines">): ChordChart {
  const cands = candidates(tune.key);
  return tune.lines.map((line) => {
    const halves = barsOf(line).flatMap((bar) => halvesOf(bar));
    const n = halves.length;
    const score = halves.map((half) => {
      const notes = notesOf(half, tune.key);
      return cands.map((c) => c.prior + scoreNotes(c, notes));
    });
    // The phrase ends on the tonic.
    const last = score[n - 1];
    if (last) last[0] = (last[0] ?? 0) + TONIC_AT_PHRASE_END;

    const best: number[][] = [];
    const back: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row = score[i] ?? [];
      best[i] = [];
      back[i] = [];
      for (let c = 0; c < cands.length; c++) {
        if (i === 0) {
          best[i]![c] = row[c] ?? 0;
          back[i]![c] = -1;
          continue;
        }
        const changeCost = i % 2 === 1 ? CHANGE_MID_BAR : CHANGE_AT_BAR_LINE;
        let bestValue = -Infinity;
        let bestPrev = 0;
        for (let p = 0; p < cands.length; p++) {
          const v = (best[i - 1]![p] ?? 0) - (p === c ? 0 : changeCost);
          if (v > bestValue) {
            bestValue = v;
            bestPrev = p;
          }
        }
        best[i]![c] = bestValue + (row[c] ?? 0);
        back[i]![c] = bestPrev;
      }
    }

    const path: Chord[] = [];
    const lastRow = best[n - 1] ?? [];
    let c = lastRow.indexOf(Math.max(...lastRow));
    for (let i = n - 1; i >= 0; i--) {
      path[i] = cands[c]?.name ?? "";
      c = back[i]?.[c] ?? 0;
    }
    const bars: BarChords[] = [];
    for (let i = 0; i < n; i += 2) {
      const a = path[i] ?? "";
      const b = path[i + 1] ?? a;
      bars.push(a === b ? a : [a, b]);
    }
    return bars;
  });
}

/** How much a chord change costs the path, mid-bar and at the bar line. */
const CHANGE_MID_BAR = 0.8 * 1.6;
const CHANGE_AT_BAR_LINE = 0.8 * 0.7;
/** The bonus for ending a phrase on the tonic. */
const TONIC_AT_PHRASE_END = 3;

/**
 * How far a hand chord may fall below the best stock chord for the span it
 * covers before it reads as a typo rather than a taste call.
 *
 * Measured over the thirteen bundled charts (see `harmonise.test.ts`): the
 * widest gap a hand chart opens is 3.2 — the standard `G A7` cadence over
 * Haste to the Wedding's `efg fdc`, where the scorer, which knows only chord
 * tones, would rather hear `Em D`. A chord that shares no tone with the
 * notes under it opens a gap of 8 and more (an `A7` over Soldier's Joy's
 * first bar, a `D` under a jig's held `G3`), which is what this catches. A
 * wrong chord that shares one tone with the notes (a `G` over `d2fa`) opens
 * about the same gap as that cadence, and slips under: the test is for the
 * gross typo, not the subtle one — the ear is for those.
 */
export const PLAUSIBILITY_MARGIN = 4;

/** One chord span of a hand chart, scored against the best stock chord for the same notes. */
export interface ChordReport {
  line: number;
  bar: number;
  /** Which half, when the bar has a pair; absent for a whole-bar chord. */
  half?: 0 | 1;
  hand: Chord;
  best: Chord;
  /** `best − hand`; zero when the hand chord is the best, never negative. */
  gap: number;
}

/**
 * Score every chord of a hand chart against the best stock chord over the
 * same span — the whole bar for a single chord, each half for a pair — with
 * no priors, so a taste call between two chords the notes fit equally (Am
 * for C) opens no gap. A chord is plausible when its gap is at most
 * {@link PLAUSIBILITY_MARGIN}. Never an equality test with {@link harmonise}:
 * the draft generator's transition costs and priors are its own taste, and
 * the hand chart is allowed a different one.
 */
export function plausibility(tune: Pick<Tune, "key" | "lines" | "chords">): ChordReport[] {
  const cands = candidates(tune.key);
  const reports: ChordReport[] = [];
  tune.lines.forEach((line, li) => {
    barsOf(line).forEach((bar, bi) => {
      const chart = tune.chords[li]?.[bi];
      if (chart === undefined) return;
      const halves = halvesOf(bar).map((half) => notesOf(half, tune.key));
      const spans: Array<{ half?: 0 | 1; hand: Chord; notes: WeightedNote[] }> =
        typeof chart === "string"
          ? [{ hand: chart, notes: halves.flat() }]
          : chordPair(chart).map((hand, h) => ({ half: h as 0 | 1, hand, notes: halves[h] ?? [] }));
      for (const span of spans) {
        const handScore = scoreNotes(candidateOf(span.hand), span.notes);
        let best: Chord = span.hand;
        let bestScore = handScore;
        for (const c of cands) {
          const s = scoreNotes(c, span.notes);
          if (s > bestScore) {
            bestScore = s;
            best = c.name;
          }
        }
        reports.push({
          line: li,
          bar: bi,
          ...(span.half === undefined ? {} : { half: span.half }),
          hand: span.hand,
          best,
          gap: bestScore - handScore,
        });
      }
    });
  });
  return reports;
}

/** A stock chord of a key: its name, its tones, its seventh (dominants only), and a prior. */
export interface Candidate {
  name: Chord;
  tones: readonly number[];
  seventh?: number;
  prior: number;
}

/** The scale degrees (0-based) and qualities of a mode's five stock chords, tonic first. */
const STOCK: Readonly<
  Record<Mode, ReadonlyArray<{ degree: number; quality: Quality; prior: number }>>
> = {
  major: [
    { degree: 0, quality: "major", prior: 0.3 },
    { degree: 3, quality: "major", prior: 0.1 },
    { degree: 4, quality: "dominant", prior: 0.1 },
    { degree: 5, quality: "minor", prior: -1.2 },
    { degree: 1, quality: "minor", prior: -1.2 },
  ],
  mixolydian: [
    { degree: 0, quality: "major", prior: 0.3 },
    { degree: 6, quality: "major", prior: 0.1 },
    { degree: 3, quality: "major", prior: 0.1 },
    { degree: 4, quality: "minor", prior: -1.2 },
    { degree: 1, quality: "minor", prior: -1.2 },
  ],
  minor: [
    { degree: 0, quality: "minor", prior: 0.3 },
    { degree: 6, quality: "major", prior: 0.1 },
    { degree: 2, quality: "major", prior: 0.1 },
    { degree: 3, quality: "minor", prior: -1.2 },
    { degree: 4, quality: "minor", prior: -1.2 },
  ],
  dorian: [
    { degree: 0, quality: "minor", prior: 0.3 },
    { degree: 3, quality: "major", prior: 0.1 },
    { degree: 6, quality: "major", prior: 0.1 },
    { degree: 2, quality: "major", prior: 0.1 },
    { degree: 4, quality: "minor", prior: -1.2 },
  ],
};

type Quality = "major" | "minor" | "dominant";

/** The five stock chords of a key, tonic first, named with the key's own accidentals. */
export function candidates(key: string): Candidate[] {
  const k = parseKey(key);
  return STOCK[k.mode].map(({ degree, quality, prior }) => {
    const letter = LETTERS[(k.letterIndex + degree) % 7] ?? "C";
    const root = k.scale[degree] ?? k.tonic;
    const name = `${letter}${accidentalName(root - (NATURAL[letter] ?? 0))}${quality === "minor" ? "m" : quality === "dominant" ? "7" : ""}`;
    const c = chordOf(root, quality);
    return {
      name,
      tones: c.tones,
      ...(c.seventh === undefined ? {} : { seventh: c.seventh }),
      prior,
    };
  });
}

/** A chord symbol as a scored candidate: `D`, `A7`, `Em`, `F#m`, `Bb`. */
export function candidateOf(chord: Chord): Candidate {
  const found = /^([A-G])([#b]?)(m?)(7?)$/.exec(chord);
  if (found === null) throw new Error(`@caller/music: unreadable chord symbol "${chord}"`);
  const [, letter = "C", accidental = "", minor = "", seventh = ""] = found;
  const root = ((NATURAL[letter] ?? 0) + accidentalOffset(accidental) + 12) % 12;
  const c = chordOf(root, minor ? "minor" : seventh ? "dominant" : "major");
  return {
    name: chord,
    tones: c.tones,
    ...(c.seventh === undefined ? {} : { seventh: c.seventh }),
    prior: 0,
  };
}

/** Whether every tone of a chord symbol (its seventh included) lies in the key's scale. */
export function inKey(chord: Chord, key: string): boolean {
  const { scale } = parseKey(key);
  const c = candidateOf(chord);
  const tones = c.seventh === undefined ? c.tones : [...c.tones, c.seventh];
  return tones.every((t) => scale.includes(t));
}

function chordOf(root: number, quality: Quality): { tones: number[]; seventh?: number } {
  const third = quality === "minor" ? 3 : 4;
  const tones = [root, root + third, root + 7].map((x) => x % 12);
  return quality === "dominant" ? { tones, seventh: (root + 10) % 12 } : { tones };
}

/** A note of a half-bar: its pitch class and its weight (duration, doubled on the half's first note). */
export interface WeightedNote {
  pc: number;
  w: number;
}

/**
 * The notes of one half-bar as pitch classes with duration weights, the
 * first note counting double. Unmarked notes take the key signature's
 * accidentals; `^`, `_` and `=` override it. Rests are skipped. Anything
 * else in the half-bar — a stray chord symbol, a repeat sign, a typo — is an
 * error, because the melodies are the data everything here is scored on.
 */
export function notesOf(half: string, key: string): WeightedNote[] {
  const { signature } = parseKey(key);
  const out: WeightedNote[] = [];
  let first = true;
  for (const token of tokensOf(half)) {
    if (token.kind === "rest") continue;
    const natural = NATURAL[token.letter] ?? 0;
    const offset =
      token.accidental === "" ? (signature[token.letter] ?? 0) : accidentalOffset(token.accidental);
    out.push({ pc: (natural + offset + 12) % 12, w: first ? token.duration * 2 : token.duration });
    first = false;
  }
  return out;
}

/** One note or rest of a half-bar, with its duration in `L:` units. */
export interface Token {
  kind: "note" | "rest";
  /** Upper-case letter for a note, `z` for a rest. */
  letter: string;
  accidental: string;
  duration: number;
}

const TOKEN = /([_^=]?)([A-Ga-gz])([,']*)(\d*)(\/\d*)?/y;

/** The notes and rests of a half-bar, in order; throws on anything else. */
export function tokensOf(half: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  while (at < half.length) {
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(half);
    if (m === null || m.index !== at) {
      throw new Error(`@caller/music: unreadable ABC in half-bar "${half}" at "${half.slice(at)}"`);
    }
    const [, accidental = "", letter = "", , digits = "", slash = ""] = m;
    let duration = digits === "" ? 1 : parseInt(digits, 10);
    if (slash !== "") duration /= slash.length > 1 ? parseInt(slash.slice(1), 10) : 2;
    out.push({
      kind: letter === "z" ? "rest" : "note",
      letter: letter.toUpperCase(),
      accidental,
      duration,
    });
    at = TOKEN.lastIndex;
  }
  return out;
}

function scoreNotes(c: Candidate, notes: readonly WeightedNote[]): number {
  let s = 0;
  for (const n of notes) {
    s += n.w * (c.tones.includes(n.pc) ? 1 : c.seventh === n.pc ? 0.5 : -0.6);
  }
  return s;
}

export type Mode = "major" | "minor" | "mixolydian" | "dorian";

/** A parsed ABC key: tonic pitch class, mode, scale, and the signature's accidental for each letter. */
export interface ParsedKey {
  tonic: number;
  letterIndex: number;
  mode: Mode;
  /** Seven pitch classes, tonic first. */
  scale: number[];
  /** Semitone offset the key signature gives each natural letter: `{ F: 1, C: 1 }` for D. */
  signature: Readonly<Record<string, number>>;
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const INTERVALS: Readonly<Record<Mode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

/** The ABC key field, read: `D`, `G`, `Em`, `AMix`, `Ador`, `F#m`, `Bb`. */
export function parseKey(key: string): ParsedKey {
  const found = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(key);
  if (found === null) throw new Error(`@caller/music: unreadable key "${key}"`);
  const [, letter = "C", accidental = "", modeWord = ""] = found;
  const mode = modeOf(modeWord);
  const tonic = ((NATURAL[letter] ?? 0) + accidentalOffset(accidental) + 12) % 12;
  const scale = (INTERVALS[mode] ?? INTERVALS.major).map((i) => (tonic + i) % 12);
  const letterIndex = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  // Each scale degree has its own letter, tonic letter first; the signature
  // is whatever accidental each letter needs to land on its degree's pitch.
  const signature: Record<string, number> = {};
  scale.forEach((pitch, degree) => {
    const l = LETTERS[(letterIndex + degree) % 7] ?? "C";
    const offset = (((pitch - (NATURAL[l] ?? 0)) % 12) + 12) % 12;
    if (offset === 1) signature[l] = 1;
    else if (offset === 11) signature[l] = -1;
  });
  return { tonic, letterIndex, mode, scale, signature };
}

function modeOf(word: string): Mode {
  const w = word.toLowerCase().slice(0, 3);
  if (w === "" || w === "maj" || w === "ion") return "major";
  if (w === "m" || w === "mi" || w === "min" || w === "aeo") return "minor";
  if (w === "mix") return "mixolydian";
  if (w === "dor") return "dorian";
  throw new Error(`@caller/music: unsupported mode "${word}"`);
}

function accidentalOffset(accidental: string): number {
  return accidental === "#" || accidental === "^"
    ? 1
    : accidental === "b" || accidental === "_"
      ? -1
      : 0;
}

function accidentalName(offset: number): string {
  const o = ((offset % 12) + 12) % 12;
  return o === 1 ? "#" : o === 11 ? "b" : "";
}
