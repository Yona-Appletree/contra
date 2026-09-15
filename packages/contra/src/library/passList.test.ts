import { describe, expect, it } from "vitest";
import {
  amountOfPassList,
  legsOfAmount,
  legsOfPassList,
  parsePassList,
  printPassList,
  readPassList,
} from "./passList.js";

/**
 * **The pass list's own tests**: the notation, and the twenty-line fixture the
 * round trip is run over.
 *
 * The fixture has two halves and they are not the same kind of evidence, so they
 * are kept apart and labelled.
 *
 * - **{@link QUOTED}** — five hey lines **quoted verbatim** from the Caller's
 *   Box pages of the acceptance set, which `dances/acceptance.ts` holds and
 *   `notes.md` records with their permission. Nothing in this half is written by
 *   this repository.
 * - **{@link WRITTEN}** — fifteen more, one for each *kind* of hey
 *   `notes.md`'s Family 4 counts enumerate (1/8, 1/2, 3/4 and full; `~`;
 *   ricochet; hey for three; an unusual side person; a diagonal), written **in
 *   this repository's own notation** rather than copied from any dance. They
 *   are here because the counts say those variants exist in the corpus in
 *   quantity, not as quotations of particular dances, and this comment is the
 *   whole of that claim.
 */

/** Five hey lines, verbatim from the Caller's Box, in the Box's own spelling. */
const QUOTED: readonly { dance: string; line: string; repo: string }[] = [
  { dance: "Butter #10320 B1", line: "WR;NL;MR;PL;WR;NL;MR", repo: "RR NL LR PL RR NL LR" },
  {
    dance: "On the Prowl #10626 B2",
    line: "WR;NL;MR;PL;WR;NL;M ricochet;NL~",
    repo: "RR NL LR PL RR NL L! NL~",
  },
  {
    dance: "Are You 'Most Done? #2842 B1",
    line: "MR;N2L;WR;PL;MR;N2L;WR;PL",
    repo: "LR N2L RR PL LR N2L RR PL",
  },
  { dance: "Anna's Reel #140 A2", line: "WL;PR;ML;N2R", repo: "RL PR LL N2R" },
  { dance: "Anna's Reel #140 2A2", line: "MR;PL;WR;N3L", repo: "LR PL RR N3L" },
];

/** Fifteen more, one per variant `notes.md`'s counts name. Written, not quoted. */
const WRITTEN: readonly { what: string; line: string }[] = [
  { what: "a full hey, larks first", line: "LR PL RR NL LR PL RR" },
  { what: "a full hey by the left", line: "RL PR LL NR RL PR LL" },
  { what: "a half hey (1/2, 736 in the corpus)", line: "RR NL LR" },
  { what: "a half hey, larks first", line: "LR PL RR" },
  { what: "three quarters (92)", line: "RR NL LR PL RR" },
  { what: "an eighth (55): one pass and stop", line: "RR" },
  { what: "a half hey ending short (~, about 340)", line: "RR NL LR~" },
  { what: "a full hey ending short on the last side pass", line: "RR NL LR PL RR NL LR PL~" },
  { what: "a ricochet on the first centre pass (107)", line: "R! NL LR PL RR NL LR" },
  { what: "a ricochet on the larks' second centre pass", line: "RR NL LR PL RR NL L!" },
  { what: "a hey for three (69): the same list, one role standing out", line: "RR NL LR PL RR NL LR" },
  { what: "an unusual side person (about 150): the shadow at the sides", line: "RR SL LR SL RR SL LR" },
  { what: "the opposite at the sides", line: "RR OL LR OL RR OL LR" },
  { what: "a diagonal hey with N2 (102 along/diagonal)", line: "LR N2L RR PL LR N2L RR" },
  { what: "a hey to N3, which A Rare Bird's sides reach", line: "RR N3L LR PL RR N3L LR" },
];

