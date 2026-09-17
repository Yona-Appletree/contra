import { createHall, createLibrary, createScriptDecider, spokenBeats } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { createContraRegistry } from "../figures/registry.js";
import { contraCyclePlanner } from "../set/planCycle.js";

/**
 * `ContraCall.spokenBeats` (a dance's own override of the rhythm estimate) has
 * to survive `chainCalls`, which rebuilds every call field by field rather
 * than spreading the input — the same reason `who`, `group` and `call` are
 * each named there rather than assumed. Written here rather than as a
 * `chain.ts` unit test (which does not exist yet, and inventing one is more
 * than this override needs) because what actually matters is that the
 * decider reads the dance's own number instead of estimating.
 */
describe("a dance's own spokenBeats reaches the decider", () => {
  it("overrides the estimate for one call, and leaves an un-overridden one alone", () => {
    const dance = contraDance({
      slug: "tiny",
      title: "A Tiny Dance",
      author: "C3",
      formation: DUPLE_IMPROPER,
      phrases: [
        {
          name: "A1",
          figures: [
            // The estimate for "SWING" alone is one beat; ten is absurd on
            // purpose, so a passing test can only mean the override, never a
            // coincidence with the estimate.
            { figure: "swing", beats: 8, params: { pairs: "neighbors" }, spokenBeats: 10 },
            { figure: "long-lines", beats: 8 },
          ],
        },
      ],
    });

    expect(
      dance.phrases[0]!.figures[0]!.spokenBeats,
      "chainCalls must carry spokenBeats through, field by field, like who/group/call",
    ).toBe(10);
    expect(dance.phrases[0]!.figures[1]!.spokenBeats).toBeUndefined();

    const registry = createContraRegistry();
    const hall = createHall(DUPLE_IMPROPER, [{ id: "s0", couples: 4, centre: [0, 0], axis: 90 }]);
    const decider = createScriptDecider(
      { slug: "p", items: [{ dance: dance.slug, medley: "m", timesThrough: 1 }] },
      registry,
      hall,
      createLibrary([dance], [DUPLE_IMPROPER]),
      // **The contra planner**, because there is no other one since M11; see
      // `oracle.ts`'s `DanceRunOptions`.
      { cycle: contraCyclePlanner },
    );
    decider.advance(16);
    const said = decider.timeline().utterances();

    const swing = said.find((u) => u.text === registry.get("swing").call)!;
    // The dance's own first call: its lead (firstCallLeadBeats, 2) is clipped
    // to the programme's own start, and held for the override's ten beats
    // plus the default one-beat tail — not the estimate's one beat plus tail.
    expect(swing.start).toBe(0);
    expect(swing.end - swing.start).toBe(10 + 1);

    const longLines = said.find((u) => u.text === registry.get("long-lines").call)!;
    const estimate = spokenBeats(registry.get("long-lines").call);
    expect(longLines.end - longLines.start).toBe(estimate + 1);
  });
});
