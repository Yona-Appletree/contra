import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER, PLACE_PITCH_PX } from "../formation/dupleImproper.js";
import { balance, balanceRing } from "./balance.js";
import { withDefaults } from "@caller/choreo";
import { CONTRA_ROLES } from "../roles.js";
import type { Spot } from "./ContraFigure.js";
import { planContext } from "./ContraFigure.js";
import { RING_FOOTPRINT_MARGIN_PX } from "./ring.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("balance", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      for (const pairs of ["neighbors", "partners"] as const) {
        for (const hold of ["two", "one", "none"] as const) {
          expect(
            figureProblems(probeFigure(balance, { pairs, hold }, { group })),
            `${pairs} ${hold}`,
          ).toEqual([]);
        }
      }
      expect(figureProblems(probeFigure(balanceRing, {}, { group }))).toEqual([]);
    });
  }

  it("closes the pair to the frame's hold spacing, which is where a swing starts", () => {
    for (const pairs of ["neighbors", "partners"] as const) {
      const ends = figureMoves(balance, { pairs });
      expect(dist(ends["1L"]!.p, ends[pairs === "neighbors" ? "2R" : "1R"]!.p)).toBeCloseTo(
        HOLD_SPACING_PX,
        9,
      );
    }
  });

  it("leaves the pair facing each other", () => {
    const ends = figureMoves(balance, { pairs: "neighbors" });
    expect(Math.abs(((ends["1L"]!.facing - ends["2R"]!.facing) % 360) + 360) % 360).toBeCloseTo(
      180,
      6,
    );
  });

  it("closes the ring to the footprint-clamped radius while it rocks", () => {
    // Mid-figure, which is what AC1 has to hold for: everybody on one ring,
    // all the same distance out. F11: the ring's natural (arm-based) radius
    // is clamped to this rectangle's narrower half-extent
    // (PLACE_PITCH_PX / 2 = 10 px) plus RING_FOOTPRINT_MARGIN_PX.
    // `rock: 0` takes the ±1 px rock out, so the number under test is the ring.
    const ring = ringSpotsAt(2, { rock: 0 });
    const radii = Object.values(ring).map((spot) => dist(spot.p, CENTRE));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 9);
    expect(radii[0]!).toBeCloseTo(PLACE_PITCH_PX / 2 + RING_FOOTPRINT_MARGIN_PX, 9);
  });

  it("steps back out to the places it started from", () => {
    // M9: "balance the ring and petronella" puts a dancer on the next place of
    // the *set*, and a dance ending on a ring figure has to be back on its
    // places for the progression to land. So the ring balance ends where it
    // began, facing the middle.
    const ends = figureMoves(balanceRing);
    for (const station of DUPLE_IMPROPER.group(4)) {
      expect(spotError(ends[station.id]!, stationSpot(DUPLE_IMPROPER, station.id))).toBeCloseTo(
        0,
        9,
      );
    }
  });

  it("leaves everybody closed up when it is told not to open out", () => {
    // A balance for two keeps this shape, because the swing that follows wants
    // the pair closed; `balance-ring` only differs in its default.
    const ends = figureMoves(balanceRing, { openOut: false });
    const radii = Object.values(ends).map((spot) => dist(spot.p, CENTRE));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 9);
    expect(radii[0]!).toBeCloseTo(PLACE_PITCH_PX / 2 + RING_FOOTPRINT_MARGIN_PX, 9);
  });
});

/** The middle of a duple improper minor set, frame-local. */
const CENTRE: [number, number] = [0, 0];

/** Where the ring balance puts everybody `t` beats in. */
function ringSpotsAt(t: number, params: { rock?: number } = {}): Record<string, Spot> {
  const stations = DUPLE_IMPROPER.group(4);
  const resolved = withDefaults(balanceRing, params, balanceRing.beats);
  const plan = balanceRing.plan(
    planContext(stations, CONTRA_ROLES, HOLD_SPACING_PX, resolved.from),
    resolved,
  );
  return Object.fromEntries(
    stations.map((s) => {
      const sample = plan.at(s.id, t);
      return [s.id, { p: sample.p, facing: sample.facing }];
    }),
  );
}
