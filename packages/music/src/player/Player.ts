import { renderAbc, synth, type TuneObject } from "abcjs";
import { createClock, type Beat, type Clock } from "../clock/Clock.js";
import type { Medley, Tune } from "../tunes/Tune.js";

export interface Player {
  /** Prime the synth for every tune in the medley (async; `play` stays synchronous). */
  load(medley: Medley): Promise<void>;
  /** Start playback at the given beat. Synchronous: `load` already primed the buffers. */
  play(atBeat: Beat): void;
  stop(): void;
  /** Change tempo: the clock keeps its current beat (no jump), and the synth re-primes. */
  setTempo(bpm: number): void;
  clock: Clock;
  /** Fires once per cycle boundary (every 64 beats), including the one `play` starts in. */
  onCycle(cb: (cycle: number, tune: Tune) => void): void;
}

/** Scheduling latency before the first buffer starts, seconds (matches the hall spike). */
const START_LATENCY = 0.06;
/** How far ahead of a cycle boundary we schedule the next buffer, seconds. */
const LOOKAHEAD = 0.2;
/** How often the silence-mode cycle poller checks the clock, milliseconds. */
const SILENT_POLL_MS = 50;

interface PrimedTune {
  bpm: number;
  buffer: AudioBuffer;
  durationSeconds: number;
}

/**
 * `createPlayer(ctx)` uses `createClock(() => ctx.currentTime)`. In silence
 * mode — no `AudioContext` (tests, autoplay blocked) — pass `undefined` and
 * the clock runs on `performance.now()` instead; `play` still emits cycle
 * events on a timer, just without sound. (The milestone contract types
 * `ctx` as a plain, non-optional `AudioContext`; it is made optional here
 * so silence mode is actually reachable without a browser. See the
 * "Deviations" note in `packages/music/README.md`.)
 */
