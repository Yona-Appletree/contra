import { concurrentCalls } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "../dances/index.js";
import { parseRelation } from "../set/relations.js";
import {
  DESCRIPTION_WORDS,
  FIGURE_TEXTS,
  FORM_WORDS,
  LINE_WORDS,
  REQUIRED_FORM_BEATS,
  SHORT_FORM_WORDS,
  TEACH_WORDS,
  callWho,
  checkFigureTexts,
  formFor,
  renderSlot,
  resolveFigureForms,
  resolveFigureText,
  slotsIn,
  textedFigureIds,
  textsOf,
  variantValue,
} from "./figureText.js";
import { relationWords, whoOf } from "./relationWords.js";

/** Every figure that must have texts: the library's, and the engine's two. */
const IDS = [...textedFigureIds()];

/** How many words a text is, with a `{slot}` counted as the one word it becomes. */
const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** Every written string in every file, labelled, for a rule that applies to all of them. */
function everyText(): Array<{ id: string; where: string; field: string; text: string }> {
  const out: Array<{ id: string; where: string; field: string; text: string }> = [];
  for (const id of IDS) {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      for (const [field, text] of Object.entries(texts)) {
        out.push({ id, where, field, text: String(text) });
      }
    }
  }
  return out;
}

/** Every text of every figure a programme dance calls, resolved as the app prints it. */
function everyResolvedText(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  for (const dance of DEMO_DANCES) {
    for (const phrase of dance.phrases) {
      for (const written of phrase.figures) {
        for (const call of concurrentCalls(written)) {
          const texts = resolveFigureText(
            call.figure,
            { ...(call.params ?? {}), beats: call.beats },
            { who: callWho(call) },
          );
          if (texts === undefined) continue;
          const where = `${dance.slug} ${call.figure}`;
          out.push({ where: `${where} description`, text: texts.description });
          out.push({ where: `${where} line`, text: texts.walkthrough.line });
          out.push({ where: `${where} teach`, text: texts.walkthrough.teach });
          for (const form of texts.forms) {
            out.push({ where: `${where} call ${String(form.beats)}`, text: form.text });
          }
        }
      }
    }
  }
  return out;
}

describe("every figure has its seven texts", () => {
  it("loads with nothing to complain about", () => {
    expect(checkFigureTexts()).toEqual([]);
  });

  it.each(IDS)("%s has a file with all seven", (id) => {
    const file = FIGURE_TEXTS[id];
    expect(file, `no data/figures/${id}.json`).toBeDefined();
    expect(file!.description.length).toBeGreaterThan(0);
    expect(["name", "line"]).toContain(file!.defaultLevel);
    expect(file!.walkthrough.line.length).toBeGreaterThan(0);
    expect(file!.walkthrough.teach.length).toBeGreaterThan(0);
    for (const beats of REQUIRED_FORM_BEATS) {
      expect(file!.call[String(beats)], `${id}: no ${String(beats)}-beat form`).toBeDefined();
    }
  });

  it("has no text file for a figure the library does not hold", () => {
    expect([...Object.keys(FIGURE_TEXTS)].sort()).toEqual([...IDS].sort());
  });
});

/**
 * The voice rules a machine can check (`docs/move-texts.md`).
 *
 * Run twice over: once on what is **written** in the files, and once on every
 * text of every figure a **programme dance** calls, resolved through the word
 * tables as the app prints it. The second pass is what catches a rule broken by
 * the vocabulary rather than by the prose — "three quarters" arriving through
 * `{places}` rather than being typed into a sentence.
 */
