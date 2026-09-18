import { describe, expect, it } from "vitest";
import { runNamed } from "../dances/load.js";
import { formatLine, listing } from "./listing.js";

/**
 * The listing is what the user reads at the gate, so it is pinned. A change
 * to this snapshot means the scheduler changed its mind about what a dancer
 * does — read the diff as a dancer would, not as a formatter would.
 */
describe("the listing", () => {
  it("reads like what a dancer says, and is pinned", () => {
    const result = runNamed("fixture", { bpm: 112 });
    const lines = listing(result.schedule!.programs["L"]!, result.dialect!, result.sequence!).map(
      formatLine,
    );
    expect(lines).toMatchSnapshot();
    expect(lines[0]).toBe("beat 0 · body · stand · look at robin · bow 25°");
    expect(lines).toContain(
      "beat 10 · exit · step back and to the left 35 cm · turn an eighth left · look at robin · take right hands with robin — allemande-R",
    );
    expect(lines).toContain(
      "beat 11 · exit · step forward and to the left 15 cm · turn an eighth left · look at robin",
    );
    expect(lines.some((l) => l.startsWith("beat 18 · exit"))).toBe(true);
  });

  it("stands the solo dancer in plain words", () => {
    const result = runNamed("solo", { bpm: 112 });
    const lines = listing(result.schedule!.programs["L"]!, result.dialect!, result.sequence!).map(
      formatLine,
    );
    expect(lines.find((l) => l.startsWith("beat 4 ·"))).toBe("beat 4 · body · stand · look ahead");
    expect(lines.every((l) => !l.includes("take"))).toBe(true);
  });
});
