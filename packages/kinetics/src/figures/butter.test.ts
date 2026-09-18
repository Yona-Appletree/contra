import type { Source } from "@caller/lang";
import { describe, expect, it } from "vitest";
import { runNamed } from "../dances/load.js";
import type { Dialect } from "../dialect/Dialect.js";
import { execute } from "../executor/execute.js";
import { proveMotion } from "../motion/prove.js";
import type { Schedule } from "../schedule/schedule.js";
import { tempo } from "../units/Tempo.js";

const T = tempo(112);

/** The dancers of the middle minor set, who have everybody they need. */
const MIDDLE = ["1-1L", "1-1R", "1-2L", "1-2R"];

/**
 * One figure on a becket, written as a four-line dance beside the fixtures:
 * the same shape round 1's inline `dance d($minor-set: Group) { … }` had,
 * said in `@caller/lang`. Six couples — three minor sets — so the middle one
 * has no end effects.
 */
const one = (name: string, uses: string, script: string): Source => ({
  name: `${name}.dance`,
  text: `use contra::{Role, Couple, ${uses}};
use becket::{MajorSet, MinorSet};

fn ${name}(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
${script}
}
`,
});

/**
 * The errors that are about the figure under test. A one-figure dance is six
 * or eight beats long, and the couples waiting at the ends of the becket run
 * the formation's `out(length)` for exactly that — a wait-out shorter than
 * its own eight-beat minimum, which the scheduler rightly minds and which
 * says nothing about the figure being looked at.
 */
const figureErrors = (s: Schedule) => s.errors.filter((e) => !e.message.startsWith("wait-out"));

const runFigure = (source: Source): { s: Schedule; dialect: Dialect } => {
  const result = runNamed(source.name.replace(/\.dance$/, ""), {
    args: { "minor-sets": 3 },
    times: 1,
    bpm: 112,
    extra: [source],
  });
  expect(result.errors.filter((e) => e.stage !== "schedule")).toEqual([]);
  return { s: result.schedule as Schedule, dialect: result.dialect as Dialect };
};

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
  expect(figureErrors(s)).toEqual([]);
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
    const { s, dialect } = runFigure(
      one("only-circle", "circle", "  circle(MinorSet, Left, places = 3, beats = 6);"),
    );
    const call = s.calls["1-1L"]![0]!;
    // The take costs the first beat (nothing before it to overlap), so three
    // quarters go round in the five that are left.
    expect(call.rate).toBeCloseTo(0.75 / (call.exit[1] - call.body[0]), 9);
    expect(call.seamIn).toBe("take");
    proveDancers(s, dialect, MIDDLE);
  });

  it("swing: free turns land the couple beside each other facing home, lark on the left", () => {
    const { s } = runFigure(
      one(
        "only-swing",
        "swing, long-lines",
        "  swing(neighbor, beats = 12);\n  long-lines(across = neighbor, beats = 8);",
      ),
    );
    const swingCall = s.calls["1-1L"]![0]!;
    // Twelve beats from across the set: two to come together, two to open
    // out, and a turn and a bit in the eight between.
    const orbitBeats = swingCall.exit[1] - swingCall.body[0];
    expect(swingCall.rate! * orbitBeats).toBeGreaterThanOrEqual(1);
    expect(swingCall.notes.some((n) => n.includes("turns so the exit lands"))).toBe(true);
    // Pinned: opening out from a swing taken across the set to the line is a
    // stride too long in the two beats the spiral has; the entry should bring
    // the couple to the line first.
    expect(figureErrors(s).every((e) => e.kind === "StepTooLong")).toBe(true);
  });

  it("long lines forward and back returns everyone to place", () => {
    const { s, dialect } = runFigure(
      one("only-lines", "long-lines", "  long-lines(across = partner, beats = 8);"),
    );
    const program = s.programs["1-1L"]!;
    const steps = program.slots.flatMap((slot) => slot.instrs.filter((i) => i.op === "step"));
    expect(steps.length).toBeGreaterThan(0);
    proveDancers(s, dialect, MIDDLE);
  });

  it("balance: a rock forward and back with both hands", () => {
    const { s, dialect } = runFigure(
      one("only-balance", "balance", "  balance(partner, beats = 4);"),
    );
    proveDancers(s, dialect, MIDDLE);
  });

  /**
   * The shift, with the progression before it — and the milestone's finding.
   *
   * The cast is right: after the progression the neighbour is a different
   * person, read live from the tree. The **distance** is not: `becket.dance`
   * puts its minor sets 1.6 m apart with every one of them seated, so the
   * commit moves a couple a whole couple-width (40 px) and the shift has two
   * beats to walk it. `StepTooLong` says so, in centimetres, at the call's
   * span. Round 1's becket laid the sets at half that pitch with alternate
   * ones occupied (the kinetics plan's DA9), which is the floor a becket
   * really has; making the language say so is a G1/D9 question.
   */
  it("shift left moves the couple, and says the walk is twice as far as it has beats for", () => {
    const result = runNamed("only-shift", {
      args: { "minor-sets": 3 },
      times: 1,
      bpm: 112,
      extra: [
        one(
          "only-shift",
          "shift, swing",
          "  progress();\n  shift(Left, beats = 2);\n  swing(neighbor, beats = 8);",
        ),
      ],
    });
    const calls = result.sequence!.perDancer["1-1L"]!;
    expect(calls[0]!.figure.id).toBe("shift");
    expect(calls[0]!.cast.partner).toBe("1-1R");
    // After the progression the neighbour is a different dancer from the one
    // the same word named before it.
    const before = runNamed("only-swing-first", {
      args: { "minor-sets": 3 },
      times: 1,
      bpm: 112,
      extra: [one("only-swing-first", "swing", "  swing(neighbor, beats = 8);")],
    });
    const beforeId = before.sequence!.perDancer["1-1L"]![0]!.cast.partner;
    expect(beforeId).toBe("1-2R");
    expect(calls[1]!.cast.partner).not.toBe(beforeId);
    expect(calls[1]!.bindings["with"]).toBe(calls[1]!.cast.partner);

    const tooLong = result.errors.filter((e) => e.kind === "StepTooLong");
    expect(tooLong.map((e) => e.message).join("\n")).toContain(
      "shift walks 160 cm to its seat in 2 beats",
    );
  });
});

describe("Butter's A1", () => {
  it("shift, circle, swing for the middle four: the seams pinned", () => {
    const { s, dialect } = runFigure(
      one(
        "butter-a1",
        "shift, circle, swing, long-lines",
        [
          "  shift(Left, beats = 2);",
          "  circle(MinorSet, Left, places = 3, beats = 6);",
          "  swing(neighbor, beats = 8);",
          "  long-lines(across = partner, beats = 8);",
        ].join("\n"),
      ),
    );
    // With no `progress()` before it the shift walks nowhere, so A1 schedules
    // as round 1's did: this is the phrase, not the progression.
    proveDancers(s, dialect, MIDDLE);
  });
});
