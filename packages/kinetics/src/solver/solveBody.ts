import { SHOULDER_FORWARD_PX, SHOULDER_WIDTH_PX, dirOf, rightOf } from "@caller/core";
import { HEIGHTS, type Channel, type PointName } from "../body/Body.js";
import type { DancerId } from "../dialect/Dialect.js";
import { free } from "../holds/free.js";
import type { BodyFrame, Contact, HoldPosture } from "../holds/HoldPosture.js";
import { HOLDS } from "../holds/library.js";
import type { Hand } from "../ir/Hold.js";
import { beatOf, type Trajectory } from "../motion/Trajectory.js";
import { proveMotion, type Violation } from "../motion/prove.js";
import type { Vec3 } from "../motion/Vec3.js";
import { solveArm } from "./arm.js";
import { headPoint, LOOK_DISTANCE_PX, lookBearing, solveHead } from "./head.js";
import type { LookAt, SolveDancer, SolveInput } from "./SolveInput.js";
import { type HandPull, solveTorso } from "./torso.js";

/**
 * From planned effectors to solved bodies: shoulders, elbows and heads, a
 * plate for every hand, and the rendering contract proved rather than
 * promised.
 *
 * The solver adds nothing the executor could have decided. It reads the hips,
 * the hands, the facing and the lean; it turns the holds in force into
 * postures; and it works out where the rest of the body must be if those are
 * true. Everything it cannot make true — a hand further off than an arm
 * reaches, a torso or a neck asked to turn faster than one can — comes back in
 * `violations` rather than being quietly clamped into looking fine.
 */
export const solveBodies = (input: SolveInput): SolvedBodies => {
  const { tempo } = input;
  const ids = Object.keys(input.dancers);
  const planned = new Map<DancerId, Planned>(ids.map((id) => [id, readPlanned(input, id)]));

  // Pass 1: frames at the facing the executor planned. The two-person
  // postures place their target from the hips alone, so this is enough to ask
  // where each held hand has to be — which is what turns the torso.
  const framesPlanned = new Map<DancerId, BodyFrame[]>();
  for (const [id, p] of planned) framesPlanned.set(id, framesOf(p, p.facing));

  const yaw = new Map<DancerId, readonly number[]>();
  const violations: BodyViolation[] = [];
  for (const [id, p] of planned) {
    const pulls: HandPull[][] = [];
    for (let i = 0; i < p.length; i++) {
      const row: HandPull[] = [];
      for (const hand of BOTH_HANDS) {
        const held = p.holdAt[hand][i]!;
        if (held.weight <= 0) continue;
        const self = framesPlanned.get(id)![i]!;
        const other = held.with === undefined ? undefined : framesPlanned.get(held.with)?.[i];
        row.push({ target: held.posture.target(self, other, hand), weight: held.weight });
      }
      pulls.push(row);
    }
    const torso = solveTorso({ tempo, facing: p.facing, hips: p.hip, pulls });
    yaw.set(id, torso.yawDeg);
    for (const limit of torso.limited) {
      violations.push({
        dancer: id,
        kind: "yaw-rate",
        sample: limit.sample,
        beat: beatOf(p.trajectory, limit.sample),
        point: "facing",
        value: limit.value,
        cap: limit.cap,
      });
    }
  }

  // Pass 2: frames at the solved yaw. A free hand hangs off the torso, so its
  // target moves with the comfort yaw; a held one does not.
  const frames = new Map<DancerId, BodyFrame[]>();
  for (const [id, p] of planned) frames.set(id, framesOf(p, yaw.get(id)!));

  // Every head, before any of them is aimed: a dancer looking at another
  // dancer looks at that dancer's head point, so they all have to exist first.
  const heads = new Map<DancerId, Vec3[]>();
  for (const [id, frame] of frames) {
    heads.set(
      id,
      frame.map((f) => headPoint(f.hip, f.leanDeg, f.yawDeg)),
    );
  }

  const trajectories: Record<DancerId, Trajectory> = {};
  const hands: Record<DancerId, Record<Hand, HandPlate[]>> = {};

  for (const [id, p] of planned) {
    const self = frames.get(id)!;
    const shoulderL: Vec3[] = [];
    const shoulderR: Vec3[] = [];
    const elbowL: Vec3[] = [];
    const elbowR: Vec3[] = [];
    const plates: Record<Hand, HandPlate[]> = { left: [], right: [] };

    for (let i = 0; i < p.length; i++) {
      const frame = self[i]!;
      shoulderL.push(shoulderPoint(frame, "left"));
      shoulderR.push(shoulderPoint(frame, "right"));

      for (const hand of BOTH_HANDS) {
        const held = p.holdAt[hand][i]!;
        const other = held.with === undefined ? undefined : frames.get(held.with)?.[i];
        const point = p.hand[hand][i] ?? held.posture.target(frame, other, hand);
        const shoulder = hand === "right" ? shoulderR[i]! : shoulderL[i]!;
        const arm = solveArm(shoulder, point, held.posture.swivelDeg, hand, frame.yawDeg);
        (hand === "right" ? elbowR : elbowL).push(arm.elbow);
        if (arm.reach) {
          violations.push({
            dancer: id,
            kind: "reach",
            sample: i,
            beat: beatOf(p.trajectory, i),
            point: hand === "right" ? "elbowR" : "elbowL",
            value: arm.reach.distancePx,
            cap: arm.reach.reachPx,
          });
        }
        plates[hand].push({
          hand,
          p: point,
          normal: held.posture.palmNormal(frame, other, hand),
          contact: held.posture.contact,
          onTop: held.posture.contact === "stacked" && held.posture.onTop === p.role,
        });
      }
    }

    const bearingDeg = p.look.map((target, i) => bearingOf(target, heads, id, i));
    const head = solveHead({ tempo, torsoYawDeg: yaw.get(id)!, bearingDeg });
    for (const limit of head.limited) {
      violations.push({
        dancer: id,
        kind: "look-rate",
        sample: limit.sample,
        beat: beatOf(p.trajectory, limit.sample),
        point: "headYaw",
        value: limit.value,
        cap: limit.cap,
      });
    }

    const solved: Trajectory = {
      tempo: p.trajectory.tempo,
      beat0: p.trajectory.beat0,
      length: p.length,
      points: {
        ...p.trajectory.points,
        shoulderL,
        shoulderR,
        elbowL,
        elbowR,
        head: heads.get(id)!,
      },
      // `facing` carries the solved torso yaw, which is the planned facing
      // plus the comfort rule: it is where the shoulders actually point.
      channels: { ...p.trajectory.channels, facing: yaw.get(id)!, headYaw: head.headYawDeg },
    };
    trajectories[id] = solved;
    hands[id] = plates;

    for (const v of proveMotion(solved)) violations.push({ ...v, dancer: id });
  }

  violations.sort((a, b) => a.sample - b.sample);
  return { trajectories, hands, violations };
};

