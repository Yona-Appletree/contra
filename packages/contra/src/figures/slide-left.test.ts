import type { Group } from "@caller/choreo";
import { createGroup, withDefaults } from "@caller/choreo";
import { angleDiff } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { PLACE_PITCH_PX } from "../formation/dupleImproper.js";
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

  it("slides every dancer half a couple place to their own left, still facing across", () => {
    const ends = figureMoves(slideLeft, {}, BECKET);
    // The `+1` line faces `+x`, so its own left is `−y`; the other line's is
    // `+y`. Half a couple place — one dancer position — since FR-C2: the two
    // lines slide opposite ways, so they pass each other one whole couple
    // width and you land facing the couple that was on your diagonal.
    for (const id of ["1L", "1R"]) {
      const from = stationSpot(BECKET, id);
      expect(ends[id]!.p[0], id).toBeCloseTo(from.p[0], 9);
      expect(ends[id]!.p[1], id).toBeCloseTo(from.p[1] - PLACE_PITCH_PX, 9);
      expect(ends[id]!.facing, id).toBe(from.facing);
    }
    for (const id of ["2L", "2R"]) {
      const from = stationSpot(BECKET, id);
      expect(ends[id]!.p[1], id).toBeCloseTo(from.p[1] + PLACE_PITCH_PX, 9);
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
    const average = PLACE_PITCH_PX / CALLED_BEATS;
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

/**
 * The odd line's cross-over (S2).
 *
 * An odd becket line has one waiting place, so at the other end the couple that
 * runs out of line crosses straight over with no time out — see `becket.ts`'s
 * header for the loop that makes that so. `Station.crossedOver` is how the
 * shift knows, and this is what it does with it.
 */
describe("slide left crosses a marked couple over instead", () => {
  /** A becket minor set whose `2` couple got here by crossing the set. */
  function crossedGroup(): Group {
    const plain = probeGroup(BECKET);
    const stations = plain.stations.map((s) =>
      s.id.startsWith("2") ? { ...s, crossedOver: true } : { ...s },
    );
    return createGroup(
      {
        id: "probe",
        kind: "set",
        frame: plain.frame,
        stations,
        members: plain.members,
        couples: [],
      },
      BECKET.roleSet,
    );
  }

  it("starts them on the station opposite and leaves them on their own, exactly", () => {
    const group = crossedGroup();
    // The same four stations with nobody marked: a dancer standing on each of
    // them, which is what a probe group with no `from` samples at t = 0.
    const plain = probeGroup(BECKET);
    const params = withDefaults(slideLeft, {}, CALLED_BEATS);
    /** Where a station's own rest pose is, in the probe frame's world px. */
    const rest = (id: string) => slideLeft.sample(plain, id, 0, params);
    // The mirror pairs: `1L` is the point opposite `2L` through the set's centre.
    for (const [crossed, opposite] of [
      ["2L", "1L"],
      ["2R", "1R"],
    ] as const) {
      const at0 = slideLeft.sample(group, crossed, 0, params);
      const was = rest(opposite);
      expect(at0.p[0], crossed).toBeCloseTo(was.p[0], 9);
      expect(at0.p[1], crossed).toBeCloseTo(was.p[1], 9);
      expect(Math.abs(angleDiff(at0.facing, was.facing)), crossed).toBeLessThan(1e-9);
      const end = slideLeft.sample(group, crossed, CALLED_BEATS, params);
      const home = rest(crossed);
      expect(end.p[0], crossed).toBeCloseTo(home.p[0], 9);
      expect(end.p[1], crossed).toBeCloseTo(home.p[1], 9);
      expect(Math.abs(angleDiff(end.facing, home.facing)), crossed).toBeLessThan(1e-9);
    }
  });

  it("keeps the crossing couple a place apart the whole way, so they never pass through each other", () => {
    const group = crossedGroup();
    const params = withDefaults(slideLeft, {}, CALLED_BEATS);
    for (let t = 0; t <= CALLED_BEATS + 1e-9; t += 1 / 32) {
      const l = slideLeft.sample(group, "2L", t, params).p;
      const r = slideLeft.sample(group, "2R", t, params).p;
      // They turn as a couple about their own centre, so the gap never moves.
      // Walking them straight to their new stations instead would put them
      // both on the centre of the set at the same instant.
      expect(Math.hypot(l[0] - r[0], l[1] - r[1]), `at ${String(t)}`).toBeCloseTo(
        PLACE_PITCH_PX,
        9,
      );
    }
  });

  it("leaves the couple that is not crossing sliding exactly as it always did", () => {
    const crossed = crossedGroup();
    const plain = probeGroup(BECKET);
    const params = withDefaults(slideLeft, {}, CALLED_BEATS);
    for (const id of ["1L", "1R"]) {
      for (let t = 0; t <= CALLED_BEATS + 1e-9; t += 1 / 32) {
        expect(slideLeft.sample(crossed, id, t, params), `${id} at ${String(t)}`).toEqual(
          slideLeft.sample(plain, id, t, params),
        );
      }
    }
  });

  it("turns on its own ease so the turn and the steps never peak together", () => {
    const group = crossedGroup();
    const params = withDefaults(slideLeft, {}, CALLED_BEATS);
    const step = 1 / 64;
    let peak = 0;
    let last = slideLeft.sample(group, "2L", 0, params).p;
    for (let t = step; t <= CALLED_BEATS + 1e-9; t += step) {
      const p = slideLeft.sample(group, "2L", t, params).p;
      peak = Math.max(peak, Math.hypot(p[0] - last[0], p[1] - last[1]) / step);
      last = p;
    }
    // Turning half way round while walking across costs more top speed than
    // sliding along does, and it is the fastest body motion in the library.
    // Pinned so it cannot creep: S2 measured **40.78** px/beat here with a
    // whole-couple slide, against **44.47** with the turn driven by the steps
    // and **29.99** for the plain slide. FR-C2 halved the slide itself, so the
    // crosser's own travel is what is left. The whole table is in S2's report.
    expect(peak).toBeGreaterThan(PLACE_PITCH_PX / CALLED_BEATS);
    expect(peak).toBeLessThan(42);
  });
});
