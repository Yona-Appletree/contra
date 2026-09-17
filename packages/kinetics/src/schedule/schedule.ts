import type { Vec2 } from "@caller/core";
import { ARM_REACH_PX, angleDiff, dirOf, dist, leftOf, rightOf } from "@caller/core";
import type { Foot, Instr, LookAt, Slot, WindowName } from "../asm/Instruction.js";
import type { Program } from "../asm/Program.js";
import type { DancerId, Dialect } from "../dialect/Dialect.js";
import type { FigureIR, LookTarget, Role, Window } from "../ir/Figure.js";
import { resolveChoice, resolveNumber } from "../ir/Figure.js";
import type { CompiledCall, CompiledSequence } from "../lang/compile.js";
import type { Tempo } from "../units/Tempo.js";
import { TAKE_BEATS } from "../units/limits.js";
import type { ScheduleError, ScheduleWarning } from "./errors.js";
import type { HoldNeed, SeamKind } from "./seams.js";
import { holdNeeds } from "./seams.js";
import type { Floor, Pose } from "./state.js";
import { bearing, handState, initialFloor, midpoint, sameHold, setHand } from "./state.js";
import type { PlannedStep, PxLimits } from "./steps.js";
import { beatsNeeded, limitsAtTempo, planSteps, stepFractions } from "./steps.js";

/**
 * The scheduler (DA8, DA9): a compiled sequence becomes, per call, an
 * **entry, body and exit** and, per dancer, a program of one slot per beat.
 *
 * The user's friend put the contract in one breath: *"you have some initial
 * state/position, and you have moves you need to do, and you have to figure
 * out how to transition, which takes different amounts of time, and you have
 * to go to the next move, also a different amount of time, and that leaves a
 * certain amount in the middle for the main part, which changes due to the
 * amount of time you have … like, you circle longer if you start the move
 * already with joined hands."*
 *
 * So: the entry and the exit are computed from the state on either side, the
 * body absorbs what is left, and a body that would need more than it has is a
 * compile error rather than a fast dancer (D3). The exit is **back-chained**
 * from the next figure's `pre` (D12): when the previous figure's body can be
 * re-planned, its last beats walk to where the next figure starts, and the
 * next figure's entry is zero.
 *
 * A figure is planned as an **instance**: the dancers it casts together (a
 * pair, or a ring of four) over one span, so both sides of a hold and every
 * point of a ring come from one piece of geometry.
 */
export interface ScheduledCall {
  dancer: DancerId;
  call: CompiledCall;
  /** Half-open beat ranges, contiguous, covering `[call.start, call.end)`. */
  entry: readonly [number, number];
  body: readonly [number, number];
  exit: readonly [number, number];
  seamIn: SeamKind;
  seamOut: SeamKind;
  /** Turns per beat for an orbit body. */
  rate?: number;
  /** One line per decision, in plain words. */
  notes: readonly string[];
}

export interface Schedule {
  calls: Readonly<Record<DancerId, readonly ScheduledCall[]>>;
  programs: Readonly<Record<DancerId, Program>>;
  errors: readonly ScheduleError[];
  warnings: readonly ScheduleWarning[];
  /** The last beat of the program. */
  endBeat: number;
}

interface Instance {
  key: string;
  figure: FigureIR;
  start: number;
  end: number;
  dancers: DancerId[];
  calls: Map<DancerId, CompiledCall>;
  entry: number;
  exit: number;
  rate?: number;
  notes: string[];
  seamIn: SeamKind;
  seamOut: SeamKind;
  /** The instructions this instance's body and exit emitted, so a re-plan can retract exactly them and nothing that rode on the same slot. */
  emitted: Map<DancerId, { key: string; instr: Instr }[]>;
  bodyStart: Map<DancerId, Pose>;
  bodyEnd: Map<DancerId, Pose>;
  /** Whether the body can be re-planned over fewer beats to make room for an exit. */
  replannable: boolean;
  /** Somebody this figure needs is missing: the dancer stands. */
  nobody: boolean;
}

