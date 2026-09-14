import { describe, expect, it } from "vitest";
import { NEUTRAL_STYLE, lerpHand } from "./PoseSample.js";

describe("NEUTRAL_STYLE", () => {
  it("is 1, 0, 1", () => {
    expect(NEUTRAL_STYLE).toEqual({ bounce: 1, lead: 0, swingTightness: 1 });
  });
});

describe("lerpHand", () => {
  it("interpolates the floor point and the drop together", () => {
    const a = { p: [0, 0] as const, drop: 4 };
    const b = { p: [10, -4] as const, drop: 14 };
    expect(lerpHand(a, b, 0)).toEqual({ p: [0, 0], drop: 4 });
    expect(lerpHand(a, b, 1)).toEqual({ p: [10, -4], drop: 14 });
    expect(lerpHand(a, b, 0.25)).toEqual({ p: [2.5, -1], drop: 6.5 });
  });
});
