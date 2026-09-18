import { describe, expect, it } from "vitest";
import { runNamed } from "../dances/load.js";
import { PLACE_PX, driftOf } from "./drift.js";

/**
 * The drift check (risk R1), on the two ends of its own scale: a dance whose
 * text and floor agree says nothing, and Butter — whose becket moves a couple
 * twice as far as its shift has beats for — says it in numbers.
 */
describe("drift", () => {
  it("says nothing when every figure ends on the seat the dance gives it", () => {
    const result = runNamed("fixture", { bpm: 112 });
    expect(driftOf(result.schedule!, result.sequence!)).toEqual([]);
  });

  it("names the figure, the beat, the dancer, the place and the distance", () => {
    const result = runNamed("butter", { args: { "minor-sets": 3 }, times: 7, bpm: 112 });
    const drift = driftOf(result.schedule!, result.sequence!);
    expect(drift.length).toBeGreaterThan(0);
    for (const w of drift) {
      expect(w.kind).toBe("Drift");
      expect(result.dialect!.dancers).toContain(w.dancer);
      expect(w.beat).toBeGreaterThan(0);
      expect(w.span?.file).toBe("butter.dance");
      expect(w.message).toMatch(/ends \d+(\.\d)? px from the seat the commit gave/);
    }
    // Only figures that claim to end at a seat are checked: the shift walks to
    // one, the swing and the chain land in the line, the circle and the hey
    // do not. Butter's chain to partner drifts nothing since M3 (the swing
    // before it puts the robin on the right side; `dances/butter.test.ts`);
    // a chain to neighbour does (`dances/robins.test.ts`).
    expect(new Set(drift.map((w) => w.message.split(" ")[0]))).toEqual(new Set(["shift", "swing"]));
  });

  it("measures a place as half a couple's spacing", () => {
    // 0.8 m at 25 px to the metre: a dancer further than this from their seat
    // is standing in somebody else's.
    expect(PLACE_PX).toBe(20);
  });
});
