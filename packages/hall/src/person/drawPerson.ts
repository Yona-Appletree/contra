import type { Arm3dSolution, PoseSample, Vec2 } from "@caller/core";
import { UPPER_ARM_PX, bodyPoint, q256Vec2 } from "@caller/core";
import { SHOE_COLOUR } from "../appearance/Appearance.js";
import { shade } from "../appearance/shade.js";
import type { Ctx2D } from "../renderer/Ctx2D.js";
import { OUTLINE_COLOUR, TAU, circ, ell, seg } from "../renderer/Ctx2D.js";
import type { ArmPair, DancerLayout } from "./layoutDancer.js";
import { layoutDancer } from "./layoutDancer.js";
import type { Person } from "./Person.js";

/**
 * Where one hand sits in a joined pair. `"bottom"` is the hand underneath,
 * drawn a little wider so it peeks out around the one on top; `"top"` is the
 * one over it, drawn a little narrower. See `sceneOrder`.
 */
export type HandStack = "free" | "top" | "bottom";

/** How the hand radius changes for a joined hand. Ported from the spike. */
export const HAND_STACK_RADIUS_PX: Record<HandStack, number> = {
  free: 0,
  bottom: 0.45,
  top: -0.15,
};

/** The soft dark ellipse under every dancer. */
export const SHADOW_COLOUR = "rgba(0,0,0,0.22)";

/**
 * The torso ellipse seen from above: half its depth front to back, and half
 * its width side to side. The width is the shoulders' own half-width, which is
 * what a resting hand hangs beside — see `HAND_HANG_LATERAL_PX`.
 */
export const TORSO_HALF_DEPTH_PX = 3.6;
export const TORSO_HALF_WIDTH_PX = 5.6;

export interface DrawOptions {
  /** Draw the near-black outline around every body part. Default true. */
  outline?: boolean;
  /** Draw the shadow under the torso. Default true. */
  shadow?: boolean;
  /** Snap each drawn point to a whole px — the `aa: false` look. Default identity. */
  snap?: (v: Vec2) => Vec2;
  /** Which of this dancer's hands are joined, and how they stack. */
  stack?: { L: HandStack; R: HandStack };
}

const IDENTITY = (v: Vec2): Vec2 => v;
const FREE_STACK: { L: HandStack; R: HandStack } = { L: "free", R: "free" };

/**
 * Draw one dancer, in the contract's order: shadow, feet, skirt, torso, arms,
 * then the head.
 *
 * The scene renderer does not call this — it interleaves the passes across
 * dancers so that arms sit over every torso and heads over every arm — but for
 * a lone dancer the pixels are identical, and a story or a fixture that only
 * has one person can say what it means in one call.
 */
export function drawPerson(
  g: Ctx2D,
  person: Person,
  pose: PoseSample,
  arms: ArmPair,
  opts: DrawOptions = {},
): void {
  const layout = layoutDancer({ person, pose }, 0, opts.snap ?? q256Vec2);
  const withArms: DancerLayout = { ...layout, arms };
  drawBody(g, withArms, opts);
  drawArms(g, withArms, opts);
  drawHead(g, withArms, opts);
}

/**
 * Everything below the shoulders that is not an arm: the shadow, both feet,
 * the skirt, the torso and its highlight, in that order.
 */
