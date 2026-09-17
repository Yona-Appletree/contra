import {
  ARM_REACH_PX,
  FOREARM_PX,
  HOLD_SPACING_PX,
  SHOULDER_WIDTH_PX,
  UPPER_ARM_PX,
} from "@caller/core";
import { describe, expect, it } from "vitest";
import { HEIGHTS } from "../body/Body.js";
import type { DancerId } from "../dialect/Dialect.js";
import { ALLEMANDE_RISE_PX } from "../holds/allemande.js";
import { hangPoint, lateralOf } from "../holds/free.js";
import type { BodyFrame } from "../holds/HoldPosture.js";
import type { Trajectory } from "../motion/Trajectory.js";
import { dist, lerp, scale, sub, vec3, type Vec3 } from "../motion/Vec3.js";
import { ANGULAR_CAPS } from "../units/caps.js";
import { tempo } from "../units/Tempo.js";
import { boneLengths } from "./arm.js";
import type { SolveInput } from "./SolveInput.js";
import { solveBodies } from "./solveBody.js";

const T = tempo(112);
const SPB = T.samplesPerBeat;
const BEATS = 8;
const N = BEATS * SPB + 1;
const R = HOLD_SPACING_PX / 2;

/** The allemande's take starts here and its drop ends here. */
const FROM = SPB;
const TO = 7 * SPB;
/**
 * How long the take's ramp is. Two beats, not one: a hand coming out of the
 * free hang starts with the arm 14.5 px of its 15 px extended, and pulling it
 * in over a single beat swings the elbow past its 800 cm/s² cap — the proof
 * catches it. A real finding for the executor (P5) and for G1's question about
 * where the caps sit, not a number this fixture may fudge.
 */
const RAMP = 2 * SPB;

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The take's weight at sample `i`: a raised cosine in, flat, a raised cosine out. */
const holdWeight = (i: number): number => {
  if (i <= FROM || i >= TO) return 0;
  if (i < FROM + RAMP) return (1 - Math.cos((Math.PI * (i - FROM)) / RAMP)) / 2;
  if (i > TO - RAMP) return (1 - Math.cos((Math.PI * (TO - i)) / RAMP)) / 2;
  return 1;
};

/** Where the two hands meet: the midpoint of the two hips, waist-plus. */
const SHARED = vec3(0, 0, HEIGHTS.hipPx + ALLEMANDE_RISE_PX);

/**
 * One dancer of a pair orbiting each other once over `BEATS` beats, at the
 * contract's hold spacing, each facing the other throughout — an allemande,
 * built by hand because the scheduler and the executor that will really
 * produce it (P4, P5) do not exist yet. Everything below the hips is a
 * parametric circle; the hands ramp on and off the shared point.
 */
const orbit = (startDeg: number): SolveInput["dancers"][DancerId] => {
  const hip: Vec3[] = [];
  const footL: Vec3[] = [];
  const footR: Vec3[] = [];
  const handL: Vec3[] = [];
  const handR: Vec3[] = [];
  const facing: number[] = [];
  const lean: number[] = [];
  const holdWeightL: number[] = [];
  const holdWeightR: number[] = [];

  for (let i = 0; i < N; i++) {
    const theta = startDeg + (360 * i) / (BEATS * SPB);
    const rad = (theta * Math.PI) / 180;
    const p = vec3(R * Math.cos(rad), R * Math.sin(rad), HEIGHTS.hipPx);
    // Each dancer faces the other, which on a circle is straight inward.
    const yaw = theta + 180;
    const frame: BodyFrame = { hip: p, yawDeg: yaw, leanDeg: 0, role: "lark" };

    hip.push(p);
    facing.push(yaw);
    lean.push(0);

    const right = lateralOf(yaw, "right");
    const left = lateralOf(yaw, "left");
    footR.push(vec3(p.x + right.x * 2, p.y + right.y * 2, 0));
    footL.push(vec3(p.x + left.x * 2, p.y + left.y * 2, 0));

    const w = holdWeight(i);
    const hang = hangPoint(frame, "right");
    handR.push(w <= 0 ? hang : w >= 1 ? SHARED : lerp(hang, SHARED, w));
    handL.push(hangPoint(frame, "left"));
    holdWeightR.push(w);
    holdWeightL.push(0);
  }

  const effectors: Trajectory = {
    tempo: T,
    beat0: 0,
    length: N,
    points: { hip, footL, footR, handL, handR },
    channels: { facing, lean, holdWeightL, holdWeightR },
  };
  return { effectors, holds: [], look: [] };
};

