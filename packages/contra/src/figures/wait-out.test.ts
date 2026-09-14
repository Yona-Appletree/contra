import type { Formation } from "@caller/choreo";
import { createGroup, frame, withDefaults } from "@caller/choreo";
import { dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET, BECKET_WAIT_STATIONS } from "../formation/becket.js";
import { DUPLE_IMPROPER, DUPLE_IMPROPER_WAIT_STATIONS } from "../formation/dupleImproper.js";
import { crossingOf, waitOut } from "./wait-out.js";

const waitGroup = (formation: Formation, axis = 90) => {
  const stations = formation.group(2);
  return createGroup(
    {
      id: "w",
      kind: "wait-top",
      frame: frame([0, 0], axis),
      stations,
      members: Object.fromEntries(stations.map((s) => [s.id, `w/${s.id}`])),
      couples: [],
    },
    formation.roleSet,
  );
};

describe("wait out", () => {
  it("reads the crossing off the waiting couple's own stations", () => {
    expect(DUPLE_IMPROPER_WAIT_STATIONS).toHaveLength(2);
    expect(BECKET_WAIT_STATIONS).toHaveLength(2);
    expect(crossingOf(waitGroup(DUPLE_IMPROPER))).toBe("swap");
    expect(crossingOf(waitGroup(BECKET))).toBe("mirror");
    expect(crossingOf(waitGroup(BECKET, 270))).toBe("mirror");
  });

  it("keeps a becket couple apart while it crosses, and lands it exactly", () => {
    const group = waitGroup(BECKET);
    const params = withDefaults(waitOut, undefined, 64);
    let closest = Infinity;
    for (let n = 0; n <= 64 * 8; n++) {
      const t = n / 8;
      closest = Math.min(
        closest,
        dist(waitOut.sample(group, "WL", t, params).p, waitOut.sample(group, "WR", t, params).p),
      );
    }
    expect(closest).toBeGreaterThan(8);

    const ends = waitOut.ends(group, params);
    for (const id of ["WL", "WR"]) {
      expect(dist(waitOut.sample(group, id, 64, params).p, ends[id]!.p), id).toBeLessThan(0.01);
    }
  });

  it("crosses a becket couple to the point opposite through the frame's centre", () => {
    const group = waitGroup(BECKET);
    const params = withDefaults(waitOut, undefined, 64);
    const ends = waitOut.ends(group, params);
    for (const station of BECKET_WAIT_STATIONS) {
      expect(dist(ends[station.id]!.p, [-station.p[0], -station.p[1]]), station.id).toBeLessThan(
        1e-9,
      );
    }
  });

  it("still swaps a duple improper couple across the set", () => {
    const group = waitGroup(DUPLE_IMPROPER);
    const params = withDefaults(waitOut, undefined, 64);
    const ends = waitOut.ends(group, params);
    expect(dist(ends["WL"]!.p, [16, 0])).toBeLessThan(1e-9);
    expect(dist(ends["WR"]!.p, [-16, 0])).toBeLessThan(1e-9);
  });
});
