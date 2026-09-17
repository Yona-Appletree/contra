import type { Vec2 } from "@caller/core";
import type { Foot, Instr, LookAt as InstrLookAt } from "../asm/Instruction.js";
import type { Program } from "../asm/Program.js";
import type { Channel, PointName } from "../body/Body.js";
import type { DancerId, Dialect } from "../dialect/Dialect.js";
import type { BodyFrame } from "../holds/HoldPosture.js";
import type { Hand, HoldId } from "../ir/Hold.js";
import type { Trajectory } from "../motion/Trajectory.js";
import type { Vec3 } from "../motion/Vec3.js";
import type { Schedule } from "../schedule/schedule.js";
import type { LookAt, SolveDancer, SolveHold, SolveInput } from "../solver/SolveInput.js";
import { TAKE_BEATS } from "../units/limits.js";
import type { Tempo } from "../units/Tempo.js";
import { gait } from "./gait.js";
import { hipPath, type BeatPose } from "./hipPath.js";
import { HAND_REACH_PX, handPath, reachOverrun, type HoldEvent } from "./hands.js";
import { LEAN_BEATS, rampAt } from "./ramps.js";

/**
 * The executor (DA10): per-dancer programs of per-beat instructions become
 * continuous, sampled trajectories of the **effectors** — the hip, both feet
 * and both hands — with the channels the solver reads off them.
 *
 * It is the only thing in the engine that produces a trajectory. Nothing above
 * it places a point and nothing below it re-times one: the scheduler says
 * what happens on which beat, the executor says what that looks like at 16
 * samples a beat, and the proof then says whether a body could have done it.
 *
 * Everyone is executed together because a hold's target is a function of both
 * bodies (D13): the two dancers of a joined pair compute the same shared point
 * from the same two hips, and neither could have worked it out alone.
 */
export function execute(schedule: Schedule, dialect: Dialect, tempo: Tempo): Executed {
  const beats = schedule.endBeat;
  const length = beats * tempo.samplesPerBeat + 1;
  const ids = [...dialect.dancers];
  const initial = dialect.initial();

  const plans = new Map<DancerId, Plan>();
  for (const id of ids) {
    const program = schedule.programs[id];
    const start = initial.dancers[id];
    if (!program || !start) continue;
    plans.set(id, readProgram(program, { p: start.p, facing: start.facing }, beats));
  }

  // The hips, the facing, the lean and the look: everything one body decides
  // on its own, before any hand knows where it is going.
  const bodies = new Map<DancerId, Body>();
  for (const [id, plan] of plans) {
    const path = hipPath(plan.targets, tempo);
    const lean = channelOf(plan.lean, 0, length, tempo, LEAN_BEATS);
    const frames: BodyFrame[] = new Array(length);
    const role = dialect.roleOf(id);
    for (let i = 0; i < length; i++) {
      frames[i] = { hip: path.hip[i]!, yawDeg: path.facing[i]!, leanDeg: lean[i]!, role };
    }
    bodies.set(id, { plan, path, lean, frames });
  }

  const frames = new Map<DancerId, readonly BodyFrame[]>(
    [...bodies].map(([id, body]) => [id, body.frames]),
  );

  const trajectories: Record<DancerId, Trajectory> = {};
  const dancers: Record<DancerId, SolveDancer> = {};
  const dialectRoles: Record<DancerId, "lark" | "robin"> = {};
  const violations: ExecutionViolation[] = [];

  for (const [id, body] of bodies) {
    const { plan } = body;
    const feet = gait({ targets: plan.targets, stepFoot: plan.stepFoot, length }, tempo);
    const left = handPath(plan.hands.left, "left", body.frames, frames, tempo);
    const right = handPath(plan.hands.right, "right", body.frames, frames, tempo);

    const trajectory: Trajectory = {
      tempo,
      beat0: 0,
      length,
      points: {
        hip: body.path.hip,
        footL: feet.footL,
        footR: feet.footR,
        handL: left.target,
        handR: right.target,
      },
      channels: {
        facing: body.path.facing,
        lean: body.lean,
        holdWeightL: left.weight,
        holdWeightR: right.weight,
      },
    };
    trajectories[id] = trajectory;
    dialectRoles[id] = dialect.roleOf(id);
    dancers[id] = {
      effectors: trajectory,
      holds: [
        ...spansOf(plan.hands.left, "left", length, tempo),
        ...spansOf(plan.hands.right, "right", length, tempo),
      ],
      look: lookOf(plan.look, body.path.facing, length, tempo),
    };

    for (const hand of BOTH_HANDS) {
      const path = hand === "left" ? left : right;
      const point: PointName = hand === "right" ? "handR" : "handL";
      for (const found of outOfReach(body.frames, path.target, hand)) {
        violations.push({
          dancer: id,
          kind: "reach",
          sample: found.sample,
          beat: found.sample / tempo.samplesPerBeat,
          point,
          value: found.value,
          cap: HAND_REACH_PX,
        });
      }
    }
  }

  return { input: { tempo, dialectRoles, dancers }, trajectories, violations };
}

