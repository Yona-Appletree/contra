import type { Vec2 } from "@caller/core";
import type { World } from "../renderer/World.js";

/**
 * Two consecutive trail points further apart than this are a jump — a seek, a
 * wrap, or a dancer who just appeared — and start a new stroke instead of
 * drawing a line across the hall.
 */
export const TRAIL_BREAK_PX = 8;

/** How solid a trail is, and how wide. One px, so it reads as a pixel line. */
export const TRAIL_ALPHA = 0.55;
export const TRAIL_WIDTH_PX = 1;

/** What one dancer contributes to the trails layer in one frame. */
export interface TrailUpdate {
  id: string;
  colour: string;
  points: readonly Vec2[];
}

/**
 * The persistent floor-trail layer: where everybody has been since the dance
 * started. It is its own offscreen canvas because it is never redrawn — each
 * frame only appends the step just taken, so a whole dance's worth of trail
 * costs nothing per frame — and because the floor underneath it (M4) is
 * redrawn whenever the hall changes and would otherwise wipe it.
 */
export interface Trails {
  readonly layer: OffscreenCanvas;
  /** Append this frame's segments. */
  add(updates: readonly TrailUpdate[]): void;
  /** Wipe the layer. Called between dances, never within one. */
  clear(): void;
  /** Reallocate for a new world size. Wipes the layer. */
  resize(world: World): void;
}

export function createTrails(world: World): Trails {
  let layer = new OffscreenCanvas(world.w, world.h);
  let g = context(layer);
  let size = { w: world.w, h: world.h };
  const last = new Map<string, Vec2>();

  return {
    get layer() {
      return layer;
    },
    add(updates) {
      g.globalAlpha = TRAIL_ALPHA;
      g.lineWidth = TRAIL_WIDTH_PX;
      for (const u of updates) {
        if (u.points.length === 0) continue;
        g.strokeStyle = u.colour;
        g.beginPath();
        let from = last.get(u.id);
        for (const point of u.points) {
          const x = Math.round(size.w / 2 + point[0]) + 0.5;
          const y = Math.round(size.h / 2 + point[1]) + 0.5;
          if (from !== undefined && distance(from, point) <= TRAIL_BREAK_PX) {
            g.lineTo(x, y);
          } else {
            g.moveTo(x, y);
          }
          from = point;
        }
        g.stroke();
        const end = u.points[u.points.length - 1];
        if (end !== undefined) last.set(u.id, end);
      }
      g.globalAlpha = 1;
    },
    clear() {
      g.clearRect(0, 0, size.w, size.h);
      last.clear();
    },
    resize(next) {
      layer = new OffscreenCanvas(next.w, next.h);
      g = context(layer);
      size = { w: next.w, h: next.h };
      last.clear();
    },
  };
}

/**
 * Split a run of points into the strokes a trail should be drawn as: a jump
 * longer than `breakPx` ends one stroke and starts the next. Exported for the
 * tests, which have no canvas.
 */
export function trailStrokes(
  points: readonly Vec2[],
  from?: Vec2,
  breakPx = TRAIL_BREAK_PX,
): Vec2[][] {
  const strokes: Vec2[][] = [];
  let current: Vec2[] = from === undefined ? [] : [from];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous !== undefined && distance(previous, point) > breakPx) {
      if (current.length > 1) strokes.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 1) strokes.push(current);
  return strokes;
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const g = canvas.getContext("2d");
  if (g === null) throw new Error("hall: no 2D context for the trails layer");
  return g;
}
