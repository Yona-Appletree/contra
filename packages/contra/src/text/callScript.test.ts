import { describe, expect, it } from "vitest";
import { ALL_DANCES, DEMO_DANCES } from "../dances/index.js";
import { DATA_DEFINITIONS } from "../library/figures/index.js";
import {
  DEFAULT_CALL_POLICY,
  LEAD_BEATS,
  budgetFor,
  callScript,
  callTexts,
  callingCard,
  classifyCall,
  saysTheSame,
} from "./callScript.js";

/**
 * The calling card is a computation, so what is tested is the computation: how
 * much room there is, which form fits in it, and what happens when there is not
 * enough room for one call's worth of words.
 */

const of = (slug: string) => ALL_DANCES.find((dance) => dance.slug === slug)!;

describe("the lead", () => {
  it("is four beats, and the library's own leads are four or two", () => {
    // **A deviation from the plan's A22**, recorded here rather than in prose:
    // it expected every definition to carry `lead: 4`. The merged library's
    // short figures carry two — a pull-by, a loop, a cast back, a bend the line,
    // a turn as couples, a turn alone, Fatal Attraction's own go-forward, the
    // corpus's own `custom` line — and those are the figures whose own call is
    // two beats long. The window is about how far ahead a **caller** speaks,
    // which is one number.
    expect(LEAD_BEATS).toBe(4);
    const leads = new Set(DATA_DEFINITIONS.map((def) => def.lead));
    expect([...leads].sort((a, b) => Number(a) - Number(b))).toEqual([2, 4]);
    const short = DATA_DEFINITIONS.filter((def) => def.lead === 2).map((def) => def.id);
    expect(short.sort()).toEqual([
      "bend-the-line",
      "cast-back",
      "custom",
      "fatal-attraction/go-forward",
      "loop",
      "pull-by",
      "turn-alone",
      "turn-as-couples",
    ]);
  });
});

describe("the budget", () => {
  it("shortens as the hall learns the dance, and stays there", () => {
    expect(DEFAULT_CALL_POLICY.budgets).toEqual([4, 2, 2, 1]);
    expect([1, 2, 3, 4, 9].map((t) => budgetFor(DEFAULT_CALL_POLICY, t))).toEqual([4, 2, 2, 1, 1]);
  });

  it("is a dance's own where it writes one", () => {
    expect(budgetFor({ budgets: [4, 4] }, 9)).toBe(4);
  });
});

describe("the window, and what fits in it", () => {
  it("gives every call of every programme dance something to say", () => {
    for (const dance of DEMO_DANCES) {
      for (const timeThrough of [1, 2, 3, 4]) {
        for (const one of callScript(dance, timeThrough)) {
          expect(one.text, `${dance.slug} time ${String(timeThrough)}`).toBeTruthy();
          expect(one.text, `${dance.slug} time ${String(timeThrough)}`).not.toContain("{");
          expect(one.text).toBe(one.text.toUpperCase());
          // The words a card colours join back into the words a caller says.
          expect(one.tokens.map((token) => token.text).join(" ")).toBe(one.text);
        }
      }
    }
  });

  it("wraps the first call's window round to the last call of the record", () => {
    // Butter's last figure is sixteen beats, so its first call has the whole
    // four to be said in; the circle that follows a two-beat slide has two.
    const rows = callingCard(of("butter"));
    expect(rows[0]!.window).toBe(4);
    expect(rows[1]!.window).toBe(2);
  });

  it("says a short call in the same breath as the one before it, inside a phrase", () => {
    const first = callScript(of("butter"), 1);
    expect(first[0]!.text).toBe("SHIFT LEFT, CIRCLE LEFT THREE PLACES");
    expect(first[0]!.covers).toEqual([0, 1]);
    // And the card shows the whole of it on the first row and a dash on the
    // covered one, which is what `mergedInto` is.
    const rows = callingCard(of("butter"));
    expect(rows[1]!.byTime[0]!.text).toBe("");
    expect(rows[1]!.byTime[0]!.mergedInto).toBe(0);
    // At the middle register there is no room for a whole sentence anyway, so
    // nothing merges.
    expect(rows[1]!.byTime[1]!.mergedInto).toBeUndefined();
  });

  it("never merges a call into the phrase before it", () => {
    for (const dance of ALL_DANCES) {
      const firsts = new Set<number>();
      let index = 0;
      for (const phrase of dance.phrases) {
        firsts.add(index);
        index += phrase.figures.length;
      }
      for (const timeThrough of [1, 2, 3, 4]) {
        for (const one of callScript(dance, timeThrough)) {
          for (const covered of one.covers.slice(1)) {
            expect(firsts.has(covered), `${dance.slug}: call ${String(covered)}`).toBe(false);
          }
        }
      }
    }
  });
});

