import { ARM_REACH_PX, FOREARM_PX, UPPER_ARM_PX, leftOf, rightOf } from "@caller/core";
import type { Hand } from "../ir/Hold.js";
import { add, len, scale, sub, type Vec3 } from "../motion/Vec3.js";

/**
 * The two-bone arm in three dimensions: given where the shoulder is and where
 * the hand has to be, where is the elbow?
 *
 * Both bones are fixed (`UPPER_ARM_PX`, `FOREARM_PX` — 7.5 px each, the
 * rendering contract), so the elbow lies on a circle: centre on the
 * shoulder–hand segment, radius `h = √(7.5² − (|SH|/2)²)`, in the plane
 * perpendicular to the segment. Which point of that circle is the only free
 * choice, and it is the hold's, not the solver's: the reference direction is
 * **down** (the projection of −z onto the circle's plane) and `swivelDeg`
 * turns the elbow off it toward the body's own outward side — `side` says
 * which side that is, so a positive swivel means "a tiny bit out" on either
 * arm and the left arm is the right one mirrored without anything having to
 * negate an angle.
 *
 * A hand further away than `ARM_REACH_PX` is **reported**, never quietly
 * pulled in: the elbow goes on the straight shoulder–hand line, where the
 * over-stretch is visible, and `reach` says by how much.
 */
export const solveArm = (
  shoulder: Vec3,
  hand: Vec3,
  swivelDeg: number,
  side: Hand,
  yawDeg: number,
): SolvedArm => {
  const sh = sub(hand, shoulder);
  const d = len(sh);

  // The hand is all but on top of the shoulder: there is no segment to build a
  // frame from, and the arm simply hangs.
  if (d < DEGENERATE_PX) {
    return { elbow: { x: shoulder.x, y: shoulder.y, z: shoulder.z - UPPER_ARM_PX } };
  }

  const u = scale(sh, 1 / d);

  if (d > ARM_REACH_PX) {
    return {
      elbow: add(shoulder, scale(u, UPPER_ARM_PX)),
      reach: { distancePx: d, reachPx: ARM_REACH_PX },
    };
  }

  // Where on the segment the circle's plane cuts it, and how wide the circle
  // is there. The bones are equal under the contract, so `along` is `d / 2`;
  // the general form is written out so the arithmetic stays true if a future
  // body ever has a longer upper arm than forearm.
  const along = (d * d + UPPER_ARM_PX * UPPER_ARM_PX - FOREARM_PX * FOREARM_PX) / (2 * d);
  const m = add(shoulder, scale(u, along));
  const h = Math.sqrt(Math.max(0, UPPER_ARM_PX * UPPER_ARM_PX - along * along));

  const outward = lateralOfYaw(yawDeg, side);
  const e1 = poleDirection(u, outward);
  // A quarter turn from the pole about the shoulder–hand axis, handed by the
  // side rather than chosen by comparing against `outward`: (e1, e2, u) is
  // right-handed, which puts `+cross` outward for the right arm and inward for
  // the left. A sign is continuous everywhere; a comparison is not, and an arm
  // reaching straight out to its own side would flap.
  const e2 = scale(cross(u, e1), side === "right" ? 1 : -1);
  const theta = (swivelDeg * Math.PI) / 180;
  const offset = add(scale(e1, h * Math.cos(theta)), scale(e2, h * Math.sin(theta)));
  return { elbow: add(m, offset) };
};

/** Where the elbow went, and whether the hand was further off than the arm reaches. */
export interface SolvedArm {
  elbow: Vec3;
  /** Present only when `|SH| > ARM_REACH_PX`. The caller turns it into a violation. */
  reach?: ReachOverrun;
}

/** A hand the arm cannot get to: how far it is, and how far the arm reaches. */
export interface ReachOverrun {
  distancePx: number;
  reachPx: number;
}

/** Below this shoulder-to-hand distance the shoulder–hand frame is meaningless. */
const DEGENERATE_PX = 0.5;

/**
 * How near vertical an arm has to get before the pole starts blending away
 * from world down, as the sine of the angle off vertical: 30°.
 */
const VERTICAL_BLEND_SIN = 0.5;

const unit = (v: Vec3, fallback: Vec3): Vec3 => {
  const m = len(v);
  return m < 1e-9 ? fallback : scale(v, 1 / m);
};

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The component of a vector perpendicular to the unit axis `u`. */
const perp = (v: Vec3, u: Vec3): Vec3 => sub(v, scale(u, dot(v, u)));

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** The flat unit vector out of `side` of a body yawed `yawDeg`. */
const lateralOfYaw = (yawDeg: number, side: Hand): Vec3 => {
  const v = side === "right" ? rightOf(yawDeg) : leftOf(yawDeg);
  return { x: v[0], y: v[1], z: 0 };
};

/**
 * The elbow's reference direction on its circle: "down", meaning −z projected
 * into the circle's plane.
 *
 * A **hanging** arm has no such direction — the projection is the vanishing
 * residue of a vector nearly parallel to the axis, so it points wherever the
 * last rounding error put it and swings right round for a hand that has barely
 * moved. That is not a hypothetical: the free hang is 14.5 px of a 15 px arm,
 * within a degree of vertical, and taking hands out of it whipped the elbow
 * past its cap. Over the last 30° of vertical the pole therefore blends into
 * the body's own outward side, which is always well defined and turns only as
 * fast as the dancer does — and the band is wide rather than tight on purpose,
 * so the pole does its turning while the elbow circle is still small and the
 * turn costs nothing. The circle is barely 2 px wide at the hang, so what this
 * trades away is invisible and what it buys is a continuous elbow.
 */
const poleDirection = (u: Vec3, outward: Vec3): Vec3 => {
  const down = perp({ x: 0, y: 0, z: -1 }, u);
  const side = perp(outward, u);
  const k = Math.min(1, len(down) / VERTICAL_BLEND_SIN);
  const blend = k * k * (3 - 2 * k);
  if (blend >= 1) return unit(down, side);
  const a = unit(down, side);
  const b = unit(side, { x: 1, y: 0, z: 0 });
  return unit(add(scale(a, blend), scale(b, 1 - blend)), b);
};

/** The two bone lengths of a solved arm, for the contract's tests. */
export const boneLengths = (shoulder: Vec3, elbow: Vec3, hand: Vec3): [number, number] => [
  len(sub(elbow, shoulder)),
  len(sub(hand, elbow)),
];

/** The nominal bone lengths, from the rendering contract. */
export const BONES_PX: readonly [number, number] = [UPPER_ARM_PX, FOREARM_PX];