export function drawBody(g: Ctx2D, layout: DancerLayout, opts: DrawOptions = {}): void {
  const snap = opts.snap ?? IDENTITY;
  const a = layout.person.appearance;
  const p = snap(layout.p);
  const angle = layout.torsoAngle;
  const rad = (angle * Math.PI) / 180;
  const flare = layout.pose.flare;
  const outline = opts.outline ?? true;

  if (opts.shadow ?? true) {
    const q = bodyPoint(p, angle, -0.2, 0);
    ell(
      g,
      q[0] + 1,
      q[1] + 1.3,
      a.skirt ? 6.6 + flare : 4.6,
      a.skirt ? 7 + flare : 6.2,
      rad,
      SHADOW_COLOUR,
      false,
    );
  }

  for (const side of SIDES) {
    const foot = layout.feet[side];
    const q = bodyPoint(p, angle, foot[0], foot[1]);
    ell(g, q[0], q[1], 1.8, 1.1, rad, SHOE_COLOUR, outline);
  }

  if (a.skirt !== undefined && a.skirtDark !== undefined) {
    const q = bodyPoint(p, angle, -0.4, 0);
    ell(g, q[0], q[1], 6.2 + flare, 6.8 + flare, rad, a.skirt, outline);
    ell(g, q[0], q[1], 4.6 + flare * 0.5, 5.2 + flare * 0.5, rad, a.skirtDark, false);
  }

  const lean = layout.pose.lean;
  const t = bodyPoint(p, angle, lean * 0.5, 0);
  ell(g, t[0], t[1], TORSO_HALF_DEPTH_PX, TORSO_HALF_WIDTH_PX, rad, a.shirtDark, outline);
  ell(g, t[0], t[1], 2.5, 4.3, rad, a.shirt, false);
  const hl = bodyPoint(p, angle, lean * 0.5 + 0.6, -1.2);
  ell(g, hl[0], hl[1], 1.2, 2.0, rad, a.shirtLite, false);
}

/**
 * Both arms: upper arm in the shirt colour, forearm and hand in skin. A hand
 * higher off the floor is drawn a little larger and a steeply sloped upper arm
 * a little darker, which is the only depth cue a true overhead view gets.
 *
 * The two segments of one arm are ordered by height, because from directly
 * above the nearer one is the one on top: an arm that hangs puts the elbow
 * below the shoulder and the hand below the elbow, so the **sleeve draws over
 * the forearm**, and an arm that reaches up puts the hand above the elbow, so
 * the forearm draws over the sleeve. Drawing the forearm on top either way —
 * which is what the spike and M3 did — reads as a skin-coloured forearm lying
 * across the shirt, which is gate G1's "the forearm renders _over_ the upper
 * arm which is usually wrong". The outlines are still laid down first, as one
 * silhouette under the whole arm, so neither segment's outline cuts across the
 * other's fill.
 *
 * The robin-over-lark rule between two dancers is `sceneOrder`'s and is
 * untouched (plan AC2).
 */
export function drawArms(g: Ctx2D, layout: DancerLayout, opts: DrawOptions = {}): void {
  const snap = opts.snap ?? IDENTITY;
  const a = layout.person.appearance;
  const stack = opts.stack ?? FREE_STACK;
  const outline = opts.outline ?? true;

  for (const [side, arm] of [
    ["L", layout.arms[0]],
    ["R", layout.arms[1]],
  ] as const) {
    const s = snap(arm.shoulder);
    const e = snap(arm.elbow);
    const h = snap(arm.hand);
    const radius =
      1.25 + 0.35 * (1 + Math.max(-15, arm.handZ) / 15) + HAND_STACK_RADIUS_PX[stack[side]];
    const upperFraction = Math.min(1, Math.hypot(e[0] - s[0], e[1] - s[1]) / UPPER_ARM_PX);

    if (outline) {
      seg(g, s, e, 3.7, OUTLINE_COLOUR);
      seg(g, e, h, 3.2, OUTLINE_COLOUR);
      circ(g, h[0], h[1], radius + 0.7, OUTLINE_COLOUR, false);
    }

    const sleeve = (): void => {
      seg(g, s, e, 2.4, a.shirt);
      if (upperFraction < 0.9) {
        g.globalAlpha = (1 - upperFraction) * 0.4;
        seg(g, s, e, 2.4, OUTLINE_COLOUR);
        g.globalAlpha = 1;
      }
    };
    const forearm = (): void => {
      seg(g, e, h, 1.9, a.skin);
      circ(g, h[0], h[1], radius, a.skin, false);
    };

    if (forearmOverSleeve(arm)) {
      sleeve();
      forearm();
    } else {
      forearm();
      sleeve();
    }
  }
}

