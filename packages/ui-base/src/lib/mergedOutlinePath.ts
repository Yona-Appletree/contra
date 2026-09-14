/**
 * Merged-outline geometry: the union of axis-aligned rects as one rounded SVG
 * path.
 *
 * This is the core of the "contiguous popover" chrome: the popover's trigger
 * and its panel are plain DOM elements with no border or background of their
 * own; one SVG path — the union of their rects, every corner rounded — draws
 * the shared fill, border and shadow. Convex and concave corners use the same
 * arc construction (the sweep flag flips with the turn direction), so the
 * concave fillets where trigger meets panel are not a special case.
 *
 * Pure geometry: no DOM, unit-tested. Ported from lightplayer's
 * `lp-app/lpa-studio-web/src/base/outline.rs`, which was itself ported from
 * the `spikes/contiguous-popup/index.html` spike; technique write-up:
 * https://lab.photomancer.art/post/2026-07-15-contiguous-popup/
 */

/** One participating rectangle, in viewport CSS pixels. */
export interface OutlineRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A vertex of a union loop, in viewport CSS pixels. */
export type OutlinePoint = readonly [x: number, y: number];

/** Degenerate-rect / collinearity epsilon. */
const EPS = 1e-4;

/**
 * Coordinates closer than this are welded onto one grid line. Deliberately
 * generous: edges that ALMOST line up (sub-1.5px steps from layout rounding)
 * would otherwise render as hairline jogs in the outline.
 */
const COORD_TOL = 1.25;

/**
 * Union of `rects` as one SVG path string (the consumer draws it with
 * `fill-rule: evenodd`), every corner rounded with `radius` — clamped per
 * vertex, so short segments shrink their corners instead of self-intersecting
 * — and coordinates snapped to device pixels for `dpr` so 1px strokes stay
 * crisp.
 *
 * Returns an empty string when no non-degenerate rect is given.
 */
export function mergedOutlinePath(
  rects: readonly OutlineRect[],
  radius: number,
  dpr: number,
): string {
  return roundedPath(unionLoops(rects.map((rect) => snapRect(rect, dpr))), radius);
}

/** Grow (positive `by`) or shrink a rect on all sides. */
export function inflateRect(rect: OutlineRect, by: number): OutlineRect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by };
}

function snap(value: number, dpr: number): number {
  const d = dpr > EPS ? dpr : 1;
  const snapped = Math.round(value * d) / d;
  // At dpr 1 an integer-aligned 1px stroke straddles two pixels; center it.
  return Math.abs(d - 1) < EPS ? snapped + 0.5 : snapped;
}

/** A rect with all four edges on the device-pixel grid for `dpr`. */
export function snapRect(rect: OutlineRect, dpr: number): OutlineRect {
  const x = snap(rect.x, dpr);
  const y = snap(rect.y, dpr);
  return {
    x,
    y,
    w: snap(rect.x + rect.w, dpr) - x,
    h: snap(rect.y + rect.h, dpr) - y,
  };
}

/** Sorted values collapsed so entries within `tol` weld onto the first of their cluster. */
function dedupeSorted(sorted: readonly number[], tol: number): number[] {
  const out: number[] = [];
  for (const value of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && value - last <= tol) continue;
    out.push(value);
  }
  return out;
}

/** Key a point for the adjacency map, at the same 1/100 px tolerance the Rust port uses. */
const pointKey = (point: OutlinePoint): string =>
  `${String(Math.round(point[0] * 100))}|${String(Math.round(point[1] * 100))}`;

/**
 * The union of axis-aligned rects as closed rectilinear loops.
 *
 * Grid method: the distinct edge coordinates form a small grid; cells covered
 * by any rect are marked; boundary edges (where coverage flips) are chained
 * into loops; collinear midpoints are dropped. For the two or three rects of a
 * popover the grid is a handful of cells.
 */
