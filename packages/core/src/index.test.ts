import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@caller/core", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@caller/core");
  });
});
