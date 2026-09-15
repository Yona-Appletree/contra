import { angleDiff, createHall, dist, stationPose } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { homeOf, modelFromSet } from "./SetModel.js";

/**
 * The set model: every dancer on a slot, every slot a real place on the floor,
 * and the whole thing plain data.
 */

const NOWHERE = new Map();

const dupleModel = (couples: number) =>
  modelFromSet(
    DUPLE_IMPROPER,
    createHall(DUPLE_IMPROPER, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!,
    NOWHERE,
  );

const becketModel = (couples: number) =>
  modelFromSet(
    BECKET,
    createHall(BECKET, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!,
    NOWHERE,
  );

describe("the set model holds every dancer of a set", () => {
  it("gives every dancer a slot, a travel and a partner", () => {
    const model = dupleModel(4);
    expect(Object.keys(model.dancers)).toHaveLength(8);
    for (const dancer of Object.values(model.dancers)) {
      expect(dancer.travel === 1 || dancer.travel === -1).toBe(true);
      expect(dancer.partner).not.toBe(dancer.id);
      // A partner binding is symmetric.
      expect(model.dancers[dancer.partner]!.partner).toBe(dancer.id);
      expect(dancer.holds).toEqual({});
    }
  });

  it("puts a duple improper couple across the set from each other, one position per place", () => {
    const model = dupleModel(4);
    const lark = model.dancers["set0/c0/lark"]!;
    const robin = model.dancers["set0/c0/robin"]!;
    expect(lark.slot.position).toBe(0);
    expect(robin.slot.position).toBe(0);
    expect(lark.slot.line).not.toBe(robin.slot.line);
    // Improper: the ones' lark is on the `+x` line and the twos' lark on `-x`.
    expect(lark.slot.line).toBe(1);
    expect(model.dancers["set0/c1/lark"]!.slot.line).toBe(0);
    expect(model.dancers["set0/c1/lark"]!.slot.position).toBe(1);
  });

  it("puts a becket couple side by side on one line, two positions per place", () => {
    const model = becketModel(6);
    const lark = model.dancers["set0/c1/lark"]!;
    const robin = model.dancers["set0/c1/robin"]!;
    expect(lark.slot.line).toBe(robin.slot.line);
    expect(Math.abs(lark.slot.position - robin.slot.position)).toBe(1);
  });

  it("puts every dancer's home exactly on their own station", () => {
    for (const [formation, couples] of [
      [DUPLE_IMPROPER, 4],
      [DUPLE_IMPROPER, 5],
      [BECKET, 6],
      [BECKET, 7],
    ] as const) {
      const set = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }])
        .sets[0]!;
      const model = modelFromSet(formation, set, NOWHERE);
      for (const plan of formation.groupsFor("hands-four", set)) {
        // Only a dancing group's stations are lattice homes: a waiting couple
        // stands beyond the end of the line, which the lattice has no place for
        // (M6 gives the end effects their own policy).
        if (plan.kind !== "set") continue;
        for (const station of plan.stations) {
          const dancer = plan.members[station.id]!;
          const want = stationPose(plan.frame, station);
          const home = homeOf(model, dancer);
          expect(
            dist(home.p, want.p),
            `${formation.id} ${String(couples)} ${station.id}`,
          ).toBeLessThan(1e-9);
          expect(Math.abs(angleDiff(home.facing, want.facing))).toBeLessThan(1e-9);
        }
      }
    }
  });

  it("survives a JSON round trip unchanged", () => {
    const model = becketModel(7);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it("stands a dancer where `standingAt` says, not on their home", () => {
    const set = createHall(DUPLE_IMPROPER, [{ id: "set0", couples: 4, centre: [0, 0], axis: 90 }])
      .sets[0]!;
    const somewhere = { p: [100, 200] as [number, number], facing: 37 };
    const model = modelFromSet(DUPLE_IMPROPER, set, new Map([["set0/c0/lark", somewhere]]));
    expect(model.dancers["set0/c0/lark"]!.spot).toEqual(somewhere);
    expect(model.dancers["set0/c0/robin"]!.spot).toEqual(homeOf(model, "set0/c0/robin"));
  });

  it("names the set it cannot find a dancer in", () => {
    expect(() => homeOf(dupleModel(4), "nobody")).toThrow(/has no dancer "nobody"/);
  });
});
