import { createGroup, withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET, LINE_GROUP } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { downTheHall } from "./down-the-hall.js";
import { figureMoves, figureProblems, probeFigure, probeGroup } from "./testing.js";

describe("down the hall", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      expect(
        figureProblems(probeFigure(downTheHall, {}, { group: probeGroup(formation) })),
      ).toEqual([]);
    });
  }

  it("swaps each couple's own two dancers onto each other's original station", () => {
    const ends = figureMoves(downTheHall);
    // 1L ends where 1R started, and 1R ends where 1L started; same for 2.
    for (const [a, b] of [
      ["1L", "1R"],
      ["1R", "1L"],
      ["2L", "2R"],
      ["2R", "2L"],
    ] as const) {
      const originalOfB = DUPLE_IMPROPER.group(4).find((s) => s.id === b)!;
      expect(ends[a]!.p).toEqual(originalOfB.p);
      expect(ends[a]!.facing).toBeCloseTo(originalOfB.facing, 6);
    }
  });

  it("honors a dance-authored order (couple 2 leads the line)", () => {
    const ends = figureMoves(downTheHall, { order: ["2L", "2R", "1L", "1R"] });
    // Couple pairing (adjacent in `order`) is unchanged; only which couple
    // leads the line changed, which does not change who ends on whom.
    const originalOf2R = DUPLE_IMPROPER.group(4).find((s) => s.id === "2R")!;
    expect(ends["2L"]!.p).toEqual(originalOf2R.p);
  });
});

/**
 * `group: "line"` — the director's revision to this milestone (2026-09-14):
 * "author down-the-hall's call with group: 'line', ends: 'bottom'... so that
 * at the true bottom of a set the waiting couple is swept into the figure."
 * M2 (merged) built `groupsFor("line", set)` and the `ends` exclusion; what
 * this milestone owns is whether `down-the-hall` itself, as a figure, can
 * run on the group that selector actually hands it.
 *
 * **Interior case: yes, unchanged.** `groupsFor("line", set)` is "identical
 * to hands-four in the interior" (becket.test.ts, dupleImproper.test.ts) —
 * so every probe above, run against the plain four-station group, already
 * covers every interior instance a `"line"`-selector call ever produces.
 * No separate interior-with-`"line"` test is needed because there is no
 * separate interior-with-`"line"` shape.
 *
 * **True-end case: not yet.** Duple improper can never have a wait couple
 * at both true ends of the same cycle (`dupleImproper.ts`'s `groupFor`
 * comment; confirmed by `dupleImproper.test.ts`'s alternating
 * `["wait-bottom", "wait-top", ...]`), but becket can, at rest, with as few
 * as four couples (`becket.test.ts`: `["wait-top", "set", "wait-bottom"]`).
 * At a true end `groupsFor("line", set)` widens to **six** stations — but
 * `DownTheHallParams.order` is a strict four-tuple, and every station
 * `ends()` visits comes from `ctx.ids`, i.e. the group actually handed to
 * the figure, not from `order` alone. Handed the widened group with its own
 * default `order`, the figure throws by name rather than silently
 * mis-dancing two dancers it was never told about — the two out-of-scope
 * stations. Building the swept-in geometry itself (an `order` that names
 * the waiting couple's two stations, and turning three couples through the
 * line instead of two) is real, undone work — flagged here, and in the
 * report, rather than guessed at.
 */
describe('down the hall and the "line" selector (M2 dependency)', () => {
  it('groupsFor("line", set) is the plain four-station group in the interior', () => {
    const state = BECKET.start({ id: "b", couples: 8, centre: [0, 0], axis: 90 });
    const line = BECKET.groupsFor(LINE_GROUP, state);
    const interior = line.find((p) => p.stations.length === 4)!;
    expect(interior).toBeDefined();
    const group = createGroup(interior, BECKET.roleSet);
    const params = withDefaults(downTheHall, {}, downTheHall.beats);
    expect(figureProblems(probeFigure(downTheHall, params, { group }))).toEqual([]);
  });

  it("widens to six stations at a true end (M2's own mechanism, confirmed here)", () => {
    const state = BECKET.start({ id: "b", couples: 8, centre: [0, 0], axis: 90 });
    const line = BECKET.groupsFor(LINE_GROUP, state);
    const widened = line.filter((p) => p.stations.length === 6);
    expect(widened).toHaveLength(2); // both a true top and a true bottom, per D7/D8
  });

  it("does not yet dance a true end: down-the-hall's own order is a fixed four-tuple", () => {
    const state = BECKET.start({ id: "b", couples: 8, centre: [0, 0], axis: 90 });
    const line = BECKET.groupsFor(LINE_GROUP, state);
    const bottom = line.find((p) => p.stations.length === 6)!;
    const group = createGroup(bottom, BECKET.roleSet);
    const params = withDefaults(downTheHall, {}, downTheHall.beats);
    // Fails loudly, by station name, rather than silently mis-dancing the
    // two stations `order` was never told about.
    expect(() => downTheHall.ends(group, params)).toThrow(/not in "order"/);
  });
});
