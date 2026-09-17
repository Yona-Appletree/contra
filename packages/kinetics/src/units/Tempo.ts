import { CM_PER_PX, DEFAULT_BPM } from "@caller/core";

/** The tempo and the units every conversion in this package is done through. */
export interface Tempo {
  /** Beats per minute. */
  bpm: number;
  /** World scale, cm per px (from `@caller/core`'s rendering contract). */
  cmPerPx: number;
  /** Samples per beat, the executor's and the proof's sampling rate. */
  samplesPerBeat: number;
}

/** The executor and the proof both sample at 16 per beat. */
export const SAMPLES_PER_BEAT = 16;

/** A {@link Tempo} at `bpm` (default `DEFAULT_BPM`), the package's world scale. */
export const tempo = (bpm: number = DEFAULT_BPM): Tempo => ({
  bpm,
  cmPerPx: CM_PER_PX,
  samplesPerBeat: SAMPLES_PER_BEAT,
});

/** Seconds per beat at `t`'s tempo. */
export const secondsPerBeat = (t: Tempo): number => 60 / t.bpm;

/** Convert a speed in cm/s to px/beat at `t`'s tempo and world scale. */
export const pxPerBeat = (t: Tempo, cmPerSecond: number): number =>
  (cmPerSecond * secondsPerBeat(t)) / t.cmPerPx;

/** Convert an acceleration in cm/s² to px/beat² at `t`'s tempo and world scale. */
export const pxPerBeat2 = (t: Tempo, cmPerSecond2: number): number =>
  (cmPerSecond2 * secondsPerBeat(t) ** 2) / t.cmPerPx;

/** Convert an angular speed in deg/s to deg/beat at `t`'s tempo. */
export const degPerBeat = (t: Tempo, degPerSecond: number): number =>
  degPerSecond * secondsPerBeat(t);

/** Convert a length in cm to px at `t`'s world scale. */
export const cmToPx = (t: Tempo, cm: number): number => cm / t.cmPerPx;
