import { describe, expect, it } from "vitest";
import * as core from "./index.js";

describe("@caller/core", () => {
  it("exports its package name", () => {
    expect(core.packageName).toBe("@caller/core");
  });

  it("exports the contract the renderer and the figure definitions are written against", () => {
    for (const name of [
      "createClock",
      "solveArm",
      "planarReach",
      "shoulders",
      "stackJoined",
      "easeSeam",
      "quietMotion",
      "smooth",
      "q256",
      "angleLerp",
    ] as const) {
      expect(typeof core[name], name).toBe("function");
    }
    expect(core.RENDERING_CONTRACT.armReachPx).toBe(15);
  });
});
