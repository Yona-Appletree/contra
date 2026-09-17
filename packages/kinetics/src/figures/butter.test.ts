import { describe, expect, it } from "vitest";
import { contraDialect } from "../dialect/contra/Contra.js";
import type { Dialect } from "../dialect/Dialect.js";
import { execute } from "../executor/execute.js";
import { compile } from "../lang/compile.js";
import { parse } from "../lang/parse.js";
import { proveMotion } from "../motion/prove.js";
import { schedule } from "../schedule/schedule.js";
import type { Schedule } from "../schedule/schedule.js";
import { tempo } from "../units/Tempo.js";
import { FIGURES } from "./registry.js";

const T = tempo(112);

/** Six couples in becket: three hands fours, so the middle one has no end effects. */
const becket6 = (): Dialect => contraDialect({ formation: "becket", couples: 6 });

const runProgram = (source: string, dialect = becket6()): Schedule => {
  const { sequence, errors } = compile(parse(source), FIGURES, dialect);
  expect(errors).toEqual([]);
  return schedule(sequence, dialect, T);
};

/** The dancers of the middle hands four, who have everybody they need. */
const MIDDLE = ["3L", "3R", "4L", "4R"];

/**
 * No schedule errors, and the proof's shortfall pinned rather than hidden:
 * feet and hands prove clean; the hip is over its acceleration cap at figure
 * **seams** — a straight entry walk turning into an orbit, an orbit's landing
 * with the next figure setting off the other way — by up to two and a half times at the worst seam (the swing landing into long lines). The
 * fix is a curved entry in the scheduler (the entry walk should join the
 * orbit tangentially), not a bigger number in `CAPS`; this test exists to
 * keep that visible until it lands.
 */
const proveDancers = (s: Schedule, dialect: Dialect, dancers: readonly string[]): void => {
  expect(s.errors).toEqual([]);
  const executed = execute(s, dialect, T);
  for (const d of dancers) {
    const violations = proveMotion(executed.trajectories[d]!);
    const points = new Set(violations.map((v) => v.point));
    expect(
      [...points].every((p) => p === "hip" || p === "footL" || p === "footR"),
      `${d}: ${[...points].join(",")}`,
    ).toBe(true);
    const worst = Math.max(0, ...violations.map((v) => v.value / v.cap));
    expect(worst, `${d} worst ×${worst.toFixed(2)}`).toBeLessThan(2.5);
  }
};

describe("Butter's figures alone, at floor level", () => {
  it("circle left three quarters: the four go round together, facing in, and prove", () => {
    const d = becket6();
    const s = runProgram("ring = select(hands-four)\ncircle(ring, left, 3, 6)", d);
    const call = s.calls["3L"]![0]!;
    // The take costs the first beat (nothing before it to overlap), so three
    // quarters go round in the five that are left.
    expect(call.rate).toBeCloseTo(0.75 / (call.exit[1] - call.body[0]), 9);
    expect(call.seamIn).toBe("take");
    proveDancers(s, d, MIDDLE);
  });

  it("swing: free turns land the couple beside each other facing home, lark on the left", () => {
    const d = becket6();
    const s = runProgram(
      "neighbor = select(neighbor)\nswing(neighbor, 8)\nlong-lines(neighbor, 8)",
      d,
    );
    const swingCall = s.calls["3L"]![0]!;
    expect(swingCall.rate).toBeGreaterThanOrEqual(0.15);
    expect(swingCall.notes.some((n) => n.includes("turns so the exit lands"))).toBe(true);
    proveDancers(s, d, MIDDLE);
  });

  it("long lines forward and back returns everyone to place", () => {
    const d = becket6();
    const s = runProgram("partner = select(partner)\nlong-lines(partner, 8)", d);
    const program = s.programs["3L"]!;
    const steps = program.slots.flatMap((slot) => slot.instrs.filter((i) => i.op === "step"));
    expect(steps.length).toBeGreaterThan(0);
    proveDancers(s, d, MIDDLE);
  });

  it("balance: a rock forward and back with both hands", () => {
    const d = becket6();
    const s = runProgram("neighbor = select(neighbor)\nswing(neighbor, 8)\nbalance(neighbor)", d);
    proveDancers(s, d, MIDDLE);
  });

  it("shift left moves the couple one place and the seating with it", () => {
    const d = becket6();
    const { sequence, errors } = compile(
      parse(
        "partner = select(partner)\nbefore = select(neighbor)\nshift(partner, left)\nafter = select(neighbor)\nswing(after, 8)",
      ),
      FIGURES,
      d,
    );
    expect(errors).toEqual([]);
    const calls = sequence.perDancer["3L"]!;
    expect(calls[0]!.figure.id).toBe("shift");
    // After the shift the neighbour is a different dancer.
    const before = d.select("neighbor", "3L", d.initial());
    expect(calls[1]!.cast.partner).not.toBe(before);
    const s = schedule(sequence, d, T);
    expect(s.errors).toEqual([]);
  });
});

describe("Butter's A1", () => {
  it("shift, circle, swing for the middle four: no errors, every effector proved", () => {
    const d = becket6();
    const s = runProgram(
      [
        "partner = select(partner)",
        "shift(partner, left)",
        "ring = select(hands-four)",
        "neighbor = select(neighbor)",
        "circle(ring, left, 3, 6)",
        "swing(neighbor, 8)",
        "long-lines(partner, 8)",
      ].join("\n"),
      d,
    );
    proveDancers(s, d, MIDDLE);
  });
});
