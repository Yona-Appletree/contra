import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@caller/choreo", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@caller/choreo");
  });
});
