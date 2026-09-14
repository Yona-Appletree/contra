import { poseAt } from "@caller/choreo";
import { DEMO_DANCES } from "@caller/contra";
import { layoutHall } from "@caller/hall";
import { describe, expect, it } from "vitest";
import { CYCLE_BEATS, ITEM_BEATS, createDemoProgram } from "./program.js";

/**
 * Every dancer stays on the dance floor, all evening.
 *
 * The hall's floor is laid out from the longest line's couple count, and each
 * formation lays its own line out from the point the hall gives it. Those two
 * only agree if the formation's set is no longer than the hall thinks a line
 * is — and a becket set is longer than a duple improper one of the same size,
 * because it needs a waiting place beyond each end. This is the one place in
 * the repo that can say so: `@caller/contra` knows nothing about the hall and
 * `@caller/hall` knows nothing about formations.
 *
 * How far outside the floor a dancer may be: the renderer draws a body about
 * eleven px across, so a torso centre on the floor's own edge is still half a
 * body over the skirting. The margin is generous because what this test is for
 * is a line that runs off the end, not a pixel of overlap.
 */
const MARGIN_PX = 2;

describe("the hall's floor holds the whole programme", () => {
  const world = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
  const program = createDemoProgram(world);

  for (const [index, dance] of DEMO_DANCES.entries()) {
    it(`${dance.slug}: every dancer is on the floor`, () => {
      // Two times through, plus the line-up into the next dance.
      const from = index * ITEM_BEATS;
      program.decider.advance(from + ITEM_BEATS + CYCLE_BEATS);
      const timeline = program.decider.timeline();
      let worstTop = Infinity;
      let worstBottom = Infinity;
      for (let beat = from; beat <= from + ITEM_BEATS; beat += 1 / 4) {
        for (const dancer of timeline.dancers()) {
          const { p } = poseAt(timeline, dancer, beat);
          worstTop = Math.min(worstTop, p[1] - world.floorTop);
          worstBottom = Math.min(worstBottom, world.floorBottom - p[1]);
        }
      }
      expect(worstTop, "above the top of the floor").toBeGreaterThan(-MARGIN_PX);
      expect(worstBottom, "below the bottom of the floor").toBeGreaterThan(-MARGIN_PX);
    });
  }
});