export function createPlayer(ctx?: AudioContext): Player {
  const silent = !ctx;
  const clock = createClock(silent ? () => performance.now() / 1000 : () => ctx.currentTime);

  let medley: Medley | null = null;
  let sequence: Tune[] = [];
  let bpm = 120;
  const visuals = new Map<Tune, TuneObject>();
  const primed = new Map<Tune, PrimedTune>();

  const cycleListeners: Array<(cycle: number, tune: Tune) => void> = [];
  let playing = false;
  let lastFiredCycle: number | null = null;

  // Real-audio scheduling state.
  let currentSource: AudioBufferSourceNode | null = null;
  let chainTimer: ReturnType<typeof setTimeout> | null = null;
  // Silence-mode scheduling state.
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function tuneAt(cycle: number): Tune | undefined {
    if (sequence.length === 0) return undefined;
    return sequence[((cycle % sequence.length) + sequence.length) % sequence.length];
  }

  function fireCycle(cycle: number, tune: Tune): void {
    if (cycle === lastFiredCycle) return;
    lastFiredCycle = cycle;
    for (const cb of cycleListeners) cb(cycle, tune);
  }

  function visualFor(tune: Tune): TuneObject {
    let v = visuals.get(tune);
    if (!v) {
      const detached = document.createElement("div");
      const [rendered] = renderAbc(detached, tune.abc, {});
      if (!rendered) throw new Error(`@caller/music: tune "${tune.slug}" failed to parse as ABC`);
      v = rendered;
      visuals.set(tune, v);
    }
    return v;
  }

  async function primeTune(tune: Tune, atBpm: number): Promise<PrimedTune> {
    const existing = primed.get(tune);
    if (existing && existing.bpm === atBpm) return existing;
    if (!ctx) throw new Error("@caller/music: cannot prime audio without an AudioContext");
    const visualObj = visualFor(tune);
    // millisecondsPerMeasure = 60000 * beatsPerBar / bpm: one bar's wall-clock
    // duration at `atBpm` dance-beats/minute. This is the same formula for
    // reels and jigs in this package's convention, because both are danced
    // at 2 beats/bar (a walking step per half note for a reel, per dotted
    // quarter for a jig) — see packages/music/README.md.
    const millisecondsPerMeasure = (60000 * tune.meter.beatsPerBar) / atBpm;
    const createSynth = new synth.CreateSynth();
    await createSynth.init({ audioContext: ctx, visualObj, millisecondsPerMeasure, options: {} });
    await createSynth.prime();
    const buffer = createSynth.getAudioBuffer();
    if (!buffer)
      throw new Error(`@caller/music: synth produced no audio buffer for "${tune.slug}"`);
    const result: PrimedTune = { bpm: atBpm, buffer, durationSeconds: buffer.duration };
    primed.set(tune, result);
    return result;
  }

  async function primeAll(atBpm: number): Promise<void> {
    if (!medley) return;
    await Promise.all(medley.tunes.map((tune) => primeTune(tune, atBpm)));
  }

  function stopSource(): void {
    if (currentSource) {
      try {
        currentSource.stop();
      } catch {
        // already stopped
      }
      currentSource.disconnect();
      currentSource = null;
    }
    if (chainTimer !== null) {
      clearTimeout(chainTimer);
      chainTimer = null;
    }
  }

  function stopSilentPoll(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** Start (or chain into) the buffer for `cycle`, starting at `startAt` (ctx time), offset `offsetSeconds` in. */
  function scheduleCycle(cycle: number, startAt: number, offsetSeconds: number): void {
    if (!ctx || !playing) return;
    const tune = tuneAt(cycle);
    const primedTune = tune ? primed.get(tune) : undefined;
    if (!tune || !primedTune) return;

    const source = ctx.createBufferSource();
    source.buffer = primedTune.buffer;
    source.connect(ctx.destination);
    source.start(startAt, offsetSeconds);
    currentSource = source;

    clock.rebase(startAt - offsetSeconds, cycle * 64, bpm);
    fireCycle(cycle, tune);

    const cycleDurationSeconds = (64 * 60) / bpm;
    const nextStartAt = startAt - offsetSeconds + cycleDurationSeconds;
    const delayMs = Math.max(0, (nextStartAt - ctx.currentTime - LOOKAHEAD) * 1000);
    chainTimer = setTimeout(() => {
      chainTimer = null;
      scheduleCycle(cycle + 1, nextStartAt, 0);
    }, delayMs);
  }

  function startSilentPoll(): void {
    stopSilentPoll();
    pollTimer = setInterval(() => {
      const b = clock.beat();
      const cycle = Math.floor(b / 64);
      const tune = tuneAt(cycle);
      if (tune) fireCycle(cycle, tune);
    }, SILENT_POLL_MS);
  }

  function load(m: Medley): Promise<void> {
    medley = m;
    sequence = m.tunes.flatMap((tune) => Array.from({ length: m.timesThroughEach }, () => tune));
    bpm = m.tunes[0]?.defaultBpm ?? 120;
    if (silent) return Promise.resolve();
    return primeAll(bpm);
  }

  function play(atBeat: Beat): void {
    stop();
    if (sequence.length === 0) return;
    playing = true;
    lastFiredCycle = null;
    const cycle = Math.floor(atBeat / 64);

    if (silent) {
      clock.rebase(performance.now() / 1000, atBeat, bpm);
      const tune = tuneAt(cycle);
      if (tune) fireCycle(cycle, tune);
      startSilentPoll();
      return;
    }

    const offsetBeats = atBeat - cycle * 64;
    const offsetSeconds = (offsetBeats * 60) / bpm;
    const when = ctx.currentTime + START_LATENCY;
    scheduleCycle(cycle, when, offsetSeconds);
  }

  function stop(): void {
    playing = false;
    stopSource();
    stopSilentPoll();
  }

  function setTempo(newBpm: number): void {
    bpm = newBpm;
    clock.setTempo(newBpm);
    if (silent) return;
    void primeAll(newBpm).then(() => {
      if (playing) play(clock.beat());
    });
  }

  function onCycle(cb: (cycle: number, tune: Tune) => void): void {
    cycleListeners.push(cb);
  }

  return { load, play, stop, setTempo, clock, onCycle };
}
