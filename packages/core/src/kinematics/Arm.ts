import type { Angle } from "../geometry/Angle.js";
import { leftOf, rightOf } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";
import type { Hand, Side } from "./PoseSample.js";
import { ARM_REACH_PX, FOREARM_PX, UPPER_ARM_PX } from "./RenderingContract.js";

/**
 * An arm, projected onto the floor — what the renderer draws.
 *
 * `short` is how many px the hand target was out of reach. The inviolable
 * invariant of the project is that a hand is never drawn where the arm cannot
 * reach, so `short > 0` means the figure asked for something impossible and
 * the arm is pointing at it instead.
 */
export interface ArmSolution {
  shoulder: Vec2;
  elbow: Vec2;
  hand: Vec2;
  short: number;
}

/**
 * The same solution before projection: heights are px below shoulder height,
 * so they are negative going down. The renderer shades by hand and elbow
 * height, and the bone-length invariant is only checkable in three dimensions.
 */
export interface Arm3dSolution extends ArmSolution {
  /** Elbow height relative to the shoulder, in px (negative is below). */
  elbowZ: number;
  /** Hand height relative to the shoulder, in px (negative is below). */
  handZ: number;
  /** Planar reach available at `handZ`. */
  reach: number;
}

/**
 * How far, on the floor, a straight arm can put a hand that is `drop` px below
 * the shoulder: `sqrt(15² − drop²)`, or 0 once the drop exceeds the reach.
 */
export const planarReach = (drop: number): number =>
  Math.sqrt(Math.max(0, ARM_REACH_PX * ARM_REACH_PX - drop * drop));

/**
 * Two-bone IK in three dimensions, then projected onto the floor.
 *
 * The shoulder is at height 0 by contract and the hand target at `−drop`. Both
 * bones keep their true 7.5 px length in three dimensions; the elbow is placed
 * by two-bone IK with a pole pointing down and outward (away from the body on
 * this dancer's side). A planar arm therefore never exceeds 15 px and shortens
 * by itself as it slopes down, so hands only meet when the dancers are close
 * enough.
 *
 * When the target is out of 3D reach the whole target vector is scaled back to
 * 15 px — direction in three dimensions is preserved, so the returned hand lies
 * on the floor segment from the shoulder toward the target, and its drop
 * shrinks with everything else. `short` reports the shortfall in px.
 *
 * @param shoulder the shoulder's floor point; it is at height z = 0 by contract
 * @param hand the target
 * @param side which arm, which fixes the elbow pole's outward direction
 * @param facing the body's facing in degrees (use the swayed torso angle when
 *   the renderer applies sway)
 */
export function solveArm(shoulder: Vec2, hand: Hand, side: Side, facing: Angle): ArmSolution {
  const { shoulder: s, elbow, hand: h, short } = solveArm3d(shoulder, hand, side, facing);
  return { shoulder: s, elbow, hand: h, short };
}

/**
 * How far out to the side the default elbow pole leans, against a downward
 * component of 1. Only the direction matters, but the ratio is what decides how
 * far round the elbow swings for an arm that is neither straight down nor
 * straight out.
 */
export const POLE_OUTWARD = 0.55;

/**
 * {@link solveArm} keeping the heights the renderer shades by.
 *
 * `poleXY` overrides the floor-plane part of the elbow pole, which is
 * `outward × {@link POLE_OUTWARD}` by default. A near-vertical arm has the
 * pole's downward part cancelled by the shoulder-hand line, so whatever is left
 * in the floor plane is the whole of it and the elbow swings all the way there:
 * that is why a renderer that wants a hanging arm's elbow tucked behind the
 * body rather than winged out to the side has to say so here. The default is
 * unchanged, and nothing in `core` passes one.
 */
export function solveArm3d(
  shoulder: Vec2,
  hand: Hand,
  side: Side,
  facing: Angle,
  poleXY?: Vec2,
): Arm3dSolution {
  const outward = side === "L" ? leftOf(facing) : rightOf(facing);
  const pole: Vec2 = poleXY ?? [outward[0] * POLE_OUTWARD, outward[1] * POLE_OUTWARD];
  const poleLen = Math.hypot(pole[0], pole[1]) || 1;
  const poleDir: Vec2 = [pole[0] / poleLen, pole[1] / poleLen];
  const l1 = UPPER_ARM_PX;
  const l2 = FOREARM_PX;
  const total = l1 + l2;
  const hz = -Math.max(0, hand.drop);

  let vx = hand.p[0] - shoulder[0];
  let vy = hand.p[1] - shoulder[1];
  let vz = hz;
  let d = Math.hypot(vx, vy, vz);
  const d0 = d;
  let hx = hand.p[0];
  let hy = hand.p[1];
  let short = 0;
  if (d > total) {
    const k = total / d;
    vx *= k;
    vy *= k;
    vz *= k;
    hx = shoulder[0] + vx;
    hy = shoulder[1] + vy;
    short = d0 - total;
    d = total;
  }
  // Reach is reported for the drop that was asked for, not the clamped one.
  const reach = planarReach(-hz);

  if (d < DEGENERATE_PX) {
    // Hand effectively at the shoulder: any elbow 7.5 px from the shoulder
    // satisfies both bones. Take the pole direction, down and a little out.
    const pl = Math.hypot(0.5, l1);
    return {
      shoulder,
      elbow: [
        shoulder[0] + (poleDir[0] * 0.5 * l1) / pl,
        shoulder[1] + (poleDir[1] * 0.5 * l1) / pl,
      ],
      hand: [hx, hy],
      short,
      elbowZ: (-l1 * l1) / pl,
      handZ: vz,
      reach,
    };
  }

  const ux = vx / d;
  const uy = vy / d;
  const uz = vz / d;
  // Distance along the shoulder-hand line to the foot of the elbow, and the
  // elbow's offset perpendicular to it.
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));

  // Pole: down and (by default) outward, made perpendicular to the
  // shoulder-hand line.
  let px = pole[0];
  let py = pole[1];
  let pz = -1.0;
  let dot = px * ux + py * uy + pz * uz;
  px -= dot * ux;
  py -= dot * uy;
  pz -= dot * uz;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) {
    // The arm points straight down the pole; fall back to the pole's own
    // floor-plane direction.
    px = poleDir[0];
    py = poleDir[1];
    pz = 0;
    dot = px * ux + py * uy;
    px -= dot * ux;
    py -= dot * uy;
    pz -= dot * uz;
    pl = Math.hypot(px, py, pz) || 1;
  }
  px /= pl;
  py /= pl;
  pz /= pl;

  return {
    shoulder,
    elbow: [shoulder[0] + ux * a + px * hh, shoulder[1] + uy * a + py * hh],
    hand: [hx, hy],
    short,
    elbowZ: uz * a + pz * hh,
    handZ: vz,
    reach,
  };
}

/** Below this 3D shoulder-to-hand distance the IK is degenerate. */
const DEGENERATE_PX = 0.05;
