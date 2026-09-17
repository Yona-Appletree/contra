import type { Arrangement, Tune, Voice } from "../tunes/Tune.js";

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
 * phrase that never happened. Rendered sample by sample into a `Float32Array`,
 * which makes it pure, seeded and measurable without an `AudioContext`;
 * {@link playPotatoes} is the three lines that hand the result to the browser.
 *
 * **What plays them.** The brief asks for "the loudest instrument of the
 * current tune's arrangement", chosen "from the tune's data, not hard-coded per
 * tune". A {@link Tune} carries its {@link Arrangement} — the band's three
 * voices with their programs and volumes — so {@link potatoesFor} takes the
 * loudest of them and plays the chords in that instrument's family
 * ({@link voiceOf}): **bowed** for a fiddle (a bow bite, a swell, an octave up
 * where a fiddle's chord sits), **struck** for a piano, **plucked** for a bass.
 * The **key** — the root of the chord and whether its third is major or
 * minor — comes from the tune's own `key` field.
 */
export interface PotatoOptions {
  /** How many potatoes, and therefore how many beats the buffer lasts. */
  beats: number;
  /** Which instrument's family strikes the chord. */
  voice: PotatoVoice;
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
  /**
   * What {@link playPotatoes} connects its source to. Default `ctx.destination`.
   * {@link createPlayer} passes its master gain, so the count-in is muted by the
   * same control the tune is — nothing is heard through a muted hall.
   */
  destination?: AudioNode;
}

/** The families a potato can be played in; see {@link voiceOf}. */
export type PotatoVoice = "bowed" | "struck" | "plucked";

export const POTATO_DEFAULTS: PotatoOptions = {
  beats: 4,
  // The hammer: the timbre the potatoes had before the arrangement existed,
  // and the fallback for an instrument outside the three families.
  voice: "struck",
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

/** What distinguishes one voice's chord from another's, before the envelope. */
interface Timbre {
  /** Seconds the attack transient lasts: the pick, the bow bite, the hammer. */
  attackSeconds: number;
  /** How much noise rides on the attack, relative to the tone. */
  noise: number;
  /** How much second-harmonic bite the tone carries, for a chord that cuts. */
  bite: number;
  /** Seconds the tone takes to swell in under the attack; zero for an instant strike. */
  swellSeconds: number;
  /** Octaves above the potato root the chord is played at. */
  octave: number;
  /** What the voice does to `decaySeconds`: a bow stroke is shorter than a ringing string. */
  decay: number;
}

const TIMBRE: Readonly<Record<PotatoVoice, Timbre>> = {
  // A fiddle's chord: the bow bites, the tone swells in over twenty
  // milliseconds, the sound is bright with the bow's edge, and it sits an
  // octave up — a fiddle's lowest string is G3, and its D chord starts at D4.
  // The stroke is a short one — a down-bow, not a held note — so it decays
  // faster than a struck string rings.
  bowed: { attackSeconds: 0.02, noise: 0.35, bite: 0.6, swellSeconds: 0.02, octave: 1, decay: 0.7 },
  // A piano's chord: the hammer, instant, ringing.
  struck: { attackSeconds: 0.008, noise: 0.55, bite: 0.25, swellSeconds: 0, octave: 0, decay: 1 },
  // A bass's chord: a fast, rounder pluck, low, ringing.
  plucked: { attackSeconds: 0.004, noise: 0.45, bite: 0.15, swellSeconds: 0, octave: 0, decay: 1 },
};

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

  const timbre = TIMBRE[o.voice];
  for (let k = 0; k < o.beats; k++) {
    addPotato(out, sampleRate, k * beatSeconds, o, timbre, chord, random);
  }
  return normalise(out, o.peak);
}

/**
 * Play one set of potatoes on `ctx`, starting at `when` (default: now), into
 * `options.destination` (default: `ctx.destination`).
 */
export function playPotatoes(
  ctx: AudioContext,
  when?: number,
  options: Partial<PotatoOptions> = {},
): AudioBufferSourceNode {
  const samples = renderPotatoes(ctx.sampleRate, options);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  // `set` rather than `copyToChannel`: the DOM types pin the latter to a
  // `Float32Array<ArrayBuffer>`, and a plain `new Float32Array(n)` is not one.
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(options.destination ?? ctx.destination);
  source.start(when ?? ctx.currentTime);
  return source;
}

/**
 * The potatoes for one tune, at one tempo: the chord in **its** key, played
 * by **its** loudest instrument.
 *
 * Both are read off the tune's own data rather than out of a table keyed by
 * slug, so a tune added tomorrow gets potatoes in its own key, in its own
 * band's voice, with nothing else written.
 */
export const potatoesFor = (
  tune: Pick<Tune, "key" | "arrangement">,
  bpm: number,
): Partial<PotatoOptions> => {
  const key = keyOf(tune);
  return {
    bpm,
    rootHz: key.rootHz,
    mode: key.mode,
    voice: voiceOf(loudestVoice(tune.arrangement).program),
  };
};

/** The loudest voice of an arrangement; the melody wins a tie, then the chords. */
export function loudestVoice(arrangement: Arrangement): Voice {
  return [arrangement.melody, arrangement.chords, arrangement.bass].reduce((loudest, voice) =>
    voice.volume > loudest.volume ? voice : loudest,
  );
}

/**
 * The family a General MIDI program plays a potato in: the strings (40–47)
 * bow it, the pianos and chromatic percussion (0–15) strike it, and
 * everything else — basses, guitars, and whatever a future band brings —
 * plucks it.
 */
export function voiceOf(program: number): PotatoVoice {
  if (program >= 40 && program <= 47) return "bowed";
  if (program >= 0 && program <= 15) return "struck";
  return "plucked";
}

/**
 * A tune's key, read off its own `key` field — the same text its ABC's `K:`
 * is written from.
 *
 * Keys in this package look like `D`, `G`, `Em`, `AMix` — a tonic letter, an
 * optional accidental, and an optional mode. Anything this does not recognise
 * falls back to D major, which is what nine of the thirteen tunes are.
 */
export function keyOf(tune: Pick<Tune, "key">): {
  rootHz: number;
  mode: "major" | "minor";
  name: string;
} {
  const found = /^\s*([A-G])([#b]?)([A-Za-z]*)/.exec(tune.key);
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
  timbre: Timbre,
  chord: readonly number[],
  random: () => number,
): void {
  const from = Math.max(0, Math.round(at * sampleRate));
  const to = out.length;
  const twoPi = Math.PI * 2;
  const root = o.rootHz * Math.pow(2, timbre.octave);
  const decaySeconds = o.decaySeconds * timbre.decay;
  for (let i = from; i < to; i++) {
    const dt = (i - from) / sampleRate;
    const decay = Math.exp(-dt / decaySeconds);
    if (decay < 1e-4) break;
    let sample = 0;
    for (let c = 0; c < chord.length; c++) {
      const hz = root * chord[c]!;
      const level = CHORD_LEVELS[c] ?? 0.3;
      const phase = twoPi * hz * dt;
      sample += level * (Math.sin(phase) + timbre.bite * Math.sin(2 * phase));
    }
    // A bowed tone swells in under the bite; a struck or plucked one is there at once.
    if (timbre.swellSeconds > 0) sample *= 1 - Math.exp(-dt / timbre.swellSeconds);
    // The strike: a few milliseconds of noise on top of the tone, which is
    // what makes a chord read as *struck* rather than faded in.
    const attack = Math.exp(-dt / timbre.attackSeconds);
    sample += timbre.noise * attack * (random() * 2 - 1);
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
