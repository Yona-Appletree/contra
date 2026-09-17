import { HANDS_FOUR_GROUP, concurrentCalls, danceSchedule } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { budgetFor, formsFor, saysTheSame } from "../text/callScript.js";
import { DEMO_DANCES } from "./index.js";
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
    // M2 built "shadow-pair" and "line" for duple improper; "set" (D9) is
    // still not one any formation defines.
    expect(() => danceFromFile(file({ group: "set" }))).toThrow(
      /fixture A1: "long-lines" wants group "set"/,
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

/**
 * **A `call` in a dance file is a flourish, and only ever that** (M13, A7).
 *
 * What the caller says is derived from the figure's own forms; a record that
 * writes its own words is saying something no form can — Butter's "SHIFT
 * LEFT", After the Solstice's "AND SWING". Anything a form *can* say has been
 * deleted from the file, and this is what keeps it deleted: without it the
 * corpus's own vocabulary ("ONE AND A HALF", "THREE QUARTERS") creeps back one
 * re-encoded dance at a time and the card and the bubble drift apart again.
 */
describe("a dance's own call is a flourish", () => {
  for (const dance of DEMO_DANCES) {
    it(`${dance.slug}: every call it still writes is one no form can say`, () => {
      for (const [index, { call, phrase }] of danceSchedule(dance).entries()) {
        const forms = formsFor(dance, index);
        for (const one of concurrentCalls(call)) {
          if (one.call === undefined) continue;
          const where = `${dance.slug} ${phrase} ${one.figure}: "${one.call}"`;
          for (const form of forms) {
            expect(saysTheSame(one.call, form.text), `${where} is "${form.text}"`).toBe(false);
          }
          // And it is said in the user's own vocabulary, whatever the corpus
          // wrote: "once and a half", "three places", robins and larks.
          expect(one.call, where).not.toMatch(
            /\bONE AND A HALF\b|\bTHREE QUARTERS\b|\bLADIES\b|\bGENTS\b/,
          );
        }
      }
    });
  }
});

/** A dance may still say how long its calls stay long. */
describe("callBudgets", () => {
  it("overrides the policy for one dance, and no programme dance sets one", () => {
    for (const dance of DEMO_DANCES) expect(dance.callBudgets, dance.slug).toBeUndefined();
    const dance = danceFromFile({ ...file({}), callBudgets: [4, 4, 2] });
    expect(dance.callBudgets).toEqual([4, 4, 2]);
    expect(budgetFor({ budgets: dance.callBudgets! }, 2)).toBe(4);
    expect(budgetFor({ budgets: dance.callBudgets! }, 9)).toBe(2);
    expect(JSON.parse(JSON.stringify(dance))).toEqual(dance);
  });
});
