import { describe, expect, it } from "vitest";
import { figureChecks } from "./figureChecks.js";
import { KNOWN_WRONG, isKnownWrong } from "./knownWrong.js";
import { CONTRA_FIGURE_IDS, createContraRegistry } from "./registry.js";

/**
 * The known-wrong contract, in two halves.
 *
 * Everything **not** on `KNOWN_WRONG` passes, so a change that breaks a figure
 * fails here. Everything **on** it still fails, so a change that fixes one
 * also fails here — and the fix is to delete the row, which is how the list
 * gets shorter without anyone remembering to look at it.
 *
 * No assertion is skipped and none was loosened. The failures these tests
 * tolerate are printed with their numbers in `docs/motion-report.md`.
 */

const all = figureChecks().flatMap((group) =>
  group.results.map((result) => ({ key: group.key, result })),
);

const describeRow = (key: string, label: string, note: string): string =>
  `${key}: "${label}" — ${note}`;

describe("the figure checks", () => {
  it("makes at least one assertion about every figure the milestone named", () => {
    const keys = new Set(figureChecks().map((g) => g.key));
    for (const id of [
      "hey",
      "robins-chain",
      "long-lines",
      "star",
      "circle",
      "allemande",
      "do-si-do",
      "right-and-left-through",
      "petronella",
      "balance",
      "swing",
      "balance → swing",
    ]) {
      expect(keys).toContain(id);
    }
  });

  it("passes everything that is not on the known-wrong list", () => {
    const broken = all
      .filter(({ key, result }) => !result.pass && !isKnownWrong(key, result.label))
      .map(({ key, result }) => describeRow(key, result.label, result.note));
    expect(broken).toEqual([]);
  });

  it("still fails everything that is on the known-wrong list", () => {
    const fixed = all
      .filter(({ key, result }) => result.pass && isKnownWrong(key, result.label))
      .map(({ key, result }) => describeRow(key, result.label, result.note));
    // A row here means a figure got better: delete its row from KNOWN_WRONG.
    expect(fixed).toEqual([]);
  });

  it("has no known-wrong row that no assertion produces", () => {
    const orphans = KNOWN_WRONG.filter(
      (row) => !all.some(({ key, result }) => key === row.key && result.label === row.label),
    ).map((row) => describeRow(row.key, row.label, "no assertion produces this label"));
    expect(orphans).toEqual([]);
  });
});

describe("every figure says what the dancers do", () => {
  it("has a `describe` on every figure in the registry", () => {
    const registry = createContraRegistry();
    for (const id of registry.ids()) {
      const text = registry.get(id).describe;
      expect(text, `figure "${id}" has no describe`).toBeTruthy();
      // Two to four sentences of a caller's words, not a one-liner.
      expect(text!.length, `figure "${id}"'s describe is too short`).toBeGreaterThan(80);
    }
  });

  it("marks the ones we are unsure of, so a caller knows what to correct", () => {
    const registry = createContraRegistry();
    const unsure = CONTRA_FIGURE_IDS.filter((id) => registry.get(id).describe?.includes("(unsure"));
    // The marker is written `(unsure: why)` rather than a bare `(unsure)`, so a
    // caller reading the report is told what to correct as well as where.
    // Not an assertion about which figures: an assertion that it is in use and
    // that the report has something to show the user.
    expect(unsure.length).toBeGreaterThan(0);
  });
});
