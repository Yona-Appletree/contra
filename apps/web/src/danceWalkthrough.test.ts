import { DEMO_DANCES, danceBySlug } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { danceWalkthrough } from "./danceWalkthrough.js";

describe("danceWalkthrough", () => {
  it("has one step per figure call, in order, for every demo dance", () => {
    for (const dance of DEMO_DANCES) {
      const steps = danceWalkthrough(dance);
      const figures = dance.phrases.flatMap((p) => p.figures.map((f) => f.figure));
      expect(
        steps.map((s) => s.figure),
        dance.slug,
      ).toEqual(figures);
    }
  });

  it("leaves no template slot unresolved", () => {
    for (const dance of DEMO_DANCES) {
      for (const step of danceWalkthrough(dance)) {
        expect(step.text, `${dance.slug}: ${step.figure}`).not.toContain("{");
        expect(step.call, `${dance.slug}: ${step.figure}`).not.toContain("{");
      }
    }
  });

  it("prefers the dance's own written call over the resolved one", () => {
    const airpants = danceBySlug("airpants")!;
    const first = danceWalkthrough(airpants)[0]!;
    expect(first.call).toBe("NEIGHBOR BALANCE AND SWING");
  });

  it("ends airpants' opening balance-and-swing on the user's own landmark sentence", () => {
    const airpants = danceBySlug("airpants")!;
    const first = danceWalkthrough(airpants)[0]!;
    expect(first.text).toContain(
      "You should be across the set from your partner, next to your neighbor.",
    );
  });
});
