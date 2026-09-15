import { describe, expect, it } from "vitest";
import type { Vec2 } from "@caller/core";
import { dist, peakOverAverage } from "@caller/core";
import type { EndPose } from "./FigureDef.js";
import { ringOf, ringWalk } from "./ring.js";
import { walkStep } from "./walkPath.js";

const FROM: EndPose = { p: [0, 0], facing: 0 };
const TO: EndPose = { p: [32, 0], facing: 180 };
const STEP = 1 / 32;

/** The peak of a walk's own body speed over its average, sampled. */
function peakOverAverageOf(at: (t: number) => Vec2, beats: number): number {
  let peak = 0;
  let total = 0;
  let before = at(0);
  for (let i = 1; i <= Math.round(beats / STEP); i++) {
    const now = at(i * STEP);
    const moved = dist(now, before);
    peak = Math.max(peak, moved / STEP);
    total += moved;
    before = now;
  }
  return peak / (total / beats);
}

describe("walkStep: the motion profile (M10)", () => {
  it("defaults to the smoothstep, so every caller before M10 is unchanged", () => {
    for (const t of [0, 0.5, 1, 2, 3.25, 4]) {
      expect(walkStep(FROM, TO, t, 4)).toEqual(walkStep(FROM, TO, t, 4, undefined, "smooth"));
    }
  });

  it("peaks at 3/2 on the smoothstep and 4/3 on the cruise", () => {
    // Bowless, so the whole of the motion is the travel itself.
    const smooth = peakOverAverageOf((t) => walkStep(FROM, TO, t, 4, 0).p, 4);
    const cruise = peakOverAverageOf((t) => walkStep(FROM, TO, t, 4, 0, "cruise").p, 4);
    expect(smooth).toBeCloseTo(peakOverAverage("smooth", 4), 2);
    expect(cruise).toBeCloseTo(peakOverAverage("cruise", 4), 2);
    expect(cruise).toBeLessThan(smooth);
  });

  it("keeps the ends exact and the midpoint at the middle", () => {
    for (const profile of ["smooth", "cruise"] as const) {
      const walk = (t: number) => walkStep(FROM, TO, t, 4, 0, profile);
      expect(walk(0).p).toEqual(FROM.p);
      expect(walk(4).p).toEqual(TO.p);
      expect(walk(-1).p).toEqual(FROM.p);
      expect(walk(5).p).toEqual(TO.p);
      expect(walk(2).p[0]).toBeCloseTo(16, 9);
    }
  });

  it("cruises on a two-beat leg too, where a fixed one-beat ramp would be a triangle", () => {
    const cruise = peakOverAverageOf((t) => walkStep(FROM, TO, t, 2, 0, "cruise").p, 2);
    expect(cruise).toBeCloseTo(4 / 3, 2);
  });
});

describe("ringWalk: the motion profile (M10)", () => {
  const places = {
    a: { p: [10, 0], facing: 180 } as EndPose,
    b: { p: [0, 10], facing: 270 } as EndPose,
    c: { p: [-10, 0], facing: 0 } as EndPose,
    d: { p: [0, -10], facing: 90 } as EndPose,
  };
  const ids = ["a", "b", "c", "d"];
  const ring = ringOf(places, ids, 20);
  const walk = { inBeats: 1.5, outBeats: 1.5, turn: 180, faceOffset: 180 };

  it("defaults to the smoothstep", () => {
    for (const t of [0, 1.5, 3, 5, 6.5, 8]) {
      expect(ringWalk(ring, "a", places.a, places.c, t, 8, walk)).toEqual(
        ringWalk(ring, "a", places.a, places.c, t, 8, { ...walk, profile: "smooth" }),
      );
    }
  });

  it("turns at a flat rate over the plateau when it cruises", () => {
    const at = (t: number) =>
      ringWalk(ring, "a", places.a, places.c, t, 8, { ...walk, profile: "cruise" }).p;
    // The turn window is beats 1.5 to 6.5, five beats long, so its ramps are a
    // beat each: the plateau is beats 2.5 to 5.5.
    const rates: number[] = [];
    for (let t = 2.75; t <= 5.25; t += 0.25) rates.push(dist(at(t), at(t - 0.25)));
    const first = rates[0]!;
    for (const rate of rates) expect(rate).toBeCloseTo(first, 3);
  });

  it("keeps both ends exact whichever profile the turn rides", () => {
    for (const profile of ["smooth", "cruise"] as const) {
      const options = { ...walk, profile };
      expect(ringWalk(ring, "a", places.a, places.c, 0, 8, options).p).toEqual(places.a.p);
      expect(ringWalk(ring, "a", places.a, places.c, 8, 8, options).p[0]).toBeCloseTo(
        places.c.p[0],
        9,
      );
    }
  });
});
