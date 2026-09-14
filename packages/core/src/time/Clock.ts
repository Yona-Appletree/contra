/**
 * The beat the model runs on. Fractional; 0 is the first beat of the sequence.
 */
export type Beat = number;

/**
 * Maps a time source to beats. The beat is a linear function of `now()`
 * between rebases, so once music plays the caller rebases the clock onto
 * `AudioContext.currentTime` and nothing above reads a wall clock (plan AC4).
 */
export interface Clock {
  /** The current beat. */
  beat(): Beat;
  /** Declare that `beat` happens at time `now`, running at `bpm` from there. */
  rebase(now: number, beat: Beat, bpm: number): void;
  /** Change tempo without moving the current beat. */
  setTempo(bpm: number): void;
  /** Jump to `beat`, keeping the current tempo and paused state. */
  setBeat(beat: Beat): void;
  /** Freeze the beat where it is. Idempotent. */
  pause(): void;
  /** Continue from the frozen beat, with no jump. Idempotent. */
  resume(): void;
  /** Whether the clock is paused. */
  isPaused(): boolean;
  /** The current tempo in beats per minute. */
  tempo(): number;
}

/** Tempo the clock starts at, before any `rebase` or `setTempo`. */
export const DEFAULT_BPM = 112;

/**
 * A clock reading `now` (seconds) from the supplied time source.
 *
 * `beat()` is `refBeat + (now() − ref) × bpm / 60`: exactly linear in `now()`
 * between rebases, which is what makes the audio clock the master clock.
 */
export function createClock(now: () => number, bpm: number = DEFAULT_BPM): Clock {
  let ref = now();
  let refBeat = 0;
  let tempoBpm = bpm;
  let paused = false;
  let pausedBeat = 0;

  const running = (): Beat => refBeat + (now() - ref) * (tempoBpm / 60);
  const beat = (): Beat => (paused ? pausedBeat : running());

  return {
    beat,
    rebase(atNow, atBeat, atBpm) {
      ref = atNow;
      refBeat = atBeat;
      tempoBpm = atBpm;
      if (paused) pausedBeat = atBeat;
    },
    setTempo(nextBpm) {
      const current = beat();
      tempoBpm = nextBpm;
      ref = now();
      refBeat = current;
      if (paused) pausedBeat = current;
    },
    setBeat(nextBeat) {
      ref = now();
      refBeat = nextBeat;
      pausedBeat = nextBeat;
    },
    pause() {
      if (paused) return;
      pausedBeat = running();
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      ref = now();
      refBeat = pausedBeat;
    },
    isPaused: () => paused,
    tempo: () => tempoBpm,
  };
}
