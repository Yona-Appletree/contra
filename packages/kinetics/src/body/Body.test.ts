import { describe, expect, it } from "vitest";
import { EFFECTORS, HEIGHTS, JOINTS, POINTS } from "./Body.js";

describe("Body", () => {
  it("has five effectors: hip, both feet, both hands", () => {
    expect(EFFECTORS).toEqual(["hip", "footL", "footR", "handL", "handR"]);
  });

  it("has five joints: both shoulders, both elbows, the head", () => {
    expect(JOINTS).toEqual(["shoulderL", "shoulderR", "elbowL", "elbowR", "head"]);
  });

  it("POINTS is every effector followed by every joint, with no duplicates", () => {
    expect(POINTS).toEqual([...EFFECTORS, ...JOINTS]);
    expect(new Set(POINTS).size).toBe(POINTS.length);
  });

  it("orders the heights hip below shoulder below head", () => {
    expect(HEIGHTS.hipPx).toBeLessThan(HEIGHTS.shoulderPx);
    expect(HEIGHTS.shoulderPx).toBeLessThan(HEIGHTS.headPx);
  });
});
