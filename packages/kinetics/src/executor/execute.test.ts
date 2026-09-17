import { describe, expect, it } from "vitest";
import { EFFECTORS, JOINTS } from "../body/Body.js";
import { PAIR, PAIR_SOLO } from "../dialect/pair/Pair.js";
import { FIGURES } from "../figures/registry.js";
import { compile } from "../lang/compile.js";
import { FIXTURE_PROGRAM } from "../lang/fixture.js";
import { parse } from "../lang/parse.js";
import { kinematicsOf, proveMotion, type Violation } from "../motion/prove.js";
import { dist } from "../motion/Vec3.js";
import { schedule } from "../schedule/schedule.js";
import { solveBodies } from "../solver/solveBody.js";
import { capsAtTempo } from "../units/caps.js";
import { TAKE_BEATS } from "../units/limits.js";
import { tempo } from "../units/Tempo.js";
import { execute } from "./execute.js";

const T = tempo(112);

const run = (dialect = PAIR) => {
  const { sequence, errors } = compile(parse(FIXTURE_PROGRAM), FIGURES, dialect);
  expect(errors).toEqual([]);
  const scheduled = schedule(sequence, dialect, T);
  expect(scheduled.errors).toEqual([]);
  return { scheduled, executed: execute(scheduled, dialect, T) };
};

describe("the fixture, executed", () => {
  const { scheduled, executed } = run();
  const caps = capsAtTempo(T);

  it("samples every beat of the program, inclusive of the last", () => {
    expect(scheduled.endBeat).toBe(40);
    for (const id of PAIR.dancers) {
      const t = executed.trajectories[id]!;
      expect(t.beat0).toBe(0);
      expect(t.length).toBe(40 * T.samplesPerBeat + 1);
      for (const point of EFFECTORS) expect(t.points[point]).toHaveLength(t.length);
      for (const channel of ["facing", "lean", "holdWeightL", "holdWeightR"] as const) {
        expect(t.channels[channel]).toHaveLength(t.length);
      }
      // The joints are the solver's; the executor plans none of them.
      expect(t.points.head).toBeUndefined();
      expect(t.points.shoulderL).toBeUndefined();
    }
  });

  it("hands the solver an input it can read whole", () => {
    expect(executed.input.tempo).toBe(T);
    expect(executed.input.dialectRoles).toEqual({ lark: "lark", robin: "robin" });
    for (const id of PAIR.dancers) {
      const dancer = executed.input.dancers[id]!;
      expect(dancer.effectors).toBe(executed.trajectories[id]);
      expect(dancer.look).toHaveLength(dancer.effectors.length);
    }
  });

  /**
   * **AC2**, on the effectors the executor plans.
   *
   * The feet and both hands of both dancers pass the proof outright. The hip
   * does not, and the shortfall is the scheduler's rather than the
   * interpolation's: see the test below, which names it.
   */
  it("proves both dancers' feet and hands under every cap", () => {
    const rows: string[] = [
      "effector           max speed / cap      max accel / cap      px/beat, px/beat², 112 bpm",
    ];
    const violations: Violation[] = [];
    for (const id of PAIR.dancers) {
      const t = executed.trajectories[id]!;
      for (const point of EFFECTORS) {
        const kin = kinematicsOf(t, point);
        const speed = Math.max(...kin.speed);
        const accel = Math.max(...kin.accel);
        rows.push(
          [
            `${id} ${point}`.padEnd(18),
            `${speed.toFixed(2).padStart(6)} / ${caps[point].speedPxPerBeat.toFixed(2).padStart(6)}`,
            `${accel.toFixed(2).padStart(7)} / ${caps[point].accelPxPerBeat2.toFixed(2).padStart(6)}`,
            accel > caps[point].accelPxPerBeat2 || speed > caps[point].speedPxPerBeat
              ? "  OVER"
              : "",
          ].join("   "),
        );
      }
      violations.push(...proveMotion(t).filter((v) => v.point !== "hip"));
    }
    console.info(rows.join("\n"));
    expect(violations).toEqual([]);
  });

  /**
   * The hip's shortfall, pinned rather than smoothed away.
   *
   * Every violation is an acceleration at one of two seams, and both are the
   * same complaint: the scheduler plans a walk as equal steps with no ramp
   * into or out of it, so the hip is asked to be at full walking speed within
   * one beat of a standstill.
   *
   * - **beat 4**, the do-si-do stepping off: 8.68 px (35 cm) inside the first
   *   beat, from still. Bang-bang — the best any profile can do — needs about
   *   21.9 px/beat², or 305 cm/s², against a cap of 250. It is not the
   *   interpolation: no curve through those targets is legal.
   * - **beats 10–11**, the do-si-do closing into the allemande's entry: an
   *   8.68 px step reversed into a 3 px one, which is a corner rather than a
   *   stop.
   *
   * The fix is a cruise ramp in the scheduler's step plan (engine 2 had one:
   * `CRUISE_RAMP_BEATS`), not a bigger number in `CAPS`. Raising the cap is
   * the one thing this test exists to prevent.
   */
  it("reports the hip's two seams, and nothing else", () => {
    for (const id of PAIR.dancers) {
      const hip = proveMotion(executed.trajectories[id]!).filter((v) => v.point === "hip");
      expect(hip.length).toBeGreaterThan(0);
      expect(new Set(hip.map((v) => v.kind))).toEqual(new Set(["accel", "vjump"]));
      const beats = [...new Set(hip.map((v) => Math.floor(v.beat)))].sort((a, b) => a - b);
      expect(beats).toEqual([4, 10, 11]);
      const worst = Math.max(...hip.filter((v) => v.kind === "accel").map((v) => v.value));
      // 22.4 against 17.94: 25% over, not an order of magnitude.
      expect(worst).toBeLessThan(1.3 * caps.hip.accelPxPerBeat2);
    }
  });

  it("keeps both hands in reach of their shoulders the whole way through", () => {
    expect(executed.violations).toEqual([]);
  });

  it("holds the allemande with one shared point between the two dancers", () => {
    const lark = executed.trajectories.lark!;
    const robin = executed.trajectories.robin!;
    // Beat 14 is the middle of the first allemande, long past the take's ramp.
    const i = 14 * T.samplesPerBeat;
    expect(dist(lark.points.handR![i]!, robin.points.handR![i]!)).toBeCloseTo(0, 9);
  });

  it("takes the allemande's hand once and lets it go once", () => {
    for (const id of PAIR.dancers) {
      const holds = executed.input.dancers[id]!.holds;
      expect(holds).toHaveLength(1);
      const held = holds[0]!;
      expect(held.hand).toBe("right");
      expect(held.hold).toBe("allemande-R");
      expect(held.with).toBe(id === "lark" ? "robin" : "lark");
      // The take is emitted TAKE_BEATS before the allemande's body at beat 12.
      expect(held.fromSample).toBe((12 - TAKE_BEATS) * T.samplesPerBeat);
    }
  });

  it("ramps the take in and the release out over TAKE_BEATS", () => {
    const weight = executed.trajectories.lark!.channels.holdWeightR!;
    expect(weight[(12 - TAKE_BEATS) * T.samplesPerBeat]).toBeCloseTo(0, 9);
    expect(weight[12 * T.samplesPerBeat]).toBeCloseTo(1, 9);
    expect(weight[35 * T.samplesPerBeat]).toBeCloseTo(1, 9);
    expect(weight[(36 + TAKE_BEATS) * T.samplesPerBeat]).toBeCloseTo(0, 9);
    expect(weight.every((w) => w >= -1e-12 && w <= 1 + 1e-12)).toBe(true);
  });

  it("moves no hand further between two samples than a cap could have moved it", () => {
    // Continuity at the seams, stated as the thing a seam could break: the
    // take at beat 10, the release at beat 36 and every figure boundary.
    for (const id of PAIR.dancers) {
      const t = executed.trajectories[id]!;
      for (const point of ["handL", "handR"] as const) {
        const points = t.points[point]!;
        const jumpCap = caps[point].speedPxPerBeat / T.samplesPerBeat;
        for (let i = 1; i < points.length; i++) {
          expect(dist(points[i]!, points[i - 1]!)).toBeLessThan(jumpCap);
        }
      }
    }
  });

  it("looks at the other dancer, and down with the bow", () => {
    const look = executed.input.dancers.lark!.look;
    expect(look[0]).toBe("robin");
    // The bow's head goes down at the half beat; "down" resolves to the
    // direction the dancer already faces, because the lean carries the head.
    const half = Math.round(0.5 * T.samplesPerBeat);
    expect(look[half]).toEqual({ deg: expect.any(Number) });
    expect(look[2 * T.samplesPerBeat]).toBe("robin");
    // And the lean is what actually folds: 0 at the start, 25° at the bow.
    const lean = executed.trajectories.lark!.channels.lean!;
    expect(lean[0]).toBeCloseTo(0, 9);
    expect(Math.max(...lean)).toBeCloseTo(25, 6);
    expect(lean[lean.length - 1]).toBeCloseTo(0, 6);
  });
});

