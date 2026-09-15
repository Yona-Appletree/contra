import { createHall, dist, poseAt } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { danceBySlug } from "../../dances/index.js";
import { danceAlone } from "../../dances/oracle.js";
import { DUPLE_IMPROPER, PLACE_PITCH_PX } from "../../formation/dupleImproper.js";
import { contraCyclePlanner } from "../../set/planCycle.js";
import { relate } from "../../set/relations.js";
import { modelFromSet } from "../../set/SetModel.js";
import { setRulesFor } from "../../set/SetRules.js";
import { contraDataFigures } from "./index.js";

/**
 * **The long wave's hands** (M7b): Whoosh's `N1R` as a measurement.
 *
 * The transcript writes *"Balance long wave (N1R, men face in)"* and the figure
 * is told only the second half of that. Which hand each dancer really gives
 * follows from where the line is standing and which way each dancer is looking,
 * so `N1R` is a claim the dance can be checked against rather than a parameter —
 * see `kinds/wave.ts`. This is the check.
 *
 * Whoosh's wave is at beat 16, after A1 has run a grand right and left out along
 * the set and three figures back, so the line is **not** standing on its own
 * slots. That is exactly the case M7's lattice reading got wrong.
 */

const RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

/** The beat the wave is held on: one beat in, after `closeBeats`. */
const HELD: number = 17;

const modelAt = (couples: number) =>
  modelFromSet(
    DUPLE_IMPROPER,
    createHall(DUPLE_IMPROPER, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!,
    new Map(),
  );

describe("balance the long wave, in Whoosh", () => {
  const dance = danceBySlug("whoosh");
  const table = setRulesFor(DUPLE_IMPROPER).relations;

  it("gives every N1 pair their right hands, at every line length", () => {
    for (const couples of [2, 3, 4, 5, 6]) {
      const timeline = danceAlone(dance, couples, 24, {}, RUN).timeline();
      const model = modelAt(couples);
      let pairs = 0;
      for (const me of Object.keys(model.dancers)) {
        const n1 = relate(model, table, me, { kind: "neighbor", k: 1 });
        if (n1 === undefined) continue;
        const mine = poseAt(timeline, me, HELD);
        const theirs = poseAt(timeline, n1, HELD);
        const hand = mine.hands.R;
        const other = theirs.hands.R;
        // They are holding hands only if both right hands are placed on the
        // same floor point; a hand that is `"down"` is not in the wave at all.
        if (hand === "down" || other === "down") continue;
        if (dist(hand.p, other.p) > 1e-6) continue;
        pairs += 1;
      }
      // Every dancer with an N1 in the wave: a pair per two of them.
      const withN1 = Object.keys(model.dancers).filter(
        (me) => relate(model, table, me, { kind: "neighbor", k: 1 }) !== undefined,
      ).length;
      expect(pairs, `${String(couples)} couples`).toBe(withN1);
    }
  });

  it("leaves everybody where they were standing — a balance goes nowhere", () => {
    const timeline = danceAlone(dance, 4, 24, {}, RUN).timeline();
    for (const dancer of timeline.dancers()) {
      const before = poseAt(timeline, dancer, 16).p;
      const after = poseAt(timeline, dancer, 20).p;
      expect(dist(before, after), dancer).toBeLessThan(1e-6);
    }
  });

  it("is not standing on its own slots, which is the case that broke it", () => {
    // The evidence for the paragraph in `kinds/wave.ts`: at four couples every
    // dancer in the wave is one whole dancing place from the slot they started
    // the time through on, so a wave read off the lattice would have moved each
    // of them 20 px sideways and handed them the wrong neighbour.
    const timeline = danceAlone(dance, 4, 24, {}, RUN).timeline();
    for (const dancer of timeline.dancers()) {
      const home = poseAt(timeline, dancer, 0).p;
      expect(dist(poseAt(timeline, dancer, 16).p, home), dancer).toBeCloseTo(PLACE_PITCH_PX, 6);
    }
  });

  it("joins each dancer to the dancers standing beside them and nobody else", () => {
    const timeline = danceAlone(dance, 6, 24, {}, RUN).timeline();
    for (const dancer of timeline.dancers()) {
      const me = poseAt(timeline, dancer, HELD);
      for (const side of ["L", "R"] as const) {
        const hand = me.hands[side];
        if (hand === "down") continue;
        // A joined hand sits half way between two dancers one dancing place
        // apart, so it is never more than half a place from its own owner.
        expect(dist(hand.p, me.p), `${dancer} ${side}`).toBeLessThan(PLACE_PITCH_PX);
      }
    }
  });
});
