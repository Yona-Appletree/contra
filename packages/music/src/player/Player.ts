import { createClock, type Beat, type Clock } from "@caller/core";
import { renderAbc, synth, type TuneObject } from "abcjs";
import type { Medley, Tune } from "../tunes/Tune.js";
import { playPotatoes, potatoesFor } from "./potatoes.js";

/** What {@link Player.play} takes beyond the beat to start at. */
export interface PlayOptions {
  /**
   * Beats of **potatoes** to play before the tune's own beat 0 — the four
   * strong chords a band counts a dance in with (B3). Default 0.
   *
   * The whole lead-in sits *before* `atBeat`: the potato buffer starts now, the
   * tune's first cycle starts `potatoBeats` later, and the clock is rebased so
   * that `atBeat` still falls exactly where the tune's bar 1 does. So a page
   * that wants potatoes calls `play` four beats early, not late, and nothing
   * about the tune's own arithmetic moves.
   */
  potatoBeats?: Beat;
}

/** What {@link createPlayer} takes beyond the audio context. */
export interface PlayerOptions {
  /**
   * Where abcjs loads its per-note samples from: a directory holding
   * `<instrument>-mp3/<Note>.mp3`, the layout of gleitz/midi-js-soundfonts.
   * The app passes its own `public/soundfont/`, built by
   * `apps/web/scripts/build-soundfont.mjs`, so nothing streams from GitHub
   * at run time. Left out, abcjs streams FluidR3 from its default host.
   */
  soundFontUrl?: string;
}

export interface Player {
  /** Prime the synth for every tune in the medley (async; `play` stays synchronous). */
  load(medley: Medley): Promise<void>;
  /** Start playback at the given beat. Synchronous: `load` already primed the buffers. */
  play(atBeat: Beat, options?: PlayOptions): void;
  stop(): void;
  /** Change tempo: the clock keeps its current beat (no jump), and the synth re-primes. */
  setTempo(bpm: number): void;
  clock: Clock;
  /** Fires once per cycle boundary (every 64 beats), including the one `play` starts in. */
  onCycle(cb: (cycle: number, tune: Tune) => void): void;
  /**
   * Mute or unmute the band **without stopping it**: the master gain ramps to
   * 0 (or back to 1) over {@link MUTE_RAMP_SECONDS}, so there is no click, and
   * the clock, the scheduling and `onCycle` carry on untouched. A muted player
   * is still playing — that is the whole point: the hall keeps dancing on a
   * beat that stays a linear function of `AudioContext.currentTime`.
   *
   * In silence mode (no `AudioContext`) this only records the flag.
   */
  setMuted(muted: boolean): void;
  /** Whether {@link Player.setMuted} was last called with `true`. Default `false`. */
  muted(): boolean;
  /**
   * The master gain's value right now, or `null` in silence mode (there is no
   * gain node to read). It is the *live* value, so just after `setMuted(true)`
   * it is still on its way down the ramp rather than exactly 0.
   */
  gain(): number | null;
}

/** Scheduling latency before the first buffer starts, seconds (matches the hall spike). */
const START_LATENCY = 0.06;
/** How far ahead of a cycle boundary we schedule the next buffer, seconds. */
const LOOKAHEAD = 0.2;
/** How often the silence-mode cycle poller checks the clock, milliseconds. */
const SILENT_POLL_MS = 50;
/** What abcjs applies to its own FluidR3 rendering; ours is the same rendering, self-hosted. */
const SOUND_FONT_VOLUME_MULTIPLIER = 3.0;
/**
 * The time constant of the mute ramp, seconds. `setTargetAtTime` approaches
 * its target exponentially, so ten milliseconds is inaudible as a fade and
 * still long enough that the step never clicks.
 */
