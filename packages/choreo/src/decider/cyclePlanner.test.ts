import { describe, expect, it } from "vitest";
import type { Dance, PhraseName, Program } from "../dance/Dance.js";
import { validateDance } from "../dance/Dance.js";
import type { AnyFigureDef, EndPose } from "../figure/FigureDef.js";
import { createFigureRegistry, withDefaults } from "../figure/FigureDef.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import type { DancerId, HallState, StationId } from "../formation/Formation.js";
import { HANDS_FOUR_GROUP, createHall } from "../formation/Formation.js";
import { coverageProblems } from "../testing/oracles.js";
import { SQUARE } from "../testing/square.js";
import type { FigureEvent } from "../timeline/Timeline.js";
import { poseAt } from "../timeline/poseAt.js";
import type { CycleEmission, CyclePlanner } from "./Decider.js";
import { createLibrary } from "./Decider.js";
import { createScriptDecider, defaultCyclePlanner } from "./createScriptDecider.js";

/**
 * The `CyclePlanner` seam, proved on the square: a planner other than the
 * decider's own decides what dances, and the decider still owns the calls, the
 * between-dances interval and `standingAt`.
 *
 * Deliberately a square and not a contra — the seam is form-neutral, and a test
 * that needed a line or a progression to exercise it would be evidence that it
 * is not.
 */

const PHRASES: readonly PhraseName[] = ["A1", "A2", "B1", "B2"];

const DANCE: Dance = validateDance({
  slug: "one",
  title: "First Dance",
  author: "A Caller",
  formation: "square",
  phrases: PHRASES.map((name) => ({
    name,
    figures: [{ figure: "walk-to-station", beats: 16, call: `${name}` }],
  })),
});

const PROGRAM: Program = { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 4 }] };

function run(cycle?: CyclePlanner) {
  const registry = createFigureRegistry([WALK_TO_STATION, WAIT_OUT]);
  const hall = createHall(SQUARE, [{ id: "sq", couples: 5, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(
    PROGRAM,
    registry,
    hall,
    createLibrary([DANCE], [SQUARE]),
    cycle === undefined ? {} : { cycle },
  );
  decider.advance(160);
  return decider;
}

const figures = (events: readonly { kind: string }[]): FigureEvent[] =>
  events.filter((e): e is FigureEvent => e.kind === "figure");

describe("the cycle planner seam", () => {
  it("defaults to the decider's own planner, which is what it always did", () => {
    const plain = run();
    const explicit = run(defaultCyclePlanner);
    const dancers = plain.timeline().dancers();
    expect(explicit.timeline().dancers()).toEqual(dancers);
    for (const dancer of dancers) {
      for (let beat = 0; beat <= 128; beat += 1 / 4) {
        expect(poseAt(explicit.timeline(), dancer, beat)).toEqual(
          poseAt(plain.timeline(), dancer, beat),
        );
      }
    }
  });

  it("dances a planner that gives every dancer their own figure", () => {
    /** One `walk-to-station` per dancer, over the whole time through. */
    const onePerDancer: CyclePlanner = (input) => {
      const emissions: CycleEmission[] = [];
      for (const set of input.hall.sets) {
        for (const plan of input.formation.groupsFor(HANDS_FOUR_GROUP, set)) {
          const group = input.mintGroup(plan);
          for (const station of group.stations) {
            const dancer = group.members[station.id];
            if (dancer === undefined) continue;
            const here = input.standingAt.get(dancer);
            const origins: Record<StationId, EndPose> = here ? { [station.id]: here } : {};
            emissions.push({
              group,
              def: WALK_TO_STATION as AnyFigureDef,
              params: withDefaults(WALK_TO_STATION, { origins }, 64),
              stations: [station.id],
              start: input.start,
            });
          }
        }
      }
      const next: HallState = {
        sets: input.hall.sets.map((s) => input.formation.progression.next(s)),
      };
      return { emissions, next };
    };

    const decider = run(onePerDancer);
    const timeline = decider.timeline();
    const cycle = figures(timeline.events()).filter((e) => e.start === 0);
    // One event per dancer, each binding exactly one station.
    expect(cycle.length).toBe(timeline.dancers().length);
    for (const event of cycle) expect(Object.keys(event.bindings).length).toBe(1);
    // The decider still covers everybody and still says the dance's own calls.
    expect(coverageProblems(timeline, 0, 128)).toEqual([]);
    expect(timeline.utterances().map((u) => u.text)).toContain("A1");
  });

  it("threads standingAt through the planner, figure by figure", () => {
    const seen: Array<ReadonlyMap<DancerId, EndPose>> = [];
    const spy: CyclePlanner = (input) => {
      seen.push(new Map(input.standingAt));
      return defaultCyclePlanner(input);
    };
    run(spy);
    // Nothing has danced before the first time through; everything has before
    // the second, and the decider's own map is what the planner was handed.
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]!.size).toBe(0);
    expect(seen[1]!.size).toBe(10);
  });
});
