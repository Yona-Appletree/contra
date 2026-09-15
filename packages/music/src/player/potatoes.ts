import type { Tune } from "../tunes/Tune.js";

/**
 * The potatoes: the four strong chords a band plays into the start of a dance.
 *
 * The user, B3:
 *
 * > "when the dance starts, and this actually affects the music but its
 * > important for realism is the 'potatoes.' four chords or strong notes played
 * > by the loudest instrument that denote the beginning of the dance. its
 * > basically '5 6 7 8' before the '1 2 3 4 …' of the dance."
 *
 * Four onsets, one a beat, the fourth one beat before the tune's own bar 1 —
 * so the last thing the hall hears before beat 1 is a chord on beat 8 of a
 * phrase that never happened. Rendered sample by sample into a `Float32Array`
 * exactly as the applause is, which makes it pure, seeded and measurable
 * without an `AudioContext`; {@link playPotatoes} is the three lines that hand
 * the result to the browser.
 *
 * **What plays them.** The brief asks for "the loudest instrument of the
 * current tune's arrangement", chosen "from the tune's data, not hard-coded per
 * tune". There is no arrangement in this package to choose from: a
 * {@link Tune} is one ABC melody line with a key, a meter and a tempo, and
 * `abcjs`' synth renders it as a single voice. So what *is* taken from the
 * tune's own data is its **key** — the root of the chord, parsed out of the
 * ABC's own `K:` field — and its **mode**, which decides whether the chord is
 * major or minor; the voice itself is one loud, bright, plucked-string timbre
 * for every tune. See the B3 report for the ruling this is owed.
 */
export interface PotatoOptions {
  /** How many potatoes, and therefore how many beats the buffer lasts. */
  beats: number;
  /** The tempo they are played at, in dance beats a minute. */
  bpm: number;
  /** The root of the chord, in Hz. */
  rootHz: number;
  /** Whether the chord's third is major or minor. */
  mode: "major" | "minor";
  /** Peak amplitude of the rendered buffer, 0 to 1. */
  peak: number;
  /** Seconds one chord takes to decay by 1/e. */
  decaySeconds: number;
  /** Seed for the tiny amount of noise in the attack. */
  seed: number;
}

export const POTATO_DEFAULTS: PotatoOptions = {
  beats: 4,
  bpm: 112,
  // D below middle C: the root of nine of this package's thirteen tunes, and
  // the key `POTATO_DEFAULTS` is only ever a fallback for.
  rootHz: 146.832,
  mode: "major",
  peak: 0.85,
  decaySeconds: 0.42,
  seed: 20260914,
};

/** The partials of one potato, as multiples of the root and their weights. */
const CHORD_MAJOR: readonly number[] = [1, 3 / 2, 2, 5 / 2, 3];
const CHORD_MINOR: readonly number[] = [1, 3 / 2, 2, 12 / 5, 3];
/** How loud each of those is, before the envelope. */
const CHORD_LEVELS: readonly number[] = [1, 0.7, 0.55, 0.35, 0.3];

/** Seconds the attack transient lasts: the pick, the bow bite, the hammer. */
const ATTACK_SECONDS = 0.008;
/** How much noise rides on the attack, relative to the tone. */
const ATTACK_NOISE = 0.55;
/** How much second-harmonic bite the tone carries, for a chord that cuts. */
const BITE = 0.25;

/**
 * Four potatoes, rendered sample by sample.
 *
 * Each one is a chord struck on the beat: the root, its fifth, the octave, the
 * third above that and the twelfth, under a short noisy attack and a plucked
 * decay. The buffer is exactly `beats` beats long, so scheduling it to end when
 * the tune's first cycle begins puts the fourth potato one beat before bar 1
 * with no gap and no overlap.
 */
export function renderPotatoes(
  sampleRate: number,
  options: Partial<PotatoOptions> = {},
): Float32Array {
  const o: PotatoOptions = { ...POTATO_DEFAULTS, ...options };
  const beatSeconds = 60 / o.bpm;
  const n = Math.max(1, Math.round(sampleRate * o.beats * beatSeconds));
  const out = new Float32Array(n);
  const random = mulberry32(o.seed);
  const chord = o.mode === "major" ? CHORD_MAJOR : CHORD_MINOR;

  for (let k = 0; k < o.beats; k++) {
    addPotato(out, sampleRate, k * beatSeconds, o, chord, random);
  }
  return normalise(out, o.peak);
}

