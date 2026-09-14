import type { Angle } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";

/**
 * One dancer's state at one instant: everything the renderer needs and nothing
 * about dancing. Figures produce these; `core` never produces one on its own.
 */
export interface PoseSample {
  /** Floor position of the body centre, in world px. */
  p: Vec2;
  /** Which way the body faces, degrees. */
  facing: Angle;
  /** Which way the head looks, degrees (absolute, not relative to `facing`). */
  look: Angle;
  /** Forward lean, in px. Positive leans the way the dancer faces. */
  lean: number;
  /** Where each hand is, or `'down'` for a hand the figure does not place. */
  hands: { L: Hand | "down"; R: Hand | "down" };
  /** Steps per beat. 1 for a walk, 2 for the double-time of a buzz step. */
  stepRate: number;
  /** Buzz-step swing: the feet stop alternating and the torso stops swaying. */
  buzz: boolean;
  /** Extra skirt radius from rotation, in px. */
  flare: number;
  /** Scales the quiet motion, 0 to 1. 0 is a dancer standing still. */
  amp: number;
  /** Explicit foot offsets, body-local (forward, right). Overrides quiet motion. */
  feet?: { L: Vec2; R: Vec2 };
}

/**
 * A hand: a point on the floor plus how far below shoulder height it is. Two
 * dancers joining hands compute the same `Hand` from the same figure frame,
 * which is what makes joined hands one shared floor point.
 */
export interface Hand {
  /** Floor point the hand is over, in world px. */
  p: Vec2;
  /** Drop below shoulder height, in px. 0 is shoulder height. */
  drop: number;
}

/** Which arm. */
export type Side = "L" | "R";

/**
 * Per-dancer variation. Neutral defaults are 1, 0, 1: every dancer dances the
 * figure as written until something sets a style.
 */
export interface Style {
  /** Scales the quiet motion (foot swing and torso sway). Clamped to [0, 1]. */
  bounce: number;
  /** Beats early or late this dancer anticipates a figure. Used by figures, not by `core`. */
  lead: number;
  /** How close a swing is taken. Used by figures, not by `core`. */
  swingTightness: number;
}

/** The neutral style: no variation at all. */
export const NEUTRAL_STYLE: Style = { bounce: 1, lead: 0, swingTightness: 1 };

/** Interpolate two hands. `k` is not clamped. */
export const lerpHand = (a: Hand, b: Hand, k: number): Hand => ({
  p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k],
  drop: a.drop + (b.drop - a.drop) * k,
});
