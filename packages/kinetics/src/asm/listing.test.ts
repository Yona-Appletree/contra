import { describe, expect, it } from "vitest";
import { PAIR, PAIR_SOLO } from "../dialect/pair/Pair.js";
import { FIGURES } from "../figures/registry.js";
import { compile } from "../lang/compile.js";
import { FIXTURE_PROGRAM } from "../lang/fixture.js";
import { parse } from "../lang/parse.js";
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
    const { sequence } = compile(parse(FIXTURE_PROGRAM), FIGURES, PAIR);
    const s = schedule(sequence, PAIR, tempo(112));
    const lines = listing(s.programs.lark!, PAIR, sequence).map(formatLine);
    expect(lines).toMatchSnapshot();
    expect(lines[0]).toBe("beat 0 · body · stand · look at robin · bow 25°");
    expect(lines).toContain(
      "beat 10 · body · step back and to the left 35 cm · look at robin · take right hands with robin — allemande-R",
    );
    expect(lines).toContain(
      "beat 11 · exit · step forward 10 cm · turn a quarter left · look at robin",
    );
    expect(lines.some((l) => l.startsWith("beat 19 · exit"))).toBe(true);
  });

  it("stands the solo dancer in plain words", () => {
    const { sequence } = compile(parse(FIXTURE_PROGRAM), FIGURES, PAIR_SOLO);
    const s = schedule(sequence, PAIR_SOLO, tempo(112));
    const lines = listing(s.programs.lark!, PAIR_SOLO, sequence).map(formatLine);
    expect(lines.find((l) => l.startsWith("beat 4 ·"))).toBe("beat 4 · body · stand · look ahead");
    expect(lines.every((l) => !l.includes("take"))).toBe(true);
  });
});