export function schedule(sequence: CompiledSequence, dialect: Dialect, tempo: Tempo): Schedule {
  const limits = limitsAtTempo(tempo);
  const errors: ScheduleError[] = [];
  const warnings: ScheduleWarning[] = [];
  const floor = initialFloor(dialect);
  const slots = new Map<DancerId, Map<string, Slot>>();
  for (const d of dialect.dancers) slots.set(d, new Map());

  const perDancer = elide(sequence);
  const instances = groupInstances(perDancer);
  const byCall = new Map<string, Instance>();
  for (const inst of instances) {
    for (const [d, c] of inst.calls) byCall.set(`${d}:${c.id}`, inst);
  }
  const neighbourOf = (inst: Instance, d: DancerId, offset: -1 | 1): Instance | undefined => {
    const list = perDancer[d] ?? [];
    const i = list.findIndex((c) => c === inst.calls.get(d));
    const other = list[i + offset];
    return other ? byCall.get(`${d}:${other.id}`) : undefined;
  };

  // ---- slots ----------------------------------------------------------------

  const slotKey = (beat: number, half: 0 | 1): string => `${beat}:${half}`;
  const emit = (
    d: DancerId,
    beat: number,
    half: 0 | 1,
    instr: Instr,
    call: number,
    window: WindowName,
    inst?: Instance,
  ): void => {
    const map = slots.get(d);
    if (!map) throw new Error(`unknown dancer ${d}`);
    const key = slotKey(beat, half);
    const existing = map.get(key);
    if (existing) map.set(key, { ...existing, instrs: [...existing.instrs, instr] });
    else map.set(key, { beat, half, instrs: [instr], call, window });
    inst?.emitted.get(d)?.push({ key, instr });
  };
  /** Take back what `inst` emitted for `d`; a hold or drop another figure put on the same slot stays. */
  const retract = (inst: Instance, d: DancerId): void => {
    const map = slots.get(d);
    if (!map) return;
    for (const { key, instr } of inst.emitted.get(d) ?? []) {
      const slot = map.get(key);
      if (!slot) continue;
      const instrs = slot.instrs.filter((i) => i !== instr);
      if (instrs.length === 0) map.delete(key);
      else map.set(key, { ...slot, instrs });
    }
    inst.emitted.set(d, []);
  };
  const emitStep = (
    d: DancerId,
    beat: number,
    step: PlannedStep,
    call: CompiledCall,
    window: WindowName,
    inst: Instance,
  ): void => {
    const lengthCm = step.lengthPx * tempo.cmPerPx;
    if (step.lengthPx > limits.maxStepPx + 1e-9) {
      errors.push({
        kind: "StepTooLong",
        message: `${d}: a ${lengthCm.toFixed(0)} cm step at beat ${beat} in ${call.figure.id}`,
        call: call.id,
        dancer: d,
        beat,
        span: call.span,
      });
    } else if (step.lengthPx > limits.preferredStepPx) {
      warnings.push({
        kind: "LongStride",
        message: `${d}: a ${lengthCm.toFixed(0)} cm stride at beat ${beat} in ${call.figure.id}`,
        call: call.id,
        dancer: d,
        beat,
      });
    }
    const stepping = step.lengthPx > limits.tolerancePx;
    const pivotCap = stepping ? limits.maxPivotSteppingDeg : limits.maxPivotStandingDeg;
    if (Math.abs(step.pivot) > pivotCap + 1e-9) {
      errors.push({
        kind: "PivotTooLarge",
        message: `${d}: a ${Math.abs(step.pivot).toFixed(0)}° turn ${stepping ? "while stepping" : "standing"} at beat ${beat} in ${call.figure.id}`,
        call: call.id,
        dancer: d,
        beat,
        span: call.span,
      });
    }
    if (stepping) {
      emit(d, beat, 0, { op: "step", foot: "R", to: step.to, lengthCm }, call.id, window, inst);
    } else {
      emit(d, beat, 0, { op: "stand" }, call.id, window, inst);
    }
    if (Math.abs(step.pivot) > 1e-9) {
      emit(d, beat, 0, { op: "pivot", deg: step.pivot }, call.id, window, inst);
    }
  };
  const emitLook = (
    d: DancerId,
    beat: number,
    inst: Instance,
    call: CompiledCall,
    window: WindowName,
    bodyBeat: number,
  ): void => {
    emit(
      d,
      beat,
      0,
      { op: "look", at: lookAt(inst, call, d, bodyBeat, floor) },
      call.id,
      window,
      inst,
    );
  };

  // ---- the cruise ramp -----------------------------------------------------------

  /** Whether this dancer took a step in the beat before `beat`. */
  const wasStepping = (d: DancerId, beat: number): boolean =>
    (slots.get(d)?.get(slotKey(beat - 1, 0))?.instrs ?? []).some((i) => i.op === "step");
  /** Whether this dancer stands still once the instance ends: no next call, or one whose body does not walk. */
  const stopsAfter = (inst: Instance, d: DancerId): boolean => {
    const next = neighbourOf(inst, d, 1);
    if (!next) return true;
    const kind = next.figure.windows[0]?.kind;
    return (
      next.nobody ||
      kind === undefined ||
      kind === "stand" ||
      kind === "intrinsic" ||
      kind === "pivot"
    );
  };
  /** The fractions for a run of steps from `beat`, ramping at either end where the dancer is at rest. */
  const fractionsFor = (d: DancerId, beat: number, beats: number, rampDown: boolean): number[] =>
    stepFractions(beats, !wasStepping(d, beat), rampDown);

  // ---- geometry ---------------------------------------------------------------

  const poseOf = (d: DancerId): Pose => {
    const f = floor[d];
    if (!f) throw new Error(`dancer ${d} is not on the floor`);
    return { p: f.p, facing: f.facing };
  };
  const setPose = (d: DancerId, pose: Pose): void => {
    const f = floor[d];
    if (!f) throw new Error(`dancer ${d} is not on the floor`);
    f.p = pose.p;
    f.facing = pose.facing;
  };
  const homeFacing = (d: DancerId): number => dialect.homeFacing?.(d) ?? poseOf(d).facing;
  const castOf = (inst: Instance, d: DancerId, role: Role): DancerId | undefined =>
    role === "self" ? d : inst.calls.get(d)?.cast[role];

  /** The windows of a body and the beats each gets, in order. */
  const windowSpans = (
    inst: Instance,
    from: number,
    to: number,
  ): { window: Window; from: number; to: number }[] => {
    const windows = inst.figure.windows;
    const n = to - from;
    if (windows.length === 0 || n <= 0) return [];
    const shares = windows.map((w) => w.beats ?? 1);
    const total = shares.reduce((a, b) => a + b, 0);
    const spans: { window: Window; from: number; to: number }[] = [];
    let at = from;
    windows.forEach((window, i) => {
      const last = i === windows.length - 1;
      const beats = last ? to - at : Math.round((n * (shares[i] ?? 1)) / total);
      spans.push({ window, from: at, to: at + beats });
      at += beats;
    });
    return spans;
  };

  /** The circle an orbit body runs on: the IR's radius, kept inside the `pre`'s spacing for a midpoint orbit. */
  const orbitRadius = (
    inst: Instance,
    w: Extract<Window, { kind: "orbit" }>,
    dancers: DancerId[],
  ): number => {
    if (w.axis !== "midpoint" || dancers.length !== 2) return w.radiusPx;
    const apart = inst.figure.pre.arrangement.find((c) => c.kind === "apart" && c.who === "self");
    if (apart && apart.kind === "apart") {
      const [a, b] = dancers as [DancerId, DancerId];
      const half = dist(poseOf(a).p, poseOf(b).p) / 2;
      return Math.min(Math.max(half, apart.minPx / 2), apart.maxPx / 2);
    }
    return w.radiusPx;
  };

  /**
   * Where each dancer stands and faces when the instance's body starts,
   * from the floor as it is now: an orbit's points on its circle, or the
   * `pre` arrangement for any other body.
   */
  const bodyTargets = (inst: Instance): Map<DancerId, Pose> => {
    const targets = new Map<DancerId, Pose>();
    const first = inst.figure.windows[0];
    const orbit = first?.kind === "orbit" ? first : undefined;
    if (orbit && !inst.nobody) {
      const dancers = orbit.who
        ? inst.dancers.filter((d) => roleMatches(inst, d, orbit.who))
        : inst.dancers;
      if (dancers.length >= 2) {
        const axis = centroid(dancers.map((d) => poseOf(d).p));
        const call0 = inst.calls.get(dancers[0] as DancerId) as CompiledCall;
        const sign = orbitSign(resolveChoice(orbit.sense, call0.params));
        const r = orbitRadius(inst, orbit, dancers);

        // Even the ring out from the first dancer's bearing, in ring order.
        const theta0 = bearing(axis, poseOf(dancers[0] as DancerId).p);
        const ordered = ringOrder(inst, dancers, axis);
        ordered.forEach((d, i) => {
          const theta = theta0 + (sign * 360 * i) / ordered.length;
          const p: Vec2 = [axis[0] + r * dirOf(theta)[0], axis[1] + r * dirOf(theta)[1]];
          targets.set(d, {
            p,
            facing: orbitFacing(orbit, theta, sign, poseOf(d).facing, () => {
              const partner = castOf(inst, d, "partner");
              return partner ? bearing(p, poseOf(partner).p) : poseOf(d).facing;
            }),
          });
        });
        // With the facing fixed each faces where the other will stand (a do-si-do).
        if (orbit.facing === "fixed" && ordered.length === 2) {
          const [a, b] = ordered as [DancerId, DancerId];
          const ta = targets.get(a) as Pose;
          const tb = targets.get(b) as Pose;
          ta.facing = bearing(ta.p, tb.p);
          tb.facing = bearing(tb.p, ta.p);
        }
        for (const d of inst.dancers) if (!targets.has(d)) targets.set(d, poseOf(d));
        return targets;
      }
    }
    for (const d of inst.dancers)
      targets.set(d, arrangementTarget(inst, d, inst.figure.pre.arrangement));
    return targets;
  };

  /** A pose satisfying an arrangement's clauses for `self`, from where they stand. */
  const arrangementTarget = (
    inst: Instance,
    d: DancerId,
    clauses: readonly FigureIR["pre"]["arrangement"][number][],
  ): Pose => {
    const me = poseOf(d);
    let p = me.p;
    let facing = me.facing;
    if (inst.nobody) return me;
    for (const clause of clauses) {
      if (clause.who !== "self") continue;
      if (clause.kind === "facing") {
        if (clause.toward === "home") facing = homeFacing(d);
        else {
          const other = castOf(inst, d, clause.toward);
          if (other) facing = bearing(p, poseOf(other).p);
        }
      }
      if (clause.kind === "apart") {
        const other = castOf(inst, d, clause.from);
        if (!other) continue;
        const op = poseOf(other).p;
        const d0 = dist(me.p, op);
        const want = Math.min(Math.max(d0, clause.minPx), clause.maxPx);
        if (Math.abs(want - d0) > 1e-9 && d0 > 1e-9) {
          const mid = midpoint(me.p, op);
          const dir = dirOf(bearing(mid, me.p));
          p = [mid[0] + dir[0] * (want / 2), mid[1] + dir[1] * (want / 2)];
        }
      }
      if (clause.kind === "beside") {
        const other = castOf(inst, d, clause.of);
        if (!other) continue;
        const side = clause.side === "as-couple" ? dialect.sideOf?.(d, other) : clause.side;
        if (!side) continue;
        const mid = midpoint(me.p, poseOf(other).p);
        const f = clauses.some((c) => c.kind === "facing" && c.toward === "home")
          ? homeFacing(d)
          : facing;
        const lateral = side === "left" ? leftOf(f) : rightOf(f);
        p = [
          mid[0] + lateral[0] * (clause.spacingPx / 2),
          mid[1] + lateral[1] * (clause.spacingPx / 2),
        ];
        facing = f;
      }
    }
    return { p, facing };
  };

  // ---- the body ----------------------------------------------------------------

  /**
   * The negotiated exit of an orbit: over its last `beats`, the orbit's own
   * points are blended toward where the next figure starts, so the body
   * spirals out to the next `pre` instead of stopping and stepping to it.
   */
  interface ExitBlend {
    beats: number;
    targets: Map<DancerId, Pose>;
  }

  const emitBody = (
    inst: Instance,
    from: number,
    to: number,
    start: Map<DancerId, Pose>,
    blend?: ExitBlend,
  ): void => {
    inst.bodyEnd = new Map();
    for (const d of inst.dancers) setPose(d, start.get(d) as Pose);
    if (to - from <= 0 || inst.nobody) {
      if (inst.nobody) {
        for (const d of inst.dancers) {
          const call = inst.calls.get(d) as CompiledCall;
          for (let beat = from; beat < to; beat++) {
            emit(d, beat, 0, { op: "stand" }, call.id, "body", inst);
            emitLook(d, beat, inst, call, "body", beat - from);
          }
        }
      }
      for (const d of inst.dancers) inst.bodyEnd.set(d, poseOf(d));
      return;
    }
    for (const span of windowSpans(inst, from, to)) {
      const n = span.to - span.from;
      if (n <= 0) continue;
      const w = span.window;
      const dancers = w.who
        ? inst.dancers.filter((d) => roleMatches(inst, d, w.who))
        : inst.dancers;
      const idle = inst.dancers.filter((d) => !dancers.includes(d));
      // A dancer no window names in this span stands and looks.
      for (const d of idle) {
        const call = inst.calls.get(d) as CompiledCall;
        for (let k = 0; k < n; k++) {
          const key = slotKey(span.from + k, 0);
          if (slots.get(d)?.get(key)) continue;
          emit(d, span.from + k, 0, { op: "stand" }, call.id, "body", inst);
          emitLook(d, span.from + k, inst, call, "body", span.from + k - from);
        }
      }
      switch (w.kind) {
        case "orbit":
          emitOrbit(inst, w, span.from, n, dancers, from, span.to === to ? blend : undefined);
          break;
        case "walk":
          for (const d of dancers) {
            const call = inst.calls.get(d) as CompiledCall;
            const me = poseOf(d);
            const dir = walkDirection(w.direction, me.facing);
            const target: Pose = {
              p: [me.p[0] + dir[0] * w.distancePx, me.p[1] + dir[1] * w.distancePx],
              facing: me.facing,
            };
            const steps = planSteps(me, target, n, limits) ?? [];
            if (steps.length === 0 && dist(me.p, target.p) > limits.tolerancePx) {
              errors.push({
                kind: "StepTooLong",
                message: `${d}: ${inst.figure.id} walks ${(w.distancePx * tempo.cmPerPx).toFixed(0)} cm in ${n} beats`,
                call: call.id,
                dancer: d,
                beat: span.from,
                span: call.span,
              });
            }
            steps.forEach((step, k) => {
              emitStep(d, span.from + k, step, call, "body", inst);
              emitLook(d, span.from + k, inst, call, "body", span.from + k - from);
            });
            setPose(d, target);
          }
          break;
        case "pass":
          for (const d of dancers) {
            const call = inst.calls.get(d) as CompiledCall;
            const other = castOf(inst, d, "partner");
            if (!other) continue;
            const me = poseOf(d);
            const dest = (start.get(other) ?? poseOf(other)).p;
            // A dancer crossing to where the other stood, veering to their own
            // left to pass right shoulders (right to pass left).
            const veer =
              w.shoulder === "right" ? leftOf(bearing(me.p, dest)) : rightOf(bearing(me.p, dest));
            const heading = bearing(me.p, dest);
            const shares = fractionsFor(d, span.from, n, span.to !== to || stopsAfter(inst, d));
            let prev: Pose = me;
            let t = 0;
            for (let k = 1; k <= n; k++) {
              t = k === n ? 1 : t + (shares[k - 1] ?? 0);
              const along: Vec2 = [
                me.p[0] + (dest[0] - me.p[0]) * t,
                me.p[1] + (dest[1] - me.p[1]) * t,
              ];
              const bow = PASS_VEER_PX * Math.sin(Math.PI * t);
              const p: Vec2 = [along[0] + veer[0] * bow, along[1] + veer[1] * bow];
              const facingRaw = k === n ? heading : bearing(prev.p, p);
              const facing = prev.facing + angleDiff(prev.facing, facingRaw);
              const step: PlannedStep = {
                to: p,
                facing,
                pivot: angleDiff(prev.facing, facing),
                lengthPx: dist(prev.p, p),
              };
              emitStep(d, span.from + k - 1, step, call, "body", inst);
              emitLook(d, span.from + k - 1, inst, call, "body", span.from + k - 1 - from);
              prev = { p, facing };
            }
            setPose(d, prev);
          }
          break;
        case "pivot":
          for (const d of dancers) {
            const call = inst.calls.get(d) as CompiledCall;
            const me = poseOf(d);
            let facing = me.facing;
            for (let k = 0; k < n; k++) {
              const pivot = w.deg / n;
              facing += pivot;
              emitStep(
                d,
                span.from + k,
                { to: me.p, facing, pivot, lengthPx: 0 },
                call,
                "body",
                inst,
              );
              emitLook(d, span.from + k, inst, call, "body", span.from + k - from);
            }
            setPose(d, { p: me.p, facing });
          }
          break;
        case "stand":
          for (const d of dancers) {
            const call = inst.calls.get(d) as CompiledCall;
            for (let k = 0; k < n; k++) {
              emit(d, span.from + k, 0, { op: "stand" }, call.id, "body", inst);
              emitLook(d, span.from + k, inst, call, "body", span.from + k - from);
            }
          }
          break;
        case "intrinsic":
          for (const d of dancers) {
            const call = inst.calls.get(d) as CompiledCall;
            for (const line of w.lines) {
              if (!roleMatches(inst, d, line.who)) continue;
              if (line.beat >= n) {
                warnings.push({
                  kind: "IntrinsicTruncated",
                  message: `${inst.figure.id}: an authored line at beat ${line.beat} falls outside its ${n} beats`,
                  call: call.id,
                  dancer: d,
                  beat: span.from + line.beat,
                });
                continue;
              }
              const instr: Instr =
                line.op.kind === "stand"
                  ? { op: "stand" }
                  : line.op.kind === "lean"
                    ? { op: "lean", deg: line.op.deg }
                    : { op: "look", at: resolveLook(line.op.at, call, d, floor) };
              emit(d, span.from + line.beat, line.half, instr, call.id, "body", inst);
            }
            for (let k = 0; k < n; k++) {
              if (slots.get(d)?.get(slotKey(span.from + k, 0))) continue;
              emit(d, span.from + k, 0, { op: "stand" }, call.id, "body", inst);
              emitLook(d, span.from + k, inst, call, "body", span.from + k - from);
            }
          }
          break;
      }
    }
    for (const d of inst.dancers) inst.bodyEnd.set(d, poseOf(d));
  };

  const emitOrbit = (
    inst: Instance,
    w: Extract<Window, { kind: "orbit" }>,
    from: number,
    n: number,
    dancers: DancerId[],
    bodyFrom: number,
    blend?: ExitBlend,
  ): void => {
    if (dancers.length < 2) return;
    const axis = centroid(dancers.map((d) => poseOf(d).p));
    const call0 = inst.calls.get(dancers[0] as DancerId) as CompiledCall;
    const sign = orbitSign(resolveChoice(w.sense, call0.params));
    const theta0 = new Map(dancers.map((d) => [d, bearing(axis, poseOf(d).p)]));
    const r = dist(axis, poseOf(dancers[0] as DancerId).p);
    let turns: number;
    if (w.turns === "free") {
      turns = freeTurns(inst, w, dancers, axis, sign, n);
    } else {
      turns = resolveNumber(w.turns, call0.params);
    }
    let rate = turns / n;
    if (rate > w.rateMaxTurnsPerBeat + 1e-9) {
      errors.push({
        kind: "RateTooHigh",
        message: `${inst.figure.id}: ${turns} turn(s) in ${n} beats is ${rate.toFixed(3)} turns/beat, over ${w.rateMaxTurnsPerBeat}`,
        call: call0.id,
        span: call0.span,
      });
      rate = w.rateMaxTurnsPerBeat;
      turns = rate * n;
    }
    inst.rate = rate;
    if (w.buzz) {
      for (const d of dancers) {
        const call = inst.calls.get(d) as CompiledCall;
        emit(d, from, 0, { op: "buzz", on: true }, call.id, "body", inst);
        emit(d, from + n - 1, 1, { op: "buzz", on: false }, call.id, "body", inst);
      }
    }
    // The orbit's own cruise ramp: half a step to start from standing, half a
    // step to stop; `progress[k]` is how far round the body is after step k.
    const lastWindow = from + n === inst.end - inst.exit || blend !== undefined;
    const shares = fractionsFor(
      dancers[0] as DancerId,
      from,
      n,
      lastWindow && !blend && stopsAfter(inst, dancers[0] as DancerId),
    );
    const progress: number[] = [0];
    for (const f of shares) progress.push((progress[progress.length - 1] ?? 0) + f);
    const posAt = (d: DancerId, k: number): Vec2 => {
      const theta = (theta0.get(d) ?? 0) + sign * 360 * turns * (progress[k] ?? 1);
      return [axis[0] + r * dirOf(theta)[0], axis[1] + r * dirOf(theta)[1]];
    };
    for (const d of dancers) {
      const call = inst.calls.get(d) as CompiledCall;
      const startFacing = poseOf(d).facing;
      const target = blend?.targets.get(d);
      let prev: Pose = poseOf(d);
      let spiralFacing: number | undefined;
      for (let k = 1; k <= n; k++) {
        const theta = (theta0.get(d) ?? 0) + sign * 360 * turns * (progress[k] ?? 1);
        let p = posAt(d, k);
        let facing = orbitFacing(w, theta, sign, startFacing, () => {
          const partner = castOf(inst, d, "partner");
          return partner && dancers.includes(partner) ? bearing(p, posAt(partner, k)) : startFacing;
        });
        const exiting = blend !== undefined && target !== undefined && k > n - blend.beats;
        if (exiting && target) {
          // Spiral out: the last `blend.beats` steps lean toward the next
          // figure's start, the final one landing on it exactly. The facing
          // turns from where it was when the spiral began straight to the
          // target's, spread evenly, rather than riding the orbit's own turn
          // as well (which stacked the two into one 113° step).
          const i = k - (n - blend.beats);
          const sBlend = i >= blend.beats ? 1 : smoothstep(i / blend.beats);
          // Blend in polar coordinates about the axis, so the orbit keeps its
          // tangential pace while the radius and the bearing ease toward the
          // target's; a Cartesian blend lengthens one step and shortens the next.
          const rT = dist(axis, target.p);
          const thetaEnd = (theta0.get(d) ?? 0) + sign * 360 * turns;
          const thetaT = thetaEnd + angleDiff(thetaEnd, bearing(axis, target.p));
          const rK = r + (rT - r) * sBlend;
          const thetaK = theta + (thetaT - thetaEnd) * sBlend;
          p = [axis[0] + rK * dirOf(thetaK)[0], axis[1] + rK * dirOf(thetaK)[1]];
          if (i >= blend.beats) p = target.p;
          spiralFacing ??= prev.facing;
          facing = spiralFacing + angleDiff(spiralFacing, target.facing) * (i / blend.beats);
        }
        // Keep the facing on one continuous branch from step to step.
        facing = prev.facing + angleDiff(prev.facing, facing);
        const step: PlannedStep = {
          to: p,
          facing,
          pivot: angleDiff(prev.facing, facing),
          lengthPx: dist(prev.p, p),
        };
        emitStep(d, from + k - 1, step, call, exiting ? "exit" : "body", inst);
        emitLook(d, from + k - 1, inst, call, exiting ? "exit" : "body", from + k - 1 - bodyFrom);
        prev = { p, facing };
      }
      setPose(d, prev);
    }
  };

  /**
   * How far a `free` orbit goes: enough turns that the body ends where the
   * `post` arrangement wants everyone, as many times round as the rate
   * allows. The swing's canonical case: the couple comes out beside each other
   * facing home, however many times they went round.
   */
  const freeTurns = (
    inst: Instance,
    w: Extract<Window, { kind: "orbit" }>,
    dancers: DancerId[],
    axis: Vec2,
    sign: number,
    n: number,
  ): number => {
    const d0 = dancers[0] as DancerId;
    const post = arrangementTarget(inst, d0, inst.figure.post.arrangement);
    const thetaEnd = bearing(axis, post.p);
    const theta0 = bearing(axis, poseOf(d0).p);
    let fraction = (((thetaEnd - theta0) * sign) % 360) / 360;
    if (fraction < 0) fraction += 1;
    const maxTurns = w.rateMaxTurnsPerBeat * n;
    const minTurns = (w.rateMinTurnsPerBeat ?? 0) * n;
    let turns = fraction;
    while (turns + 1 <= maxTurns + 1e-9) turns += 1;
    if (turns < minTurns)
      inst.notes.push(
        `orbit: only ${turns.toFixed(2)} turns fit, under the ${minTurns.toFixed(2)} wanted`,
      );
    inst.notes.push(`orbit: ${turns.toFixed(2)} turns so the exit lands on the post`);
    return turns;
  };

  // ---- walks (entry and exit) --------------------------------------------------

  const emitWalk = (
    inst: Instance,
    from: number,
    beats: number,
    poses: Map<DancerId, Pose>,
    targets: Map<DancerId, Pose>,
    window: WindowName,
  ): boolean => {
    let ok = true;
    for (const d of inst.dancers) {
      const call = inst.calls.get(d) as CompiledCall;
      const a = poses.get(d) as Pose;
      const t = targets.get(d) as Pose;
      const rampDown =
        window === "exit"
          ? false
          : !["orbit", "walk", "pass"].includes(inst.figure.windows[0]?.kind ?? "");
      const steps = planSteps(a, t, beats, limits, fractionsFor(d, from, beats, rampDown));
      if (!steps) {
        ok = false;
        continue;
      }
      steps.forEach((step, i) => {
        emitStep(d, from + i, step, call, window, inst);
        emitLook(d, from + i, inst, call, window, window === "entry" ? 0 : Infinity);
      });
      setPose(d, t);
    }
    return ok;
  };

  // ---- the seams ------------------------------------------------------------------

  const takeHands = (inst: Instance): SeamKind => {
    let seam: SeamKind = "none";
    const done = new Set<string>();
    for (const d of inst.dancers) {
      const call = inst.calls.get(d) as CompiledCall;
      for (const need of holdNeeds(inst.figure.pre, call, d)) {
        const pairKey = [need.dancer, need.with].sort().join("+") + ":" + need.hold;
        if (done.has(pairKey)) continue;
        done.add(pairKey);
        const fd = floor[need.dancer];
        const fo = floor[need.with];
        if (!fd || !fo) continue;
        const current = handState(fd, need.hand);
        if (sameHold(current, { hold: need.hold, with: need.with })) {
          seam = "carried";
          inst.notes.push(`${need.hold} with ${need.with} carried: already held`);
          continue;
        }
        const otherNeed = counterpartNeed(inst, need);
        const reach = dist(fd.p, fo.p);
        if (reach > 2 * (ARM_REACH_PX - 4) + 1e-9 && inst.entry === 0) {
          errors.push({
            kind: "TakeOutOfReach",
            message: `${need.dancer} and ${need.with} are ${(reach * tempo.cmPerPx).toFixed(0)} cm apart at the ${need.hold} take`,
            call: call.id,
            dancer: need.dancer,
            beat: inst.start,
            span: call.span,
          });
        }
        const prev = neighbourOf(inst, need.dancer, -1);
        const prevOther = neighbourOf(inst, need.with, -1);
        // The take ramps over TAKE_BEATS and lands on the beat the body needs
        // it, so it starts that many beats back — inside the previous figure
        // when both dancers' hands are free there for that long.
        const freeBefore =
          prev !== undefined &&
          prevOther !== undefined &&
          prev.end === inst.start &&
          prevOther.end === inst.start &&
          prev.start <= inst.start - TAKE_BEATS &&
          prevOther.start <= inst.start - TAKE_BEATS &&
          current === undefined &&
          handState(fo, otherNeed.hand) === undefined;
        const instr: Instr = { op: "hold", hand: need.hand, with: need.with, hold: need.hold };
        const instrOther: Instr = {
          op: "hold",
          hand: otherNeed.hand,
          with: need.dancer,
          hold: need.hold,
        };
        if (freeBefore && inst.entry === 0) {
          const at = inst.start - TAKE_BEATS;
          const prevCall = prev.calls.get(need.dancer) as CompiledCall;
          const prevCallOther = prevOther.calls.get(need.with) as CompiledCall;
          emit(
            need.dancer,
            at,
            0,
            instr,
            prevCall.id,
            at >= prev.end - prev.exit ? "exit" : "body",
          );
          emit(
            need.with,
            at,
            0,
            instrOther,
            prevCallOther.id,
            at >= prevOther.end - prevOther.exit ? "exit" : "body",
          );
          seam = "take-overlapped";
          inst.notes.push(
            `take ${need.hand} hands with ${need.with} (${need.hold}) overlapped on the last ${TAKE_BEATS} beats of ${prev.figure.id}: hands were free`,
          );
        } else {
          if (inst.entry === 0) inst.entry = 1;
          emit(need.dancer, inst.start, 0, instr, call.id, "entry", inst);
          emit(
            need.with,
            inst.start,
            0,
            instrOther,
            (inst.calls.get(need.with) as CompiledCall).id,
            "entry",
            inst,
          );
          seam = "take";
          inst.notes.push(`take ${need.hand} hands with ${need.with} (${need.hold}) in the entry`);
        }
        setHand(fd, need.hand, { hold: need.hold, with: need.with });
        setHand(fo, otherNeed.hand, { hold: need.hold, with: need.dancer });
      }
    }
    return seam;
  };

  const dropHands = (inst: Instance): SeamKind => {
    let seam: SeamKind = "none";
    for (const d of inst.dancers) {
      const call = inst.calls.get(d) as CompiledCall;
      const fd = floor[d];
      if (!fd) continue;
      const keeps = holdNeeds(inst.figure.post, call, d);
      const next = neighbourOf(inst, d, 1);
      const nextCall = next?.calls.get(d);
      const nextNeeds = next && nextCall ? holdNeeds(next.figure.pre, nextCall, d) : [];
      for (const hand of ["right", "left"] as const) {
        const held = handState(fd, hand);
        if (!held) continue;
        if (keeps.some((k) => k.hand === hand && sameHold(held, { hold: k.hold, with: k.with })))
          continue;
        const wanted = nextNeeds.find((k) => k.hand === hand);
        if (wanted && sameHold(held, { hold: wanted.hold, with: wanted.with })) continue; // carried
        const instr: Instr = { op: "drop", hand };
        if (!wanted && next && next.start === inst.end) {
          emit(d, inst.end, 0, instr, nextCall?.id ?? call.id, "entry");
          seam = "drop-overlapped";
          inst.notes.push(
            `${d}: let go ${hand} hand overlapped on the first beat of ${next.figure.id}`,
          );
        } else {
          emit(d, inst.end - 1, 0, instr, call.id, "exit");
          seam = "drop";
          inst.notes.push(`${d}: let go ${hand} hand in the last beat`);
        }
        setHand(fd, hand, undefined);
      }
    }
    return seam;
  };

  // ---- the main loop ---------------------------------------------------------------

  for (const inst of instances) {
    inst.emitted = new Map(inst.dancers.map((d) => [d, []]));
    inst.replannable =
      !inst.nobody && ["orbit", "walk"].includes(inst.figure.windows[0]?.kind ?? "");
    if (inst.nobody) inst.notes.push(`nobody to ${inst.figure.id} with: stand`);

    let targets = bodyTargets(inst);
    let need = 0;
    for (const d of inst.dancers)
      need = Math.max(need, beatsNeeded(poseOf(d), targets.get(d) as Pose, limits));

    // Back-chain: can the previous instance's body give up `need` beats for an exit?
    const prevs = [...new Set(inst.dancers.map((d) => neighbourOf(inst, d, -1)))];
    const prev = prevs.length === 1 ? prevs[0] : undefined;
    const prevShared =
      prev !== undefined &&
      prev.end === inst.start &&
      prev.dancers.length === inst.dancers.length &&
      inst.dancers.every((d) => prev.dancers.includes(d));
    if (need > 0 && prevShared && prev.replannable) {
      const prevKind = prev.figure.windows[prev.figure.windows.length - 1]?.kind;
      // A spiral over one beat is a corner; over two it is a curve. Give an
      // orbit's exit two beats whenever its body can spare them.
      let k = prevKind === "orbit" ? Math.max(need, SPIRAL_MIN_BEATS) : need;
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const bodyBeats = prev.end - prev.start - prev.entry - k;
        if (bodyBeats < prev.figure.beats.min) break;
        for (const d of prev.dancers) retract(prev, d);
        if (prevKind === "orbit") {
          // An orbit spirals out over its last k beats to where this figure
          // starts: the exit is inside the body's motion, not a walk after it.
          emitBody(prev, prev.start + prev.entry, prev.end, prev.bodyStart, { beats: k, targets });
          const landed = prev.dancers.every(
            (d) => beatsNeeded(poseOf(d), targets.get(d) as Pose, limits) === 0,
          );
          if (!landed) {
            k += 1;
            continue;
          }
          prev.exit = k;
          prev.notes.push(
            `exit: the last ${k} beat${k === 1 ? "" : "s"} spiral out to where ${inst.figure.id} starts`,
          );
          for (const d of prev.dancers) prev.bodyEnd.set(d, poseOf(d));
          need = 0;
          done = true;
          continue;
        }
        emitBody(prev, prev.start + prev.entry, prev.end - k, prev.bodyStart);
        const fromPoses = new Map<DancerId, Pose>(
          prev.dancers.map((d) => [d, prev.bodyEnd.get(d) as Pose]),
        );
        const newTargets = bodyTargets(inst);
        let k2 = 0;
        for (const d of inst.dancers)
          k2 = Math.max(
            k2,
            beatsNeeded(fromPoses.get(d) as Pose, newTargets.get(d) as Pose, limits),
          );
        if (k2 > k) {
          k = k2;
          continue;
        }
        emitWalk(prev, prev.end - k, k, fromPoses, newTargets, "exit");
        prev.exit = k;
        prev.notes.push(
          `exit: ${k} beat${k === 1 ? "" : "s"} re-planned to land where ${inst.figure.id} starts`,
        );
        targets = newTargets;
        need = 0;
        done = true;
      }
      if (!done) {
        for (const d of prev.dancers) retract(prev, d);
        emitBody(prev, prev.start + prev.entry, prev.end, prev.bodyStart);
        prev.exit = 0;
        targets = bodyTargets(inst);
        need = 0;
        for (const d of inst.dancers)
          need = Math.max(need, beatsNeeded(poseOf(d), targets.get(d) as Pose, limits));
        inst.notes.push(
          `${prev.figure.id} could not give up its beats; this figure pays its entry`,
        );
      }
    }

    inst.entry = need;
    if (need > 0) {
      const fromPoses = new Map<DancerId, Pose>(inst.dancers.map((d) => [d, poseOf(d)]));
      emitWalk(inst, inst.start, need, fromPoses, targets, "entry");
      inst.notes.push(`entry: ${need} beat${need === 1 ? "" : "s"} to reach the body's start`);
    } else if (!inst.nobody) {
      inst.notes.push(`entry: 0 — already where the body starts`);
    }
    inst.seamIn = inst.nobody ? "none" : takeHands(inst);

    const bodyStart = inst.start + inst.entry;
    const bodyBeats = inst.end - bodyStart;
    if (!inst.nobody && bodyBeats < inst.figure.beats.min) {
      const call = inst.calls.get(inst.dancers[0] as DancerId) as CompiledCall;
      errors.push({
        kind: "TimingViolation",
        message: `${inst.figure.id} at beat ${inst.start} has ${bodyBeats} beat${bodyBeats === 1 ? "" : "s"} for its body after a ${inst.entry}-beat entry; it needs ${inst.figure.beats.min}`,
        call: call.id,
        beat: inst.start,
        span: call.span,
      });
    }
    inst.bodyStart = new Map(targets);
    emitBody(inst, bodyStart, inst.end, targets);
    inst.exit = 0;
    inst.seamOut = inst.nobody ? "none" : dropHands(inst);
  }

  // ---- assemble ------------------------------------------------------------------------

  const programs: Record<DancerId, Program> = {};
  const calls: Record<DancerId, ScheduledCall[]> = {};
  let endBeat = 0;
  for (const d of dialect.dancers) {
    const list = [...(slots.get(d)?.values() ?? [])].sort(
      (x, y) => x.beat - y.beat || x.half - y.half,
    );
    // Feet alternate over the whole program, right foot first, whatever the
    // re-planning above did to the order the steps were emitted in.
    let foot: Foot = "R";
    const footed = list.map((slot) => ({
      ...slot,
      instrs: slot.instrs.map((instr) => {
        if (instr.op !== "step") return instr;
        const stepped: Instr = { ...instr, foot };
        foot = foot === "R" ? "L" : "R";
        return stepped;
      }),
    }));
    programs[d] = { dancer: d, slots: footed };
    calls[d] = [];
    for (const inst of instances) {
      const call = inst.calls.get(d);
      if (!call) continue;
      endBeat = Math.max(endBeat, inst.end);
      const sc: ScheduledCall = {
        dancer: d,
        call,
        entry: [inst.start, inst.start + inst.entry],
        body: [inst.start + inst.entry, inst.end - inst.exit],
        exit: [inst.end - inst.exit, inst.end],
        seamIn: inst.seamIn,
        seamOut: inst.seamOut,
        notes: inst.notes,
      };
      if (inst.rate !== undefined) sc.rate = inst.rate;
      calls[d].push(sc);
    }
    calls[d].sort((x, y) => x.call.start - y.call.start);
  }
  return { calls, programs, errors, warnings, endBeat };
}

