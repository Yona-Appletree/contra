import { describe, expect, it } from "vitest";
import {
  inflateRect,
  mergedOutlinePath,
  type OutlineRect,
  roundedPath,
  snapRect,
  unionLoops,
} from "./mergedOutlinePath.js";

// The eight cases from lightplayer's `base/outline.rs` test module, ported
// one for one, plus one more for the seam overlap the popover actually draws.

const rect = (x: number, y: number, w: number, h: number): OutlineRect => ({ x, y, w, h });

/** The sweep flag of every arc in a path string, in order. */
function sweeps(d: string): number[] {
  return d
    .split("A")
    .slice(1)
    .map((arc) => {
      // "rx ry 0 0 sweep x y…" — the sweep is the fifth field.
      const field = arc.split(/\s+/)[4];
      expect(field, `arc sweep field in ${d}`).toBeDefined();
      return Number(field);
    });
}

describe("mergedOutlinePath", () => {
  it("draws a single rect as one loop of four corners", () => {
    const loops = unionLoops([rect(0, 0, 100, 50)]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);

    const d = mergedOutlinePath([rect(0, 0, 100, 50)], 8, 2);
    const flags = sweeps(d);
    expect(flags).toHaveLength(4);
    expect(new Set(flags), `uniform turn direction on a plain rect: ${d}`).toEqual(
      new Set([flags[0]]),
    );
  });

  it("gives a trigger plus a wider panel exactly two concave corners", () => {
    // Trigger 40..90 x 10..40; the panel overlaps its bottom edge by 1px and
    // is wider on both sides — the classic contiguous-popover shape.
    const trigger = rect(40, 10, 50, 30);
    const panel = rect(10, 39, 200, 80);
    const loops = unionLoops([trigger, panel]);
    expect(loops, "overlapping rects merge into one loop").toHaveLength(1);
    expect(loops[0], "4 convex panel + 2 convex trigger + 2 concave").toHaveLength(8);

    const d = mergedOutlinePath([trigger, panel], 8, 2);
    const flags = sweeps(d);
    expect(flags).toHaveLength(8);
    const ones = flags.filter((flag) => flag === 1).length;
    expect(Math.min(ones, flags.length - ones), `exactly two concave fillets: ${d}`).toBe(2);
  });

  it("welds a sub-tolerance step away", () => {
    // Two rects whose bottom edges differ by 1px (< COORD_TOL): the step must
    // weld, giving the same vertex count as perfect alignment.
    const aligned = unionLoops([rect(0, 0, 50, 40), rect(50, 0, 50, 40)]);
    const stepped = unionLoops([rect(0, 0, 50, 40), rect(50, 0, 50, 41)]);
    expect(aligned).toHaveLength(1);
    expect(stepped).toHaveLength(1);
    expect(stepped[0], "a 1px step should weld onto one grid line").toHaveLength(
      aligned[0]!.length,
    );
    expect(aligned[0]).toHaveLength(4);
  });

  it("clamps the radius on short segments", () => {
    // A 10px-tall rect with radius 8: the vertical segments allow at most r=5.
    const d = roundedPath(unionLoops([rect(0, 0, 100, 10)]), 8);
    expect(d, `clamped to half the short edge: ${d}`).toContain("A5 5 0");
    expect(d, `the unclamped radius must not appear: ${d}`).not.toContain("A8 8 0");
  });

  it("draws disjoint rects as separate subpaths", () => {
    const d = mergedOutlinePath([rect(0, 0, 40, 40), rect(100, 100, 40, 40)], 8, 2);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it("ignores degenerate input", () => {
    expect(mergedOutlinePath([], 8, 2)).toBe("");
    expect(mergedOutlinePath([rect(10, 10, 0, 50)], 8, 2)).toBe("");
    // A degenerate rect alongside a real one changes nothing.
    const alone = mergedOutlinePath([rect(0, 0, 50, 50)], 8, 2);
    const withDegenerate = mergedOutlinePath([rect(0, 0, 50, 50), rect(10, 10, 0, 0)], 8, 2);
    expect(withDegenerate).toBe(alone);
  });

  it("snaps onto device pixels", () => {
    // dpr 2: coordinates snap to halves.
    const r2 = snapRect(rect(10.3, 20.6, 100.2, 50.4), 2);
    for (const v of [r2.x, r2.y, r2.x + r2.w, r2.y + r2.h]) {
      expect(Math.abs(v * 2 - Math.round(v * 2)), `${String(v)} not on a half-pixel`).toBeLessThan(
        1e-9,
      );
    }
    // dpr 1: edges sit on x.5 so a 1px stroke fills one pixel row.
    const r1 = snapRect(rect(10.3, 20.6, 100.2, 50.4), 1);
    for (const v of [r1.x, r1.y, r1.x + r1.w, r1.y + r1.h]) {
      expect(Math.abs(v - Math.trunc(v) - 0.5), `${String(v)} not on x.5`).toBeLessThan(1e-9);
    }
  });

  it("inflates symmetrically", () => {
    expect(inflateRect(rect(10, 20, 30, 40), 3)).toEqual(rect(7, 17, 36, 46));
  });

  it("merges a panel welded to one trigger edge without a concave corner on that side", () => {
    // The `snap_to_trigger_edges` case: the panel's right edge lands exactly
    // on the trigger's, so that side is one straight run and only the other
    // side gets a fillet — six vertices, not eight.
    const trigger = rect(150, 10, 40, 30);
    const panel = rect(30, 39, 160, 90);
    const loops = unionLoops([trigger, panel]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });
});
