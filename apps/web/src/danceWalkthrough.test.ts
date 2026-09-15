import { DEMO_DANCES, danceBySlug } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { danceWalkthrough } from "./danceWalkthrough.js";

describe("danceWalkthrough", () => {
  it("has one step per figure call, in order, for every demo dance", () => {
    for (const dance of DEMO_DANCES) {
      const steps = danceWalkthrough(dance);
      // **A concurrent call is two steps, not one** (M9g). Are You 'Most Done?
      // is the first programme dance to write a `while` clause — *"larks
      // allemande right once || robins loop right"* — and a walkthrough that
      // said only the first half of it would be telling half the room nothing.
      const figures = dance.phrases.flatMap((p) =>
        p.figures.flatMap((f) => [f.figure, ...(f.while ?? []).map((w) => w.figure)]),
      );
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

  it("names each figure by the caller's own 4-beat form", () => {
    // M13: a dance file's own `call` is a **flourish** now and Airpants writes
    // none, so the heading is what a caller would say for the figure.
    const airpants = danceBySlug("airpants")!;
    const first = danceWalkthrough(airpants)[0]!;
    expect(first.call).toBe("WITH YOUR NEIGHBOR BALANCE AND SWING");
  });

  it("stops the written teach at how far, and leaves where you end to the hint", () => {
    // D22, M13's A3: `{where}` is gone from the written language. The teach says
    // what the dancers do; where the figure leaves them is generated at the seam
    // and rendered beside the text, never baked into it.
    const airpants = danceBySlug("airpants")!;
    const first = danceWalkthrough(airpants)[0]!;
    expect(first.text).toContain("Take both hands with your neighbor");
    expect(first.text).not.toContain("You should be across the set");
  });
});