describe("the voice (docs/move-texts.md)", () => {
  /** D18: say what to do, never what to avoid. */
  const NEGATIVES = /\b(nobody|no one|never|without|not|don't|do not|nothing|neither|nor)\b|n't/i;
  /** D8: no gendered word or pronoun for a role. */
  const GENDERED =
    /\b(he|she|his|her|hers|him|man|men|woman|women|lady|ladies|gent|gents|gentlemen|boy|girl)\b/i;
  /** D28: the words callers say to each other and never to the hall. */
  const CALLER_ONLY = /\b(improper|duple|minor set|progression|hands-four)\b/i;
  /** D15, D17: the encoder's numbers, where the user has words. */
  const ENCODER =
    /\bone and a half\b|\bthree quarters\b|couple's width|\bone couple\b|\bturn (one|two|three|four) places?\b/i;
  /** D20: never the view from the balcony. */
  const FROM_ABOVE = /the whole (line|set)|the (line|set) (slides|shifts)/i;
  // The user: "we really want them not to sound like ai slop." These are the
  // tells — a hedge, a parenthetical aside, an adjective about the figure, an
  // "(unsure: …)" left in by whoever wrote it — written down so they cannot
  // come back one text at a time.
  const BANNED = [
    "(",
    ")",
    "unsure",
    "usually",
    "typically",
    "graceful",
    "elegant",
    "flowing",
    "note that",
    "of course",
    "simply",
    "essentially",
  ];

  it.each(IDS)("%s says nothing an AI would say", (id) => {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      for (const [field, text] of Object.entries(texts)) {
        const lower = String(text).toLowerCase();
        for (const banned of BANNED) {
          expect(lower, `${id} ${where}.${field} contains "${banned}"`).not.toContain(banned);
        }
      }
    }
  });

  it("says what to do, never what to avoid", () => {
    for (const { id, where, field, text } of everyText()) {
      expect(text, `${id} ${where}.${field}`).not.toMatch(NEGATIVES);
    }
  });

  it("never names a role with a gendered word", () => {
    for (const { id, where, field, text } of everyText()) {
      expect(text, `${id} ${where}.${field}`).not.toMatch(GENDERED);
    }
  });

  it("says what the dancer does instead of what callers call it", () => {
    for (const { id, where, field, text } of everyText()) {
      expect(text, `${id} ${where}.${field}`).not.toMatch(CALLER_ONLY);
    }
  });

  it("uses the user's vocabulary rather than the encoder's", () => {
    for (const { id, where, field, text } of everyText()) {
      expect(text, `${id} ${where}.${field}`).not.toMatch(ENCODER);
    }
  });

  it("speaks from where the dancer stands, never from the balcony", () => {
    for (const { id, where, field, text } of everyText()) {
      expect(text, `${id} ${where}.${field}`).not.toMatch(FROM_ABOVE);
    }
  });

  it("keeps every rule when the words are filled in from a real call", () => {
    for (const { where, text } of everyResolvedText()) {
      expect(text, where).not.toMatch(NEGATIVES);
      expect(text, where).not.toMatch(GENDERED);
      expect(text, where).not.toMatch(CALLER_ONLY);
      expect(text, where).not.toMatch(ENCODER);
      expect(text, where).not.toMatch(FROM_ABOVE);
    }
  });

  it.each(IDS)("%s keeps to its word budget", (id) => {
    const file = FIGURE_TEXTS[id]!;
    for (const [where, texts] of textsOf(file)) {
      for (const [field, text] of Object.entries(texts)) {
        const budget = budgetFor(where, field);
        expect(words(String(text)), `${id} ${where}.${field}`).toBeLessThanOrEqual(budget);
      }
    }
  });

  it.each(IDS)("%s writes its calls the way the bubble draws them", (id) => {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      if (!where.endsWith("call")) continue;
      for (const [field, text] of Object.entries(texts)) {
        // Every key is a count of beats.
        expect(field, `${id} ${where}`).toMatch(/^[1-9]\d*$/);
        // Capitals, digits, spaces and the hyphen of DO-SI-DO; a `{slot}` is
        // written in lowercase and shouted when it is filled in.
        expect(String(text), `${id} ${where}.${field}`).toMatch(/^[A-Z0-9 \-{}a-zA-Z]+$/);
        expect(String(text).replace(/\{[a-zA-Z]+\}/g, ""), `${id} ${where}.${field}`).not.toMatch(
          /[a-z]/,
        );
      }
    }
  });

  it.each(IDS)("%s describes itself in the third person, in one sentence", (id) => {
    const description = FIGURE_TEXTS[id]!.description;
    expect(description, id).not.toMatch(/\b(you|your)\b/i);
    expect(description.match(/\./g)?.length ?? 0, id).toBe(1);
    expect(description.endsWith("."), id).toBe(true);
  });

  it.each(IDS)("%s writes whole sentences in its walkthroughs", (id) => {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      if (where.endsWith("call")) continue;
      for (const [field, text] of Object.entries(texts)) {
        const written = String(text);
        expect(written, `${id} ${where}.${field}`).not.toContain("  ");
        expect(written.trim(), `${id} ${where}.${field}`).toBe(written);
        expect(written, `${id} ${where}.${field}`).toMatch(/\.$/);
      }
    }
  });

  it.each(IDS)("%s has retired the slots W1 wrote", (id) => {
    for (const [, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      for (const text of Object.values(texts)) {
        for (const slot of slotsIn(String(text))) {
          expect(["where", "pairs", "couples"], `${id}: "{${slot}}"`).not.toContain(slot);
        }
      }
    }
  });
});