/**
 * What the executor produces: the body solver's input, the same effector
 * trajectories by dancer for the proof and the debugger, and everything the
 * executor was asked for that a body cannot do.
 */
export interface Executed {
  /** P6's `solveBodies` takes this unchanged. */
  input: SolveInput;
  /** The effectors, by dancer — `input.dancers[id].effectors`, reached directly. */
  trajectories: Readonly<Record<DancerId, Trajectory>>;
  violations: readonly ExecutionViolation[];
}

/**
 * Something the executor was asked to plan that a body cannot do. Shaped like
 * the proof's and the solver's violations so the three lists read as one.
 *
 * `reach` — the hand the executor planned is further from the shoulder than an
 * arm reaches. Reported once per stretch, at its worst sample, and planned
 * there anyway: the arm is the solver's to fail at, and a clamp here would
 * hide a scheduler that put the two dancers too far apart to take hands.
 */
export interface ExecutionViolation {
  dancer: DancerId;
  kind: "reach";
  sample: number;
  beat: number;
  point: PointName | Channel;
  value: number;
  cap: number;
}

const BOTH_HANDS: readonly Hand[] = ["left", "right"];

/**
 * Every stretch over which the hand the executor planned is further from the
 * shoulder than an arm reaches, one report per stretch at its worst sample.
 *
 * The phase file asked for this at the take's ramp *start*; with `TAKE_BEATS`
 * at two, a take's ramp starts while the two dancers are still walking toward
 * each other, and the hold's target at that moment is a point nobody reaches
 * for — the hand is still at the hang, and only arrives as the ramp closes and
 * the bodies do. So the question is asked of the point the executor actually
 * commits the hand to, at every sample it commits it: a take that ends beyond
 * the arm is reported, a take that is merely aimed a long way off while the
 * ramp is still at nothing is not.
 */
const outOfReach = (
  frames: readonly BodyFrame[],
  points: readonly Vec3[],
  hand: Hand,
): { sample: number; value: number }[] => {
  const out: { sample: number; value: number }[] = [];
  let open: { sample: number; value: number } | undefined;
  for (let i = 0; i < frames.length; i++) {
    const over = reachOverrun(frames[i]!, hand, points[i]!);
    if (over > 0) {
      if (!open || over > open.value) open = { sample: i, value: over };
      continue;
    }
    if (open) out.push(open);
    open = undefined;
  }
  if (open) out.push(open);
  return out;
};

/** One dancer's program, read into the shapes the three planners want. */
interface Plan {
  /** Hip and facing targets at beats `0 … endBeat`. */
  targets: BeatPose[];
  /** The foot that steps over each beat. */
  stepFoot: (Foot | undefined)[];
  lean: Keyframe[];
  look: LookKeyframe[];
  hands: Record<Hand, HoldEvent[]>;
}

interface Keyframe {
  beat: number;
  value: number;
}

interface LookKeyframe {
  beat: number;
  at: InstrLookAt;
}

interface Body {
  plan: Plan;
  path: ReturnType<typeof hipPath>;
  lean: readonly number[];
  frames: BodyFrame[];
}

/**
 * A program read into per-beat targets. A `step` says where the hip is at the
 * **end** of its beat and a `pivot` how far the facing has turned by then, so
 * beat `b`'s instructions set beat `b + 1`'s target; a beat that says neither
 * holds the one before. Hands, leans and looks keep their half beats, which is
 * where a bow's head goes down.
 */