/** Play one set of potatoes on `ctx`, starting at `when` (default: now). */
export function playPotatoes(
  ctx: AudioContext,
  when?: number,
  options: Partial<PotatoOptions> = {},
): AudioBufferSourceNode {
  const samples = renderPotatoes(ctx.sampleRate, options);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  // `set` rather than `copyToChannel`, for the same DOM-typing reason
  // `applause.ts` gives.
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(when ?? ctx.currentTime);
  return source;
}

/**
 * The potatoes for one tune, at one tempo: the chord in **its** key.
 *
 * Read off the tune's own ABC rather than out of a table keyed by slug, so a
 * tune added tomorrow gets potatoes in its own key with nothing else written.
 */
export const potatoesFor = (tune: Tune, bpm: number): Partial<PotatoOptions> => {
  const key = keyOf(tune);
  return { bpm, rootHz: key.rootHz, mode: key.mode };
};

/**
 * A tune's key, from the `K:` field of its ABC.
 *
 * ABC keys in this package look like `K:D`, `K:G`, `K:Em`, `K:AMix` — a tonic
 * letter, an optional accidental, and an optional mode. Anything this does not
 * recognise falls back to D major, which is what nine of the thirteen tunes
 * are; a tune with no `K:` at all is a tune `abcjs` would not render either.
 */
export function keyOf(tune: Tune): { rootHz: number; mode: "major" | "minor"; name: string } {
  const found = /^K:[ \t]*([A-G])([#b]?)([A-Za-z]*)/m.exec(tune.abc);
  if (found === null) return { rootHz: POTATO_DEFAULTS.rootHz, mode: "major", name: "D" };
  const [, letter = "D", accidental = "", modeWord = ""] = found;
  const semitone =
    (SEMITONE_OF[letter] ?? 2) + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  return {
    // A above middle C is 440 Hz and nine semitones above C; the potatoes sit
    // an octave and a bit below it, in the register a guitar or a piano's left
    // hand would strike, so they sound under the tune rather than over it.
    rootHz: (440 * Math.pow(2, (semitone - 9) / 12)) / 2,
    mode: MINOR_MODES.has(modeWord.toLowerCase().slice(0, 3)) ? "minor" : "major",
    name: `${letter}${accidental}${modeWord}`,
  };
}

/** Semitones above C, for each natural note. */
const SEMITONE_OF: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** The ABC mode words whose third is flat. Everything else reads as major. */
const MINOR_MODES: ReadonlySet<string> = new Set(["m", "mi", "min", "aeo", "dor", "phr"]);

/** Add one chord at `at` seconds. */
function addPotato(
  out: Float32Array,
  sampleRate: number,
  at: number,
  o: PotatoOptions,
  chord: readonly number[],
  random: () => number,
): void {
  const from = Math.max(0, Math.round(at * sampleRate));
  const to = out.length;
  const twoPi = Math.PI * 2;
  for (let i = from; i < to; i++) {
    const dt = (i - from) / sampleRate;
    const decay = Math.exp(-dt / o.decaySeconds);
    if (decay < 1e-4) break;
    let sample = 0;
    for (let c = 0; c < chord.length; c++) {
      const hz = o.rootHz * chord[c]!;
      const level = CHORD_LEVELS[c] ?? 0.3;
      const phase = twoPi * hz * dt;
      sample += level * (Math.sin(phase) + BITE * Math.sin(2 * phase));
    }
    // The strike: a few milliseconds of noise on top of the tone, which is
    // what makes a chord read as *struck* rather than faded in.
    const attack = Math.exp(-dt / ATTACK_SECONDS);
    sample += ATTACK_NOISE * attack * (random() * 2 - 1);
    out[i] = out[i]! + decay * sample;
  }
}

/** Scale the whole buffer so its loudest sample is exactly `peak`. */
function normalise(out: Float32Array, peak: number): Float32Array {
  let loudest = 0;
  for (const s of out) loudest = Math.max(loudest, Math.abs(s));
  if (loudest === 0) return out;
  const gain = peak / loudest;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * gain;
  return out;
}

/** A tiny deterministic PRNG (mulberry32), so the same seed renders the same chords. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
