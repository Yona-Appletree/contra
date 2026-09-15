import { DEMO_DANCES } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { formationSummary } from "./formationSummary.js";

describe("formationSummary", () => {
  it("names a duple improper dance's formation with no progression clause", () => {
    const dance = DEMO_DANCES.find((d) => d.formation === "duple-improper");
    expect(dance).toBeDefined();
    expect(formationSummary(dance!)).toBe("duple-improper");
  });

  it("adds which way a becket dance progresses", () => {
    const dance = DEMO_DANCES.find((d) => d.formation === "becket");
    expect(dance).toBeDefined();
    expect(formationSummary(dance!)).toBe("becket, progresses left");
  });
});
