import type { Beat, PoseSample, Style, Vec2 } from "@caller/core";
import type { Person } from "../person/Person.js";

/** One dancer in one frame. */
export interface FrameDancer {
  person: Person;
  pose: PoseSample;
  /**
   * Floor velocity in px per beat. The quiet motion — foot swing and torso
   * sway — is scaled by it and aligned to it, so a dancer passed no velocity
   * stands with planted feet. Figures know their own velocity; the renderer
   * cannot difference a single frame.
   */
  velocity?: Vec2;
  /** Per-dancer variation. Defaults to `NEUTRAL_STYLE`. */
  style?: Style;
  /**
   * Points to add to this person's floor trail this frame, in order and in
   * world px. Left out, the renderer adds the dancer's current position, which
   * is what an animating page wants. Pass the sub-frame samples when the play
   * head moves more than a px between frames. Two consecutive points further
   * apart than `TRAIL_BREAK_PX` start a new stroke rather than a long dash
   * across the hall, so a seek or a wrap does not draw a line.
   */
  trail?: readonly Vec2[];
}

/**
 * Everything the renderer needs for one frame. It is pure data: the renderer
 * never calls a figure, and the same `Frame` always draws the same pixels.
 */
export interface Frame {
  beat: Beat;
  people: readonly FrameDancer[];
  /**
   * The part of the dance's role set that decides hand stacking: `top` names
   * the role whose hand is drawn on top of every joined pair, and whose arms
   * therefore draw last. The contra role set says `robin`.
   */
  roleSet: { top: string };
}