/** Which budget one text of one file is held to. */
function budgetFor(where: string, field: string): number {
  if (where.endsWith("description")) return DESCRIPTION_WORDS;
  if (where.endsWith("call")) return Number(field) <= 1 ? SHORT_FORM_WORDS : FORM_WORDS;
  return field === "line" ? LINE_WORDS : TEACH_WORDS;
}

describe("a call's own parameters fill every slot", () => {
  // One case per dance rather than per figure per dance: fifteen cases, each
  // resolving a whole time through, is the whole programme at a few ms each.
  it.each(DEMO_DANCES.map((d) => d.slug))("%s leaves no slot unresolved", (slug) => {
    const dance = DEMO_DANCES.find((d) => d.slug === slug)!;
    for (const phrase of dance.phrases) {
      for (const written of phrase.figures) {
        for (const call of concurrentCalls(written)) {
          const texts = resolveFigureText(
            call.figure,
            { ...(call.params ?? {}), beats: call.beats },
            { who: callWho(call) },
          );
          expect(texts, `${slug}: ${call.figure}`).toBeDefined();
          const all = [
            texts!.description,
            texts!.walkthrough.line,
            texts!.walkthrough.teach,
            ...texts!.forms.map((f) => f.text),
          ];
          for (const text of all) {
            expect(slotsIn(text), `${slug}: ${call.figure}: "${text}"`).toEqual([]);
            expect(text, `${slug}: ${call.figure}`).not.toContain("{");
            expect(text.length, `${slug}: ${call.figure}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("resolves a figure nobody calls from its own defaults", () => {
    for (const id of ["california-twirl", "roll-away", "balance"]) {
      const texts = resolveFigureText(id, {});
      expect(slotsIn(texts!.walkthrough.teach), id).toEqual([]);
    }
  });

  // The words the tables answer with are mid-sentence words, and a text may
  // open a sentence with one: the wave of four's teach does, right after "…
  // rather than at each other."
  it("opens a sentence with a capital, whichever words fill the slot", () => {
    const teach = resolveFigureText("balance-wave-of-four", {})!.walkthrough.teach;
    expect(teach).toContain(". The ");
    expect(teach).not.toMatch(/[.!?]\s+(the|your|a) /);
  });

  it("leaves a slot in the middle of a sentence alone", () => {
    const line = resolveFigureText("promenade", { pairs: "partners" })!.walkthrough.line;
    expect(line).toContain("your partner");
  });

  it("refuses a slot whose parameter the call does not carry", () => {
    expect(() => resolveFigureText("loop", {})).toThrow(/who/);
  });

  it("knows nothing about a figure with no file", () => {
    expect(resolveFigureText("moon-walk", {})).toBeUndefined();
    expect(resolveFigureForms("moon-walk", {})).toBeUndefined();
  });

  it("hands the forms back longest first", () => {
    const forms = resolveFigureForms("swing", { pairs: "partners" })!;
    expect(forms.map((f) => f.beats)).toEqual([4, 2, 1]);
    expect(forms.map((f) => f.text)).toEqual(["SWING YOUR PARTNER", "PARTNER SWING", "SWING"]);
    expect(formFor(forms, 3)!.text).toBe("PARTNER SWING");
    expect(formFor(forms, 0)!.text).toBe("SWING");
  });
});

describe("the relation word table", () => {
  it("says a relation two ways: a call shouts, a walkthrough teaches", () => {
    expect(relationWords(parseRelation("partner"), "call")).toBe("PARTNER");
    expect(relationWords(parseRelation("partner"), "prose")).toBe("your partner");
    expect(relationWords(parseRelation("neighbor"), "prose")).toBe("your neighbor");
    expect(relationWords(parseRelation("N2"), "prose")).toBe("your next neighbor");
    expect(relationWords(parseRelation("N0"), "prose")).toBe("your previous neighbor");
    expect(relationWords(parseRelation("shadow"), "prose")).toBe("your shadow");
  });

  it("counts the neighbours past the next one, as the corpus does", () => {
    // A Rare Bird: "right shoulder round number three"; Whoosh: "allemande left
    // once with number four". A deviation from the plan, which asked for no
    // words at all past N2 — two programme dances reach that far.
    expect(relationWords(parseRelation("N3"), "call")).toBe("NUMBER THREE");
    expect(relationWords(parseRelation("N4"), "prose")).toBe("number four");
  });

  it("says a role as a plural to the hall and a singular to the dancer", () => {
    expect(relationWords("robin", "call")).toBe("ROBINS");
    expect(relationWords("robin", "prose")).toBe("the other robin");
    expect(relationWords("lark", "prose")).toBe("the other lark");
  });

  it("reads a record's own spellings of who", () => {
    expect(whoOf("partners")).toEqual({ kind: "partner" });
    expect(whoOf("robins")).toBe("robin");
    expect(whoOf([["1R", "2R"]])).toBe("robin");
    expect(whoOf([["1L", "2L"]])).toBe("lark");
    expect(whoOf([["1L", "2R"]])).toBeUndefined();
    // A selector that names a place rather than a person has no words.
    expect(whoOf("ones")).toBeUndefined();
    expect(whoOf("self+partner+N1+N2")).toBeUndefined();
  });

  it("names nobody for a figure a dancer does alone", () => {
    expect(relationWords(parseRelation("self"), "prose")).toBeUndefined();
  });
});

describe("the slot vocabulary", () => {
  it("says how far in the user's words", () => {
    expect(renderSlot("amount", 1.5, "call")).toBe("once and a half");
    expect(renderSlot("amount", 1.5, "prose")).toBe("once and a half");
    expect(renderSlot("amount", 1, "prose")).toBe("once around");
    expect(renderSlot("places", 3, "call")).toBe("three places");
    expect(renderSlot("places", 3, "prose")).toBe("three places");
    expect(renderSlot("places", 4, "call")).toBe("once");
  });

  it("has a word for every fraction a record writes", () => {
    for (const amount of [0.25, 1 / 3, 0.5, 0.75, 0.875, 1, 1.25, 1.5, 2]) {
      expect(renderSlot("amount", amount, "call"), String(amount)).toBeDefined();
    }
  });

  it("has no words for a parameter measured in pixels", () => {
    expect(renderSlot("bowPx", 5, "prose")).toBeUndefined();
    expect(renderSlot("amount", 3.25, "prose")).toBeUndefined();
  });

  it("writes a variant key's value the way the record writes it", () => {
    expect(variantValue("partners")).toBe("partners");
    expect(variantValue(1.5)).toBe("1.5");
    expect(variantValue([["1R", "2R"]])).toBe("robins");
  });
});

describe("the variants", () => {
  it("gives the robins' allemande its own prose", () => {
    const robins = resolveFigureText(
      "allemande",
      { pairs: [["1R", "2R"]], hand: "L", amount: 1.5 },
      { who: whoOf([["1R", "2R"]]) },
    );
    expect(robins!.walkthrough.line).toContain("Robins only");
    expect(robins!.forms[0]!.text).toBe("ROBINS ALLEMANDE LEFT ONCE AND A HALF");

    const both = resolveFigureText("allemande", { pairs: "partners" }, { who: whoOf("partners") });
    expect(both!.walkthrough.line).not.toContain("Robins only");
    expect(both!.forms[0]!.text).toBe("PARTNER ALLEMANDE LEFT");
  });

  it("gives half a hey its own call", () => {
    const half = resolveFigureText("hey", { amount: 0.5 });
    expect(half!.forms.map((f) => f.text)).toEqual(["HALF A HEY", "HALF HEY", "HEY"]);
    const full = resolveFigureText("hey", {});
    expect(full!.forms.map((f) => f.text)).toEqual(["HEY FOR FOUR", "HEY", "HEY"]);
  });

  it("mirrors the whole weave when the larks start", () => {
    const larks = resolveFigureText("hey", { start: "lark", by: "left" });
    expect(larks!.walkthrough.teach).toContain("Larks start by passing left shoulders");
  });

  it("swaps who crosses and who loops for the box circulate (P7)", () => {
    // FR-B1's own doc comment: "which route you dance is which way you are
    // looking, not which role you are" — before this variant the text
    // hardcoded "the larks cross, the robins loop" for `facesIn=robin` too,
    // which is backwards whenever a wave forms with the robins facing in.
    const larksIn = resolveFigureText("circulate", { facesIn: "lark", hand: "R" });
    expect(larksIn!.walkthrough.teach).toContain("The larks walk straight across");
    expect(larksIn!.walkthrough.teach).toContain("The robins loop out");

    const robinsIn = resolveFigureText("circulate", { facesIn: "robin", hand: "R" });
    expect(robinsIn!.walkthrough.teach).toContain("The robins walk straight across");
    expect(robinsIn!.walkthrough.teach).toContain("The larks loop out");
  });
});
