import { describe, expect, it } from "vitest";
import { loadMoves, readDance, standardFloor } from "./dances/load.js";
import { run } from "./pipeline.js";

const FIXTURE = readDance("fixture.dance");
const opts = (floorName: string) => ({
  floor: standardFloor(floorName),
  moves: loadMoves(),
  bpm: 112,
});

describe("run", () => {
  it("takes the fixture through every layer", () => {
    const result = run(FIXTURE, opts("pair"));

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
    const result = run(FIXTURE, opts("solo"));
    expect(result.errors).toEqual([]);
    expect(result.dialect.dancers).toHaveLength(1);
    expect(result.solved).toBeDefined();
  });

  it("stops at a syntax error with nothing after it", () => {
    const result = run("dance d() { bow(", opts("pair"));
    expect(result.parseError?.stage).toBe("parse");
    expect(result.program).toBeUndefined();
    expect(result.sequence).toBeUndefined();
    expect(result.schedule).toBeUndefined();
    expect(result.solved).toBeUndefined();
    expect(result.errors).toHaveLength(1);
  });

  it("reports what the checker minds, with a span, and still compiles the rest", () => {
    const result = run(
      "dance d($partner: Place) { allemande($partner, Robin); bow($partner); }",
      opts("pair"),
    );
    expect(result.errors.map((e) => `${e.stage}: ${e.message}`)).toContain(
      "check: Robin is not a Hand: Left, Right",
    );
    expect(result.errors.every((e) => e.stage !== "parse")).toBe(true);
    expect(result.sequence).toBeDefined();
  });

  it("names a $ the floor does not provide", () => {
    const result = run("dance d($neighbor: Place) { swing($neighbor); }", opts("pair"));
    expect(result.errors.map((e) => e.message)).toContain("pair does not provide $neighbor");
  });

  it("reports an allemande with no beats to turn in and still schedules what it can", () => {
    const result = run(
      "dance d($partner: Place) { allemande($partner, Right, beats = 2); }",
      opts("pair"),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.sequence).toBeDefined();
  });
});