/**
 * Every dancer's solved body. `hands` is indexed dancer → hand → sample: one
 * plate per hand per sample, which is what a renderer needs to draw a hand and
 * what a test needs to check that two joined hands are one point.
 */
export interface SolvedBodies {
  trajectories: Readonly<Record<DancerId, Trajectory>>;
  hands: Readonly<Record<DancerId, Readonly<Record<Hand, readonly HandPlate[]>>>>;
  violations: readonly BodyViolation[];
}

/** A hand as a flat plate (DA5): where it is, which way the palm points, and how it meets. */
export interface HandPlate {
  hand: Hand;
  p: Vec3;
  normal: Vec3;
  contact: Contact;
  /** True when this dancer's hand stacks on the other's, from the posture and the role. */
  onTop: boolean;
}

/** Something the solver was asked for that a body cannot do. */
export interface SolveViolation {
  dancer: DancerId;
  kind: SolveViolationKind;
  sample: number;
  beat: number;
  /** The point or channel at fault. */
  point: PointName | Channel;
  value: number;
  cap: number;
}

/**
 * `reach` — the hand is further from the shoulder than the two bones reach.
 * `yaw-rate`, `look-rate` — the torso or the neck was asked to turn faster
 * than `ANGULAR_CAPS` allows, which means the executor asked for it.
 */
export type SolveViolationKind = "reach" | "yaw-rate" | "look-rate";

/** One of `proveMotion`'s violations, tagged with whose body it is. */
export interface ProofViolation extends Violation {
  dancer: DancerId;
}

/** Everything wrong with a solved body: the proof's findings and the solver's own. */
export type BodyViolation = ProofViolation | SolveViolation;

const BOTH_HANDS: readonly Hand[] = ["left", "right"];

