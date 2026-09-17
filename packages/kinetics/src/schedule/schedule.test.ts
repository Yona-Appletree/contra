import { describe, expect, it } from "vitest";
import { PAIR, PAIR_SOLO } from "../dialect/pair/Pair.js";
import type { Dialect } from "../dialect/Dialect.js";
import { FIGURES } from "../figures/registry.js";
import type { FigureIR } from "../ir/Figure.js";
import { compile } from "../lang/compile.js";
import { FIXTURE_PROGRAM } from "../lang/fixture.js";
import { parse } from "../lang/parse.js";
import { tempo } from "../units/Tempo.js";
import { TAKE_BEATS } from "../units/limits.js";
import { schedule } from "./schedule.js";
import type { Schedule } from "./schedule.js";

const T = tempo(112);

const run = (source: string, dialect: Dialect = PAIR, registry = FIGURES): Schedule => {
  const { sequence, errors } = compile(parse(source), registry, dialect);
  expect(errors).toEqual([]);
  return schedule(sequence, dialect, T);
};

describe("the fixture", () => {
  const s = run(FIXTURE_PROGRAM);
  const lark = s.calls.lark ?? [];

  it("schedules six calls per dancer with no errors", () => {
    expect(s.errors).toEqual([]);
    expect(lark.map((c) => c.call.figure.id)).toEqual([
      "bow",
      "do-si-do",
      "allemande",
      "do-si-do",
      "allemande",
      "bow",
    ]);
    expect(s.endBeat).toBe(40);
  });

  it("has windows that are contiguous and cover every beat", () => {
    for (const c of lark) {
      expect(c.entry[0]).toBe(c.call.start);
      expect(c.entry[1]).toBe(c.body[0]);
      expect(c.body[1]).toBe(c.exit[0]);
      expect(c.exit[1]).toBe(c.call.end);
      expect(c.body[1]).toBeGreaterThanOrEqual(c.body[0] + c.call.figure.beats.min);
    }
    const program = s.programs.lark;
    for (let beat = 0; beat < 40; beat++) {
      expect(
        program?.slots.some((slot) => slot.beat === beat && slot.half === 0),
        `beat ${beat}`,
      ).toBe(true);
    }
  });

  it("takes the allemande's hands overlapped on the do-si-do's last beats, and the allemande pays no entry", () => {
    const doSiDo = lark[1]!;
    const allemande = lark[2]!;
    expect(allemande.seamIn).toBe("take-overlapped");
    expect(allemande.entry).toEqual([12, 12]);
    expect(doSiDo.exit[1] - doSiDo.exit[0]).toBeGreaterThanOrEqual(1);
    const slot = s.programs.lark?.slots.find((x) => x.beat === 12 - TAKE_BEATS && x.half === 0);
    expect(
      slot?.instrs.some((i) => i.op === "hold" && i.hold === "allemande-R" && i.with === "robin"),
    ).toBe(true);
  });

  it("lands the allemande facing the partner in place, dropping hands over the next figure's first beat", () => {
    const allemande = lark[2]!;
    const next = lark[3]!;
    expect(allemande.seamOut).toBe("drop-overlapped");
    expect(allemande.exit[1] - allemande.exit[0]).toBeGreaterThanOrEqual(1);
    expect(next.entry).toEqual([20, 20]);
    const last = lark[4]!;
    expect(last.seamOut).toBe("drop-overlapped");
    expect(lark[5]!.entry).toEqual([36, 36]);
  });

  it("gives the bow all its beats to the body", () => {
    expect(lark[0]!.entry).toEqual([0, 0]);
    expect(lark[0]!.body).toEqual([0, 4]);
    expect(lark[0]!.exit).toEqual([4, 4]);
  });

  it("emits a hold as one shared line in both programs", () => {
    const larkSlot = s.programs.lark?.slots.find((x) => x.beat === 12 - TAKE_BEATS && x.half === 0);
    const robinSlot = s.programs.robin?.slots.find(
      (x) => x.beat === 12 - TAKE_BEATS && x.half === 0,
    );
    const larkHold = larkSlot?.instrs.find((i) => i.op === "hold");
    const robinHold = robinSlot?.instrs.find((i) => i.op === "hold");
    expect(larkHold).toEqual({ op: "hold", hand: "right", with: "robin", hold: "allemande-R" });
    expect(robinHold).toEqual({ op: "hold", hand: "right", with: "lark", hold: "allemande-R" });
  });

  it("chooses the allemande's rate from the beats its body has", () => {
    const allemande = lark[2]!;
    const body = allemande.body[1] - allemande.body[0];
    expect(allemande.rate).toBeCloseTo(1 / body, 9);
    expect(allemande.rate!).toBeLessThanOrEqual(0.25);
  });

  it("writes a note for every decision", () => {
    for (const c of lark) expect(c.notes.length).toBeGreaterThan(0);
  });
});

describe("errors", () => {
  it("reports an allemande once round in two beats as a rate violation", () => {
    const s = run("partner = select(across)\nallemande(partner, right, 1, 2)");
    expect(s.errors.map((e) => e.kind)).toContain("RateTooHigh");
  });
  it("reports a timing violation when entry and exit leave no body", () => {
    const tight: FigureIR = {
      ...FIGURES["do-si-do"]!,
      id: "tight",
      beats: { nominal: 2, min: 2 },
      pre: {
        arrangement: [
          { kind: "facing", who: "self", toward: "partner" },
          { kind: "apart", who: "self", from: "partner", minPx: 60, maxPx: 60 },
        ],
        holds: [],
      },
    };
    const s = run("partner = select(across)\nbow(partner)\ntight(partner)", PAIR, {
      ...FIGURES,
      tight,
    });
    expect(s.errors.map((e) => e.kind)).toContain("TimingViolation");
  });
});

describe("nobody", () => {
  it("stands the solo dancer for forty beats with no holds and no errors", () => {
    const s = run(FIXTURE_PROGRAM, PAIR_SOLO);
    expect(s.errors).toEqual([]);
    const program = s.programs.lark!;
    expect(
      program.slots.every((slot) => slot.instrs.every((i) => i.op !== "hold" && i.op !== "step")),
    ).toBe(true);
    for (let beat = 0; beat < 40; beat++) {
      const slot = program.slots.find((x) => x.beat === beat && x.half === 0);
      expect(
        slot?.instrs.some((i) => i.op === "stand"),
        `beat ${beat}`,
      ).toBe(true);
    }
    for (const c of s.calls.lark ?? []) {
      expect(c.entry[1] - c.entry[0]).toBe(0);
      expect(c.seamIn).toBe("none");
    }
  });

  it("elides a figure whose cast says so and stretches the next call over its beats", () => {
    const shifty: FigureIR = {
      ...FIGURES["do-si-do"]!,
      id: "shifty",
      beats: { nominal: 2, min: 2 },
      casts: { partner: "elide" },
      elide: "stretch",
    };
    const s = run("partner = select(across)\nshifty(partner)\nbow(partner)", PAIR_SOLO, {
      ...FIGURES,
      shifty,
    });
    expect(s.errors).toEqual([]);
    const calls = s.calls.lark ?? [];
    expect(calls.map((c) => c.call.figure.id)).toEqual(["bow"]);
    expect(calls[0]!.call.start).toBe(0);
    expect(calls[0]!.body).toEqual([0, 6]);
  });
});
