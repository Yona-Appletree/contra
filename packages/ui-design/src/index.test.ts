import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@caller/ui-design", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@caller/ui-design");
  });
});
