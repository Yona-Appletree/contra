import { describe, expect, it } from "vitest";
import {
  dancesUsingFigure,
  figureAloneRow,
  figureAssertionGroups,
  figureLabReport,
  figureOracles,
  figureSeamRows,
  seamKeysFor,
} from "./figureLab.js";
import { danceBySlug } from "../dances/index.js";

describe("dancesUsingFigure", () => {
  it("finds every dance that calls the figure, and only those", () => {
    const slugs = dancesUsingFigure("hey").map((d) => d.slug);
    expect(slugs).toContain("butter");
    expect(slugs).toContain("jubilation");
    expect(slugs).not.toContain("airpants");
  });

  it("is empty for a figure no demo dance calls directly", () => {
    // Named by no phrase — every dance calling this pairing spells it out
    // as `right-and-left-through` (bare `right-and-left` is not a figure id).
    expect(dancesUsingFigure("right-and-left")).toEqual([]);
  });

  it("is empty for an unknown id, not a throw", () => {
    expect(dancesUsingFigure("not-a-figure")).toEqual([]);
  });
});

describe("seamKeysFor", () => {
  it("names every seam either side of the figure, including the wrap", () => {
    const butter = danceBySlug("butter")!;
    // Butter: slide-left, circle, swing, long-lines, robins-chain, hey,
    // balance-and-swing — and the wrap back to slide-left.
    expect(seamKeysFor("robins-chain", butter).sort()).toEqual(
      ["long-lines → robins-chain", "robins-chain → hey"].sort(),
    );
    expect(seamKeysFor("slide-left", butter).sort()).toEqual(
      ["balance-and-swing → slide-left", "slide-left → circle"].sort(),
    );
  });

  it("is empty for a one-figure dance's own figure with itself missing from it", () => {
    const butter = danceBySlug("butter")!;
    expect(seamKeysFor("do-si-do", butter)).toEqual([]);
  });
});

describe("figureAloneRow", () => {
  it("measures a real figure alone, in duple and in becket", () => {
    const duple = figureAloneRow("hey", "duple");
    expect(duple?.key).toBe("hey");
    expect(duple?.samples).toBeGreaterThan(0);

    const becket = figureAloneRow("slide-left", "becket");
    expect(becket?.key).toBe("slide-left");
    expect(becket?.samples).toBeGreaterThan(0);
  });

  it("is undefined for an id with no registry figure", () => {
    expect(figureAloneRow("not-a-figure", "duple")).toBeUndefined();
  });
});

describe("figureSeamRows", () => {
  it("only reports seams that touch the figure, over the dances that call it", () => {
    const dances = dancesUsingFigure("robins-chain");
    const rows = figureSeamRows("robins-chain", dances);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.key.startsWith("robins-chain → ") || row.key.endsWith(" → robins-chain")).toBe(
        true,
      );
    }
  });

  it("is empty when no dance calls the figure", () => {
    expect(figureSeamRows("swing", [])).toEqual([]);
  });
});

describe("figureAssertionGroups", () => {
  it("finds the figure's own group and any seam group naming it", () => {
    const groups = figureAssertionGroups("swing").map((g) => g.key);
    expect(groups).toContain("swing");
    expect(groups).toContain("balance → swing");
  });

  it("is empty for an id no check writes about", () => {
    expect(figureAssertionGroups("slide-left")).toEqual([]);
  });
});

describe("figureOracles", () => {
  it("runs AC5/AC1/AC6 over one time through of one dance", () => {
    const butter = danceBySlug("butter")!;
    const [row] = figureOracles("hey", [butter]);
    expect(row?.dance).toBe("butter");
    expect(row?.until).toBe(64);
    expect(row?.oracles.coverage).toEqual([]);
  });
});

describe("figureLabReport", () => {
  it("is green for a real figure, on the library's current, all-fixed state", () => {
    const report = figureLabReport("hey");
    expect(report.id).toBe("hey");
    expect(report.ok).toBe(true);
    expect(report.text).toContain("HEY FOR FOUR");
    expect(report.text).toContain("## 1. Assertions");
    expect(report.text).toContain("`hey`");
    expect(report.text).toContain("## 2. Motion, alone");
    expect(report.text).toContain("## 3. Oracles");
  });

  it("restricts seams and oracles to one dance with `dance`", () => {
    const all = figureLabReport("robins-chain");
    const one = figureLabReport("robins-chain", "butter");
    expect(one.text).toContain("`butter`");
    expect(one.text.length).toBeLessThan(all.text.length);
  });

  it("is not ok for an id with no registry figure", () => {
    const report = figureLabReport("not-a-figure");
    expect(report.ok).toBe(false);
    expect(report.text).toContain("no such figure");
  });
});
