import { describe, expect, it } from "vitest";
import { compileDance, readDance, standardFloor } from "../dances/load.js";
import { treeDialect } from "../dialect/tree/TreeDialect.js";
import { schedule } from "../schedule/schedule.js";
import { tempo } from "../units/Tempo.js";
import { formatLine, listing } from "./listing.js";

/**
 * The listing is what the user reads at the gate, so it is pinned. A change
 * to this snapshot means the scheduler changed its mind about what a dancer
 * does — read the diff as a dancer would, not as a formatter would.
 */
describe("the listing", () => {
  it("reads like what a dancer says, and is pinned", () => {
    const floor = standardFloor("pair");
    const dialect = treeDialect(floor);
    const { sequence } = compileDance(readDance("fixture.dance"), floor);
    const s = schedule(sequence, dialect, tempo(112));
    const lines = listing(s.programs.lark!, dialect, sequence).map(formatLine);
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
    const floor = standardFloor("solo");
    const dialect = treeDialect(floor);
    const { sequence } = compileDance(readDance("fixture.dance"), floor);
    const s = schedule(sequence, dialect, tempo(112));
    const lines = listing(s.programs.lark!, dialect, sequence).map(formatLine);
    expect(lines.find((l) => l.startsWith("beat 4 ·"))).toBe("beat 4 · body · stand · look ahead");
    expect(lines.every((l) => !l.includes("take"))).toBe(true);
  });
});