export function unionLoops(input: readonly OutlineRect[]): OutlinePoint[][] {
  const rects = input.filter((rect) => rect.w > EPS && rect.h > EPS);
  if (rects.length === 0) return [];

  const xs = dedupeSorted(
    rects.flatMap((rect) => [rect.x, rect.x + rect.w]).sort((a, b) => a - b),
    COORD_TOL,
  );
  const ys = dedupeSorted(
    rects.flatMap((rect) => [rect.y, rect.y + rect.h]).sort((a, b) => a - b),
    COORD_TOL,
  );
  const nx = xs.length - 1;
  const ny = ys.length - 1;

  const cov: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    const column: boolean[] = [];
    for (let j = 0; j < ny; j++) {
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      column.push(
        rects.some(
          (rect) => cx > rect.x && cx < rect.x + rect.w && cy > rect.y && cy < rect.y + rect.h,
        ),
      );
    }
    cov.push(column);
  }
  const covered = (i: number, j: number): boolean =>
    i < 0 || j < 0 || i >= nx || j >= ny ? false : cov[i]![j]!;

  // Boundary segments: grid edges where coverage flips.
  const segs: [OutlinePoint, OutlinePoint][] = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (covered(i - 1, j) !== covered(i, j)) {
        segs.push([
          [xs[i]!, ys[j]!],
          [xs[i]!, ys[j + 1]!],
        ]);
      }
    }
  }
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (covered(i, j - 1) !== covered(i, j)) {
        segs.push([
          [xs[i]!, ys[j]!],
          [xs[i + 1]!, ys[j]!],
        ]);
      }
    }
  }

  // Chain segments into closed loops.
  const adjacency = new Map<string, number[]>();
  segs.forEach((seg, index) => {
    for (const end of seg) {
      const key = pointKey(end);
      const list = adjacency.get(key);
      if (list) list.push(index);
      else adjacency.set(key, [index]);
    }
  });

  const used = segs.map(() => false);
  const loops: OutlinePoint[][] = [];
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const lp: OutlinePoint[] = [segs[start]![0], segs[start]![1]];
    for (;;) {
      const cur = lp[lp.length - 1]!;
      const prev = lp[lp.length - 2]!;
      const key = pointKey(cur);
      const candidates = (adjacency.get(key) ?? []).filter((index) => !used[index]);
      const first = candidates[0];
      if (first === undefined) break;
      // At degree-4 junctions (two rects touching corner to corner) prefer a
      // turning continuation over crossing straight through.
      let pick = first;
      if (candidates.length > 1) {
        const dinX = cur[0] - prev[0];
        const dinY = cur[1] - prev[1];
        pick =
          candidates.find((index) => {
            const seg = segs[index]!;
            const other = pointKey(seg[0]) === key ? seg[1] : seg[0];
            const doutX = other[0] - cur[0];
            const doutY = other[1] - cur[1];
            return Math.abs(dinX * doutY - dinY * doutX) > EPS;
          }) ?? first;
      }
      used[pick] = true;
      const seg = segs[pick]!;
      const next = pointKey(seg[0]) === key ? seg[1] : seg[0];
      if (pointKey(next) === pointKey(lp[0]!)) break;
      lp.push(next);
    }

    // Drop collinear midpoints (merges runs of grid edges).
    const n = lp.length;
    const simplified = lp.filter((b, i) => {
      const a = lp[(i + n - 1) % n]!;
      const c = lp[(i + 1) % n]!;
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      return Math.abs(cross) > EPS;
    });
    if (simplified.length >= 3) loops.push(simplified);
  }
  return loops;
}

/**
 * Loops to an SVG path string with rounded corners.
 *
 * At every vertex both adjacent segments are trimmed by the (clamped) radius
 * and joined with an arc whose sweep follows the turn direction — in screen
 * coordinates (y down), `cross > 0` is a clockwise turn, sweep flag 1.
 */
export function roundedPath(loops: readonly OutlinePoint[][], radius: number): string {
  let d = "";
  for (const pts of loops) {
    const n = pts.length;
    const clamped = pts.map((p, i) => {
      const a = pts[(i + n - 1) % n]!;
      const c = pts[(i + 1) % n]!;
      const lp = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const ln = Math.hypot(c[0] - p[0], c[1] - p[1]);
      return Math.max(0, Math.min(radius, lp / 2, ln / 2));
    });
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const a = pts[(i + n - 1) % n]!;
      const c = pts[(i + 1) % n]!;
      const lin = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const lout = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (lin < EPS || lout < EPS) continue;
      const dinX = (p[0] - a[0]) / lin;
      const dinY = (p[1] - a[1]) / lin;
      const doutX = (c[0] - p[0]) / lout;
      const doutY = (c[1] - p[1]) / lout;
      const r = clamped[i]!;
      const p1x = p[0] - dinX * r;
      const p1y = p[1] - dinY * r;
      const p2x = p[0] + doutX * r;
      const p2y = p[1] + doutY * r;
      const sweep = dinX * doutY - dinY * doutX > 0 ? 1 : 0;
      d += `${i === 0 ? "M" : "L"}${fmt(p1x)} ${fmt(p1y)}`;
      if (r > 0.05) {
        d += `A${fmt(r)} ${fmt(r)} 0 0 ${String(sweep)} ${fmt(p2x)} ${fmt(p2y)}`;
      }
    }
    d += "Z";
  }
  return d;
}

/** Two decimals; `String` already drops a whole number's trailing `.0`. */
const fmt = (value: number): string => String(Math.round(value * 100) / 100);