export const MUTE_RAMP_SECONDS = 0.01;

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
export function createPlayer(ctx?: AudioContext, options: PlayerOptions = {}): Player {
  const silent = !ctx;
  const clock = createClock(silent ? () => performance.now() / 1000 : () => ctx.currentTime);

  // The master gain: everything this player makes a sound with — the tunes and
  // the potatoes alike — goes through it, so muting is one ramp rather than a
  // walk over live sources, and a source started while muted is silent from
  // its first sample. Silence mode has no node, only the flag.
  const master = ctx ? ctx.createGain() : null;
  if (ctx && master) master.connect(ctx.destination);
  /** Where a source connects: the master gain, or the destination if there is none. */
  const output = (): AudioNode | null => master ?? ctx?.destination ?? null;
  let isMuted = false;

  let medley: Medley | null = null;
  let sequence: Tune[] = [];
  let bpm = 120;
  const visuals = new Map<Tune, TuneObject>();
  // abcjs multiplies its samples by 3.0 for its own default soundfont and by
  // 1.0 for any other URL. Ours is the same FluidR3 rendering at a different
  // address, so the multiplier is stated rather than left to that rule.
  const synthOptions = {
    soundFontVolumeMultiplier: SOUND_FONT_VOLUME_MULTIPLIER,
    ...(options.soundFontUrl === undefined ? {} : { soundFontUrl: options.soundFontUrl }),
  };
  const primed = new Map<Tune, PrimedTune>();

  const cycleListeners: Array<(cycle: number, tune: Tune) => void> = [];
  let playing = false;
  let lastFiredCycle: number | null = null;

  // Real-audio scheduling state.
  //
  // **Every** source that has been started and not yet finished, not just the
  // most recent one. `scheduleCycle` chains the next cycle's buffer `LOOKAHEAD`
  // seconds before the current one ends, so for a fifth of a second there are
  // two live sources; when this held only the latest of them, a `stop()` inside
  // that window stopped the buffer that had not started yet and left the one
  // that was *sounding* to play itself out. That is exactly the window the end
  // of a dance falls in, and B3's R1 is that nothing sounds through the
  // interval — so the set is the fix, in the player rather than by muting.
  const sources = new Set<AudioBufferSourceNode>();
  let chainTimer: ReturnType<typeof setTimeout> | null = null;
  /** A deferred cycle-boundary event, when the buffer starts later than now. */
  let cycleTimer: ReturnType<typeof setTimeout> | null = null;
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
    await createSynth.init({
      audioContext: ctx,
      visualObj,
      millisecondsPerMeasure,
      options: synthOptions,
    });
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
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
    }
    sources.clear();
    if (chainTimer !== null) {
      clearTimeout(chainTimer);
      chainTimer = null;
    }
    if (cycleTimer !== null) {
      clearTimeout(cycleTimer);
      cycleTimer = null;
    }
  }

  /** Start one buffer, and keep hold of it until it has finished. */
  function start(source: AudioBufferSourceNode, when: number, offsetSeconds = 0): void {
    sources.add(source);
    source.onended = (): void => {
      sources.delete(source);
    };
    source.start(when, offsetSeconds);
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
    const destination = output();
    if (destination) source.connect(destination);
    start(source, startAt, offsetSeconds);

    const cycleStartsAt = startAt - offsetSeconds;
    clock.rebase(cycleStartsAt, cycle * 64, bpm);
    // The cycle boundary is an event about the *music*, so it fires when the
    // cycle actually begins. Ordinarily that is within `LOOKAHEAD` of now and
    // firing straight away is right; with B3's potatoes in front of the first
    // cycle it is four beats away, and a listener told "the dance has started"
    // four beats early would show the wrong tune over the count-in.
    const dueSeconds = cycleStartsAt - ctx.currentTime;
    if (dueSeconds <= LOOKAHEAD) {
      fireCycle(cycle, tune);
    } else {
      cycleTimer = setTimeout(() => {
        cycleTimer = null;
        if (playing) fireCycle(cycle, tune);
      }, dueSeconds * 1000);
    }

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

  function play(atBeat: Beat, options: PlayOptions = {}): void {
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
    const potatoBeats = Math.max(0, options.potatoBeats ?? 0);
    const potatoSeconds = (potatoBeats * 60) / bpm;
    const countIn = ctx.currentTime + START_LATENCY;
    // The potatoes go in *front*: they start now and the tune starts when they
    // finish, so the fourth chord lands one beat before bar 1 with no gap and
    // no overlap, and the clock is rebased by `scheduleCycle` against the tune
    // rather than against them.
    const tune = tuneAt(cycle);
    if (potatoBeats > 0 && tune) {
      const source = playPotatoes(ctx, countIn, {
        ...potatoesFor(tune, bpm),
        beats: potatoBeats,
        ...(master === null ? {} : { destination: master }),
      });
      sources.add(source);
      source.onended = (): void => {
        sources.delete(source);
      };
    }
    scheduleCycle(cycle, countIn + potatoSeconds, offsetSeconds);
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

  function setMuted(next: boolean): void {
    isMuted = next;
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(next ? 0 : 1, ctx.currentTime, MUTE_RAMP_SECONDS);
  }

  function muted(): boolean {
    return isMuted;
  }

  function gain(): number | null {
    return master === null ? null : master.gain.value;
  }

  return { load, play, stop, setTempo, clock, onCycle, setMuted, muted, gain };
}
