import { describe, expect, it } from "vitest";
import type { Dance, Program } from "./Dance.js";
import { danceBeats, danceSchedule, phraseBeats, validateDance } from "./Dance.js";

const dance = (): Dance => ({
  slug: "d",
  title: "A Dance",
  author: "Somebody",
  formation: "duple-improper",
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "balance", beats: 4 },
        { figure: "swing", beats: 12 },
      ],
    },
    { name: "A2", figures: [{ figure: "lines", beats: 16 }] },
    {
      name: "B1",
      figures: [
        { figure: "balance", beats: 4 },
        { figure: "swing", beats: 12 },
      ],
    },
    {
      name: "B2",
      figures: [
        { figure: "circle", beats: 8 },
        { figure: "twirl", beats: 8 },
      ],
    },
  ],
});

describe("a dance is data", () => {
  it("adds its phrases up from its own figure calls, not from a meter", () => {
    expect(phraseBeats(dance().phrases[0]!)).toBe(16);
    expect(danceBeats(dance())).toBe(64);
  });

  it("lets a figure end anywhere inside a phrase", () => {
    // A four-beat balance and a twelve-beat swing is a normal A1.
    expect(() => validateDance(dance())).not.toThrow();
    expect(danceSchedule(dance()).map((s) => s.start)).toEqual([0, 4, 16, 32, 36, 48, 56]);
    expect(danceSchedule(dance()).map((s) => s.phrase)).toEqual([
      "A1",
      "A1",
      "A2",
      "B1",
      "B1",
      "B2",
      "B2",
    ]);
  });

  it("refuses a phrase that does not match the others", () => {
    const bad = dance();
    bad.phrases[1]!.figures[0]!.beats = 12;
    expect(() => validateDance(bad)).toThrow(/A2 is 12 beats, A1 is 16/);
  });

  it("refuses an empty phrase and a figure with no duration", () => {
    const empty = dance();
    empty.phrases[2]!.figures = [];
    expect(() => validateDance(empty)).toThrow(/no figures/);

    const zero = dance();
    zero.phrases[1]!.figures[0]!.beats = 0;
    expect(() => validateDance(zero)).toThrow(/no duration|is 0 beats/);
  });

  it("survives JSON, which is what makes a dance shippable as a file", () => {
    const original = dance();
    const copy = JSON.parse(JSON.stringify(original)) as Dance;
    expect(copy).toEqual(original);

    const program: Program = {
      slug: "evening",
      items: [{ dance: "d", medley: "reels-1", timesThrough: 2 }],
    };
    expect(JSON.parse(JSON.stringify(program))).toEqual(program);
  });

  it("keeps a figure's parameters through JSON, flourishes and all", () => {
    const withParams: Dance = {
      ...dance(),
      phrases: [
        {
          name: "A1",
          figures: [
            {
              figure: "swing",
              beats: 16,
              who: "partners",
              params: { handOffsetPx: 5 },
              call: "SWING",
            },
          ],
        },
        { name: "A2", figures: [{ figure: "lines", beats: 16 }] },
        { name: "B1", figures: [{ figure: "lines", beats: 16 }] },
        { name: "B2", figures: [{ figure: "lines", beats: 16 }] },
      ],
    };
    expect(JSON.parse(JSON.stringify(withParams))).toEqual(withParams);
  });
});
