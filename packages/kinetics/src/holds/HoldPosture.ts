import type { Hand, HoldId } from "../ir/Hold.js";
import type { Vec3 } from "../motion/Vec3.js";

/**
 * A hold, as **posture** rather than as motion (D4, DA5). The IR names a hold
 * (`HoldId`); this is what the name stands for, and it is the only thing that
 * decides where a hand goes and which way its palm points.
 *
 * A posture is a pair of pure functions of the two body frames, so both
 * dancers compute the **same** shared point from the same geometry — the
 * rendering contract's "joined hands are one shared floor point" is a
 * consequence of the arithmetic rather than a thing a renderer arranges
 * afterwards.
 */
export interface HoldPosture {
  id: HoldId;
  /** Which hand the hold takes; `either` for a posture that is the same on both sides. */
  hand: Hand | "either";
  contact: Contact;
  /** Whose hand stacks on top. Only meaningful when `contact` is `stacked`. */
  onTop?: "robin" | "lark";
  /**
   * The shared point both dancers' hands go to, from the two body frames.
   *
   * `hand` is the side of `self`'s body the hand is on: a posture whose `hand`
   * is `either` (the free hang) needs it, and a two-person posture ignores it.
   * `other` is missing when the hold has nobody on the far end — a take with a
   * dancer who is not there — and every posture then falls back to the hang.
   */
  target(self: BodyFrame, other: BodyFrame | undefined, hand: Hand): Vec3;
  /** Unit palm normal at the target, from this dancer's side. */
  palmNormal(self: BodyFrame, other: BodyFrame | undefined, hand: Hand): Vec3;
  /** Elbow swivel about the shoulder–hand axis: 0 = elbow straight down, + = outward. */
  swivelDeg: number;
  /** Body centre to body centre while the hold is in force, px. 0 = the hold sets no spacing. */
  spacingPx: number;
}

/** How two hands meet: not at all, one stacked on the other, or palm to palm. */
export type Contact = "free" | "stacked" | "palm";

/**
 * One body, as much of it as a posture needs: where the hips are, which way
 * the torso points and how far it leans, and which role the dancer dances
 * (a `stacked` hold needs the role to know whose hand is on top).
 */
export interface BodyFrame {
  hip: Vec3;
  /** Torso yaw, degrees, 0 = +x, increasing toward +y (screen y down). */
  yawDeg: number;
  /** Forward lean off vertical, degrees. */
  leanDeg: number;
  role: "lark" | "robin";
}
