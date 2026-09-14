import { dist } from "@caller/core";
import { withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { allemande } from "./allemande.js";
import { handForwardAngle } from "../pair/forwardAngle.js";
import { figureMoves, figureProblems, probeFigure, probeGroup, stationSpot } from "./testing.js";

describe("allemande", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      for (const hand of ["L", "R"] as const) {
        for (const amount of [1, 1.5, 2]) {
          for (const pairs of ["neighbors", "partners"] as const) {
            expect(
              figureProblems(probeFigure(allemande, { hand, amount, pairs }, { group })),
              `${hand} ${amount} ${pairs}`,
            ).toEqual([]);
          }
        }
      }
    });
  }

  it("comes home after a whole turn and changes places after a turn and a half", () => {
    const once = figureMoves(allemande, { amount: 1 });
    expect(once["1L"]!.p[0]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "1L").p[0], 9);
    expect(once["1L"]!.p[1]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "1L").p[1], 9);
    const half = figureMoves(allemande, { amount: 1.5 });
    expect(half["1L"]!.p[0]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "2R").p[0], 9);
    expect(half["1L"]!.p[1]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "2R").p[1], 9);
  });

  it("turns the other way when the other hand is given", () => {
    const left = figureMoves(allemande, { hand: "L", amount: 0.25 });
    const right = figureMoves(allemande, { hand: "R", amount: 0.25 });
    expect(dist(left["1L"]!.p, right["1L"]!.p)).toBeGreaterThan(1);
  });

  it("leaves the pair facing each other", () => {
    const ends = figureMoves(allemande, { amount: 1 });
    const gap = (((ends["1L"]!.facing - ends["2R"]!.facing) % 360) + 360) % 360;
    expect(gap).toBeCloseTo(180, 6);
  });

  /**
   * The same gate G1 ruling the pair allemande carries, on the figure a dance
   * actually calls: the joined arm stays at least 30° forward of the shoulder
   * line for the whole of the turn, because an arm cannot take a pull from
   * behind it. `inward` is 45°, which is the torso turn that does it.
   */
  it("keeps the joined arm forward of the shoulder line (gate G1)", () => {
    expect(allemande.defaults.inward).toBe(45);
    for (const formation of [DUPLE_IMPROPER, BECKET]) {
      const group = probeGroup(formation);
      for (const hand of ["L", "R"] as const) {
        for (const amount of [1, 1.5, 2]) {
          const params = withDefaults(allemande, { hand, amount }, allemande.beats);
          for (let n = Math.ceil(1.3 * 8); n <= (allemande.beats - 0.9) * 8; n++) {
            const t = n / 8;
            for (const station of group.stations) {
              const pose = allemande.sample(group, station.id, t, params);
              const forward = handForwardAngle(pose, hand);
              if (forward === null) continue;
              expect(
                forward,
                `${formation.id} ${station.id} ${hand} ${amount} at t=${t}`,
              ).toBeGreaterThanOrEqual(30);
            }
          }
        }
      }
    }
  });
});
