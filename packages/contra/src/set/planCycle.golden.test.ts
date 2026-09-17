import type { Beat, DancerId } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "../dances/index.js";
import { LAB_RUN } from "../dances/danceLab.js";
import { danceAlone, linesFor } from "../dances/oracle.js";
import type { DanceGolden } from "./danceGolden.js";
import {
  danceGolden,
  danceGoldenKey,
  traceDance,
  updatingDanceGolden,
  writeDanceGolden,
} from "./danceGolden.js";

/**
 * **The deletion's own proof that nothing moved.**
 *
 * Every demo dance, at every line length its formation is checked at, on the
 * path the app dances, compared pose for pose against the poses the same code
 * produced at the last commit that still held the coded figure layer. Every
 * dancer, every half beat, two times through: position within
 * {@link TOLERANCE} px, facing within {@link TOLERANCE}°, and the dancers found
 * in the same order.
 *
 * This is AC1's tolerance and AC1's spirit on the one comparison M11 can still
 * make. AC1 itself — the ten threadable demo dances through the contra planner
 * *with every figure bridged*, against the decider's own planner over the coded
 * registry — compared two halves of the coded layer, passed at 1e-9 from M1
 * until this milestone, and cannot outlive the layer it was about. Its result
 * is recorded in `docs/acceptance.md`; `danceGolden.ts` says why at length.
 *
 * **A diff here is a bug, not a tolerance to raise.** If the deletion moved a
 * dancer, this is where it says so.
 */
const TOLERANCE = 1e-9;

/** Two times through, which is what every other dance check uses. */
const UNTIL: Beat = 128;

/**
 * Every beat.
 *
 * Within-figure timing is covered an order of magnitude finer by the per-figure
 * fixtures, which sample every 1/8 beat; what this golden is for is the *dance*
 * — where resolution puts people, call after call, at every line length — and
 * a dancer who is in the right place on every beat of two times through, at
 * 1e-9, has not been moved by the deletion. It is also what keeps the file to a
 * few megabytes rather than a few tens of them.
 */
const STEP: Beat = 1;

const golden: DanceGolden = updatingDanceGolden()
  ? {
      sampledAt: "3f44e4d (2026-09-17), whose tree is main 99ad224 plus one docs file",
      step: STEP,
      until: UNTIL,
      runs: {},
    }
  : danceGolden();

if (updatingDanceGolden()) {
  for (const dance of DEMO_DANCES) {
    for (const couples of linesFor(dance)) {
      const timeline = danceAlone(dance, couples, UNTIL, {}, LAB_RUN).timeline();
      golden.runs[danceGoldenKey(dance.slug, couples)] = {
        dance: dance.slug,
        couples,
        dancers: timeline.dancers(),
        poses: traceDance(timeline, UNTIL, STEP),
      };
    }
  }
  writeDanceGolden(golden);
}

describe("the demo dances are where the deletion found them", () => {
  it("covers every demo dance at every line length it is checked at", () => {
    const want = DEMO_DANCES.flatMap((dance) =>
      linesFor(dance).map((couples) => danceGoldenKey(dance.slug, couples)),
    ).sort();
    expect(Object.keys(golden.runs).sort()).toEqual(want);
    expect(golden.step).toBe(STEP);
    expect(golden.until).toBe(UNTIL);
  });

  for (const dance of DEMO_DANCES) {
    for (const couples of linesFor(dance)) {
      it(`${dance.slug} at ${String(couples)} couples`, () => {
        const run = golden.runs[danceGoldenKey(dance.slug, couples)];
        if (run === undefined) throw new Error("no recorded run; the case above says so");
        const timeline = danceAlone(dance, couples, UNTIL, {}, LAB_RUN).timeline();

        // The same dancers, found in the same order: `timeline.dancers()` is
        // insertion-ordered, and who is at which index is part of the claim.
        expect(timeline.dancers()).toEqual(run.dancers);

        const now = traceDance(timeline, UNTIL, STEP);
        const worst = { positionPx: 0, facingDeg: 0, where: "" };
        const steps = Math.round(UNTIL / STEP);
        for (const dancer of run.dancers as readonly DancerId[]) {
          const rows = run.poses[dancer];
          if (rows === undefined) throw new Error(`${dancer}: no recorded poses`);
          for (let i = 0; i <= steps; i++) {
            const row = rows[i];
            if (row === undefined) throw new Error(`${dancer}: the golden stops at ${String(i)}`);
            const pose = now[dancer]?.[i];
            if (pose === undefined) throw new Error(`${dancer}: nothing planned at ${String(i)}`);
            const px = Math.max(
              Math.abs((row[0] ?? 0) - (pose[0] ?? 0)),
              Math.abs((row[1] ?? 0) - (pose[1] ?? 0)),
            );
            const deg = Math.abs((row[2] ?? 0) - (pose[2] ?? 0));
            if (px > worst.positionPx || deg > worst.facingDeg) {
              worst.where = `${dancer} at beat ${String(i * STEP)}`;
            }
            worst.positionPx = Math.max(worst.positionPx, px);
            worst.facingDeg = Math.max(worst.facingDeg, deg);
          }
        }
        expect(worst.positionPx, `${worst.where}: position`).toBeLessThan(TOLERANCE);
        expect(worst.facingDeg, `${worst.where}: facing`).toBeLessThan(TOLERANCE);
      });
    }
  }
});