/** One dancer's planned series, read once out of the trajectory. */
interface Planned {
  trajectory: Trajectory;
  length: number;
  role: "lark" | "robin";
  hip: readonly Vec3[];
  facing: readonly number[];
  lean: readonly number[];
  hand: Readonly<Record<Hand, readonly (Vec3 | undefined)[]>>;
  holdAt: Readonly<Record<Hand, readonly HeldHand[]>>;
  look: readonly LookAt[];
}

/** The hold in force for one hand at one sample. */
interface HeldHand {
  posture: HoldPosture;
  with: DancerId | undefined;
  /** 0 (free) to 1 (fully taken), from the `holdWeight` channel. */
  weight: number;
}

const readPlanned = (input: SolveInput, id: DancerId): Planned => {
  const dancer: SolveDancer = input.dancers[id]!;
  const trajectory = dancer.effectors;
  const length = trajectory.length;
  const hip = trajectory.points.hip;
  if (!hip || hip.length < length) {
    throw new Error(`solveBodies: dancer "${id}" has no hip trajectory to build a body on`);
  }
  const zeros = new Array<number>(length).fill(0);
  return {
    trajectory,
    length,
    role: input.dialectRoles[id] ?? "lark",
    hip,
    facing: trajectory.channels.facing ?? zeros,
    lean: trajectory.channels.lean ?? zeros,
    hand: {
      left: trajectory.points.handL ?? new Array<undefined>(length).fill(undefined),
      right: trajectory.points.handR ?? new Array<undefined>(length).fill(undefined),
    },
    holdAt: {
      left: heldHands(dancer, "left", trajectory.channels.holdWeightL ?? zeros, length),
      right: heldHands(dancer, "right", trajectory.channels.holdWeightR ?? zeros, length),
    },
    look: dancer.look,
  };
};

const heldHands = (
  dancer: SolveDancer,
  hand: Hand,
  weights: readonly number[],
  length: number,
): HeldHand[] => {
  const out: HeldHand[] = [];
  for (let i = 0; i < length; i++) {
    const hold = dancer.holds.find(
      (h) => h.hand === hand && i >= h.fromSample && i < h.toSample && h.hold !== "free",
    );
    if (!hold) {
      out.push({ posture: free, with: undefined, weight: 0 });
      continue;
    }
    const weight = Math.min(Math.max(weights[i] ?? 0, 0), 1);
    out.push({ posture: HOLDS[hold.hold], with: hold.with, weight });
  }
  return out;
};

const framesOf = (p: Planned, yawDeg: readonly number[]): BodyFrame[] => {
  const out: BodyFrame[] = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    out[i] = { hip: p.hip[i]!, yawDeg: yawDeg[i]!, leanDeg: p.lean[i]!, role: p.role };
  }
  return out;
};

/** How far above the hips the shoulder line sits along the torso, px. */
export const TORSO_RISE_PX = HEIGHTS.shoulderPx - HEIGHTS.hipPx;

/**
 * A shoulder: up the torso from the hips, tilted forward by the lean, then out
 * to the side by half the contract's shoulder width and a little forward of
 * the body centre.
 */
export const shoulderPoint = (frame: BodyFrame, side: Hand): Vec3 => {
  const lean = (frame.leanDeg * Math.PI) / 180;
  const forward = dirOf(frame.yawDeg);
  const right = rightOf(frame.yawDeg);
  const sign = side === "right" ? 1 : -1;
  const reach = TORSO_RISE_PX * Math.sin(lean) + SHOULDER_FORWARD_PX;
  const half = (sign * SHOULDER_WIDTH_PX) / 2;
  return {
    x: frame.hip.x + forward[0] * reach + right[0] * half,
    y: frame.hip.y + forward[1] * reach + right[1] * half,
    z: frame.hip.z + TORSO_RISE_PX * Math.cos(lean),
  };
};

const bearingOf = (
  target: LookAt,
  heads: ReadonlyMap<DancerId, readonly Vec3[]>,
  id: DancerId,
  sample: number,
): number | undefined => {
  if (target === undefined) return undefined;
  const from = heads.get(id)![sample]!;
  if (typeof target === "string") {
    const at = heads.get(target)?.[sample];
    return at === undefined ? undefined : lookBearing(from, at);
  }
  const d = dirOf(target.deg);
  return lookBearing(from, {
    x: from.x + d[0] * LOOK_DISTANCE_PX,
    y: from.y + d[1] * LOOK_DISTANCE_PX,
    z: from.z,
  });
};
