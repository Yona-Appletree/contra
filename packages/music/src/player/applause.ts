/**
 * The applause between two dances, synthesised from noise.
 *
 * No sample, no dependency: a clap is a very short burst of noise with a sharp
 * transient and a little body, and a hall applauding is a few dozen people
 * doing that at once, each at their own rate and never quite together. That is
 * cheap enough to write out sample by sample, so {@link renderApplause} is
 * plain arithmetic on a `Float32Array` — pure, seeded, testable without an
 * `AudioContext` — and {@link playApplause} is the three lines that hand the
 * result to the browser.
 *
 * What it sounds like: a hall of people clapping. It swells over about a fifth
 * of a second, runs at full strength for two seconds and dies away over the
 * last second; each clapper is a dry, bright *snap* that decays in about a
 * twentieth of a second, and there are enough of them at enough different
 * rates that the individual claps blur into a rattle rather than a rhythm.
 * There is no cheering, no whistling and no reverb tail.
 */

/** How the applause is put together. Every number is tuned by ear-less arithmetic. */
export interface ApplauseOptions {
  /** How long the whole thing lasts, seconds. */
  seconds: number;
  /** How many people are clapping. */
  clappers: number;
  /** The slowest and fastest clapper, in claps per second. */
  slowestHz: number;
  fastestHz: number;
  /** Seconds the applause takes to swell to full strength. */
  riseSeconds: number;
  /** Seconds it takes to die away at the end. */
  fallSeconds: number;
  /** Peak amplitude of the rendered buffer, 0 to 1. */
  peak: number;
  /** Seed for the clap times and the noise, so the same call renders the same buffer. */
  seed: number;
}

export const APPLAUSE_DEFAULTS: ApplauseOptions = {
  seconds: 3.2,
  clappers: 14,
  slowestHz: 2.6,
  fastestHz: 4.6,
  riseSeconds: 0.2,
  fallSeconds: 1,
  peak: 0.9,
  seed: 20260914,
};

/** Seconds a single clap's sharp transient takes to decay by 1/e. */
const CLAP_ATTACK_TAU = 0.006;
/** Seconds its softer body takes to decay by 1/e, and how loud that body is. */
const CLAP_BODY_TAU = 0.035;
const CLAP_BODY_LEVEL = 0.45;
/** How long after its onset a clap is still worth adding, seconds. */
const CLAP_TAIL = 0.18;

/** How much louder the loudest clapper is than the quietest. */
const CLAP_LEVEL = { lo: 0.55, range: 0.45 };

/**
 * One applause, rendered sample by sample.
 *
 * Each clapper claps at its own steady rate with a little jitter on every
 * clap, so no two of them stay in phase; each clap is white noise under a
 * two-part exponential decay, one-pole-filtered at a brightness of that
 * clapper's own, which is what makes one pair of hands sound different from
 * the next. The sum is normalised to `peak`, so the loudness does not depend
 * on how many people are clapping.
 */
export function renderApplause(
  sampleRate: number,
  options: Partial<ApplauseOptions> = {},
): Float32Array {
  const o: ApplauseOptions = { ...APPLAUSE_DEFAULTS, ...options };
  const n = Math.max(1, Math.round(sampleRate * o.seconds));
  const out = new Float32Array(n);
  const random = mulberry32(o.seed);

  for (let c = 0; c < o.clappers; c++) {
    const rate = o.slowestHz + (o.fastestHz - o.slowestHz) * random();
    const level = CLAP_LEVEL.lo + CLAP_LEVEL.range * random();
    // Each clapper's own brightness: how much of the previous sample leaks
    // into this one. Near 0 is a bright snap, near 1 a dull thud.
    const dull = 0.1 + 0.35 * random();
    let t = random() / rate;
    while (t < o.seconds) {
      addClap(out, sampleRate, t, level * envelopeAt(t, o), dull, random);
      // A steady rate would beat against the other clappers; ±15% of a period
      // of jitter on every clap is what keeps it a hall rather than a machine.
      t += (1 / rate) * (0.85 + 0.3 * random());
    }
  }

  return normalise(out, o.peak);
}

/** Play one applause on `ctx`, starting at `when` (default: now). */
export function playApplause(
  ctx: AudioContext,
  when?: number,
  options: Partial<ApplauseOptions> = {},
): AudioBufferSourceNode {
  const samples = renderApplause(ctx.sampleRate, options);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  // `set` rather than `copyToChannel`: the DOM types pin the latter to a
  // `Float32Array<ArrayBuffer>`, and a plain `new Float32Array(n)` is not one.
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(when ?? ctx.currentTime);
  return source;
}

/** The swell: in over `riseSeconds`, out over `fallSeconds`, flat between. */
function envelopeAt(t: number, o: ApplauseOptions): number {
  const rise = o.riseSeconds <= 0 ? 1 : Math.min(1, t / o.riseSeconds);
  const left = o.seconds - t;
  const fall = o.fallSeconds <= 0 ? 1 : Math.min(1, Math.max(0, left) / o.fallSeconds);
  return rise * fall;
}

/** Add one clap at `at` seconds: filtered noise under a two-part decay. */
function addClap(
  out: Float32Array,
  sampleRate: number,
  at: number,
  level: number,
  dull: number,
  random: () => number,
): void {
  if (level <= 0) return;
  const from = Math.max(0, Math.round(at * sampleRate));
  const to = Math.min(out.length, Math.round((at + CLAP_TAIL) * sampleRate));
  let filtered = 0;
  for (let i = from; i < to; i++) {
    const dt = (i - from) / sampleRate;
    const decay = Math.exp(-dt / CLAP_ATTACK_TAU) + CLAP_BODY_LEVEL * Math.exp(-dt / CLAP_BODY_TAU);
    filtered = dull * filtered + (1 - dull) * (random() * 2 - 1);
    out[i] = out[i]! + level * decay * filtered;
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

/** A tiny deterministic PRNG (mulberry32), so the same seed renders the same applause. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
