import { describe, expect, it } from "vitest";
import { q256, q256Vec2 } from "./q256.js";

describe("q256", () => {
  it("snaps to the 1/256 px grid", () => {
    expect(q256(0)).toBe(0);
    expect(q256(1 / 256)).toBe(1 / 256);
    expect(q256(1 / 512)).toBe(1 / 256); // Math.round takes .5 up
    expect(q256(1 / 1024)).toBe(0);
    expect(q256(-1 / 1024)).toBe(-0);
    expect(q256(3.14159)).toBe(Math.round(3.14159 * 256) / 256);
  });

  it("never moves a value by more than half a quantum", () => {
    for (let i = 0; i < 200; i++) {
      const v = (i / 200) * 40 - 20;
      expect(Math.abs(q256(v) - v)).toBeLessThanOrEqual(1 / 512 + 1e-12);
    }
  });

  it("applies to both components", () => {
    expect(q256Vec2([1 / 1024, 3.14159])).toEqual([0, Math.round(3.14159 * 256) / 256]);
  });
});
