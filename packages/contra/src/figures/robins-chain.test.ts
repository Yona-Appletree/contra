import { describe, expect, it } from "vitest";
import { angleDiff, dirOf, dist, rightOf } from "@caller/core";
import { BECKET } from "../formation/becket.js";
import { COURTESY_PIVOT_FROM_LARK_PX } from "./courtesyTurn.js";
import { CHAIN_CANDIDATES, CHAIN_JOIN_BEAT, CHAIN_PASS_PX, robinsChain } from "./robins-chain.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("`?chain=`'s five candidates, 5 the default since F13", () => {
  it("names candidate 1 the rigid turn F9 shipped — 1 through 4 now say joinBeat: 0 explicitly, to turn F13's orbit back off", () => {
    expect(CHAIN_CANDIDATES["1"]).toEqual({
      pivotFromLark: COURTESY_PIVOT_FROM_LARK_PX,
      stepInPx: 0,
      joinBeat: 0,
    });
    expect(robinsChain.defaults.pivotFromLark).toBe(COURTESY_PIVOT_FROM_LARK_PX);
    expect(robinsChain.defaults.stepInPx).toBe(0);
  });

  it("puts candidate 2's pivot at the lark, still rigid, still off", () => {
    expect(CHAIN_CANDIDATES["2"]).toEqual({ pivotFromLark: 0, stepInPx: 0, joinBeat: 0 });
  });

  it("steps candidates 3 and 4 in 4 px and 8 px, the couple spinning, still off", () => {
    expect(CHAIN_CANDIDATES["3"]).toEqual({ stepInPx: 4, joinBeat: 0 });
    expect(CHAIN_CANDIDATES["4"]).toEqual({ stepInPx: 8, joinBeat: 0 });
  });

  it("makes candidate 5 the lark's orbit, joined a quarter of the way through, and now the figure's own default (F13)", () => {
    expect(CHAIN_CANDIDATES["5"]).toEqual({ joinBeat: CHAIN_JOIN_BEAT, passPx: CHAIN_PASS_PX });
    expect(CHAIN_JOIN_BEAT).toBe(2);
    expect(robinsChain.defaults.joinBeat).toBe(CHAIN_JOIN_BEAT);
    expect(robinsChain.defaults.passPx).toBe(CHAIN_PASS_PX);
  });

  it("has no sixth candidate", () => {
    expect(CHAIN_CANDIDATES["6"]).toBeUndefined();
  });
});

