import type { Beat } from "@caller/core";
import type { AnyFigureDef, Dance, Decider, Group, Program, StationId } from "@caller/choreo";
import {
  closureReport,
  collisionReport,
  createHall,
  createLibrary,
  createScriptDecider,
  reachReport,
  withDefaults,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../../formation/becket.js";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import type { ContraFigure, HandJoin } from "../ContraFigure.js";
import { planContext } from "../ContraFigure.js";
import { circle } from "../circle.js";
import { createContraRegistry } from "../registry.js";
import { BECKET_SEQUENCE, DUPLE_SEQUENCE } from "../sequences.js";
import { PROBE_STEP, figureProblems, probeFigure, probeGroup } from "../testing.js";
import type { SpecParams } from "../language/index.js";
import { circleData, circleSpec } from "./circleSpec.js";

/** The parameter sets the coded `circle`'s own test runs it through, and back the other way. */
const CASES = [
  {},
  { places: 4 },
  { direction: "right" },
  { places: 1, direction: "right" },
  { places: 2, holdDrop: 4, stackPx: 0 },
] as const;

const FORMATIONS = [DUPLE_IMPROPER, BECKET];

/** A figure's plan for one group, the way the oracles build it. */
const planFor = (
  def: ContraFigure<never> | ContraFigure<SpecParams>,
  group: Group,
  params: object,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = def as ContraFigure<any>;
  const resolved = withDefaults(any, params, any.beats);
  return {
    resolved,
    plan: any.plan(
      planContext(group.stations, group.roleSet, group.frame.spacing, resolved.from),
      resolved,
    ),
  };
};

/** A join, written so two lists of them can be compared as sets. */
const joinKey = (join: HandJoin): string =>
  [`${join.a}.${join.aSide}`, `${join.b}.${join.bSide}`].sort().join("/");

describe("circle as data", () => {
  it("is data: it survives a round trip through JSON", () => {
    const copy = JSON.parse(JSON.stringify(circleSpec)) as typeof circleSpec;
    expect(copy).toEqual(circleSpec);
  });

  it("compiles to a figure with the coded one's call, timing and defaults", () => {
    expect(circleData.call).toBe(circle.call);
    expect(circleData.lead).toBe(circle.lead);
    expect(circleData.beats).toBe(circle.beats);
    expect(circleData.defaults).toEqual(circle.defaults);
    // Its own id, because it is registered separately from the coded figure.
    expect(circleData.id).toBe("circle-data");
  });

  for (const formation of FORMATIONS) {
    for (const params of CASES) {
      const what = `${formation.id} ${JSON.stringify(params)}`;

      it(`gives the very same pose as the coded circle at every ${PROBE_STEP} beat — ${what}`, () => {
        const group = probeGroup(formation);
        const coded = planFor(circle as never, group, params);
        const data = planFor(circleData, group, params);
        const beats: Beat = coded.resolved.beats;
        const ids: StationId[] = group.stations.map((s) => s.id);
        const steps = Math.round(beats / PROBE_STEP);

        let samples = 0;
        for (let i = 0; i <= steps; i++) {
          const t = i * PROBE_STEP;
          for (const id of ids) {
            expect(circleData.sample(group, id, t, data.resolved), `${what} ${id} @ ${t}`).toEqual(
              circle.sample(group, id, t, coded.resolved),
            );
            samples++;
          }
        }
        expect(samples).toBe((steps + 1) * ids.length);
      });

      it(`leaves everybody where the coded circle leaves them — ${what}`, () => {
        const group = probeGroup(formation);
        const coded = planFor(circle as never, group, params);
        const data = planFor(circleData, group, params);
        expect(data.plan.ends).toEqual(coded.plan.ends);
        expect(circleData.ends(group, data.resolved)).toEqual(circle.ends(group, coded.resolved));
        expect(circleData.moves(data.resolved, group.stations, group.frame.spacing)).toEqual(
          circle.moves(coded.resolved, group.stations, group.frame.spacing),
        );
      });

      it(`holds the same hands at the same beats — ${what}`, () => {
        const group = probeGroup(formation);
        const coded = planFor(circle as never, group, params);
        const data = planFor(circleData, group, params);
        const steps = Math.round(coded.resolved.beats / PROBE_STEP);
        for (let i = 0; i <= steps; i++) {
          const t = i * PROBE_STEP;
          const want = coded.plan.joinsAt(t).map(joinKey).sort();
          expect(data.plan.joinsAt(t).map(joinKey).sort(), `${what} @ ${t}`).toEqual(want);
        }
      });

      it(`reaches, joins, ends and keeps its distance — ${what}`, () => {
        const group = probeGroup(formation);
        expect(figureProblems(probeFigure(circleData, params, { group }))).toEqual([]);
      });
    }

    it(`probes to exactly the coded circle's own numbers in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(probeFigure(circleData, {}, { group })).toEqual(probeFigure(circle, {}, { group }));
    });
  }
});

/**
 * The sequences, danced with the compiled circle in place of the coded one.
 *
 * `createContraRegistry(extra)` is the seam a dance-local figure will use in
 * M4; putting a compiled figure through it here proves the interpreter's output
 * is a `FigureDef` the decider, the timeline and the three oracles cannot tell
 * from a coded one — without touching `CONTRA_FIGURES`, which keeps the coded
 * `circle` exactly as it was.
 */
const CIRCLE_AS_DATA: AnyFigureDef = { ...circleData, id: "circle" } as AnyFigureDef;

const programFor = (dance: Dance): Program => ({
  slug: `${dance.slug}-program`,
  items: [{ dance: dance.slug, medley: "none", timesThrough: 8 }],
});

function run(
  dance: Dance,
  couples: number,
  until: number,
  extra: readonly AnyFigureDef[],
): Decider {
  const formation = dance.formation === "becket" ? BECKET : DUPLE_IMPROPER;
  const registry = createContraRegistry(extra);
  const hall = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    programFor(dance),
    registry,
    hall,
    createLibrary([dance], [formation]),
  );
  decider.advance(until);
  return decider;
}

describe("the sequences dance the same with the compiled circle", () => {
  for (const { name, dance, couples } of [
    { name: "duple improper", dance: DUPLE_SEQUENCE, couples: 6 },
    { name: "becket", dance: BECKET_SEQUENCE, couples: 8 },
  ]) {
    it(`${name}: closure, reach and collision are the coded figure's own numbers`, () => {
      const coded = run(dance, couples, 128, []).timeline();
      const data = run(dance, couples, 128, [CIRCLE_AS_DATA]).timeline();

      const codedClosure = closureReport(coded);
      expect(codedClosure.seams).toBeGreaterThan(0);
      expect(closureReport(data)).toEqual(codedClosure);

      const codedReach = reachReport(coded, 0, 128);
      expect(codedReach.hands).toBeGreaterThan(0);
      expect(reachReport(data, 0, 128)).toEqual(codedReach);

      const codedCollision = collisionReport(coded, 0, 128);
      expect(codedCollision.pairs).toBeGreaterThan(0);
      expect(collisionReport(data, 0, 128)).toEqual(codedCollision);
    });
  }
});