const readProgram = (program: Program, start: BeatPose, beats: number): Plan => {
  const targets: BeatPose[] = [{ p: start.p, facing: start.facing }];
  const stepFoot: (Foot | undefined)[] = new Array(beats).fill(undefined);
  const lean: Keyframe[] = [];
  const look: LookKeyframe[] = [];
  const hands: Record<Hand, HoldEvent[]> = { left: [], right: [] };

  const byBeat = new Map<number, Instr[]>();
  for (const slot of program.slots) {
    const at = slot.beat + slot.half / 2;
    for (const instr of slot.instrs) {
      if (instr.op === "lean") lean.push({ beat: at, value: instr.deg });
      else if (instr.op === "look") look.push({ beat: at, at: instr.at });
      else if (instr.op === "hold") {
        hands[instr.hand].push({ beat: at, hold: instr.hold, with: instr.with });
      } else if (instr.op === "drop") {
        hands[instr.hand].push({ beat: at, hold: undefined });
      } else {
        const list = byBeat.get(slot.beat) ?? [];
        list.push(instr);
        byBeat.set(slot.beat, list);
      }
    }
  }

  for (let b = 0; b < beats; b++) {
    const previous = targets[b]!;
    const instrs = byBeat.get(b) ?? [];
    let p: Vec2 = previous.p;
    let facing = previous.facing;
    for (const instr of instrs) {
      if (instr.op === "step") {
        p = instr.to;
        stepFoot[b] = instr.foot;
      } else if (instr.op === "pivot") {
        facing = facing + instr.deg;
      }
      // `buzz` is tonight's known gap (P5 scope): a swing's two steps a beat
      // need a cadence of their own, and the fixture has no swing in it.
    }
    targets.push({ p, facing });
  }

  return { targets, stepFoot, lean, look, hands };
};

/**
 * A scalar channel from its keyframes: each one a cosine ramp over `beats`
 * from whatever the channel was doing into its own value, which for a
 * keyframe landing on an unfinished ramp is the half-finished curve rather
 * than a jump.
 */
const channelOf = (
  frames: readonly Keyframe[],
  initial: number,
  length: number,
  tempo: Tempo,
  beats: number,
): number[] => {
  const ordered = [...frames].sort((a, b) => a.beat - b.beat);
  const out: number[] = new Array(length);
  for (let i = 0; i < length; i++) {
    const beat = i / tempo.samplesPerBeat;
    let value = initial;
    for (const frame of ordered) {
      const r = rampAt(beat, frame.beat, beats);
      if (r === 0) break;
      value = value + (frame.value - value) * r;
    }
    out[i] = value;
  }
  return out;
};

/**
 * The look per sample, held flat from each instruction until the next: the
 * solver ramps the head, so ramping it here too would turn it twice.
 *
 * `"down"` — the bow — becomes the direction the dancer is already facing.
 * The head goes down with the **lean**, not with the look: a bow is a body
 * that folds, not a neck that cranes at the floor.
 */
const lookOf = (
  frames: readonly LookKeyframe[],
  facing: readonly number[],
  length: number,
  tempo: Tempo,
): LookAt[] => {
  const ordered = [...frames].sort((a, b) => a.beat - b.beat);
  const out: LookAt[] = new Array(length);
  let k = -1;
  for (let i = 0; i < length; i++) {
    const beat = i / tempo.samplesPerBeat;
    while (k + 1 < ordered.length && ordered[k + 1]!.beat <= beat + 1e-9) k++;
    const current = ordered[k];
    if (!current) {
      out[i] = undefined;
      continue;
    }
    out[i] = current.at === "down" ? { deg: facing[i] ?? 0 } : current.at;
  }
  return out;
};

/**
 * The spans a hand is in a hold over, one per stretch of the same hold: from
 * the beat the take's ramp starts to the beat the release's ramp ends, so the
 * weight the solver reads is meaningful everywhere inside the span. A take of
 * a hold already held changes nothing and opens no new span.
 */
const spansOf = (
  events: readonly HoldEvent[],
  hand: Hand,
  length: number,
  tempo: Tempo,
): SolveHold[] => {
  const ordered = [...events].sort((a, b) => a.beat - b.beat);
  const out: SolveHold[] = [];
  let open: { hold: HoldId; with: DancerId; from: number } | undefined;
  const close = (beat: number): void => {
    if (!open) return;
    out.push({
      hand,
      hold: open.hold,
      with: open.with,
      fromSample: open.from,
      toSample: Math.min(Math.round((beat + TAKE_BEATS) * tempo.samplesPerBeat) + 1, length),
    });
    open = undefined;
  };
  for (const event of ordered) {
    if (event.hold === undefined || event.with === undefined) {
      close(event.beat);
      continue;
    }
    if (open && open.hold === event.hold && open.with === event.with) continue;
    close(event.beat);
    open = {
      hold: event.hold,
      with: event.with,
      from: Math.max(Math.round(event.beat * tempo.samplesPerBeat), 0),
    };
  }
  if (open) {
    out.push({
      hand,
      hold: open.hold,
      with: open.with,
      fromSample: open.from,
      toSample: length,
    });
  }
  return out;
};