// ---- helpers ------------------------------------------------------------------------------

/** How far a passing dancer veers off the straight line, px. */
const PASS_VEER_PX = 3;

/** The fewest beats an orbit spirals out over, when its body can spare them. */
const SPIRAL_MIN_BEATS = 2;

/**
 * Elision (D8, DA14): a call whose counterpart is nobody and whose figure says
 * `casts.partner: "elide"` is removed and its beats go to the next call
 * (`stretch`) or become a stand (`wait`, kept as a call the scheduler stands).
 */
function elide(sequence: CompiledSequence): Record<DancerId, CompiledCall[]> {
  const out: Record<DancerId, CompiledCall[]> = {};
  for (const [d, list] of Object.entries(sequence.perDancer)) {
    const kept: CompiledCall[] = [];
    let carry = 0;
    for (const call of list) {
      if (
        isNobody(call) &&
        call.figure.casts.partner === "elide" &&
        call.figure.elide === "stretch"
      ) {
        carry += call.beats;
        continue;
      }
      if (carry > 0) {
        kept.push({ ...call, start: call.start - carry, beats: call.beats + carry });
        carry = 0;
      } else {
        kept.push(call);
      }
    }
    if (carry > 0) {
      const last = kept[kept.length - 1];
      if (last)
        kept[kept.length - 1] = { ...last, end: last.end + carry, beats: last.beats + carry };
    }
    out[d] = kept;
  }
  return out;
}

