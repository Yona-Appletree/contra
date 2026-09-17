import { describe, expect, it } from "vitest";
import { KINETICS } from "./index.js";

describe("@caller/kinetics", () => {
  it("exists", () => {
    expect(KINETICS).toBe("engine 3");
  });
});
