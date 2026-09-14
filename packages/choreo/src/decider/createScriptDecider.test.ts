import { SEAM_BEATS, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { Dance, PhraseName, Program } from "../dance/Dance.js";
import { validateDance } from "../dance/Dance.js";
import { createFigureRegistry } from "../figure/FigureDef.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import { createHall } from "../formation/Formation.js";
import { SQUARE } from "../testing/square.js";
import { coverageProblems } from "../testing/oracles.js";
import { poseAt } from "../timeline/poseAt.js";
import type { FigureEvent, UtteranceEvent } from "../timeline/Timeline.js";
import { createLibrary } from "./Decider.js";
import { HANDS_FOUR, createScriptDecider } from "./createScriptDecider.js";

const PHRASES: readonly PhraseName[] = ["A1", "A2", "B1", "B2"];

/** A dance of four sixteen-beat stands: the decider's own behaviour, nothing else. */
const stand = (slug: string, title: string, author: string): Dance =>
  validateDance({
    slug,
    title,
    author,
    formation: "square",
    phrases: PHRASES.map((name) => ({
      name,
      figures: [
        { figure: "walk-to-station", beats: 16, call: `${name} OF ${title.toUpperCase()}` },
      ],
    })),
  });

const ONE = stand("one", "First Dance", "A Caller");
const TWO = stand("two", "Second Dance", "Another Caller");

function run(program: Program, until: number, dances: Dance[] = [ONE, TWO]) {
  const registry = createFigureRegistry([WALK_TO_STATION, WAIT_OUT]);
  const hall = createHall(SQUARE, [{ id: "sq", couples: 4, centre: [0, 0], axis: 90 }]);
  const decider = createScriptDecider(program, registry, hall, createLibrary(dances, [SQUARE]));
  const produced = decider.advance(until);
  return { decider, produced, timeline: decider.timeline() };
}

const utterances = (events: readonly { kind: string }[]): UtteranceEvent[] =>
  events.filter((e): e is UtteranceEvent => e.kind === "utterance");
const figures = (events: readonly { kind: string }[]): FigureEvent[] =>
  events.filter((e): e is FigureEvent => e.kind === "figure");

describe("the script decider keeps the timeline covered", () => {
  it("produces events up to and past the beat it was asked for", () => {
    const { decider } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 4 }] },
      100,
    );
    expect(decider.covered()).toBeGreaterThanOrEqual(100);
  });

  it("leaves no gap and no overlap for any dancer", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 4 }] },
      200,
    );
    expect(coverageProblems(timeline, 0, 200)).toEqual([]);
  });

  it("returns only the events it produced this call", () => {
    const registry = createFigureRegistry([WALK_TO_STATION, WAIT_OUT]);
    const hall = createHall(SQUARE, [{ id: "sq", couples: 4, centre: [0, 0], axis: 90 }]);
    const decider = createScriptDecider(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 8 }] },
      registry,
      hall,
      createLibrary([ONE], [SQUARE]),
    );
    const first = decider.advance(10);
    const second = decider.advance(100);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(second.some((e) => first.includes(e))).toBe(false);
  });
});

describe("the caller calls", () => {
  it("starts each call its figure's lead beats early and holds it two beats in", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 2 }] },
      0,
    );
    const said = utterances(timeline.utterances()).filter((u) => u.text.startsWith("A2"));
    expect(said[0]!.start).toBe(16 - WALK_TO_STATION.lead);
    expect(said[0]!.end).toBe(16 + 2);
  });

  it("says a dance's own call text when the dance overrides the figure's", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 1 }] },
      0,
    );
    expect(timeline.utterances().map((u) => u.text)).toContain("A1 OF FIRST DANCE");
  });

  it("says each call once for the whole hall, not once per group", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 1 }] },
      0,
    );
    const first = timeline.utterances().filter((u) => u.text === "A1 OF FIRST DANCE");
    expect(first).toHaveLength(1);
    expect(first[0]!.speaker).toBe("caller");
  });

  it("never starts an utterance before the program does", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 1 }] },
      0,
    );
    for (const u of timeline.utterances()) expect(u.start).toBeGreaterThanOrEqual(0);
  });
});

