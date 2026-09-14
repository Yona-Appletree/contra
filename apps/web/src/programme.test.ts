import type { Timeline } from "@caller/choreo";
import { coverageProblems } from "@caller/choreo";
import { DEMO_DANCES } from "@caller/contra";
import { layoutHall } from "@caller/hall";
import { describe, expect, it } from "vitest";
import { CYCLE_BEATS, ITEM_BEATS, createDemoProgram } from "./program.js";

/**
 * The whole evening, danced: every dancer has a figure at every beat, and the
 * figures they have are the ones the caller called.
 *
 * `coverageProblems` alone is not enough, and the bug this file was written
 * for is why. A hall seated in one formation and partitioned by another does
 * not leave a gap in the timeline: every dancer is accounted for at every
 * beat — as a *waiting* couple. `wait-out` is a real figure, so coverage is
 * perfect, the oracles are quiet, the console is clean, and the hall stands
 * still for a whole dance while the card, the clock and the caller carry on.
 * That is what "the simulation hung after the slide" was. So each dance is
 * asked two things: that everybody is covered, and that the figures the dance
 * calls are actually danced by somebody.
 *
 * One `it` per dance, and each one advances the decider only over its own
 * item, so no single case runs more than one time through plus a line-up.
 */

/** The demo hall the page ships: two lines, five couples and four. */
const DEMO_LINES = [5, 4];

const world = layoutHall({ lines: DEMO_LINES.length, couplesPerLine: [...DEMO_LINES] });

/** Every figure id a dance calls, the caller's own list. */
const figuresCalled = (slug: string): string[] => {
  const dance = DEMO_DANCES.find((d) => d.slug === slug)!;
  return [...new Set(dance.phrases.flatMap((p) => p.figures.map((f) => f.figure)))];
};

/** The figure ids danced by somebody over `[from, to)`. */
const figuresDanced = (timeline: Timeline, from: number, to: number): Set<string> =>
  new Set(
    timeline
      .figures()
      .filter((event) => event.start < to && event.end > from)
      .map((event) => event.figure),
  );

/** How many dancers dance nothing but `wait-out` over `[from, to)`. */
function waitingAll(timeline: Timeline, from: number, to: number): string[] {
  const out: string[] = [];
  for (const dancer of timeline.dancers()) {
    const mine = timeline.figuresOf(dancer).filter((e) => e.start < to && e.end > from);
    if (mine.length > 0 && mine.every((e) => e.figure === "wait-out")) out.push(dancer);
  }
  return out;
}

describe("the evening as the page dances it", () => {
  const program = createDemoProgram(world);

  for (const [index, dance] of DEMO_DANCES.entries()) {
    const from = index * ITEM_BEATS;
    const to = from + ITEM_BEATS;

    it(`${dance.slug}: every dancer has a figure at every beat, through the line-up after it`, () => {
      // A cycle past the end of the item, so the line-up out of this dance and
      // the first figures of the next one are both on the timeline.
      program.decider.advance(to + CYCLE_BEATS);
      expect(coverageProblems(program.decider.timeline(), from, to)).toEqual([]);
    });

    it(`${dance.slug}: the hall dances what the caller calls`, () => {
      program.decider.advance(to + CYCLE_BEATS);
      const timeline = program.decider.timeline();
      const danced = figuresDanced(timeline, from, from + CYCLE_BEATS);
      for (const figure of figuresCalled(dance.slug)) {
        expect([...danced], `${dance.slug} never dances "${figure}"`).toContain(figure);
      }
      // Waiting couples are real, but they are couples, not the whole hall:
      // a line of five and a line of four have at most three waiting couples
      // between them in either formation.
      const waiting = waitingAll(timeline, from, from + CYCLE_BEATS);
      expect(waiting.length, `waiting all the way through: ${waiting.join(", ")}`).toBeLessThan(
        timeline.dancers().length,
      );
    });
  }
});

/**
 * Choosing a dance from the page's select — and loading `#/dance/<slug>`, and
 * reloading the address the page has written for itself — rotates the
 * programme so that dance leads. When that dance is in a formation other than
 * the one the hall was seated in, it is the first dance of the evening and
 * there is no line-up before it to re-seat the hall.
 *
 * Butter is the demo's only becket dance, and this is the case that froze it.
 */
describe("a programme that starts at a becket dance", () => {
  it("butter is danced, not waited out, when the evening starts with it", () => {
    const program = createDemoProgram(world, "butter");
    expect(program.dances[0]!.slug).toBe("butter");
    program.decider.advance(CYCLE_BEATS * 2);
    const timeline = program.decider.timeline();
    const danced = figuresDanced(timeline, 0, CYCLE_BEATS);
    for (const figure of figuresCalled("butter")) {
      expect([...danced], `butter never dances "${figure}"`).toContain(figure);
    }
    // The whole hall waiting out is the freeze: every dancer covered, nobody
    // dancing, and the clock, the card and the caller carrying on regardless.
    expect(waitingAll(timeline, 0, CYCLE_BEATS)).not.toEqual(timeline.dancers());
  });

  // The same question for every other dance, one case each, so no case runs
  // more than one time through of one dance.
  for (const dance of DEMO_DANCES) {
    it(`${dance.slug} is danced when the evening starts with it`, () => {
      const program = createDemoProgram(world, dance.slug);
      program.decider.advance(CYCLE_BEATS);
      const timeline = program.decider.timeline();
      const danced = figuresDanced(timeline, 0, CYCLE_BEATS);
      for (const figure of figuresCalled(dance.slug)) {
        expect([...danced], `${dance.slug} first: never dances "${figure}"`).toContain(figure);
      }
    });
  }
});