const pairInput = (): SolveInput => {
  const lark = orbit(0);
  const robin = orbit(180);
  return {
    tempo: T,
    dialectRoles: { lark: "lark", robin: "robin" },
    dancers: {
      lark: {
        ...lark,
        holds: [
          { hand: "right", hold: "allemande-R", with: "robin", fromSample: FROM, toSample: TO },
        ],
        look: new Array<DancerId>(N).fill("robin"),
      },
      robin: {
        ...robin,
        holds: [
          { hand: "right", hold: "allemande-R", with: "lark", fromSample: FROM, toSample: TO },
        ],
        look: new Array<DancerId>(N).fill("lark"),
      },
    },
  };
};

describe("solveBodies — a pair allemanding right", () => {
  const solved = solveBodies(pairInput());
  const ids: DancerId[] = ["lark", "robin"];
  /** Samples the take is fully in: the allemande's body, both ramps over. */
  const body = Array.from({ length: TO - RAMP - (FROM + RAMP) + 1 }, (_, k) => FROM + RAMP + k);

  it("proves every point of both bodies, joints included", () => {
    expect(solved.violations).toEqual([]);
  });

  it("keeps both arms two 7.5 px bones, every sample", () => {
    for (const id of ids) {
      const t = solved.trajectories[id]!;
      for (let i = 0; i < N; i++) {
        for (const side of ["L", "R"] as const) {
          const [upper, fore] = boneLengths(
            t.points[`shoulder${side}`]![i]!,
            t.points[`elbow${side}`]![i]!,
            t.points[side === "R" ? "handR" : "handL"]![i]!,
          );
          expect(upper).toBeCloseTo(UPPER_ARM_PX, 9);
          expect(fore).toBeCloseTo(FOREARM_PX, 9);
        }
      }
    }
  });

  it("keeps the shoulders the contract's 11 px apart, every sample", () => {
    for (const id of ids) {
      const t = solved.trajectories[id]!;
      for (let i = 0; i < N; i++) {
        expect(dist(t.points.shoulderL![i]!, t.points.shoulderR![i]!)).toBeCloseTo(
          SHOULDER_WIDTH_PX,
          9,
        );
      }
    }
  });

  it("joins the two right hands at one point, palms pressing", () => {
    for (const i of body) {
      const a = solved.hands.lark!.right[i]!;
      const b = solved.hands.robin!.right[i]!;
      expect(dist(a.p, b.p)).toBeCloseTo(0, 9);
      expect(dist(a.p, SHARED)).toBeCloseTo(0, 9);
      expect(dot(a.normal, b.normal)).toBeCloseTo(-1, 9);
      expect(a.contact).toBe("palm");
      expect(a.onTop).toBe(false);
    }
  });

  it("keeps the allemande's elbow below the shoulder–hand line and a tiny bit out", () => {
    for (const id of ids) {
      const t = solved.trajectories[id]!;
      for (const i of body) {
        const shoulder = t.points.shoulderR![i]!;
        const hand = t.points.handR![i]!;
        const elbow = t.points.elbowR![i]!;
        // The bones are equal, so the elbow circle is centred on the midpoint.
        const mid = lerp(shoulder, hand, 0.5);
        expect(elbow.z).toBeLessThan(mid.z);
        const outward = lateralOf(t.channels.facing![i]!, "right");
        expect(dot(sub(elbow, mid), outward)).toBeGreaterThan(0);
      }
    }
  });

  it("hangs every free hand at the hang point", () => {
    for (const id of ids) {
      const t = solved.trajectories[id]!;
      for (let i = 0; i < N; i++) {
        const frame: BodyFrame = {
          hip: t.points.hip![i]!,
          yawDeg: t.channels.facing![i]!,
          leanDeg: 0,
          role: "lark",
        };
        expect(dist(t.points.handL![i]!, hangPoint(frame, "left"))).toBeLessThan(0.5);
        if (i < FROM || i >= TO) {
          expect(dist(t.points.handR![i]!, hangPoint(frame, "right"))).toBeLessThan(0.5);
          expect(solved.hands[id]!.right[i]!.contact).toBe("free");
        }
      }
    }
  });

  it("never asks an arm for more than it reaches", () => {
    for (const id of ids) {
      const t = solved.trajectories[id]!;
      for (let i = 0; i < N; i++) {
        expect(dist(t.points.shoulderR![i]!, t.points.handR![i]!)).toBeLessThanOrEqual(
          ARM_REACH_PX,
        );
        expect(dist(t.points.shoulderL![i]!, t.points.handL![i]!)).toBeLessThanOrEqual(
          ARM_REACH_PX,
        );
      }
    }
  });

  it("holds each head within the neck's range, watching the other dancer", () => {
    for (const id of ids) {
      const t = solved.trajectories[id]!;
      for (const yaw of t.channels.headYaw!) {
        expect(Math.abs(yaw)).toBeLessThanOrEqual(ANGULAR_CAPS.lookDeg);
      }
      // Facing each other across the circle: the head barely leaves square.
      expect(Math.abs(t.channels.headYaw![N - 1]!)).toBeCloseTo(0, 6);
    }
  });

  it("leaves the torso yaw where the executor planned it, the hold being straight ahead", () => {
    const t = solved.trajectories.lark!;
    for (let i = 0; i < N; i++) {
      const planned = (360 * i) / (BEATS * SPB) + 180;
      expect(t.channels.facing![i]!).toBeCloseTo(planned, 6);
    }
  });
});

