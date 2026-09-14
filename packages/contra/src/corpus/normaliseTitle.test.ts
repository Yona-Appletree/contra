import { describe, expect, it } from "vitest";
import { normaliseTitle, titleKey } from "./normaliseTitle.js";

describe("normaliseTitle", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normaliseTitle("  Butter  ")).toBe("Butter");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normaliseTitle("A   Thing  of\tTrust")).toBe("A Thing of Trust");
  });

  it("strips a leading program-order number", () => {
    expect(normaliseTitle("2. Sorry, Erik")).toBe("Sorry, Erik");
    expect(normaliseTitle("10. Diana's Delight")).toBe("Diana's Delight");
  });

  it("leaves a title with no leading number untouched", () => {
    expect(normaliseTitle("Butter")).toBe("Butter");
  });

  it("preserves case", () => {
    expect(normaliseTitle("cHiNeSe New Year")).toBe("cHiNeSe New Year");
  });
});

describe("titleKey", () => {
  it("is case-insensitive", () => {
    expect(titleKey("Butter")).toBe(titleKey("BUTTER"));
    expect(titleKey("Butter")).toBe(titleKey("butter"));
  });

  it("is whitespace-insensitive", () => {
    expect(titleKey("A Thing of Trust")).toBe(titleKey("  A   Thing of Trust "));
  });

  it("unifies numbered and unnumbered instances of the same title", () => {
    expect(titleKey("6. The Judge")).toBe(titleKey("The Judge"));
  });

  // Named in corpus-analysis.md section 1 ("Near-duplicate spellings") as a
  // real but minority issue this normaliser deliberately does not resolve —
  // m00-corpus.md's deliverable scopes the normaliser to whitespace and
  // case only. These examples lock in that boundary: near-duplicates stay
  // distinct rather than silently merging.
  describe("near-duplicate spellings named in corpus-analysis.md (kept distinct)", () => {
    it("a leading 'The' is not stripped", () => {
      expect(titleKey("Boys from Urbana")).not.toBe(titleKey("The Boys from Urbana"));
    });

    it("a '(var)' / ', var' tag is not stripped", () => {
      expect(titleKey("Fiddler's Frolic")).not.toBe(titleKey("Fiddler's Frolic, var"));
      expect(titleKey("Fiddler's Frolic")).not.toBe(titleKey("Fiddler's Frolic (var)"));
    });

    it("curly vs straight apostrophes are not unified", () => {
      expect(titleKey("Chris’ Poetic Orangutan")).not.toBe(titleKey("Chris' Poetic Orangutan"));
    });

    it("ambiguous punctuation is not unified", () => {
      expect(titleKey("M.A.D. About Dancing")).not.toBe(titleKey("Mad About Dancing"));
    });
  });
});