describe("switching dances", () => {
  const program: Program = {
    slug: "evening",
    items: [
      { dance: "one", medley: "m1", timesThrough: 2 },
      { dance: "two", medley: "m2", timesThrough: 2 },
    ],
  };

  it("announces the next dance over the last eight beats of the last time through", () => {
    const { timeline } = run(program, 64);
    const announce = timeline.utterances().find((u) => u.text.startsWith("NEXT DANCE"))!;
    expect(announce.text).toBe("NEXT DANCE: SECOND DANCE BY ANOTHER CALLER");
    // Two times through of a 64-beat dance ends at 128.
    expect(announce.start).toBe(120);
    expect(announce.end).toBe(128);
  });

  it("leaves an eight-beat line-up gap and then calls hands four", () => {
    const { timeline } = run(program, 140);
    const handsFour = timeline.utterances().find((u) => u.text === HANDS_FOUR)!;
    expect(handsFour.start).toBe(132);
    expect(handsFour.end).toBe(136);

    const lark = timeline.dancers().find((d) => d.endsWith("c0/lark"))!;
    const gap = timeline.figuresOf(lark).find((f) => f.start === 128)!;
    expect(gap.figure).toBe("walk-to-station");
    expect(gap.end).toBe(136);
  });

  it("starts the new dance after the gap", () => {
    const { timeline } = run(program, 200);
    const said = timeline.utterances().filter((u) => u.text.startsWith("A1 OF SECOND DANCE"));
    expect(said[0]!.start).toBe(136 - WALK_TO_STATION.lead);
  });

  it("loops the program, so the demo cycles with nobody touching it", () => {
    const { timeline } = run(program, 400);
    const announced = timeline
      .utterances()
      .filter((u) => u.text.startsWith("NEXT DANCE"))
      .map((u) => u.text);
    expect(announced).toEqual([
      "NEXT DANCE: SECOND DANCE BY ANOTHER CALLER",
      "NEXT DANCE: FIRST DANCE BY A CALLER",
      "NEXT DANCE: SECOND DANCE BY ANOTHER CALLER",
    ]);
  });

  it("does not announce or line up when the next item is the same dance", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 1 }] },
      200,
    );
    expect(timeline.utterances().some((u) => u.text.startsWith("NEXT DANCE"))).toBe(false);
    expect(figures(timeline.figures()).every((f) => f.end - f.start === 16)).toBe(true);
  });
});

describe("poseAt reads the seam", () => {
  it("eases hands, facing and lean out of the previous figure instance", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 2 }] },
      64,
    );
    const lark = timeline.dancers().find((d) => d.endsWith("c0/lark"))!;
    // Every figure here is a stand, so position must not move across the seam.
    const before = poseAt(timeline, lark, 16 - 1e-9);
    const inSeam = poseAt(timeline, lark, 16 + SEAM_BEATS / 2);
    const after = poseAt(timeline, lark, 16 + SEAM_BEATS);
    expect(dist(before.p, inSeam.p)).toBeLessThan(1e-6);
    expect(dist(before.p, after.p)).toBeLessThan(1e-6);
  });

  it("throws for a dancer it has never heard of", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 1 }] },
      0,
    );
    expect(() => poseAt(timeline, "nobody", 0)).toThrow(/no figure at beat/);
  });
});

describe("the decider refuses nonsense", () => {
  it("will not run an empty program", () => {
    expect(() => run({ slug: "p", items: [] }, 10)).toThrow(/has no items/);
  });

  it("names the dances it does have when a slug is missing", () => {
    expect(() =>
      run({ slug: "p", items: [{ dance: "nope", medley: "m", timesThrough: 1 }] }, 10, [ONE]),
    ).toThrow(/no dance "nope"/);
  });
});
