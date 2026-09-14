import type { Dance } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { contraDance } from "./chain.js";
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
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";

/**
 * Two small stand-ins for a real demo dance, built the same way
 * `packages/contra/src/dances/loadDances.ts` builds one from its JSON file —
 * `contraDance` over real figures — but deliberately not added to
 * `DEMO_DANCES`: one time through, four couples, two or three figures, so a
 * `figureSeamRows`/`figureLabReport` case here runs the decider once, over
 * ~16-24 beats, instead of sweeping every real dance that calls a figure
 * through it at full length, which is exactly the per-sample cost the repo's
 * briefs forbid inside one vitest case.
 *
 * A's calls put `long-lines` in the middle: `circle → long-lines` and
 * `long-lines → star` both touch it, and the wrap `star → circle` does not —
 * enough to exercise `figureSeamRows`'s filter both ways. B also calls
 * `long-lines`, so restricting `figureLabReport` to one dance (A) can be
 * shown to actually narrow the report against a corpus of two.
 */
const FIXTURE_DANCE_A: Dance = contraDance({
  slug: "figure-lab-fixture-a",
  title: "Figure Lab Fixture A",
  author: "figureLab.test.ts",
  formation: DUPLE_IMPROPER,
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "circle", beats: 8 },
        { figure: "long-lines", beats: 8 },
        { figure: "star", beats: 8 },
      ],
    },
  ],
});

const FIXTURE_DANCE_B: Dance = contraDance({
  slug: "figure-lab-fixture-b",
  title: "Figure Lab Fixture B",
  author: "figureLab.test.ts",
  formation: DUPLE_IMPROPER,
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "long-lines", beats: 8 },
        { figure: "do-si-do", beats: 8 },
      ],
    },
  ],
});

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
  // `figureSeamRows` drives the decider through `poseAt`; CI under turbo load runs ~15x slower than a laptop.
  it("only reports seams that touch the figure, over the dances that call it", () => {
    // Fixture A: circle → long-lines → star, wrap star → circle. The two
    // seams either side of `long-lines` should come back; the wrap, which
    // touches neither, should not.
    const rows = figureSeamRows("long-lines", [FIXTURE_DANCE_A]);
    expect(rows.map((row) => row.key).sort()).toEqual(
      ["circle → long-lines", "long-lines → star"].sort(),
    );
    for (const row of rows) {
      expect(row.key.startsWith("long-lines → ") || row.key.endsWith(" → long-lines")).toBe(true);
    }
  }, 20000);

  // `figureSeamRows` drives the decider through `poseAt`; CI under turbo load runs ~15x slower than a laptop.
  it("is empty when no dance calls the figure", () => {
    expect(figureSeamRows("swing", [])).toEqual([]);
  }, 20000);
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

/**
 * The `- \`...\`` bullet lines of a `figureLabReport` text between two
 * section headers (or from `startMarker` to the end, when `endMarker` is
 * omitted) — the seam rows or the oracle rows, counted without re-running the
 * decider to get them independently.
 */
function bulletsBetween(text: string, startMarker: string, endMarker?: string): number {
  const from = text.slice(text.indexOf(startMarker) + startMarker.length);
  const section = endMarker ? from.slice(0, from.indexOf(endMarker)) : from;
  return (section.match(/^- `/gm) ?? []).length;
}

const seamRowCount = (text: string): number =>
  bulletsBetween(text, "## Seam rows", "## 3. Oracles");
const oracleRowCount = (text: string): number => bulletsBetween(text, "## 3. Oracles");

describe("figureLabReport", () => {
  // `figureLabReport` drives the decider through `poseAt`; CI under turbo load runs ~15x slower than a laptop.
  it("is green for a real figure, on the library's current, all-fixed state", () => {
    // A real-corpus smoke test, restricted to `jubilation` (duple-improper,
    // four couples) so it still runs the decider on real data — the fixtures
    // above only stand in for the dance-scoping tests below — without
    // sweeping every "hey" dance in the demo corpus (including becket's six
    // couples) through it in one case. The unrestricted sweep (every dance
    // `hey` is called by) is still exercised by `pnpm figure hey` itself;
    // `apps/web/e2e/figureLab.spec.ts` only covers the pictures, not this
    // text report.
    const report = figureLabReport("hey", "jubilation");
    expect(report.id).toBe("hey");
    expect(report.ok).toBe(true);
    expect(report.text).toContain("HEY FOR FOUR");
    expect(report.text).toContain("## 1. Assertions");
    expect(report.text).toContain("`hey`");
    expect(report.text).toContain("## 2. Motion, alone");
    expect(report.text).toContain("## 3. Oracles");
  }, 20000);

  // `figureLabReport` drives the decider through `poseAt`; CI under turbo load runs ~15x slower than a laptop.
  it("sweeps seams and oracles over every dance that calls the figure, unrestricted", () => {
    // Both fixtures call `long-lines`; passing them as the corpus (instead
    // of the real, ten-dance `DEMO_DANCES`) keeps this to one short decider
    // run instead of a sweep over every real dance that calls the figure.
    // Fixture A contributes the `circle → long-lines` and
    // `long-lines → star` seams, fixture B contributes `long-lines →
    // do-si-do` and its wrap `do-si-do → long-lines` — 4 seam rows and one
    // oracle row per fixture (2 total) when both are in scope.
    const fixtures = [FIXTURE_DANCE_A, FIXTURE_DANCE_B];
    const all = figureLabReport("long-lines", undefined, fixtures);
    expect(all.text).toContain("`figure-lab-fixture-a`");
    expect(all.text).toContain("`figure-lab-fixture-b`");
    expect(seamRowCount(all.text)).toBe(4);
    expect(oracleRowCount(all.text)).toBe(2);
  }, 20000);

  // `figureLabReport` drives the decider through `poseAt`; CI under turbo load runs ~15x slower than a laptop.
  it("restricts seams and oracles to one dance with `dance`", () => {
    // Same two-fixture corpus as the unrestricted case above, but narrowed
    // to fixture A alone: only its two seam rows and its one oracle row
    // should appear, not fixture B's.
    const fixtures = [FIXTURE_DANCE_A, FIXTURE_DANCE_B];
    const one = figureLabReport("long-lines", "figure-lab-fixture-a", fixtures);
    expect(one.text).toContain("`figure-lab-fixture-a`");
    expect(one.text).not.toContain("figure-lab-fixture-b");
    expect(seamRowCount(one.text)).toBe(2);
    expect(oracleRowCount(one.text)).toBe(1);
  }, 20000);

  // `figureLabReport` drives the decider through `poseAt`; CI under turbo load runs ~15x slower than a laptop.
  it("is not ok for an id with no registry figure", () => {
    const report = figureLabReport("not-a-figure");
    expect(report.ok).toBe(false);
    expect(report.text).toContain("no such figure");
  }, 20000);
});
