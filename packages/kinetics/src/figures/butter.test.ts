import { angleDiff, dist, rightOf } from "@caller/core";
import type { Vec2 } from "@caller/core";
import type { Source } from "@caller/lang";
import { describe, expect, it } from "vitest";
import { runNamed } from "../dances/load.js";
import type { DancerId, Dialect } from "../dialect/Dialect.js";
import { execute } from "../executor/execute.js";
import { CLEARANCE_PX } from "../motion/clearance.js";
import { proveMotion } from "../motion/prove.js";
import { sampleAt } from "../motion/Trajectory.js";
import type { Run } from "../pipeline.js";
import type { Schedule } from "../schedule/schedule.js";
import { tempo } from "../units/Tempo.js";
import { TAKE_BEATS } from "../units/limits.js";

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
const proveDancers = (
  s: Schedule,
  dialect: Dialect,
  dancers: readonly string[],
  allowed: readonly string[] = ["hip", "footL", "footR"],
  maxRatio = 2.5,
): void => {
  expect(figureErrors(s)).toEqual([]);
  const executed = execute(s, dialect, T);
  for (const d of dancers) {
    const violations = proveMotion(executed.trajectories[d]!);
    const points = new Set(violations.map((v) => v.point));
    expect(
      [...points].every((p) => allowed.includes(p)),
      `${d}: ${[...points].join(",")}`,
    ).toBe(true);
    const worst = Math.max(0, ...violations.map((v) => v.value / v.cap));
    expect(worst, `${d} worst ×${worst.toFixed(2)}`).toBeLessThan(maxRatio);
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

// ---------------------------------------------------------------------------
// The chain and the hey (M2)
// ---------------------------------------------------------------------------

const runWhole = (source: Source): Run => {
  const result = runNamed(source.name.replace(/\.dance$/, ""), {
    args: { "minor-sets": 3 },
    times: 1,
    bpm: 112,
    extra: [source],
  });
  expect(result.errors.filter((e) => e.stage !== "schedule")).toEqual([]);
  expect(figureErrors(result.schedule as Schedule)).toEqual([]);
  return result;
};

/** Hip position and facing of `id` at `beat`, from the executed motion. */
const hipAt = (run: Run, id: DancerId, beat: number): { p: Vec2; facing: number } => {
  const t = run.executed!.trajectories[id]!;
  const i = sampleAt(t, beat);
  const p = t.points.hip![i]!;
  return { p: [p.x, p.y], facing: t.channels.facing![i]! };
};

/** The closest the two come between `from` and `to`, and the beat. */
const closest = (
  run: Run,
  a: DancerId,
  b: DancerId,
  from: number,
  to: number,
): { min: number; beat: number } => {
  const ta = run.executed!.trajectories[a]!;
  const tb = run.executed!.trajectories[b]!;
  let min = Infinity;
  let beat = from;
  for (let i = sampleAt(ta, from); i <= sampleAt(ta, to); i++) {
    const pa = ta.points.hip![i]!;
    const pb = tb.points.hip![i]!;
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (d < min) {
      min = d;
      beat = i / ta.tempo.samplesPerBeat;
    }
  }
  return { min, beat };
};

/**
 * The sign test from the old library's chain (`passRight`): the other is
 * on `me`'s right when the vector to them has a positive component along
 * `rightOf(facing)` — the engine's px frame, y down, right is facing + 90°.
 */
const onRightOf = (run: Run, me: DancerId, other: DancerId, beat: number): boolean => {
  const a = hipAt(run, me, beat);
  const b = hipAt(run, other, beat);
  const r = rightOf(a.facing);
  return (b.p[0] - a.p[0]) * r[0] + (b.p[1] - a.p[1]) * r[1] > 0;
};

/** Every stretch two of `dancers` came closer than a body's clearance. */
const clearanceAmong = (run: Run, dancers: readonly DancerId[]) =>
  (run.clearance ?? []).filter((c) => dancers.includes(c.dancer) && dancers.includes(c.with));

/**
 * The proof over `[from, to)` for `dancers`: the hands must be clean; the
 * hip and the feet are pinned at the worst ratio measured, never hidden.
 */
const worstOver = (
  run: Run,
  dancers: readonly DancerId[],
  from: number,
  to: number,
): Record<"hip" | "feet" | "hands", number> => {
  const worst = { hip: 0, feet: 0, hands: 0 };
  for (const d of dancers) {
    for (const v of proveMotion(run.executed!.trajectories[d]!)) {
      if (v.beat < from || v.beat >= to) continue;
      const ratio = v.value / v.cap;
      const key = v.point === "hip" ? "hip" : v.point.startsWith("foot") ? "feet" : "hands";
      worst[key] = Math.max(worst[key], ratio);
    }
  }
  return worst;
};

/** The four places of the middle set, from the dialect. */
const placesOf = (run: Run): Vec2[] => MIDDLE.map((id) => run.dialect!.initial().dancers[id]!.p);

const nearAPlace = (p: Vec2, places: readonly Vec2[], withinPx: number): number | undefined => {
  const i = places.findIndex((q) => dist(p, q) <= withinPx);
  return i < 0 ? undefined : i;
};

describe("the chain, on the middle set", () => {
  // Butter's own order: the chain flows into the hey, which is what keeps
  // the courtesy turn from having to stop dead (a full turn in four beats
  // has no beat to ramp down in).
  const run = runWhole(
    one(
      "only-chain",
      "chain, hey",
      [
        "  chain(Robin, to = neighbor, beats = 8);",
        "  hey(MinorSet, start = Robin, shoulder = Right, beats = 16);",
      ].join("\n"),
    ),
  );
  const robins = ["1-1R", "1-2R"] as const;

  it("pulls by right shoulders in the middle, clear of each other, and is across by beat 4", () => {
    expect(clearanceAmong(run, MIDDLE)).toEqual([]);
    const pass = closest(run, "1-1R", "1-2R", 0, 4);
    // Measured 8.82 px at beat 2.13 with the pass offset at 4.5 px (4.25,
    // the old library's, gave 8.08 once the executor's spline had rounded
    // the corner: the clearance check is what said so).
    expect(pass.min).toBeGreaterThanOrEqual(CLEARANCE_PX);
    expect(pass.beat).toBeGreaterThan(1.5);
    expect(pass.beat).toBeLessThan(2.5);
    expect(onRightOf(run, "1-1R", "1-2R", pass.beat)).toBe(true);
    expect(onRightOf(run, "1-2R", "1-1R", pass.beat)).toBe(true);
    // By beat 4 each robin is on the far line, seventeen px to her lark's
    // right, facing the way he faces; he has stepped three px to his right.
    const r = hipAt(run, "1-2R", 4);
    const l = hipAt(run, "1-1L", 4);
    expect(dist(r.p, [16, 33])).toBeLessThan(0.5);
    expect(dist(l.p, [16, 47])).toBeLessThan(0.5);
    expect(Math.abs(angleDiff(r.facing, 180))).toBeLessThan(5);
    expect(Math.abs(angleDiff(l.facing, 180))).toBeLessThan(5);
  });

  it("courtesy turns over four beats: out together half way, home in the line facing across", () => {
    // Half way round the couple faces directly out of the set (F10).
    const r6 = hipAt(run, "1-2R", 6);
    const l6 = hipAt(run, "1-1L", 6);
    expect(Math.abs(angleDiff(r6.facing, 0))).toBeLessThan(5);
    expect(Math.abs(angleDiff(l6.facing, 0))).toBeLessThan(5);
    // And at the end the couple is on the two places, facing across, the
    // robin on the lark's right — the whole effect of a chain.
    const r8 = hipAt(run, "1-2R", 8);
    const l8 = hipAt(run, "1-1L", 8);
    expect(dist(r8.p, [16, 30])).toBeLessThan(0.5);
    expect(dist(l8.p, [16, 50])).toBeLessThan(0.5);
    expect(Math.abs(angleDiff(r8.facing, 180))).toBeLessThan(5);
    expect(Math.abs(angleDiff(l8.facing, 180))).toBeLessThan(5);
    expect(onRightOf(run, "1-1L", "1-2R", 8)).toBe(true);
    // The hey needs no entry: the chain leaves everyone where it starts.
    for (const id of MIDDLE) {
      const hey = run.schedule!.calls[id]!.find((c) => c.call.figure.id === "hey")!;
      expect(hey.entry[1] - hey.entry[0]).toBe(0);
    }
  });

  it("takes the courtesy hold as the pull-by ends, left hands, the robin's on top", () => {
    const slots = run.schedule!.programs["1-2R"]!.slots;
    const take = slots.find((s) =>
      s.instrs.some((i) => i.op === "hold" && i.hold === "courtesy" && i.hand === "left"),
    );
    expect(take?.beat).toBe(4 - TAKE_BEATS);
    const hands = run.solved!.hands;
    const t = run.executed!.trajectories["1-2R"]!;
    const i = sampleAt(t, 6);
    const robin = hands["1-2R"]!.left[i]!;
    const lark = hands["1-1L"]!.left[i]!;
    expect(robin.contact).toBe("stacked");
    expect(robin.onTop).toBe(true);
    expect(lark.onTop).toBe(false);
    // One shared point.
    expect(
      Math.hypot(robin.p.x - lark.p.x, robin.p.y - lark.p.y, robin.p.z - lark.p.z),
    ).toBeLessThan(1e-6);
  });

  it("proves: hands clean, the hip and the feet pinned", () => {
    const worst = worstOver(run, MIDDLE, 0, 8);
    expect(worst.hands).toBe(0);
    // Measured 2026-09-18: the hip's worst is the courtesy turn — a quarter
    // turn a beat at seven px is four chord points a turn for the executor's
    // spline, the same seam the swing pins (its test allows 2.5×). The feet
    // are over on the pull-by's arrival footfall, where the robin reverses
    // over two beats.
    expect(worst.hip, `hip ×${worst.hip.toFixed(2)}`).toBeLessThan(2.5);
    expect(worst.feet, `feet ×${worst.feet.toFixed(2)}`).toBeLessThan(1.5);
  });

  it("drifts, by the language's seating: a robin who chained across stands on the other line's seat", () => {
    const drift = run.warnings.filter((w) => w.kind === "Drift" && w.message.startsWith("chain"));
    // Every robin, and only the robins: 37.7 px is a place along and a set
    // across, the seat the text still gives her. Nothing in the language
    // reseats after a chain; a G1 question beside the swing's.
    expect(drift.map((w) => w.dancer).sort()).toEqual(
      ["0-1R", "0-2R", "1-1R", "1-2R", "2-1R", "2-2R"].sort(),
    );
    expect(drift.every((w) => /ends 3\d\.\d px from the seat/.test(w.message))).toBe(true);
    void robins;
  });
});

describe("the hey, on the middle set", () => {
  const run = runWhole(
    one("only-hey", "hey", "  hey(MinorSet, start = Robin, shoulder = Right, beats = 16);"),
  );

  it("meets seven times at the beats: robins in the middle on 2, larks on 6, sides on 4, 8, 12", () => {
    expect(clearanceAmong(run, MIDDLE)).toEqual([]);
    const middle = (a: DancerId, b: DancerId, beat: number): void => {
      const pa = hipAt(run, a, beat);
      const pb = hipAt(run, b, beat);
      expect(Math.abs(pa.p[0]), `${a} at ${String(beat)}`).toBeLessThan(0.6);
      expect(Math.abs(pb.p[0]), `${b} at ${String(beat)}`).toBeLessThan(0.6);
      const apart = dist(pa.p, pb.p);
      expect(apart).toBeGreaterThanOrEqual(CLEARANCE_PX);
      expect(apart).toBeLessThan(11);
      // Right shoulders: each has the other on their right.
      expect(onRightOf(run, a, b, beat)).toBe(true);
      expect(onRightOf(run, b, a, beat)).toBe(true);
    };
    middle("1-1R", "1-2R", 2);
    middle("1-1L", "1-2L", 6);
    middle("1-1R", "1-2R", 10);
    middle("1-1L", "1-2L", 14);
    // At the sides everybody is on one of the four places, all four taken.
    const places = placesOf(run);
    for (const beat of [4, 8, 12, 16]) {
      const taken = MIDDLE.map((id) => nearAPlace(hipAt(run, id, beat).p, places, 1));
      expect(taken, `beat ${String(beat)}: ${taken.join(",")}`).not.toContain(undefined);
      expect(new Set(taken).size).toBe(4);
    }
  });

  it("keeps everybody a body's clearance apart, and brings everybody home on 16", () => {
    for (let a = 0; a < MIDDLE.length; a++) {
      for (let b = a + 1; b < MIDDLE.length; b++) {
        const { min } = closest(run, MIDDLE[a]!, MIDDLE[b]!, 0, 16);
        expect(min, `${MIDDLE[a]!}/${MIDDLE[b]!}`).toBeGreaterThanOrEqual(CLEARANCE_PX);
      }
    }
    const homes = run.dialect!.initial().dancers;
    for (const id of MIDDLE) {
      expect(dist(hipAt(run, id, 16).p, homes[id]!.p), id).toBeLessThan(1);
    }
    // The larks arrive home from their second crossing, so they face out of
    // it; the robins from their loop, so they face across. The next figure's
    // entry turns them (Butter's balance costs one beat for it).
    expect(Math.abs(angleDiff(hipAt(run, "1-1R", 16).facing, 180))).toBeLessThan(25);
  });

  it("proves: hands clean, the hip and the feet pinned", () => {
    const worst = worstOver(run, MIDDLE, 0, 16);
    expect(worst.hands).toBe(0);
    // Measured 2026-09-18: hip ×2.32 at the first and the last step — a
    // path has no cruise ramp, so from rest the first step is a whole one
    // and the last stops dead; the meetings stay on their beats. The feet
    // ×1.41 on the left foot's arrival footfall at the end of a crossing.
    expect(worst.hip, `hip ×${worst.hip.toFixed(2)}`).toBeLessThan(2.5);
    expect(worst.feet, `feet ×${worst.feet.toFixed(2)}`).toBeLessThan(1.5);
  });

  it("by the left is the same track with every pass by the other shoulder", () => {
    const left = runWhole(
      one("only-hey-left", "hey", "  hey(MinorSet, start = Robin, shoulder = Left, beats = 16);"),
    );
    expect(clearanceAmong(left, MIDDLE)).toEqual([]);
    const pa = hipAt(left, "1-1R", 2);
    const pb = hipAt(left, "1-2R", 2);
    expect(dist(pa.p, pb.p)).toBeGreaterThanOrEqual(CLEARANCE_PX);
    expect(onRightOf(left, "1-1R", "1-2R", 2)).toBe(false);
    expect(onRightOf(left, "1-2R", "1-1R", 2)).toBe(false);
    const homes = left.dialect!.initial().dancers;
    for (const id of MIDDLE) expect(dist(hipAt(left, id, 16).p, homes[id]!.p), id).toBeLessThan(1);
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
    // as round 1's did: this is the phrase, not the progression. Since M3 the
    // neighbour swing ends the robin on the lark's **right** (his partner's
    // seat), and long lines' placeholder `line` hold — always the left hand
    // — reaches across him to her: the hands are over their cap at that
    // take, and the swing's landing on its own post is the hip's worst
    // seam. Both pinned here; the hold's hand is the holds gallery's.
    proveDancers(s, dialect, MIDDLE, ["hip", "footL", "footR", "handL", "handR"], 6.5);
  });
});
