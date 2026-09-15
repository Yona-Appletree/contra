import { describe, expect, it } from "vitest";
import type { Dance, FigureEvent, Timeline } from "@caller/choreo";
import { LAB_RUN } from "../dances/danceLab.js";
import { danceAlone, danceBySlug } from "../dances/index.js";

/**
 * **Concurrent calls** (M8, Q13): two figures over disjoint dancers at the same
 * beats, which the timeline has always admitted and the record could not say.
 *
 * Read off a real run rather than off `resolveConcurrent` directly, because the
 * claim is about what the hall dances: both figures are on the timeline at the
 * same beats, the dancers of one are not the dancers of the other, and nobody is
 * standing through a call they are dancing.
 */

const DANCE = danceBySlug("are-you-most-done")!;

const at = (timeline: Timeline, beat: number): readonly FigureEvent[] =>
  timeline.figures().filter((event) => event.start === beat);

const run = (dance: Dance, couples: number): Timeline =>
  danceAlone(dance, couples, 64, {}, LAB_RUN).timeline();

describe("a call may carry other calls beside it", () => {
  it("emits both figures at the same beat, over disjoint dancers", () => {
    // Are You 'Most Done?'s B2: "(4) Men allemande right 1 || Women loop right".
    const here = at(run(DANCE, 4), 48).filter((e) => e.figure !== "wait-out");
    const figures = [...new Set(here.map((e) => e.figure))].sort();
    expect(figures).toEqual(["allemande", "loop"]);

    const larks = here.filter((e) => e.figure === "allemande").flatMap((e) => dancersOf(e));
    const robins = here.filter((e) => e.figure === "loop").flatMap((e) => dancersOf(e));
    expect(larks.length).toBeGreaterThan(0);
    expect(robins.length).toBeGreaterThan(0);
    expect(larks.filter((d) => robins.includes(d))).toEqual([]);
    // Every dancer of the minor sets that danced is in exactly one of them: a
    // `while` has no complement of its own, only the pair's.
    const both = [...larks, ...robins];
    expect(new Set(both).size).toBe(both.length);
  });

  it("gives the hold-place instance to the dancers **neither** branch named", () => {
    // The whole reason a concurrent call cannot be resolved one branch at a
    // time: the robins looping are not standing through the larks' allemande,
    // and a per-branch complement would put every one of them in a figure and on
    // hold-place at the same beat, which the timeline refuses per dancer.
    const here = at(run(DANCE, 4), 48);
    const dancing = new Set(
      here.filter((e) => e.figure === "allemande" || e.figure === "loop").flatMap(dancersOf),
    );
    const standing = here
      .filter((e) => e.figure === "walk-to-station")
      .flatMap(dancersOf)
      .filter((d) => dancing.has(d));
    expect(standing).toEqual([]);
  });

  it("refuses two branches that name the same dancer, by name", () => {
    const clash: Dance = {
      ...DANCE,
      phrases: DANCE.phrases.map((phrase) =>
        phrase.name !== "B2"
          ? phrase
          : {
              ...phrase,
              figures: [
                {
                  ...phrase.figures[0]!,
                  // The same larks, twice over.
                  while: [{ figure: "loop", who: "larks", params: { hand: "R" } }],
                },
                phrase.figures[1]!,
              ],
            },
      ),
    };
    expect(() => run(clash, 4)).toThrow(/must be over disjoint dancers/);
  });
});

/** Which dancers an event actually bound. */
const dancersOf = (event: FigureEvent): string[] => Object.values(event.bindings);
