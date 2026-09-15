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
import {
  HANDS_FOUR_CALLS,
  HERE_WE_GO,
  SCRIPT_DECIDER_DEFAULTS,
  THANKS_CALLS,
  betweenDancesBeats,
  createLibrary,
} from "./Decider.js";
import { createScriptDecider } from "./createScriptDecider.js";
import { spokenBeats } from "./spokenBeats.js";

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
  it("starts each call its figure's lead beats early and holds it its spoken length plus the tail", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 2 }] },
      0,
    );
    const said = utterances(timeline.utterances()).filter((u) => u.text.startsWith("A2"));
    const leadStart = 16 - WALK_TO_STATION.lead;
    expect(said[0]!.start).toBe(leadStart);
    // C3: no longer a fixed two beats into the figure — however long the
    // words take to say, plus the tail.
    expect(said[0]!.end).toBe(
      leadStart + spokenBeats(said[0]!.text) + SCRIPT_DECIDER_DEFAULTS.utteranceTailBeats,
    );
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

  /** Two times through of a 64-beat dance ends here, and the gap starts. */
  const GAP = 128;
  const { thanksBeats, announceBeats, lineUpBeats, ringBeats, readyBeats } =
    SCRIPT_DECIDER_DEFAULTS;
  const ANNOUNCE = GAP + thanksBeats;
  const WALK = ANNOUNCE + announceBeats;
  const RING = WALK + lineUpBeats;
  const READY = RING + ringBeats;
  const NEXT = READY + readyBeats;

  it("thanks the partner and neighbour first, where the dancing stopped, before anything is announced", () => {
    const { timeline } = run(program, GAP + 4);
    const lark = timeline.dancers().find((d) => d.endsWith("c0/lark"))!;
    const thanks = timeline.figuresOf(lark).find((f) => f.start === GAP)!;
    expect(thanks.figure).toBe("thanks");
    expect(thanks.end).toBe(ANNOUNCE);

    const said = timeline
      .utterances()
      .filter((u) => u.start >= GAP && u.start < ANNOUNCE)
      .map((u) => u.text);
    expect(said).toEqual([...THANKS_CALLS]);
  });

  it("announces the next dance after the thanks, then how to stand for it", () => {
    const { timeline } = run(program, ANNOUNCE + 4);
    const announced = timeline.utterances().filter((u) => u.start >= ANNOUNCE && u.start < WALK);
    expect(announced.map((u) => u.text)).toEqual([
      "NEXT: SECOND DANCE, BY ANOTHER CALLER",
      // SQUARE names no words of its own, so the decider's default is said.
      ...HANDS_FOUR_CALLS,
    ]);
    expect(announced[0]!.start).toBe(ANNOUNCE);
    expect(announced[announced.length - 1]!.end).toBe(WALK);
  });

  it("stands still through the announcement and walks only after it", () => {
    const { timeline } = run(program, WALK + 4);
    const lark = timeline.dancers().find((d) => d.endsWith("c0/lark"))!;
    const stand = timeline.figuresOf(lark).find((f) => f.start === ANNOUNCE)!;
    expect(stand.figure).toBe("walk-to-station");
    expect(stand.end).toBe(WALK);

    const walk = timeline.figuresOf(lark).find((f) => f.start === WALK)!;
    expect(walk.figure).toBe("walk-to-station");
    expect(walk.end).toBe(RING);
  });

  it("takes hands four in a ring, and holds it through the potatoes", () => {
    const { timeline } = run(program, NEXT + 4);
    const lark = timeline.dancers().find((d) => d.endsWith("c0/lark"))!;
    const ring = timeline.figuresOf(lark).find((f) => f.start === RING)!;
    expect(ring.figure).toBe("take-hands");
    // One figure over both stretches: the hall lets go on the last potatoes
    // rather than at the stretch boundary, so no hold is dropped and retaken.
    expect(ring.end).toBe(NEXT);
  });

  it("says here we go over the potatoes, and gets out of the first call's way", () => {
    const { timeline } = run(program, NEXT);
    const ready = timeline.utterances().find((u) => u.text === HERE_WE_GO)!;
    expect(ready.start).toBe(READY);
    // It ends where the dance's own first call starts, on potato 3: the bubble
    // shows whichever call started first, so an overlap would hide the one the
    // hall actually needs.
    expect(ready.end).toBe(NEXT - SCRIPT_DECIDER_DEFAULTS.firstCallLeadBeats);

    const first = timeline.utterances().find((u) => u.text === "A1 OF SECOND DANCE")!;
    expect(first.start).toBe(ready.end);
  });

  it("leaves no gap and no overlap for anybody across the whole interval", () => {
    const { timeline } = run(program, NEXT + 16);
    expect(coverageProblems(timeline, GAP - 4, NEXT + 4)).toEqual([]);
  });

  it("starts the new dance after the whole interval", () => {
    const { timeline } = run(program, 300);
    expect(betweenDancesBeats(SCRIPT_DECIDER_DEFAULTS)).toBe(NEXT - GAP);
    const said = timeline.utterances().filter((u) => u.text.startsWith("A1 OF SECOND DANCE"));
    expect(said[0]!.start).toBe(NEXT - WALK_TO_STATION.lead);
  });

  it("loops the program, so the demo cycles with nobody touching it", () => {
    const { timeline } = run(program, 3 * (GAP + (NEXT - GAP)));
    const announced = timeline
      .utterances()
      .filter((u) => u.text.startsWith("NEXT:"))
      .map((u) => u.text);
    expect(announced).toEqual([
      "NEXT: SECOND DANCE, BY ANOTHER CALLER",
      "NEXT: FIRST DANCE, BY A CALLER",
      "NEXT: SECOND DANCE, BY ANOTHER CALLER",
    ]);
  });

  it("does not thank, announce or line up when the next item is the same dance", () => {
    const { timeline } = run(
      { slug: "p", items: [{ dance: "one", medley: "m", timesThrough: 1 }] },
      200,
    );
    expect(timeline.utterances().some((u) => u.text.startsWith("NEXT:"))).toBe(false);
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
