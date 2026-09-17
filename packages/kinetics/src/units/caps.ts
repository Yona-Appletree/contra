import type { PointName } from "../body/Body.js";
import { pxPerBeat, pxPerBeat2, type Tempo } from "./Tempo.js";

/** A point's speed and acceleration ceiling, in physical units. */
export interface PointCap {
  /** Maximum speed, cm/s. */
  speedCmPerS: number;
  /** Maximum acceleration, cm/s². */
  accelCmPerS2: number;
}

// Physical constants, never derived from any library; tuned only at a gate
// against the plots. The table is `notes.md` §Q4, verbatim.
export const CAPS: Readonly<Record<PointName, PointCap>> = {
  hip: { speedCmPerS: 140, accelCmPerS2: 250 },
  footL: { speedCmPerS: 300, accelCmPerS2: 1200 },
  footR: { speedCmPerS: 300, accelCmPerS2: 1200 },
  handL: { speedCmPerS: 220, accelCmPerS2: 900 },
  handR: { speedCmPerS: 220, accelCmPerS2: 900 },
  shoulderL: { speedCmPerS: 170, accelCmPerS2: 350 },
  shoulderR: { speedCmPerS: 170, accelCmPerS2: 350 },
  elbowL: { speedCmPerS: 200, accelCmPerS2: 800 },
  elbowR: { speedCmPerS: 200, accelCmPerS2: 800 },
  head: { speedCmPerS: 170, accelCmPerS2: 350 },
};

/** Caps on the scalar channels: yaw (facing), lean and look, all per second/second². */
export const ANGULAR_CAPS = {
  /** Facing's maximum turn rate, deg/s. */
  yawDegPerS: 400,
  /** Facing's maximum angular acceleration, deg/s². */
  yawAccelDegPerS2: 2000,
  /** Lean's maximum amplitude, degrees off vertical. */
  leanDeg: 15,
  /** Lean's maximum rate, deg/s. */
  leanDegPerS: 60,
  /** Look's maximum yaw off the torso, degrees. */
  lookDeg: 70,
  /** Look's maximum rate, deg/s. */
  lookDegPerS: 300,
} as const;

/** A point's cap converted to the executor's and the proof's units, px/beat and px/beat². */
export interface CapAtTempo {
  /** Maximum speed, px/beat. */
  speedPxPerBeat: number;
  /** Maximum acceleration, px/beat². */
  accelPxPerBeat2: number;
}

/** {@link CAPS} converted to `t`'s tempo and world scale. */
export const capsAtTempo = (t: Tempo): Readonly<Record<PointName, CapAtTempo>> => {
  const out = {} as Record<PointName, CapAtTempo>;
  for (const point of Object.keys(CAPS) as PointName[]) {
    const cap = CAPS[point];
    out[point] = {
      speedPxPerBeat: pxPerBeat(t, cap.speedCmPerS),
      accelPxPerBeat2: pxPerBeat2(t, cap.accelCmPerS2),
    };
  }
  return out;
};