describe("the pass list, as a notation", () => {
  it("reads who and shoulder off every token", () => {
    expect(parsePassList("RR NL LR PL")).toEqual([
      { who: "robins", by: "right" },
      { who: "neighbor", by: "left" },
      { who: "larks", by: "right" },
      { who: "partner", by: "left" },
    ]);
  });

  it("takes the Caller's Box's own W and M, and prints R and L", () => {
    expect(printPassList(parsePassList("WR;NL;MR;PL"))).toBe("RR NL LR PL");
  });

  it("takes a numbered relation, and reads N1 as the plain word", () => {
    expect(parsePassList("N2L N3R N1L")).toEqual([
      { who: "N2", by: "left" },
      { who: "N3", by: "right" },
      { who: "neighbor", by: "left" },
    ]);
  });

  it("reads a ricochet, marked or spelled out, and keeps the shoulder it came in on", () => {
    expect(parsePassList("L!")).toEqual([{ who: "larks", by: "right", ricochet: true }]);
    expect(parsePassList("M ricochet")).toEqual([{ who: "larks", by: "right", ricochet: true }]);
  });

  it("reads the completion flag", () => {
    expect(parsePassList("RR NL~")).toEqual([
      { who: "robins", by: "right" },
      { who: "neighbor", by: "left", short: true },
    ]);
  });

  it("refuses what is not a pass, by name", () => {
    expect(() => parsePassList("RR ZL")).toThrow(/"ZL" starts with "Z"/);
    expect(() => parsePassList("RR NX")).toThrow(/ends with "X"/);
    expect(() => parsePassList("R2R")).toThrow(/numbers a role/);
    expect(() => parsePassList("R")).toThrow(/is not a pass/);
  });

  it("takes the words spelled out, which is what JSON writes", () => {
    expect(
      readPassList([
        { who: "robins", by: "right" },
        { who: "neighbor", by: "left", short: true },
      ]),
    ).toEqual([
      { who: "robins", by: "right" },
      { who: "neighbor", by: "left", short: true },
    ]);
    expect(printPassList(readPassList("RR NL")!)).toBe("RR NL");
    expect(readPassList("")).toBeUndefined();
    expect(readPassList(undefined)).toBeUndefined();
  });
});

describe("the round trip, over twenty real lines", () => {
  it("normalises all five quoted Caller's Box lines into this repository's spelling", () => {
    for (const { dance, line, repo } of QUOTED) {
      expect(printPassList(parsePassList(line)), dance).toBe(repo);
    }
  });

  it("round-trips all twenty in this repository's own spelling, unchanged", () => {
    const lines = [...QUOTED.map((q) => q.repo), ...WRITTEN.map((w) => w.line)];
    expect(lines).toHaveLength(20);
    for (const line of lines) {
      expect(printPassList(parsePassList(line)), line).toBe(line);
    }
  });

  it("counts the legs a list is, which is what puts its passes on the beat", () => {
    // Seven passes and the walk home is eight legs of a sixteen-beat hey, so
    // the passes land on 2, 4, 6, 8, 10, 12 and 14 — what a caller counts.
    expect(legsOfPassList(parsePassList("RR NL LR PL RR NL LR"))).toBe(8);
    expect(amountOfPassList(parsePassList("RR NL LR PL RR NL LR"))).toBe(1);
    // A half hey is three passes and the walk on to the place opposite.
    expect(legsOfPassList(parsePassList("RR NL LR"))).toBe(4);
    expect(amountOfPassList(parsePassList("RR NL LR"))).toBe(0.5);
    // Ending short has no walk home: the last token is where it stops.
    expect(legsOfPassList(parsePassList("RR NL LR PL RR NL L! NL~"))).toBe(8);
    expect(legsOfPassList(parsePassList("RR NL LR~"))).toBe(3);
  });

  it("turns an amount back into legs, so a call may write either", () => {
    expect(legsOfAmount(1)).toBe(8);
    expect(legsOfAmount(0.5)).toBe(4);
    expect(legsOfAmount(0.75)).toBe(6);
    expect(legsOfAmount(0.25)).toBe(2);
    expect(legsOfAmount(1 / 8)).toBe(1);
  });
});
