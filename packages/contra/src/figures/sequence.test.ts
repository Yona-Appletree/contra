import type { Dance, Decider, Program, SetState } from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  closureReport,
  collisionReport,
  coverageProblems,
  createHall,
  createLibrary,
  createScriptDecider,
  danceBeats,
  dist,
  poseAt,
  reachReport,
  stationPose,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { createContraRegistry } from "./registry.js";
import { BECKET_SEQUENCE, DUPLE_SEQUENCE } from "./sequences.js";

/** AC5's number: closure is 0.01 px. */
const CLOSURE_PX = 0.01;
/** AC6's number: no two torso centres within 8 px. */
const COLLISION_PX = 8;

const programFor = (dance: Dance): Program => ({
  slug: `${dance.slug}-program`,
  items: [{ dance: dance.slug, medley: "none", timesThrough: 8 }],
});

function run(dance: Dance, couples: number, until: number): Decider {
  const formation = dance.formation === "becket" ? BECKET : DUPLE_IMPROPER;
  const registry = createContraRegistry();
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

/** The line lengths each formation is checked at. A becket set holds even couples. */
const DUPLE_LINES = [2, 3, 4, 5, 6];
const BECKET_LINES = [4, 6, 8, 10, 12];

const CASES = [
  { name: "duple improper", dance: DUPLE_SEQUENCE, lines: DUPLE_LINES, formation: DUPLE_IMPROPER },
  { name: "becket", dance: BECKET_SEQUENCE, lines: BECKET_LINES, formation: BECKET },
] as const;

describe("the sequences are dances", () => {
  for (const { name, dance } of CASES) {
    it(`${name}: four sixteen-beat phrases, from its own data`, () => {
      expect(danceBeats(dance)).toBe(64);
      expect(dance.phrases.map((phrase) => phrase.name)).toEqual(["A1", "A2", "B1", "B2"]);
    });

    it(`${name}: survives a round trip through JSON, because it is only data`, () => {
      const copy: Dance = JSON.parse(JSON.stringify(dance)) as Dance;
      expect(copy).toEqual(dance);
    });
  }
});

describe("AC5 — closure", () => {
  for (const { name, dance, lines } of CASES) {
    for (const couples of lines) {
      it(`${name} closes within ${CLOSURE_PX} px with ${couples} couples`, () => {
        const report = closureReport(run(dance, couples, 128).timeline());
        expect(report.seams).toBeGreaterThan(0);
        expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
      });
    }
  }

  for (const { name, dance, formation, lines } of CASES) {
    it(`${name}: every dancer stands on the progressed set's own station after one time through`, () => {
      const couples = lines[lines.length - 1]!;
      const decider = run(dance, couples, 64);
      const hall = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
      const progressed: SetState = formation.progression.next(hall.sets[0]!);
      let worst = 0;
      for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, progressed)) {
        for (const station of plan.stations) {
          const dancer = plan.members[station.id]!;
          const want = stationPose(plan.frame, station).p;
          worst = Math.max(worst, dist(poseAt(decider.timeline(), dancer, 64).p, want));
        }
      }
      expect(worst).toBeLessThan(CLOSURE_PX);
    });
  }
});

describe("AC1 — every hand the figures place is one an arm reaches", () => {
  for (const { name, dance, lines } of CASES) {
    for (const couples of lines) {
      it(`${name} solves every hand with short === 0 with ${couples} couples`, () => {
        const report = reachReport(run(dance, couples, 128).timeline(), 0, 128);
        expect(report.hands).toBeGreaterThan(0);
        expect(report.maxShort, JSON.stringify(report.worst)).toBe(0);
      });
    }
  }
});

describe("AC6 — nobody walks through anybody", () => {
  for (const { name, dance, lines } of CASES) {
    for (const couples of lines) {
      it(`${name} keeps every pair more than ${COLLISION_PX} px apart with ${couples} couples`, () => {
        const decider = run(dance, couples, 128);
        // No pair is exempt: the figures here keep even a swinging pair more
        // than AC6's distance apart, so nothing has to be declared in contact.
        const report = collisionReport(decider.timeline(), 0, 128);
        expect(report.pairs).toBeGreaterThan(0);
        expect(report.minDistance, JSON.stringify(report.worst)).toBeGreaterThan(COLLISION_PX);
      });
    }
  }
});

describe("the timeline stays covered", () => {
  for (const { name, dance, lines } of CASES) {
    for (const couples of lines) {
      it(`${name} leaves no gap and no overlap with ${couples} couples`, () => {
        expect(coverageProblems(run(dance, couples, 128).timeline(), 0, 128)).toEqual([]);
      });
    }
  }
});
