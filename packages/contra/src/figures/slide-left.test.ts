import { withDefaults } from "@caller/choreo";
import { angleDiff } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET, COUPLE_PITCH_PX } from "../formation/becket.js";
import { STEP_BEATS, slideLeft, stepped } from "./slide-left.js";
import { figureMoves, figureProblems, probeFigure, probeGroup, stationSpot } from "./testing.js";

/** The beats a shift left is actually called in: Butter's A1 is two. */
const CALLED_BEATS = 2;

/** How finely the speed profile is read. */
const STEP = 1 / 64;

/** Speeds of the body over `[0, beats]`, one per {@link STEP}. */
function speeds(beats: number, station = "1L"): number[] {
  const group = probeGroup(BECKET);
  const params = withDefaults(slideLeft, {}, beats);
  const out: number[] = [];
  let last = slideLeft.sample(group, station, 0, params).p;
  for (let t = STEP; t <= beats + 1e-9; t += STEP) {
    const p = slideLeft.sample(group, station, t, params).p;
    out.push(Math.hypot(p[0] - last[0], p[1] - last[1]) / STEP);
    last = p;
  }
  return out;
}

describe("slide left", () => {
  it("reaches, ends and keeps its distance in becket", () => {
    expect(figureProblems(probeFigure(slideLeft, {}, { group: probeGroup(BECKET) }))).toEqual([]);
  });

  it("slides every dancer one couple place to their own left, still facing across", () => {
    const ends = figureMoves(slideLeft, {}, BECKET);
    // The `+1` line faces `+x`, so its own left is `−y`; the other line's is `+y`.
    for (const id of ["1L", "1R"]) {
      const from = stationSpot(BECKET, id);
      expect(ends[id]!.p[0], id).toBeCloseTo(from.p[0], 9);
      expect(ends[id]!.p[1], id).toBeCloseTo(from.p[1] - COUPLE_PITCH_PX, 9);
      expect(ends[id]!.facing, id).toBe(from.facing);
    }
    for (const id of ["2L", "2R"]) {
      const from = stationSpot(BECKET, id);
      expect(ends[id]!.p[1], id).toBeCloseTo(from.p[1] + COUPLE_PITCH_PX, 9);
    }
  });
});

/**
 * The look: two steps, a torso that never turns, and a glance along the line.
 *
 * The user's report was "the slide left/right looks really odd, not like
 * walking at all". It covers a couple pitch in two beats — by a long way the
 * fastest sustained travel in the library — and it used to do it in one eased
 * glide with the body square and the head straight ahead, which is a dancer
 * being slid sideways rather than a dancer taking two steps.
 */
describe("slide left reads as two steps", () => {
  it("stops twice in a two-beat slide, and only at the beats", () => {
    const v = speeds(CALLED_BEATS);
    const beats = CALLED_BEATS / STEP_BEATS;
    // One trough per step boundary that is not an end, and one peak per step.
    const troughs: number[] = [];
    const peaks: number[] = [];
    for (let i = 1; i < v.length - 1; i++) {
      if (v[i]! < v[i - 1]! && v[i]! <= v[i + 1]!) troughs.push((i + 1) * STEP);
      if (v[i]! > v[i - 1]! && v[i]! >= v[i + 1]!) peaks.push((i + 1) * STEP);
    }
    expect(peaks.length, `peaks at ${peaks.join(", ")}`).toBe(beats);
    expect(troughs.length, `troughs at ${troughs.join(", ")}`).toBe(beats - 1);
    // The trough is on the beat, where a foot lands. `speeds` differences
    // backwards, so it can only be located to the sample it ends on.
    expect(Math.abs(troughs[0]! - STEP_BEATS)).toBeLessThanOrEqual(STEP);
  });

  it("does not go faster than the one glide it replaces", () => {
    // `smooth`'s peak is 1.5× its average whether it is run once over the whole
    // figure or once per step, so stepping costs nothing in top speed.
    const peak = Math.max(...speeds(CALLED_BEATS));
    const average = COUPLE_PITCH_PX / CALLED_BEATS;
    expect(peak).toBeGreaterThan(average);
    expect(peak).toBeLessThan(1.51 * average);
  });

  it("keeps the torso square to the other line for the whole figure", () => {
    const group = probeGroup(BECKET);
    const params = withDefaults(slideLeft, {}, CALLED_BEATS);
    for (const id of ["1L", "1R", "2L", "2R"]) {
      const start = slideLeft.sample(group, id, 0, params).facing;
      for (let t = 0; t <= CALLED_BEATS + 1e-9; t += 1 / 16) {
        expect(slideLeft.sample(group, id, t, params).facing, `${id} at ${String(t)}`).toBe(start);
      }
    }
  });

  it("glances along the line it is travelling down, and comes back", () => {
    const group = probeGroup(BECKET);
    const params = withDefaults(slideLeft, {}, CALLED_BEATS);
    for (const id of ["1L", "2L"]) {
      const at = (t: number) => slideLeft.sample(group, id, t, params);
      const facing = at(0).facing;
      // Starts and ends on the plain facing, so no seam has to blend a head.
      expect(angleDiff(at(0).look, facing), id).toBeCloseTo(0, 9);
      expect(angleDiff(at(CALLED_BEATS).look, facing), id).toBeCloseTo(0, 9);
      // Halfway, the head is on the way they are going: the direction from
      // where they started to where the figure leaves them.
      const from = at(0).p;
      const to = at(CALLED_BEATS).p;
      const travel = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
      expect(Math.abs(angleDiff(at(CALLED_BEATS / 2).look, travel)), id).toBeLessThan(1e-9);
    }
  });
});

describe("stepped", () => {
  it("covers exactly [0, 1], monotonically, whatever the step count", () => {
    for (const steps of [1, 2, 4]) {
      expect(stepped(0, steps)).toBe(0);
      expect(stepped(1, steps)).toBe(1);
      let last = -1;
      for (let x = 0; x <= 1 + 1e-9; x += 1 / 256) {
        const k = stepped(x, steps);
        expect(k, `steps ${String(steps)} at ${String(x)}`).toBeGreaterThanOrEqual(last);
        last = k;
      }
    }
  });

  it("lands exactly on each step boundary", () => {
    for (const steps of [2, 4]) {
      for (let i = 0; i <= steps; i++) {
        expect(stepped(i / steps, steps), `${String(i)}/${String(steps)}`).toBeCloseTo(
          i / steps,
          12,
        );
      }
    }
  });

  it("with one step is the plain ease the figure used before", () => {
    for (let x = 0; x <= 1 + 1e-9; x += 1 / 32) {
      expect(stepped(x, 1)).toBeCloseTo(x * x * (3 - 2 * x), 12);
    }
  });
});