describe("a concurrent call", () => {
  it("is one utterance, its branches joined by WHILE", () => {
    const said = callScript(of("are-you-most-done"), 1);
    const both = said.find((one) => one.text.includes(" WHILE "))!;
    expect(both).toBeDefined();
    expect(both.text).toBe("ALLEMANDE RIGHT WHILE ROBINS LOOP");
    // Both halves are said, so both halves take time: the beats sum.
    expect(both.beats).toBe(4);
  });

  it("lists its branches on the card's own row", () => {
    const row = callingCard(of("fatal-attraction")).find((one) => one.branches !== undefined)!;
    expect(row.figure).toBe("cast-back");
    expect(row.branches).toEqual(["fatal-attraction/go-forward"]);
  });
});

describe("the note card's own register", () => {
  it("gives every call of every dance a line, unmerged", () => {
    for (const dance of ALL_DANCES) {
      const said = callTexts(dance, 4);
      expect(said.length).toBe(dance.phrases.flatMap((phrase) => phrase.figures).length);
      for (const one of said) expect(one.text.length).toBeGreaterThan(0);
    }
  });
});

describe("what a caller's line is made of", () => {
  it("reads a form's parts off its template", () => {
    const [first] = callScript(of("airpants"), 1);
    expect(first!.text).toBe("WITH YOUR NEIGHBOR BALANCE AND SWING");
    expect(first!.tokens).toEqual([
      { kind: "who", text: "WITH YOUR NEIGHBOR" },
      { kind: "what", text: "BALANCE AND SWING" },
    ]);
  });

  it("guesses a flourish's parts from its words", () => {
    expect(classifyCall("SHIFT LEFT")).toEqual([
      { kind: "what", text: "SHIFT" },
      { kind: "way", text: "LEFT" },
    ]);
    expect(classifyCall("ROBINS RIGHT SHOULDER ROUND")).toEqual([
      { kind: "who", text: "ROBINS" },
      { kind: "way", text: "RIGHT" },
      { kind: "what", text: "SHOULDER ROUND" },
    ]);
  });
});

describe("the same call said two ways", () => {
  it("knows the encoder's vocabulary from the user's", () => {
    expect(saysTheSame("CIRCLE LEFT THREE QUARTERS", "CIRCLE LEFT THREE PLACES")).toBe(true);
    expect(
      saysTheSame(
        "ROBINS ALLEMANDE RIGHT ONE AND A HALF",
        "ROBINS ALLEMANDE RIGHT ONCE AND A HALF",
      ),
    ).toBe(true);
    expect(saysTheSame("LADIES CHAIN", "ROBINS CHAIN")).toBe(true);
    expect(saysTheSame("NEIGHBOUR SWING", "SWING YOUR NEIGHBOR")).toBe(true);
    expect(saysTheSame("STAR LEFT ALL THE WAY", "STAR LEFT ONCE")).toBe(true);
    // And two different calls stay two different calls.
    expect(saysTheSame("SHIFT LEFT", "SLIDE LEFT")).toBe(false);
    expect(saysTheSame("PARTNER SWING", "NEIGHBOR SWING")).toBe(false);
  });
});
