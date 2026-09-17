import type { Vec3 } from "../src/motion/Vec3.js";

/**
 * The debugger's own orthographic camera — a dozen lines instead of three.js
 * (DA13).
 *
 * World axes: x across, y **down**, z up, in px at 4 cm/px. The camera orbits
 * the vertical (z) axis by `yawDeg` and rises above the floor by `pitchDeg`,
 * and screen-up is chosen so that looking straight down (pitch 90°) puts
 * world +y at the bottom of the screen — the same way round as the pixel pane,
 * so tilting between the two views never flips the floor.
 */
export interface Camera {
  yawDeg: number;
  /** Elevation above the floor plane: 0 is eye level, 90 is straight down. */
  pitchDeg: number;
  /** Screen px per world px. */
  scale: number;
  /** The world point at the centre of the canvas. */
  centre: Vec3;
  /** Canvas size, in screen px. */
  width: number;
  height: number;
}

/** A world point on the screen, with how far from the camera it is. */
export interface Projected {
  x: number;
  y: number;
  /** Larger is further away: draw descending, so the near body is drawn last. */
  depth: number;
}

export const project = (cam: Camera, p: Vec3): Projected => {
  const dx = p.x - cam.centre.x;
  const dy = p.y - cam.centre.y;
  const dz = p.z - cam.centre.z;
  const yaw = (cam.yawDeg * Math.PI) / 180;
  const pitch = (cam.pitchDeg * Math.PI) / 180;
  const cx = dx * Math.cos(yaw) + dy * Math.sin(yaw);
  const cy = -dx * Math.sin(yaw) + dy * Math.cos(yaw);
  return {
    x: cam.width / 2 + cx * cam.scale,
    y: cam.height / 2 + (cy * Math.sin(pitch) - dz * Math.cos(pitch)) * cam.scale,
    depth: -cy * Math.cos(pitch) - dz * Math.sin(pitch),
  };
};

/** The axis-aligned box a list of world points sits in. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export const boundsOf = (points: Iterable<Vec3>, pad = 0): Bounds => {
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  let any = false;
  for (const p of points) {
    any = true;
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  if (!any) return { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 0 } };
  return {
    min: { x: min.x - pad, y: min.y - pad, z: min.z },
    max: { x: max.x + pad, y: max.y + pad, z: max.z },
  };
};

export const centreOf = (b: Bounds): Vec3 => ({
  x: (b.min.x + b.max.x) / 2,
  y: (b.min.y + b.max.y) / 2,
  z: (b.min.z + b.max.z) / 2,
});