/**
 * Whether this arm's forearm is nearer the camera than its upper arm — true
 * when the hand is raised above the elbow, false for a hand that hangs below
 * it. Both heights come straight from `solveArm3d`.
 */
export function forearmOverSleeve(arm: Arm3dSolution): boolean {
  return arm.handZ > arm.elbowZ;
}

/** How far ahead of the body centre the head sits. */
export const HEAD_FORWARD_PX = 0.9;

/**
 * How far the head follows the torso's lean, per px of lean. The spike drew
 * 0.8 and the heads crowded at the balance at gate 3 (`spikes/two-dancers`
 * section 0, gate-3 rulings); M5's balance is judged at gate G1 against 0.5.
 */
export const HEAD_LEAN_FOLLOW = 0.5;

/**
 * The head, turned to `layout.headAngle` independently of the body: hair behind
 * (or a bun, or curls, or a cap), the skull, a face sliver clipped inside it,
 * and a nose that says which way the dancer is looking.
 */
export function drawHead(g: Ctx2D, layout: DancerLayout, opts: DrawOptions = {}): void {
  const snap = opts.snap ?? IDENTITY;
  const a = layout.person.appearance;
  const outline = opts.outline ?? true;
  const p = snap(layout.p);
  const centre = snap(
    bodyPoint(p, layout.pose.facing, HEAD_FORWARD_PX + layout.pose.lean * HEAD_LEAN_FOLLOW, 0),
  );
  const look = layout.headAngle;
  const lookRad = (look * Math.PI) / 180;
  const style = a.hairStyle;
  const r = style === "bob" || style === "curly" ? 3.2 : 2.9;
  const crown = style === "bald" ? a.skin : style === "cap" ? a.cap : a.hair;

  if (style === "long") {
    const q = bodyPoint(centre, look, -2.8, 0);
    ell(g, q[0], q[1], 2.6, 2.1, lookRad, a.hairDark, outline);
  }
  if (style === "bun") {
    const q = bodyPoint(centre, look, -2.9, 0);
    circ(g, q[0], q[1], 1.4, a.hairDark, outline);
  }
  if (style === "curly") {
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * TAU;
      circ(g, centre[0] + Math.cos(t) * 2.5, centre[1] + Math.sin(t) * 2.5, 1.2, a.hair, outline);
    }
  }
  circ(g, centre[0], centre[1], r, crown, outline);

  g.save();
  g.beginPath();
  g.arc(centre[0], centre[1], r, 0, TAU);
  g.clip();
  if (style === "bald") {
    const q = bodyPoint(centre, look, -1.3, 0);
    circ(g, q[0], q[1], r, a.hair, false);
    const q2 = bodyPoint(centre, look, 0.3, 0);
    circ(g, q2[0], q2[1], r - 0.7, a.skin, false);
  }
  if (style !== "cap") {
    const q = bodyPoint(centre, look, style === "bald" ? 2.1 : 1.5, 0);
    circ(g, q[0], q[1], r, a.skin, false);
  }
  if (style !== "bald") {
    const q = bodyPoint(centre, look, -0.2, -0.7);
    ell(g, q[0], q[1], 1.3, 0.9, lookRad, style === "cap" ? shade(a.cap, 1.25) : a.hairLite, false);
  }
  g.restore();

  if (style === "cap") {
    const q = bodyPoint(centre, look, 2.8, 0);
    ell(g, q[0], q[1], 1.4, 2.8, lookRad, a.capDark, outline);
  }
  const nose = bodyPoint(centre, look, r + 0.3, 0);
  circ(g, nose[0], nose[1], 0.7, a.skin, outline);
}

const SIDES = ["L", "R"] as const;
