import { describe, expect, it } from "vitest";
import { tempo } from "../units/Tempo.js";
import { beatsNeeded, limitsAtTempo, planSteps } from "./steps.js";

const limits = limitsAtTempo(tempo(112));

describe("the step planner", () => {
  it("is there already within a pixel and five degrees", () => {
    expect(beatsNeeded({ p: [0, 0], facing: 0 }, { p: [0.5, 0], facing: 4 }, limits)).toBe(0);
  });
  it("walks 30 px in two steps of 15", () => {
    const from = { p: [0, 0] as const, facing: 0 };
    const to = { p: [30, 0] as const, facing: 0 };
    expect(beatsNeeded(from, to, limits)).toBe(2);
    const steps = planSteps(from, to, 2, limits);
    expect(steps?.map((s) => s.lengthPx)).toEqual([15, 15]);
  });
  it("walks 3 px in one step", () => {
    expect(beatsNeeded({ p: [0, 0], facing: 0 }, { p: [3, 0], facing: 0 }, limits)).toBe(1);
  });
  it("turns half round standing in one beat: the shortest arc never exceeds 180°", () => {
    expect(beatsNeeded({ p: [0, 0], facing: 0 }, { p: [0, 0], facing: 180 }, limits)).toBe(1);
    expect(beatsNeeded({ p: [0, 0], facing: 0 }, { p: [0, 0], facing: 200 }, limits)).toBe(1);
  });
  it("turns 100° while stepping in two steps", () => {
    expect(beatsNeeded({ p: [0, 0], facing: 0 }, { p: [3, 0], facing: 100 }, limits)).toBe(2);
    const steps = planSteps({ p: [0, 0], facing: 0 }, { p: [3, 0], facing: 100 }, 2, limits);
    expect(steps?.map((s) => s.pivot)).toEqual([50, 50]);
  });
  it("refuses fewer beats than needed", () => {
    expect(
      planSteps({ p: [0, 0], facing: 0 }, { p: [30, 0], facing: 0 }, 1, limits),
    ).toBeUndefined();
  });
});