describe("solveBodies — one dancer standing, looking somewhere", () => {
  const n = 2 * SPB + 1;
  const hip = vec3(0, 0, HEIGHTS.hipPx);
  const frame: BodyFrame = { hip, yawDeg: 0, leanDeg: 0, role: "robin" };
  const solved = solveBodies({
    tempo: T,
    dialectRoles: { solo: "robin" },
    dancers: {
      solo: {
        effectors: {
          tempo: T,
          beat0: 0,
          length: n,
          points: {
            hip: new Array<Vec3>(n).fill(hip),
            footL: new Array<Vec3>(n).fill(vec3(0, -2, 0)),
            footR: new Array<Vec3>(n).fill(vec3(0, 2, 0)),
            handL: new Array<Vec3>(n).fill(hangPoint(frame, "left")),
            handR: new Array<Vec3>(n).fill(hangPoint(frame, "right")),
          },
          channels: {
            facing: new Array<number>(n).fill(0),
            lean: new Array<number>(n).fill(0),
            holdWeightL: new Array<number>(n).fill(0),
            holdWeightR: new Array<number>(n).fill(0),
          },
        },
        holds: [],
        look: new Array<{ deg: number }>(n).fill({ deg: 60 }),
      },
    },
  });

  it("stands still without a single violation", () => {
    expect(solved.violations).toEqual([]);
  });

  it("turns the head to the direction it was told to look, and no further", () => {
    for (const yaw of solved.trajectories.solo!.channels.headYaw!) {
      expect(yaw).toBeCloseTo(60, 9);
    }
  });

  it("builds the rest of the body out of the contract's numbers", () => {
    const t = solved.trajectories.solo!;
    expect(dist(t.points.shoulderL![0]!, t.points.shoulderR![0]!)).toBeCloseTo(
      SHOULDER_WIDTH_PX,
      9,
    );
    expect(t.points.head![0]!).toEqual(vec3(0, 0, HEIGHTS.headPx));
    const [upper, fore] = boneLengths(
      t.points.shoulderR![0]!,
      t.points.elbowR![0]!,
      t.points.handR![0]!,
    );
    expect(upper).toBeCloseTo(UPPER_ARM_PX, 9);
    expect(fore).toBeCloseTo(FOREARM_PX, 9);
  });

  it("leaves both hands free, palms turned in to the thighs", () => {
    const plates = solved.hands.solo!;
    expect(plates.left[0]!.contact).toBe("free");
    expect(plates.right[0]!.contact).toBe("free");
    // Facing +x, the right is +y, so the right palm looks back toward -y.
    const inward = scale(lateralOf(0, "right"), -1);
    expect(dist(plates.right[0]!.normal, inward)).toBeCloseTo(0, 12);
  });
});
