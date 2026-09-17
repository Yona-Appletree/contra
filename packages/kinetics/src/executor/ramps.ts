import { clamp01 } from "@caller/core";

/**
 * The executor's one easing curve: `(1 − cos(πs)) / 2`, zero slope at both
 * ends and no slope discontinuity where it meets what came before.
 *
 * It is a **cosine** ramp rather than a smoothstep for a reason P2 measured:
 * a smoothstep take of 12 px in one beat peaks at `6 × 12 = 72` px/beat²,
 * over the hand's 64.6 px/beat² cap at 112 bpm, while the cosine ramp peaks
 * at `12 × π² / 2 ≈ 59.2` and passes. Every ramp in the executor — a take, a
 * drop, a lean, a foot's flight — is this curve, so the margin is the same
 * everywhere.
 */
export const cosineRamp = (s: number): number => (1 - Math.cos(Math.PI * clamp01(s))) / 2;

/**
 * Where `beat` sits in a ramp of `beats` beats that starts at `start`: 0
 * before it, 1 after it, the cosine curve between.
 */
export const rampAt = (beat: number, start: number, beats: number): number =>
  beats <= 0 ? (beat >= start ? 1 : 0) : cosineRamp((beat - start) / beats);

/**
 * How long a lean takes to arrive, in beats.
 *
 * Two, for the same kind of reason the hand seam is two: a bow's 25° over one
 * beat peaks at `25 × π / 2 ≈ 39.3` deg/beat, over `ANGULAR_CAPS.leanDegPerS`
 * (60 deg/s, which is 32.1 deg/beat at 112 bpm). Over two beats it peaks at
 * 19.6 and the bow folds at a speed a back can fold at.
 */
export const LEAN_BEATS = 2;

/**
 * A half-sine bump: 0 at both ends of `s`, 1 in the middle. The lift of a
 * foot in flight, and nothing else.
 */
export const bump = (s: number): number => Math.sin(Math.PI * clamp01(s));
