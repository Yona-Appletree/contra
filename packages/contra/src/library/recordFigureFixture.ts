import type { PoseSample } from "@caller/core";
import type { Formation, StationId } from "@caller/choreo";
import { createGroup, withDefaults } from "@caller/choreo";
import type { ContraFigure, Spots } from "../figures/ContraFigure.js";
import { PROBE_STEP } from "../figures/testing.js";
import type { CompareCase, CompareOptions } from "./compareFigures.js";
import { COMPARE_AXIS, COMPARE_CENTRE, comparisonSet, displace } from "./compareFigures.js";
import type { FigureFixture, FixtureRun } from "./figureFixture.js";
import { ROW_FIELDS, fixtureKey } from "./figureFixture.js";

/**
 * **Temporary (M11, step 1): the recorder that writes a coded figure down.**
 *
 * It exists for exactly one run. Every per-figure golden that compared a
 * `FigureDefinition` against its hand-coded predecessor had the predecessor
 * sampled through this, the result committed as JSON beside the test, and then
 * this file and the figures it read were deleted in the same milestone.
 *
 * It is kept in the tree for one commit rather than run from a scratch script
 * so that what was recorded is exactly what the tests compare: the cases, the
 * formations, the starting arrangements and the sampling are the goldens' own,
 * read from the same `CompareOptions`, not a second copy of them that could
 * drift.
 */
export function recordFigure(
  coded: ContraFigure,
  options: CompareOptions,
  sampledAt: string,
): FigureFixture {
  const defaults = { ...(coded.defaults as Record<string, unknown>) };
  delete defaults["from"];
  delete defaults["carried"];
  const fixture: FigureFixture = {
    figure: coded.id,
    sampledAt,
    beats: coded.beats,
    call: coded.call,
    lead: coded.lead,
    defaults,
    runs: {},
  };
  for (const formation of options.formations) {
    options.cases.forEach((test, index) => {
      if (test.formations && !test.formations.includes(formation)) return;
      const run = recordOne(coded, formation, test, index, options);
      fixture.runs[fixtureKey(formation.id, run.from, index)] = run;
    });
  }
  return fixture;
}

function recordOne(
  coded: ContraFigure,
  formation: Formation,
  test: CompareCase,
  index: number,
  options: CompareOptions,
): FixtureRun {
  const params = { ...test.params };
  const from = test.from ?? "stations";
  const beats = options.beats ?? coded.beats;
  const { plan } = comparisonSet(formation, options.couples ?? 4, COMPARE_CENTRE, COMPARE_AXIS);

  const places: Spots = {};
  for (const station of plan.stations) {
    places[station.id] =
      from === "stations"
        ? { p: station.p, facing: station.facing }
        : displace(station.id, station.p, station.facing);
  }

  const group = createGroup(plan, formation.roleSet);
  const codedParams = withDefaults(coded, { ...(test.coded ?? params), from: places }, beats);
  const codedEnds = coded.ends(group, codedParams);

  const ends: Record<StationId, readonly number[]> = {};
  const samples: Record<StationId, readonly (readonly number[])[]> = {};
  const steps = Math.round(beats / PROBE_STEP);
  for (const station of plan.stations) {
    const end = codedEnds[station.id];
    if (end) ends[station.id] = [end.p[0], end.p[1], end.facing];
    const rows: number[][] = [];
    for (let i = 0; i <= steps; i++) {
      rows.push(rowOfPose(coded.sample(group, station.id, i * PROBE_STEP, codedParams)));
    }
    samples[station.id] = rows;
  }
  return { formation: formation.id, from, index, beats, ends, samples };
}

/**
 * A pose as a flat row; see `figureFixture.ts`'s `ROW_FIELDS` for the layout.
 *
 * **Not rounded.** Two of the eleven carriers agree with their coded
 * predecessor *exactly* — `expect(worst.position).toBe(0)` — and rounding the
 * fixture would turn that claim into a tolerance, which is the one thing a
 * retirement milestone must not do to a golden. `JSON.stringify` writes the
 * shortest text that round-trips a double, so the file holds the number the
 * coded figure produced and nothing else.
 *
 * Trailing zeros are dropped instead: a figure with nobody's hands placed and
 * no buzz-step feet writes eight numbers rather than twenty-two, and
 * {@link poseOfRow} reads a missing slot as zero.
 */
function rowOfPose(pose: PoseSample): number[] {
  const row = new Array<number>(ROW_FIELDS).fill(0);
  row[0] = pose.p[0];
  row[1] = pose.p[1];
  row[2] = pose.facing;
  row[3] = pose.look;
  row[4] = pose.lean;
  row[5] = pose.stepRate;
  row[6] = pose.flare;
  row[7] = pose.amp;
  row[8] = pose.buzz === true ? 1 : 0;
  if (pose.feet) {
    row[9] = 1;
    row[10] = pose.feet.L[0];
    row[11] = pose.feet.L[1];
    row[12] = pose.feet.R[0];
    row[13] = pose.feet.R[1];
  }
  for (const [base, side] of [
    [14, "L"],
    [18, "R"],
  ] as const) {
    const hand = pose.hands[side];
    if (hand === "down") continue;
    row[base] = 1;
    row[base + 1] = hand.p[0];
    row[base + 2] = hand.p[1];
    row[base + 3] = hand.drop;
  }
  let last = row.length;
  while (last > 0 && row[last - 1] === 0) last--;
  return row.slice(0, last);
}
