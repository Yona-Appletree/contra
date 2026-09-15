import { createHall, createLibrary, createScriptDecider } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { createContraRegistry } from "../figures/registry.js";
import { danceBySlug } from "./index.js";

/**
 * C3 requirement 4: "Overlaps still resolve the way `callAt` does now (the
 * earliest-started utterance wins)." Shorter, spoken-length windows overlap
 * less than the old fixed six-beat ones did, but they still can — Butter's
 * own first two figures are the demo's own example.
 *
 * `callAt` itself lives in `apps/web/src/routes/hall.tsx` and is not
 * exported, so this proves the timeline really does carry two overlapping
 * utterances (the situation `callAt`'s `reduce((a, b) => (a.start <= b.start
 * ? a : b))` resolves) rather than re-testing `callAt`'s own one-line rule.
 */
describe("overlapping calls: the earliest-started utterance is the one the bubble shows", () => {
  it("butter's SHIFT LEFT and CIRCLE LEFT THREE QUARTERS overlap at the top of A1", () => {
    const dance = danceBySlug("butter")!;
    const registry = createContraRegistry();
    const hall = createHall(BECKET, [{ id: "s0", couples: 4, centre: [0, 0], axis: 90 }]);
    const decider = createScriptDecider(
      { slug: "p", items: [{ dance: dance.slug, medley: "m", timesThrough: 1 }] },
      registry,
      hall,
      createLibrary([dance], [BECKET]),
    );
    decider.advance(8);
    const said = decider.timeline().utterances();
    // Butter's slide keeps its own words — "SHIFT LEFT" is a flourish no
    // figure's forms can say — and its circle does not, so on the **bare**
    // decider (no `callsFor`) the circle says the figure contract's own line.
    const shift = said.find((u) => u.text === "SHIFT LEFT")!;
    const circle = said.find((u) => u.text === "CIRCLE LEFT")!;

    // A genuine overlap, not just adjacency: each one's window covers a beat
    // the other's does too.
    expect(shift.start).toBeLessThan(circle.end);
    expect(circle.start).toBeLessThan(shift.end);

    // Both are clamped to the programme's own start, so this is a tie — the
    // schedule's own order (SHIFT LEFT first) is what `callAt` falls back to
    // via `Array.prototype.reduce`'s left-to-right, first-wins-on-a-tie walk.
    expect(shift.start).toBe(0);
    expect(circle.start).toBe(0);
  });
});
