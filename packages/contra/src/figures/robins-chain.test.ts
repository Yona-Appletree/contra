import { describe, expect, it } from "vitest";
import { angleDiff, dirOf, dist, rightOf } from "@caller/core";
import { BECKET } from "../formation/becket.js";
import { CHAIN_JOIN_BEAT, CHAIN_PASS_PX, robinsChain } from "./robins-chain.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("the chain's only regime, since A6", () => {
  it("is the lark's orbit, joined a quarter of the way through", () => {
    expect(CHAIN_JOIN_BEAT).toBe(2);
    expect(robinsChain.defaults.joinBeat).toBe(CHAIN_JOIN_BEAT);
    expect(robinsChain.defaults.passPx).toBe(CHAIN_PASS_PX);
  });

  // A6: F9's four earlier candidates, `CHAIN_CANDIDATES`, `?chain=` and
  // `pnpm figure --chain` are gone, and with them the parameters that only
  // existed to reach them. The test is the second half of that claim: a chain
  // has no pivot and no step-in to choose any more.
  it("has no pivot, no step in and no separate pull by to choose", () => {
    const defaults = robinsChain.defaults as Record<string, unknown>;
    for (const gone of ["pivotFromLark", "stepInPx", "pullBeats", "bowPx"]) {
      expect(Object.hasOwn(defaults, gone), gone).toBe(false);
    }
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

  // F10's candidate, F13's default and since A6 the only one. The four facts
  // the whole milestone rests on, pinned: the pull by is on the right shoulder
  // and clear of AC6, the lark walks backward the whole way round, the couple
  // faces out at the half and in at the end, and both of them land exactly on
  // their places.
  it("orbits the lark a whole turn backwards and pulls by on the right", () => {
    const ends = figureMoves(robinsChain, {}, BECKET);
    expect(spotError(ends["2R"]!, stationSpot(BECKET, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1L"]!, stationSpot(BECKET, "1L"))).toBeLessThan(1e-9);

    const group = probeGroup(BECKET);
    const params = { ...robinsChain.defaults, beats: robinsChain.beats };
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
