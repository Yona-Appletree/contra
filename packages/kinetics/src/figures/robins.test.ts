import { angleDiff, dist, rightOf } from "@caller/core";
import type { Vec2 } from "@caller/core";
import type { Source } from "@caller/lang";
import { describe, expect, it } from "vitest";
import { runNamed } from "../dances/load.js";
import type { DancerId } from "../dialect/Dialect.js";
import { CLEARANCE_PX } from "../motion/clearance.js";
import { proveMotion } from "../motion/prove.js";
import { sampleAt } from "../motion/Trajectory.js";
import type { Run } from "../pipeline.js";
import type { Schedule } from "../schedule/schedule.js";
import { WAVE_FORWARD_PX } from "./formWave.js";

/**
 * Robins on a Wire's figures alone, on the middle set of three (the M2
 * pattern, `butter.test.ts`): a four-line dance beside the fixtures, the
 * figure under test, and the executed motion read at the beats that matter.
 * Numbers measured 2026-09-18 at 112 bpm; a bound that is not clean is
 * pinned with the where and the why, never hidden.
 */
const MIDDLE = ["3-1L", "3-1R", "3-2L", "3-2R"];
const ROBINS = ["1-1R", "1-2R", "3-1R", "3-2R", "5-1R", "5-2R"];

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

/** The errors about the figure under test: the ends' short `wait-out` says nothing about it. */
const figureErrors = (s: Schedule) => s.errors.filter((e) => !e.message.startsWith("wait-out"));

const runWhole = (source: Source, sets = 3): Run => {
  const result = runNamed(source.name.replace(/\.dance$/, ""), {
    args: { "minor-sets": sets },
    times: 1,
    bpm: 112,
    extra: [source],
  });
  expect(result.errors.filter((e) => e.stage !== "schedule")).toEqual([]);
  return result;
};

const hipAt = (run: Run, id: DancerId, beat: number): { p: Vec2; facing: number } => {
  const t = run.executed!.trajectories[id]!;
  const i = sampleAt(t, beat);
  const p = t.points.hip![i]!;
  return { p: [p.x, p.y], facing: t.channels.facing![i]! };
};

const handAt = (run: Run, id: DancerId, hand: "right" | "left", beat: number) => {
  const t = run.executed!.trajectories[id]!;
  return run.solved!.hands[id]![hand][sampleAt(t, beat)]!;
};

const apart3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Is `other` on `me`'s right at `beat`, in the engine's frame (right = facing + 90°)? */
const onRightOf = (run: Run, me: DancerId, other: DancerId, beat: number): boolean => {
  const a = hipAt(run, me, beat);
  const b = hipAt(run, other, beat);
  const r = rightOf(a.facing);
  return (b.p[0] - a.p[0]) * r[0] + (b.p[1] - a.p[1]) * r[1] > 0;
};

const closest = (run: Run, a: DancerId, b: DancerId, from: number, to: number): number => {
  const ta = run.executed!.trajectories[a]!;
  const tb = run.executed!.trajectories[b]!;
  let min = Infinity;
  for (let i = sampleAt(ta, from); i <= sampleAt(ta, to); i++) {
    const pa = ta.points.hip![i]!;
    const pb = tb.points.hip![i]!;
    min = Math.min(min, Math.hypot(pa.x - pb.x, pa.y - pb.y));
  }
  return min;
};

