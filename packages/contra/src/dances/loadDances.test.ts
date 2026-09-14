import { HANDS_FOUR_GROUP } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import type { DanceFile } from "./loadDances.js";
import { danceFromFile } from "./loadDances.js";

/**
 * What a dance file may say, and what it may not.
 *
 * The loader is the only thing between a JSON file somebody typed and a
 * `Dance` the engine will dance, so the two questions it has to answer are
 * "is this a real figure with real parameters" and "is this a group its
 * formation actually defines".
 */

/** The smallest well-formed dance file: four phrases of one sixteen-beat call. */
const file = (call: Record<string, unknown>): DanceFile =>
  ({
    slug: "fixture",
    title: "The Loader Fixture",
    author: "M1",
    formation: "duple-improper",
    phrases: (["A1", "A2", "B1", "B2"] as const).map((name) => ({
      name,
      figures: [{ figure: "long-lines", beats: 16, ...call }],
    })),
    source: {
      callersBoxId: 0,
      url: "https://example.invalid/fixture",
      permission: "fixture, not a real dance",
      transcript: "A1 long lines",
    },
  }) as DanceFile;

describe("a dance file's figure calls", () => {
  it("loads without a group, which is every dance so far", () => {
    const dance = danceFromFile(file({}));
    expect(dance.phrases[0]!.figures[0]!.group).toBeUndefined();
  });

  it("accepts `group` as a call field beside `who`, and carries it to the Dance", () => {
    // Not a figure parameter: it says how wide the call draws its dancers
    // from, where `params` tune the figure itself. A future JSON dance has to
    // be able to say it, so the loader has to let it through.
    const dance = danceFromFile(file({ group: HANDS_FOUR_GROUP, who: "larks" }));
    const call = dance.phrases[0]!.figures[0]!;
    expect(call.group).toBe(HANDS_FOUR_GROUP);
    expect(call.who).toBe("larks");
    // And it survives the round trip a dance file has to survive.
    expect(JSON.parse(JSON.stringify(dance))).toEqual(dance);
  });

  it("refuses a group the formation has not built yet, naming the dance and phrase", () => {
    expect(() => danceFromFile(file({ group: "shadow-pair" }))).toThrow(
      /fixture A1: "long-lines" wants group "shadow-pair"/,
    );
  });

  it("still refuses a parameter the figure does not declare", () => {
    expect(() => danceFromFile(file({ params: { nonsense: 1 } }))).toThrow(/has no parameter/);
  });

  it("still refuses a figure the registry does not hold", () => {
    expect(() => danceFromFile(file({ figure: "no-such-figure" }))).toThrow(
      /is not a known contra figure/,
    );
  });
});
