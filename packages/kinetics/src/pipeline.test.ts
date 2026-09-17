import { describe, expect, it } from "vitest";
import { PAIR_SOLO } from "./dialect/pair/Pair.js";
import { FIXTURE_PROGRAM } from "./lang/fixture.js";
import { run } from "./pipeline.js";

describe("run", () => {
  it("takes the fixture through every layer", () => {
    const result = run(FIXTURE_PROGRAM, { bpm: 112 });

    // The proof's remaining red dots are the debugger's to show honestly (the
    // hip's acceleration where a walk starts, the solver's torso and head
    // rates); what this asserts is that nothing between the text and the
    // solved bodies gave up.
    expect(result.errors).toEqual([]);
    expect(result.parseError).toBeUndefined();
    expect(result.endBeat).toBeGreaterThan(0);
    expect(result.sequence?.perDancer.lark?.length).toBeGreaterThan(0);
    expect(result.solved).toBeDefined();
    for (const dancer of result.dialect.dancers) {
      const solved = result.solved?.trajectories[dancer];
      expect(solved?.length).toBe(result.endBeat * result.tempo.samplesPerBeat + 1);
      expect(solved?.points.head).toHaveLength(solved?.length ?? 0);
      expect(result.solved?.hands[dancer]?.right).toHaveLength(solved?.length ?? 0);
      expect(result.listings[dancer]?.length).toBeGreaterThan(0);
    }
  });

  it("runs the solo dancer too", () => {
    const result = run(FIXTURE_PROGRAM, { dialect: PAIR_SOLO, bpm: 112 });
    expect(result.errors).toEqual([]);
    expect(result.dialect.dancers).toHaveLength(1);
    expect(result.solved).toBeDefined();
  });

  it("stops at a parse error with nothing after it", () => {
    const result = run("bow(", { bpm: 112 });
    expect(result.parseError?.stage).toBe("parse");
    expect(result.program).toBeUndefined();
    expect(result.sequence).toBeUndefined();
    expect(result.schedule).toBeUndefined();
    expect(result.solved).toBeUndefined();
    expect(result.errors).toHaveLength(1);
  });

  it("reports an allemande with no beats to turn in and still schedules what it can", () => {
    const result = run("partner = select(across)\nallemande(partner, right, 1, 2)\n", { bpm: 112 });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.sequence).toBeDefined();
  });
});