describe("the executor's output, handed to the body solver", () => {
  it("is a SolveInput P6 can solve whole, joints and all", () => {
    // A seam check, not a proof: whether the solved body is *legal* is P6's
    // own test to make, and it has its own violations to answer for. This one
    // says only that what the executor emits is what the solver reads.
    const { executed } = run();
    const solved = solveBodies(executed.input);
    for (const id of PAIR.dancers) {
      const t = solved.trajectories[id]!;
      for (const joint of JOINTS) expect(t.points[joint]).toHaveLength(t.length);
      for (const effector of EFFECTORS) {
        expect(t.points[effector]).toBe(executed.trajectories[id]!.points[effector]);
      }
      expect(solved.hands[id]!.right).toHaveLength(t.length);
    }
  });
});

describe("the fixture, danced alone", () => {
  it("stands the solo dancer still for forty beats with nothing in either hand", () => {
    const { executed } = run(PAIR_SOLO);
    const t = executed.trajectories.lark!;
    expect(Object.keys(executed.input.dancers)).toEqual(["lark"]);
    expect(executed.input.dancers.lark!.holds).toEqual([]);
    const hip = t.points.hip!;
    for (const p of hip) {
      expect(p.x).toBeCloseTo(hip[0]!.x, 9);
      expect(p.y).toBeCloseTo(hip[0]!.y, 9);
    }
    expect(proveMotion(t)).toEqual([]);
  });
});