const worstOver = (run: Run, dancers: readonly DancerId[], from: number, to: number) => {
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

// ---------------------------------------------------------------------------
// A1: the chain, the mad robin, the robins into the wave; the balance
// ---------------------------------------------------------------------------

describe("the mad robin and the long wave, on the middle set", () => {
  // The dance's own A1 and the balance: the chain puts each robin on her
  // neighbour lark's right, the mad robin goes round him, the robins step
  // forward into the wave and balance it, the larks stand.
  const run = runWhole(
    one(
      "only-a1",
      "chain, mad-robin, form-wave, balance-wave, stand",
      [
        "  chain(Robin, to = neighbor, beats = 8);",
        "  mad-robin(neighbor, Right, beats = 6);",
        "  if (Role is Robin) { form-wave(right = wave-mate, left = opposite, beats = 2); }",
        "  else { stand(beats = 2); }",
        "  if (Role is Robin) { balance-wave(right = wave-mate, left = opposite, beats = 4); }",
        "  else { stand(beats = 4); }",
      ].join("\n"),
    ),
  );

  it("schedules with no complaint, and nobody through anybody", () => {
    expect(figureErrors(run.schedule as Schedule)).toEqual([]);
    expect((run.clearance ?? []).filter((c) => c.beat < 20)).toEqual([]);
  });

  it("mad robin: the pair goes round each other and comes home, facing across throughout", () => {
    // After the chain the ones' lark of the middle set has the twos' robin
    // beside him on his right; the two orbit and are back on 14.
    const l8 = hipAt(run, "3-1L", 8);
    const r8 = hipAt(run, "3-2R", 8);
    expect(onRightOf(run, "3-1L", "3-2R", 8)).toBe(true);
    expect(dist(l8.p, r8.p)).toBeCloseTo(20, 0);
    for (const [id, home] of [
      ["3-1L", l8],
      ["3-2R", r8],
    ] as const) {
      const end = hipAt(run, id, 14);
      expect(dist(end.p, home.p), id).toBeLessThan(0.5);
      // The facing is kept: never more than five degrees off across, at any
      // beat of the six — that is the whole figure.
      for (let beat = 8; beat <= 14; beat += 0.5)
        expect(
          Math.abs(angleDiff(hipAt(run, id, beat).facing, home.facing)),
          `${id} at ${String(beat)}`,
        ).toBeLessThan(5);
    }
    // Half way round each is on the other's place, having passed on the
    // far side of the line: at the quarter the lark is a place in from it.
    expect(closest(run, "3-1L", "3-2R", 8, 14)).toBeGreaterThanOrEqual(CLEARANCE_PX);
    const quarter = hipAt(run, "3-1L", 9.5);
    expect(Math.abs(quarter.p[0] - l8.p[0])).toBeGreaterThan(6);
  });

  it("form-wave: every robin on the centre line at her own place along it, facing as she was", () => {
    for (const id of ROBINS) {
      const before = hipAt(run, id, 14);
      const at = hipAt(run, id, 16);
      expect(Math.abs(at.p[0]), id).toBeLessThan(0.5);
      expect(Math.abs(at.p[1] - before.p[1]), id).toBeLessThan(0.5);
      expect(Math.abs(angleDiff(at.facing, before.facing)), id).toBeLessThan(5);
      expect(Math.abs(Math.abs(before.p[0]) - WAVE_FORWARD_PX)).toBeLessThan(0.5);
    }
  });

  it("the wave's hands: one shared point per pair, alternating, 0.8 m apart down the hall", () => {
    // The middle set's ones' robin holds right hands with the set below's
    // twos' robin (her far mate) and left hands with her own set's other
    // robin; the far side of the line is the same hand for both.
    const pairs: [DancerId, "right" | "left", DancerId, "right" | "left"][] = [
      ["3-1R", "right", "5-2R", "right"],
      ["3-1R", "left", "3-2R", "left"],
      ["3-2R", "right", "1-1R", "right"],
    ];
    for (const [a, ha, b, hb] of pairs) {
      const pa = handAt(run, a, ha, 16);
      const pb = handAt(run, b, hb, 16);
      expect(pa.contact, `${a} ${ha}`).toBe("palm");
      expect(pb.contact, `${b} ${hb}`).toBe("palm");
      expect(apart3(pa.p, pb.p), `${a}/${b}`).toBeLessThan(1e-6);
      // The hand is midway between the two, who stand a place apart.
      expect(dist(hipAt(run, a, 16).p, hipAt(run, b, 16).p)).toBeCloseTo(20, 0);
      expect(onRightOf(run, a, b, 16)).toBe(ha === "right");
    }
  });

  it("the wave's ends: the top and bottom robins balance with one hand free", () => {
    // The top set's twos' robin has nobody above her, the bottom set's ones'
    // robin nobody below: the far hand hangs, the near hand is held.
    for (const [id, free, held] of [
      ["1-2R", "right", "left"],
      ["5-1R", "right", "left"],
    ] as const) {
      for (const beat of [16, 18]) {
        expect(handAt(run, id, free, beat).contact, `${id} ${free} at ${String(beat)}`).toBe(
          "free",
        );
        expect(handAt(run, id, held, beat).contact, `${id} ${held} at ${String(beat)}`).toBe(
          "palm",
        );
      }
    }
    // The compile said nothing about it: nobody is a legitimate far mate.
    expect(run.errors.filter((e) => e.stage === "compile")).toEqual([]);
  });

  it("balance-wave: forward on 1 and back on 3 along the facing, the line never crossed", () => {
    const at16 = hipAt(run, "3-1R", 16);
    const at17 = hipAt(run, "3-1R", 17);
    const at19 = hipAt(run, "3-1R", 19);
    expect(Math.abs(at17.p[0] - at16.p[0])).toBeCloseTo(3, 0);
    expect(Math.abs(at19.p[0] - at16.p[0])).toBeLessThan(0.5);
    // Two neighbours in the wave face opposite ways and rock apart, never
    // through each other: still a place apart along the line.
    expect(dist(hipAt(run, "3-1R", 17).p, hipAt(run, "3-2R", 17).p)).toBeGreaterThan(19);
  });

  it("proves: the hip and the feet pinned; the wave's hands pinned at the take", () => {
    const worst = worstOver(run, ROBINS, 8, 20);
    // Measured 2026-09-18: the hip's worst is the mad robin's landing into
    // the wave's walk (a fixed-facing orbit ends sideways and the walk sets
    // off forward — the same seam every orbit pins); the feet as the chain's.
    expect(worst.hip, `hip ×${worst.hip.toFixed(2)}`).toBeLessThan(3.5);
    expect(worst.feet, `feet ×${worst.feet.toFixed(2)}`).toBeLessThan(1.5);
    // The hands: the wave take lifts a hanging hand to a point four px from
    // the shoulder — the arm folds nearly double, through vertical, and the
    // executor's reach and the solver's elbow both say so (K302 ×1.11, K303
    // elbow ×25 at beat 14.9). The posture is a placeholder for the holds
    // gallery; the number is written here rather than the posture tuned.
    expect(worst.hands, `hands ×${worst.hands.toFixed(2)}`).toBeLessThan(1.5);
  });
});

// ---------------------------------------------------------------------------
// B1's promenade and B2's shoulder round
// ---------------------------------------------------------------------------

describe("the single-file promenade, on the middle set", () => {
  const run = runWhole(
    one(
      "only-promenade",
      "single-file-promenade",
      "  single-file-promenade(MinorSet, Left, eighths = 5, beats = 4);",
    ),
  );

  it("takes the four round the set clockwise, each facing the way they go — as far as four beats allow", () => {
    const centre: Vec2 = [0, 40];
    const bearingOf = (p: Vec2): number =>
      Math.atan2(p[1] - centre[1], p[0] - centre[0]) * (180 / Math.PI);
    for (const id of MIDDLE) {
      const a = hipAt(run, id, 0);
      const z = hipAt(run, id, 4);
      const turned = angleDiff(bearingOf(a.p), bearingOf(z.p));
      // Clockwise on the screen is a positive bearing change. Five eighths
      // would be 225°; what four beats allow is a quarter (below).
      expect(turned, id).toBeGreaterThan(60);
      expect(turned, id).toBeLessThan(120);
      // Facing along the ring at the end: the tangent, a quarter on from the bearing.
      expect(Math.abs(angleDiff(z.facing, bearingOf(z.p) + 90)), id).toBeLessThan(10);
    }
    expect((run.clearance ?? []).filter((c) => MIDDLE.includes(c.dancer))).toEqual([]);
  });

  it("is over the caps in four beats, and says so: pinned, a G1 question", () => {
    // Five eighths of the circle through the places (19 px out) is 74 px in
    // four beats — and first the four turn a quarter on to the ring and even
    // out round it, an entry of three beats after the pivot budget (M3), so
    // the body has one beat, the rate cap holds it to a quarter turn, and
    // the steps to get there are 79 cm. Measured 2026-09-18, three sets:
    // twelve `StepTooLong`, three `RateTooHigh`, three `TimingViolation`.
    // "5/8 in four is brisk at a dance too": the record says four, and the
    // old library walked the places as a chain rather than a wheel — G1.
    const errors = figureErrors(run.schedule as Schedule);
    const kinds = new Set(errors.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(["RateTooHigh", "StepTooLong", "TimingViolation"]);
    expect(errors.length).toBeLessThanOrEqual(18);
    const rate = run.schedule!.calls["3-1L"]![0]!;
    expect(rate.entry[1] - rate.entry[0]).toBe(3);
    expect(rate.rate! * (rate.body[1] - rate.body[0])).toBeCloseTo(0.25, 2);
  });
});

describe("the shoulder round, on the middle set", () => {
  const run = runWhole(
    one(
      "only-gypsy",
      "shoulder-round",
      "  shoulder-round(partner, Right, amount-quarters = 4, beats = 8);",
    ),
  );

  it("orbits once by the right shoulder, shoulder to shoulder, eyes on each other, and ends facing", () => {
    expect(figureErrors(run.schedule as Schedule)).toEqual([]);
    const mid: Vec2 = [16, 40];
    // The entry: the robin turns about, from facing across to walking the
    // tangent, which the pivot budget spreads over three beats (M3); the
    // orbit is the five that are left.
    const call = run.schedule!.calls["3-1L"]![0]!;
    const [from, to] = call.body;
    expect(from).toBe(3);
    const half = (from + to) / 2;
    const a0 = hipAt(run, "3-1L", from);
    const a6 = hipAt(run, "3-1L", half);
    // Shoulder to shoulder: eleven px apart the whole way round, both of
    // them on the circle of half that about the point between them.
    for (const beat of [from, half, to]) {
      expect(
        dist(hipAt(run, "3-1L", beat).p, hipAt(run, "3-1R", beat).p),
        String(beat),
      ).toBeCloseTo(11, 0);
      expect(dist(hipAt(run, "3-1L", beat).p, mid), String(beat)).toBeCloseTo(5.5, 0);
    }
    // Half way through the body the lark is on the far side from where he
    // began — within a step, the cruise ramp putting the half turn a little
    // after the half of the beats.
    expect(dist(a6.p, [2 * mid[0] - a0.p[0], 2 * mid[1] - a0.p[1]])).toBeLessThan(3);
    // The body faces along the orbit — the partner on the right shoulder —
    // and the head does the looking.
    expect(onRightOf(run, "3-1L", "3-1R", half)).toBe(true);
    const listing = run.listings["3-1L"]!;
    expect(listing.some((line) => line.text.includes("look at 3-1R"))).toBe(true);
    // Once round: back where the body began, still shoulder to shoulder on
    // the tangent. The `post` says facing each other, and it is the swing
    // after it that negotiates that turn in its entry; alone, the figure
    // ends as it went round.
    const l8 = hipAt(run, "3-1L", 8);
    const r8 = hipAt(run, "3-1R", 8);
    expect(dist(l8.p, a0.p)).toBeLessThan(1.5);
    const toward = Math.atan2(r8.p[1] - l8.p[1], r8.p[0] - l8.p[0]) * (180 / Math.PI);
    expect(Math.abs(Math.abs(angleDiff(l8.facing, toward)) - 90)).toBeLessThan(10);
  });

  it("proves: hands clean, the hip pinned at the entry's turn-about", () => {
    const worst = worstOver(run, MIDDLE, 0, 8);
    expect(worst.hands).toBe(0);
    // Measured 2026-09-18: the robin turns about — from facing across to
    // walking the tangent — over the entry, at the pivot cap.
    expect(worst.hip, `hip ×${worst.hip.toFixed(2)}`).toBeLessThan(3);
    expect(worst.feet, `feet ×${worst.feet.toFixed(2)}`).toBeLessThan(1.5);
  });
});