/** Whether a call is missing the counterpart or group its figure needs. */
function isNobody(call: CompiledCall): boolean {
  const wantsDancer = call.figure.params.some((p) => p.kind === "dancer");
  const wantsGroup = call.figure.params.some((p) => p.kind === "group");
  return (
    (wantsDancer && call.cast.partner === undefined) || (wantsGroup && call.group === undefined)
  );
}

/** Group each dancer's calls into figure instances: same figure, same span, cast together. */
function groupInstances(perDancer: Record<DancerId, CompiledCall[]>): Instance[] {
  const byKey = new Map<string, Instance>();
  for (const [d, list] of Object.entries(perDancer)) {
    for (const call of list) {
      const nobody = isNobody(call);
      const members = nobody
        ? [d]
        : call.group
          ? [...call.group].sort()
          : [d, call.cast.partner as DancerId].sort();
      const key = `${call.figure.id}@${call.start}-${call.end}:${members.join("+")}`;
      let inst = byKey.get(key);
      if (!inst) {
        inst = {
          key,
          figure: call.figure,
          start: call.start,
          end: call.end,
          dancers: [],
          calls: new Map(),
          entry: 0,
          exit: 0,
          notes: [],
          seamIn: "none",
          seamOut: "none",
          emitted: new Map(),
          bodyStart: new Map(),
          bodyEnd: new Map(),
          replannable: false,
          nobody,
        };
        byKey.set(key, inst);
      }
      inst.dancers.push(d);
      inst.calls.set(d, call);
    }
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
}

function roleMatches(inst: Instance, d: DancerId, role: Role | undefined): boolean {
  if (role === undefined || role === "self") return true;
  // A role-scoped window (`who: "partner"`) means "the dancer cast as that
  // role from the first dancer's point of view" — used by figures whose two
  // roles do different things. Tonight's figures use `who` only with `self`.
  const first = inst.dancers[0] as DancerId;
  return inst.calls.get(first)?.cast[role] === d;
}

const smoothstep = (k: number): number => {
  const c = k < 0 ? 0 : k > 1 ? 1 : k;
  return c * c * (3 - 2 * c);
};

const centroid = (points: Vec2[]): Vec2 => {
  const sum = points.reduce<[number, number]>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
};

const orbitSign = (sense: string): number =>
  sense === "partner-on-right" || sense === "left" ? 1 : -1;

/**
 * The facing along an orbit at angle `theta` from the axis. Screen y is down,
 * so with `sign` +1 (the angle increasing) the tangent is `theta + 90°` and the
 * axis — and a counterpart across it — is on the dancer's right.
 */
function orbitFacing(
  w: Extract<Window, { kind: "orbit" }>,
  theta: number,
  sign: number,
  fixed: number,
  partner: () => number,
): number {
  switch (w.facing) {
    case "tangent":
      return theta + 90 * sign;
    case "inward":
      return theta + 180;
    case "partner":
      return partner();
    case "fixed":
      return fixed;
  }
}

/** The dancers of a ring in ring order: as the group lists them, else by bearing. */
function ringOrder(inst: Instance, dancers: DancerId[], axis: Vec2): DancerId[] {
  const first = dancers[0] as DancerId;
  const group = inst.calls.get(first)?.group;
  if (group && group.length === dancers.length && group.every((d) => dancers.includes(d)))
    return [...group];
  void axis;
  return dancers;
}

function walkDirection(direction: "forward" | "back" | "left" | "right", facing: number): Vec2 {
  switch (direction) {
    case "forward":
      return dirOf(facing);
    case "back":
      return dirOf(facing + 180);
    case "left":
      return leftOf(facing);
    case "right":
      return rightOf(facing);
  }
}

function counterpartNeed(inst: Instance, need: HoldNeed): HoldNeed {
  const call = inst.calls.get(need.with);
  if (call) {
    const theirs = holdNeeds(inst.figure.pre, call, need.with).find((n) => n.with === need.dancer);
    if (theirs) return theirs;
  }
  return {
    dancer: need.with,
    hand: need.hand === "right" ? "left" : "right",
    hold: need.hold,
    with: need.dancer,
  };
}

function lookAt(
  inst: Instance,
  call: CompiledCall,
  d: DancerId,
  bodyBeat: number,
  floor: Floor,
): LookAt {
  const rule =
    inst.figure.look.find(
      (r) =>
        r.role === "self" &&
        (r.from === undefined || bodyBeat >= r.from) &&
        (r.to === undefined || bodyBeat < r.to),
    ) ?? inst.figure.look.find((r) => r.role === "self" && r.from === undefined);
  const target: LookTarget = rule?.at ?? (call.cast.partner ? "partner" : "ahead");
  return resolveLook(target, call, d, floor);
}

function resolveLook(target: LookTarget, call: CompiledCall, d: DancerId, floor: Floor): LookAt {
  if (target === "partner" && call.cast.partner) return call.cast.partner;
  if (target === "down") return "down";
  return { deg: floor[d]?.facing ?? 0 };
}

export type { PxLimits };
