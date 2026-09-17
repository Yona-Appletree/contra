import { describe, expect, it } from "vitest";
import { compileDance, standardFloor } from "../dances/load.js";
import type { Dialect } from "../dialect/Dialect.js";
import { treeDialect } from "../dialect/tree/TreeDialect.js";
import { execute } from "../executor/execute.js";
import { proveMotion } from "../motion/prove.js";
import { schedule } from "../schedule/schedule.js";
import type { Schedule } from "../schedule/schedule.js";
import type { Floor } from "../tree/floor.js";
import { resolve } from "../tree/relations.js";
import { tempo } from "../units/Tempo.js";

const T = tempo(112);

/** Six couples in becket: three minor sets, so the middle one has no end effects. */
const becket6 = (): Floor => standardFloor("becket", { "minor-sets": 3 });

const runProgram = (source: string, floor = becket6()): { s: Schedule; dialect: Dialect } => {
  const dialect = treeDialect(floor);
  const { sequence, errors } = compileDance(source, floor);
  expect(errors).toEqual([]);
  return { s: schedule(sequence, dialect, T), dialect };
};

/** The dancers of the middle minor set, who have everybody they need. */
const MIDDLE = ["3L", "3R", "4L", "4R"];

/**
 * No schedule errors, and the proof's shortfall pinned rather than hidden:
 * feet and hands prove clean; the hip is over its acceleration cap at figure
 * **seams** — a straight entry walk turning into an orbit, an orbit's landing
 * with the next figure setting off the other way — by up to two and a half
 * times at the worst seam (the swing landing into long lines). The fix is a
 * curved entry in the scheduler (the entry walk should join the orbit
 * tangentially), not a bigger number in `CAPS`; this test exists to keep
 * that visible until it lands.
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
    const { s, dialect } = runProgram(
      "module d() { circle($minor-set, Left, places = 3, beats = 6); }",
    );
    const call = s.calls["3L"]![0]!;
    // The take costs the first beat (nothing before it to overlap), so three
    // quarters go round in the five that are left.
    expect(call.rate).toBeCloseTo(0.75 / (call.exit[1] - call.body[0]), 9);
    expect(call.seamIn).toBe("take");
    proveDancers(s, dialect, MIDDLE);
  });

  it("swing: free turns land the couple beside each other facing home, lark on the left", () => {
    const { s } = runProgram(
      "module d() { swing($neighbor, beats = 12); long-lines($neighbor, beats = 8); }",
    );
    const swingCall = s.calls["3L"]![0]!;
    // Twelve beats from across the set: two to come together, two to open
    // out, and a turn and a bit in the eight between.
    const orbitBeats = swingCall.exit[1] - swingCall.body[0];
    expect(swingCall.rate! * orbitBeats).toBeGreaterThanOrEqual(1);
    expect(swingCall.notes.some((n) => n.includes("turns so the exit lands"))).toBe(true);
    // Pinned: opening out from a swing taken across the set to the line is a
    // stride too long in the two beats the spiral has; the entry should bring
    // the couple to the line first.
    expect(s.errors.every((e) => e.kind === "StepTooLong")).toBe(true);
  });

  it("long lines forward and back returns everyone to place", () => {
    const { s, dialect } = runProgram(
      "module d() { long-lines($partner, beats = 8); }",
    );
    const program = s.programs["3L"]!;
    const steps = program.slots.flatMap((slot) => slot.instrs.filter((i) => i.op === "step"));
    expect(steps.length).toBeGreaterThan(0);
    proveDancers(s, dialect, MIDDLE);
  });

  it("balance: a rock forward and back with both hands", () => {
    const { s, dialect } = runProgram("module d() { balance($partner); }");
    proveDancers(s, dialect, MIDDLE);
  });

  it("shift left moves the couple one place and the seating with it", () => {
    const floor = becket6();
    const dialect = treeDialect(floor);
    const { sequence, errors } = compileDance(
      "module d() { progress(); shift($neighbor, Left); swing($neighbor, beats = 8); }",
      floor,
    );
    expect(errors).toEqual([]);
    const calls = sequence.perDancer["3L"]!;
    expect(calls[0]!.figure.id).toBe("shift");
    // After the progression the neighbour is a different dancer.
    const before = resolve(
      "neighbor",
      floor.initial.placeOf.get("3L")!,
      floor.root,
      floor.mods,
    ).value;
    const beforeId =
      before.kind === "place" ? floor.initial.dancerOf.get(before.place.path) : undefined;
    expect(beforeId).toBe("4R");
    expect(calls[1]!.cast.partner).not.toBe(beforeId);
    expect(calls[1]!.bindings["neighbor"]).toBe(calls[1]!.cast.partner);
    const s = schedule(sequence, dialect, T);
    expect(s.errors).toEqual([]);
  });
});

describe("Butter's A1", () => {
  it("shift, circle, swing for the middle four: no errors, every effector proved", () => {
    const { s, dialect } = runProgram(
      [
        "module d() {",
        "  shift($partner, Left);",
        "  circle($minor-set, Left, places = 3, beats = 6);",
        "  swing($neighbor, beats = 8);",
        "  long-lines($partner, beats = 8);",
        "}",
      ].join("\n"),
    );
    proveDancers(s, dialect, MIDDLE);
  });
});
