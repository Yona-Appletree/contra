import { describe, expect, it } from "vitest";
import { danceSources, runNamed } from "./dances/load.js";
import { run } from "./pipeline.js";

/** The fixtures, plus one module written here. */
const withSource = (name: string, text: string) => [
  ...danceSources(),
  { name: `${name}.dance`, text },
];

describe("run", () => {
  it("takes the pair fixture through every layer", () => {
    const result = runNamed("fixture", { bpm: 112 });

    // The proof's remaining red dots are the debugger's to show honestly (the
    // solver's torso and head rates); what this asserts is that nothing
    // between the text and the solved bodies gave up.
    expect(result.errors).toEqual([]);
    expect(result.endBeat).toBe(40);
    expect(result.sequence?.title).toBe("the pair");
    expect(result.sequence?.dialect).toBe("Pair");
    expect(result.sequence?.perDancer["L"]?.length).toBe(6);
    expect(result.solved).toBeDefined();
    for (const dancer of result.dialect!.dancers) {
      const solved = result.solved?.trajectories[dancer];
      expect(solved?.length).toBe(result.endBeat * result.tempo.samplesPerBeat + 1);
      expect(solved?.points.head).toHaveLength(solved?.length ?? 0);
      expect(result.solved?.hands[dancer]?.right).toHaveLength(solved?.length ?? 0);
      expect(result.listings[dancer]?.length).toBeGreaterThan(0);
    }
  });

  it("runs the solo dancer too", () => {
    const result = runNamed("solo", { bpm: 112 });
    expect(result.errors).toEqual([]);
    expect(result.dialect?.dancers).toEqual(["L"]);
    expect(result.solved).toBeDefined();
  });

  it("stops at a parse error with nothing after it", () => {
    const result = run({
      sources: withSource("broken-here", "fn d() { setup { Pair(1); }\n"),
      dance: "d",
    });
    expect(result.errors[0]?.stage).toBe("parse");
    expect(result.sequence).toBeUndefined();
    expect(result.schedule).toBeUndefined();
    expect(result.solved).toBeUndefined();
  });

  it("reports what the checker minds, with a span, and runs nothing after it", () => {
    const result = run({
      sources: withSource(
        "wrong-hand",
        `use contra::{Role, allemande};
use pair::{Pair};

fn wrong-hand() {
  setup { Pair(1); }
  allemande(opposite, Robin, beats = 8);
}
`,
      ),
      dance: "wrong-hand",
    });
    const check = result.errors.find((e) => e.stage === "check");
    expect(check?.message).toContain("Robin");
    expect(check?.span?.file).toBe("wrong-hand.dance");
    expect(result.sequence).toBeUndefined();
  });

  it("names a dance it cannot find", () => {
    const result = run({ sources: danceSources(), dance: "not-a-dance" });
    expect(result.errors.map((e) => e.message)).toContain('there is no dance called "not-a-dance"');
  });

  it("reports an allemande with no beats to turn in and still schedules what it can", () => {
    const result = run({
      sources: withSource(
        "hurry",
        `use contra::{Role, allemande};
use pair::{Pair};

fn hurry() {
  setup { Pair(1); }
  allemande(opposite, Right, beats = 2);
}
`,
      ),
      dance: "hurry",
      bpm: 112,
    });
    expect(result.errors.some((e) => e.stage === "schedule")).toBe(true);
    expect(result.sequence).toBeDefined();
    expect(result.schedule).toBeDefined();
  });

  it("says a move has no figure, at its span, and stands the dancers for its beats", () => {
    const result = runNamed("butter", { args: { "minor-sets": 1 }, times: 1, bpm: 112 });
    const noFigure = result.errors.filter((e) => e.kind === "NoFigure");
    // Two moves, not one per dancer per time through (D5).
    expect(noFigure.map((e) => e.message.replace(/ \(\d+ calls\)$/, ""))).toEqual([
      'no figure for "chain": the move stands for 8 beats',
      'no figure for "hey": the move stands for 16 beats',
    ]);
    expect(noFigure[0]?.span?.file).toBe("butter.dance");
    const calls = result.sequence!.perDancer["0-1L"]!;
    const chain = calls.find((c) => c.path === "chain")!;
    expect(chain.figure.id).toBe("standing");
    expect(chain.beats).toBe(8);
  });
});
