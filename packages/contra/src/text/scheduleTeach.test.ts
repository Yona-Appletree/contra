import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "../dances/index.js";
import { heyDefinition } from "../library/figures/hey.js";
import { paramDefaults } from "../library/interpret.js";
import { printPassList } from "../library/passList.js";
import { TEACH_WORDS, callWho, resolveFigureText } from "./figureText.js";
import { passListFor, scheduleSentences } from "./scheduleTeach.js";

/**
 * The hey's teach, generated from its own pass list.
 *
 * The oracle is the user's own text, which is why it is quoted here in full and
 * compared clause by clause rather than asserted whole: the generated sentence
 * reads every meeting of the list, and the user's stops after five clauses and
 * calls the robins' second centre pass a neighbour. Both differences are for the
 * user to rule on at G1, so what is pinned here is the generated text, exactly,
 * and the ways it differs are written down beside it.
 */

/** The user's own hey teach, 2026-09-14, verbatim. */
const USERS =
  "Note where you are standing. You will return here after walking across the " +
  "set. Robins start by passing right shoulders in the middle, neighbors by the " +
  "left on the outside, loop around, partner by the left on the outside, " +
  "neighbor by the right in the center, face your partner on your side.";

const defaults = paramDefaults(heyDefinition);
/** The hey's own shorthand names, narrowed once rather than at every call. */
const shorthand =
  heyDefinition.shape.kind === "schedule" ? heyDefinition.shape.shorthand : (undefined as never);
const teachOf = (params: Record<string, unknown>): string =>
  resolveFigureText("hey", params)!.walkthrough.teach;
const sentencesOf = (params: Record<string, unknown>): string[] =>
  scheduleSentences(heyDefinition, { ...defaults, ...params });

describe("the pass list a hey dances", () => {
  it("is the canonical weave when the record writes none", () => {
    expect(printPassList(passListFor(defaults, shorthand))).toBe("RR NL LR PL RR NL LR");
  });

  it("is a prefix of the same list for half a hey", () => {
    expect(printPassList(passListFor({ ...defaults, amount: 0.5 }, shorthand))).toBe("RR NL LR");
  });

  it("mirrors when the larks start by the left", () => {
    expect(printPassList(passListFor({ ...defaults, start: "lark", by: "left" }, shorthand))).toBe(
      "LL NR RL PR LL NR RL",
    );
  });

  it("is the record's own where it writes one", () => {
    const written = { ...defaults, passes: "RR NL LR PL RR NL L! NL~" };
    expect(printPassList(passListFor(written, shorthand))).toBe("RR NL LR PL RR NL L! NL~");
  });
});

describe("the hey's teach, generated", () => {
  it("reads the robins' own meetings out, in the user's shape", () => {
    expect(teachOf({})).toBe(
      "Note where you are standing. You will return here after walking across the set. " +
        "Robins start by passing right shoulders in the middle, " +
        "neighbor by the left on the outside, " +
        "loop around, " +
        "partner by the left on the outside, " +
        "the other robin by the right in the middle, " +
        "neighbor by the left on the outside, " +
        "loop around, " +
        "face your partner on your side.",
    );
  });

  it("differs from the user's text in three places, and only three", () => {
    // For G1's seventh question. (1) The user writes "neighbors" plural for the
    // first pass at the lanes' edges and "partner" singular for the next; the
    // generated text uses the relation word, singular, both times. (2) The
    // user's fifth clause is "neighbor by the right in the center", where the
    // list says the robins meet **the other robin** in the middle. (3) The
    // user's text stops after five clauses; the weave has seven.
    const generated = teachOf({});
    expect(USERS).toContain("neighbors by the left on the outside");
    expect(generated).toContain("neighbor by the left on the outside");
    expect(USERS).toContain("neighbor by the right in the center");
    expect(generated).toContain("the other robin by the right in the middle");
    expect(USERS.split(",").length).toBe(6);
    expect(generated.split(",").length).toBe(8);
    // Everything else is the user's, word for word.
    expect(generated).toContain("Note where you are standing.");
    expect(generated).toContain("You will return here after walking across the set.");
    expect(generated).toContain("Robins start by passing right shoulders in the middle");
    expect(generated).toContain("loop around");
    expect(generated).toContain("partner by the left on the outside");
    expect(generated).toContain("face your partner on your side.");
  });

  it("mirrors when the larks start by the left", () => {
    expect(teachOf({ start: "lark", by: "left" })).toContain(
      "Larks start by passing left shoulders in the middle, neighbor by the right on the outside",
    );
  });

  it("stops half a hey where the crossing stops", () => {
    expect(teachOf({ amount: 0.5 })).toContain("and stop when everybody has crossed the set");
  });

  it("bounces where the call asks for a ricochet, at that pass's own lane", () => {
    // `robins@2` names the **second pass of the list**, which in an ordinary hey
    // is at the lanes' edges rather than in the middle.
    expect(teachOf({ ricochet: "robins@2" })).toContain("bounce back off neighbor on the outside");
    // And the other role's list is untouched.
    expect(sentencesOf({ ricochet: "robins@2" })[1]).toBe(sentencesOf({})[1]);
  });

  it("stands one dancer out of a hey for three, and says so first", () => {
    const said = sentencesOf({ for: 3, idle: "2L" });
    expect(said[1]).toBe(
      "One lark stands this one out: stay on your place while the others weave, " +
        "and face your partner when they finish.",
    );
  });

  it("reads the starting role off a written list's own first token", () => {
    expect(teachOf({ passes: "LR N2L RR PL LR N2L RR PL" })).toContain(
      "Larks start by passing right shoulders in the middle, next neighbor by the left",
    );
  });

  it("keeps to the teach budget, dropping the other role's sentence where it must", () => {
    const full = teachOf({});
    expect(full.trim().split(/\s+/).length).toBeLessThanOrEqual(TEACH_WORDS);
    // The whole of it is two sentences and the second role's is not one of them.
    expect(full).not.toContain("the other lark");
  });
});

describe("every hey a programme dance calls", () => {
  it("resolves with no slot left and inside the budget", () => {
    for (const dance of DEMO_DANCES) {
      for (const phrase of dance.phrases) {
        for (const call of phrase.figures) {
          if (call.figure !== "hey") continue;
          const texts = resolveFigureText(
            "hey",
            { ...(call.params ?? {}), beats: call.beats },
            { who: callWho(call) },
          )!;
          const where = `${dance.slug} ${phrase.name}`;
          expect(texts.walkthrough.teach, where).not.toContain("{");
          expect(texts.walkthrough.teach.trim().split(/\s+/).length, where).toBeLessThanOrEqual(
            TEACH_WORDS,
          );
          expect(texts.walkthrough.teach, where).toContain("Note where you are standing.");
        }
      }
    }
  });
});