describe("robins chain", () => {
  it("reaches, joins, ends and keeps its distance in becket", () => {
    expect(figureProblems(probeFigure(robinsChain, {}, { group: probeGroup(BECKET) }))).toEqual([]);
  });

  it("trades the robins and leaves the larks where they stood", () => {
    const ends = figureMoves(robinsChain, {}, BECKET);
    expect(spotError(ends["1R"]!, stationSpot(BECKET, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2R"]!, stationSpot(BECKET, "1R"))).toBeLessThan(1e-9);
    for (const lark of ["1L", "2L"]) {
      expect(spotError(ends[lark]!, stationSpot(BECKET, lark)), lark).toBeLessThan(1e-9);
      expect(ends[lark]!.facing, lark).toBe(stationSpot(BECKET, lark).facing);
    }
  });

  it("is its own opposite: chain over and back and everybody is home", () => {
    const over = figureMoves(robinsChain, {}, BECKET);
    const back = figureMoves(robinsChain, { from: over }, BECKET);
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(spotError(back[id]!, stationSpot(BECKET, id)), id).toBeLessThan(1e-9);
    }
  });

  it("says so when there are not two of the chaining role", () => {
    expect(() => figureMoves(robinsChain, { chains: "nobody" }, BECKET)).toThrow(/exactly two/);
  });

  // F9's other candidate, still reachable behind `?chain=3`/`?chain=4` even
  // though F13 moved the default off the rigid turn entirely: `stepInPx` only
  // matters when `joinBeat` is 0, and the default no longer is.
  it("still has a step-in family behind stepInPx, off by default", () => {
    expect(robinsChain.defaults.stepInPx).toBe(0);
  });

  it("passes right shoulders and still closes exactly when the lark steps in", () => {
    for (const stepInPx of [4, 8]) {
      const ends = figureMoves(robinsChain, { stepInPx }, BECKET);
      expect(spotError(ends["2R"]!, stationSpot(BECKET, "1R")), `${stepInPx}: 2R`).toBeLessThan(
        1e-9,
      );
      expect(spotError(ends["1L"]!, stationSpot(BECKET, "1L")), `${stepInPx}: 1L`).toBeLessThan(
        1e-9,
      );

      // Which shoulder the two robins show each other at their closest, which
      // is the whole reason this candidate exists: `rightOf` her facing dotted
      // with the way to the other one is positive when she is passing right.
      const group = probeGroup(BECKET);
      const params = { ...robinsChain.defaults, stepInPx, beats: robinsChain.beats };
      let closest = { gap: Infinity, side: 0 };
      for (let t = 0; t <= 4.5; t += 1 / 32) {
        const a = robinsChain.sample(group, "1R", t, params);
        const b = robinsChain.sample(group, "2R", t, params);
        const gap = dist(a.p, b.p);
        if (gap >= closest.gap) continue;
        const r = rightOf(a.facing);
        closest = { gap, side: r[0] * (b.p[0] - a.p[0]) + r[1] * (b.p[1] - a.p[1]) };
      }
      expect(closest.side, `${stepInPx}: shoulder at ${closest.gap.toFixed(3)} px`).toBeGreaterThan(
        0,
      );
    }
  });

  // F10's candidate, F13's default. The four facts the whole milestone rests
  // on, pinned: the pull by is on the right shoulder and clear of AC6, the
  // lark walks backward the whole way round, the couple faces out at the half
  // and in at the end,
  // and both of them land exactly on their places.
  it("orbits the lark a whole turn backwards and pulls by on the right", () => {
    const orbit = CHAIN_CANDIDATES["5"]!;
    const ends = figureMoves(robinsChain, orbit, BECKET);
    expect(spotError(ends["2R"]!, stationSpot(BECKET, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1L"]!, stationSpot(BECKET, "1L"))).toBeLessThan(1e-9);

    const group = probeGroup(BECKET);
    const params = { ...robinsChain.defaults, ...orbit, beats: robinsChain.beats };
    const at = (id: string, t: number) => robinsChain.sample(group, id, t, params);

    // The pull by: how near the two robins come, and which shoulder.
    let closest = { gap: Infinity, side: 0 };
    for (let t = 0; t <= 4; t += 1 / 32) {
      const a = at("1R", t);
      const b = at("2R", t);
      const gap = dist(a.p, b.p);
      if (gap >= closest.gap) continue;
      const r = rightOf(a.facing);
      closest = { gap, side: r[0] * (b.p[0] - a.p[0]) + r[1] * (b.p[1] - a.p[1]) };
    }
    expect(closest.side, `shoulder at ${closest.gap.toFixed(3)} px`).toBeGreaterThan(0);
    expect(closest.gap).toBeGreaterThan(COLLISION_FLOOR_PX);

    // He walks backward for every sample of it: his facing is never within a
    // right angle of the way his feet are going.
    let previous = at("1L", 0).p;
    for (let t = 1 / 32; t <= robinsChain.beats + 1e-9; t += 1 / 32) {
      const now = at("1L", t);
      const step: [number, number] = [now.p[0] - previous[0], now.p[1] - previous[1]];
      const speed = Math.hypot(step[0], step[1]);
      previous = now.p;
      if (speed < 1e-9) continue;
      const d = dirOf(now.facing);
      expect((d[0] * step[0] + d[1] * step[1]) / speed, `at beat ${t.toFixed(3)}`).toBeLessThan(0);
    }

    // Out of the set at the half, back in at the end, both of them together.
    // Read against his own starting facing rather than a number, so the probe
    // frame's tilt cannot make this a test of the transform.
    const facesIn = at("1L", 0).facing;
    for (const id of ["1L", "2R"]) {
      expect(
        Math.abs(angleDiff(at(id, 4).facing, facesIn + 180)),
        `${id} at the half`,
      ).toBeLessThan(1e-9);
      expect(Math.abs(angleDiff(at(id, 8).facing, facesIn)), `${id} at the end`).toBeLessThan(1e-9);
    }
  });
});

/** AC6's torso floor, as `oracle.ts` states it. */
const COLLISION_FLOOR_PX = 8;
