/**
 * The audio clock: a linear map from wall/audio time to a beat number.
 *
 * This is a **local stand-in** for `@caller/core`'s `createClock`, defined
 * here because `@caller/core` (M2) has not merged yet. The shape matches
 * `m02-core-kinematics.md`'s "time" contract exactly:
 *
 * ```ts
 * type Beat = number;
 * interface Meter { beatsPerBar: number; barsPerPhrase: number }
 * interface Clock { beat(): Beat; rebase(now, beat, bpm): void; setTempo(bpm): void; pause(): void; resume(): void }
 * function createClock(now: () => number): Clock
 * ```
 *
 * See `packages/music/README.md` for the note on replacing this with
 * `@caller/core`'s `createClock` once M2 merges.
 */

/** A beat is a plain number: fractional beats are valid (mid-beat positions). */
export type Beat = number;

/**
 * A tune's rhythmic shape. `beatsPerBar` is the number of dance beats in one
 * bar of the tune (2, for both reels and jigs, in the convention this
 * package uses — see the README for why that departs from the `(4, 2)`
 * example in `m02-core-kinematics.md`). `barsPerPhrase` is the number of
 * bars in one musical phrase (8, for the AABB reels/jigs this package
 * bundles: A1/A2/B1/B2 are each one phrase).
 */
export interface Meter {
  beatsPerBar: number;
  barsPerPhrase: number;
}

export interface Clock {
  /** The current beat. Linear in `now()` between calls to `rebase`. */
  beat(): Beat;
  /** Re-anchor the clock: at time `now`, the beat is `beat`, and the tempo is `bpm`. */
  rebase(now: number, beat: Beat, bpm: number): void;
  /** Change tempo without a jump: the beat `beat()` returns right now keeps its value. */
  setTempo(bpm: number): void;
  /** Freeze `beat()` at its current value. */
  pause(): void;
  /** Unfreeze: `beat()` continues from where it was paused, no jump. */
  resume(): void;
}

/**
 * `now` is typically `() => audioContext.currentTime` (the audio clock) or
 * `() => performance.now() / 1000` (silence mode, seconds). The beat is a
 * linear function of `now()` between `rebase` calls: `beat = refBeat + (now() - refNow) * bpm / 60`.
 */
export function createClock(now: () => number): Clock {
  let refNow = now();
  let refBeat: Beat = 0;
  let bpm = 120;
  let paused = false;
  let pausedBeat: Beat = 0;

  function beat(): Beat {
    if (paused) return pausedBeat;
    return refBeat + (now() - refNow) * (bpm / 60);
  }

  function rebase(atNow: number, atBeat: Beat, atBpm: number): void {
    refNow = atNow;
    refBeat = atBeat;
    bpm = atBpm;
    if (paused) pausedBeat = atBeat;
  }

  function setTempo(newBpm: number): void {
    const current = beat();
    bpm = newBpm;
    refNow = now();
    refBeat = current;
  }

  function pause(): void {
    if (paused) return;
    pausedBeat = beat();
    paused = true;
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    refNow = now();
    refBeat = pausedBeat;
  }

  return { beat, rebase, setTempo, pause, resume };
}
