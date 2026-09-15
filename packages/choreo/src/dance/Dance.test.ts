import { describe, expect, it } from "vitest";
import type { Dance, Program } from "./Dance.js";
import {
  callBeats,
  concurrentCalls,
  danceBeats,
  dancePassSpans,
  dancePasses,
  danceSchedule,
  passBeats,
  phraseBeats,
  validateDance,
} from "./Dance.js";

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

describe("the record M8 grew: concurrency, zero-beat calls and passes", () => {
  const concurrent = (): Dance => {
    const d = dance();
    d.phrases[3]!.figures = [
      {
        figure: "allemande",
        beats: 4,
        who: "larks",
        while: [{ figure: "loop", who: "robins" }],
      },
      { figure: "swing", beats: 12 },
    ];
    return d;
  };

  it("measures a call by the longest of it and the calls beside it", () => {
    expect(callBeats(concurrent().phrases[3]!.figures[0]!)).toBe(4);
    // A branch that runs longer than its parent is what the phrase has to be
    // measured by: four beats of allemande beside six of looping is six.
    const longer = concurrent();
    longer.phrases[3]!.figures[0]!.while![0]!.beats = 6;
    expect(callBeats(longer.phrases[3]!.figures[0]!)).toBe(6);
    expect(phraseBeats(longer.phrases[3]!)).toBe(18);
    expect(() => validateDance(longer)).toThrow(/B2 is 18 beats, A1 is 16/);
  });

  it("keeps a concurrent call as one step of the schedule", () => {
    const d = validateDance(concurrent());
    expect(phraseBeats(d.phrases[3]!)).toBe(16);
    expect(danceBeats(d)).toBe(64);
    // One entry, not two: the card says one thing and the planner resolves the
    // whole of it at once, because the dancers it leaves out are the dancers
    // *neither* branch named.
    const b2 = danceSchedule(d).filter((s) => s.phrase === "B2");
    expect(b2.map((s) => s.call.figure)).toEqual(["allemande", "swing"]);
    expect(b2.map((s) => s.start)).toEqual([48, 52]);
  });

  it("flattens a concurrent call parent first, with the branch's real count", () => {
    const flat = concurrentCalls(concurrent().phrases[3]!.figures[0]!);
    expect(flat.map((c) => [c.figure, c.beats])).toEqual([
      ["allemande", 4],
      ["loop", 4],
    ]);
    // The parent hands its own count down and keeps none of its branches, so a
    // caller of this never has to remember either rule.
    expect(flat[0]!.while).toBeUndefined();
    expect(concurrentCalls({ figure: "swing", beats: 8 })).toHaveLength(1);
  });

  it("admits a call of no beats at all, and still refuses a negative one", () => {
    const zero = dance();
    zero.phrases[0]!.figures = [
      { figure: "face", beats: 0 },
      { figure: "balance", beats: 4 },
      { figure: "swing", beats: 12 },
    ];
    // 44 corpus dances have one: "face your neighbour", "form a wave" — a fact
    // about where you end up rather than something you spend the music on.
    expect(() => validateDance(zero)).not.toThrow();
    expect(phraseBeats(zero.phrases[0]!)).toBe(16);
    expect(
      danceSchedule(zero)
        .slice(0, 3)
        .map((s) => s.start),
    ).toEqual([0, 0, 4]);

    const negative = dance();
    negative.phrases[0]!.figures[0]!.beats = -4;
    expect(() => validateDance(negative)).toThrow(/no duration/);
  });

  it("counts a record's passes and says where each one starts", () => {
    const one = validateDance(dance());
    expect(dancePasses(one)).toBe(1);
    expect(passBeats(one)).toBe(64);
    expect(dancePassSpans(one)).toEqual([{ start: 0, end: 64 }]);

    const two: Dance = {
      ...dance(),
      passes: 2,
      phrases: [...dance().phrases, ...dance().phrases.map((p) => ({ ...p, name: `2${p.name}` }))],
    };
    expect(danceBeats(validateDance(two))).toBe(128);
    expect(dancePasses(two)).toBe(2);
    expect(passBeats(two)).toBe(64);
    expect(dancePassSpans(two)).toEqual([
      { start: 0, end: 64 },
      { start: 64, end: 128 },
    ]);
  });

  it("refuses passes that do not divide, or a progression that does not divide them", () => {
    expect(() => validateDance({ ...dance(), passes: 3 })).toThrow(/does not divide/);
    expect(() => validateDance({ ...dance(), passes: 0 })).toThrow(/not a count/);
    expect(() => validateDance({ ...dance(), progressEvery: 2 })).toThrow(/does not divide/);
  });

  it("lets a phrase be called anything: a phrase name is a label", () => {
    // 113 corpus dances have phrases beyond A1-B2, and a second pass writes
    // `2A1 … 2B2`. Nothing in this package reads the four letters.
    const named: Dance = {
      ...dance(),
      phrases: dance().phrases.map((p, i) => ({ ...p, name: `C${String(i)}` })),
    };
    expect(() => validateDance(named)).not.toThrow();
    expect(danceSchedule(named)[0]!.phrase).toBe("C0");
  });
});
