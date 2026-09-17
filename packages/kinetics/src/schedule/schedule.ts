import type { Vec2 } from "@caller/core";
import { ARM_REACH_PX, angleDiff, dirOf, dist } from "@caller/core";
import type { Foot, Instr, LookAt, Slot, WindowName } from "../asm/Instruction.js";
import type { Program } from "../asm/Program.js";
import type { DancerId, Dialect } from "../dialect/Dialect.js";
import type { FigureIR, LookTarget, Window } from "../ir/Figure.js";
import { resolveChoice, resolveNumber } from "../ir/Figure.js";
import type { CompiledCall, CompiledSequence } from "../lang/compile.js";
import type { Tempo } from "../units/Tempo.js";
import type { ScheduleError, ScheduleWarning } from "./errors.js";
import type { HoldNeed, SeamKind } from "./seams.js";
import { holdNeeds } from "./seams.js";
import type { DancerFloor, Floor, Pose } from "./state.js";
import { bearing, handState, initialFloor, midpoint, sameHold, setHand } from "./state.js";
import type { PlannedStep } from "./steps.js";
import { beatsNeeded, limitsAtTempo, planSteps } from "./steps.js";

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

/**
 * One figure instance: one figure danced by the dancers it casts together,
 * over one span. In the pair every call is an instance of two; a solo call
 * is an instance of one.
 */
interface Instance {
  key: string;
  figure: FigureIR;
  start: number;
  end: number;
  dancers: DancerId[];
  calls: Map<DancerId, CompiledCall>;
  /** Filled in as the instance is planned. */
  entry: number;
  exit: number;
  rate?: number;
  notes: string[];
  seamIn: SeamKind;
  seamOut: SeamKind;
  /** Slot keys this instance's body and exit emitted, so a re-plan can retract them. */
  emitted: Map<DancerId, string[]>;
  /** Where each dancer stands when the body starts (after the entry) and ends (before the exit). */
  bodyStart: Map<DancerId, Pose>;
  bodyEnd: Map<DancerId, Pose>;
  /** Whether the body can be re-planned over fewer beats to make room for an exit. */
  replannable: boolean;
}

export function schedule(sequence: CompiledSequence, dialect: Dialect, tempo: Tempo): Schedule {
  const limits = limitsAtTempo(tempo);
  const errors: ScheduleError[] = [];
  const warnings: ScheduleWarning[] = [];
  const floor = initialFloor(dialect);
  const slots = new Map<DancerId, Map<string, Slot>>();
  for (const d of dialect.dancers) slots.set(d, new Map());

  const perDancer = elide(sequence, warnings);
  const instances = groupInstances(perDancer);
  const byCall = new Map<string, Instance>();
  for (const inst of instances) {
    for (const [d, c] of inst.calls) byCall.set(`${d}:${c.id}`, inst);
  }
  const previousOf = (inst: Instance, d: DancerId): Instance | undefined => {
    const list = perDancer[d] ?? [];
    const i = list.findIndex((c) => c === inst.calls.get(d));
    const prev = list[i - 1];
    return prev ? byCall.get(`${d}:${prev.id}`) : undefined;
  };

  // ---- slot helpers ---------------------------------------------------------

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
    if (existing) {
      map.set(key, { ...existing, instrs: [...existing.instrs, instr] });
    } else {
      map.set(key, { beat, half, instrs: [instr], call, window });
      inst?.emitted.get(d)?.push(key);
    }
    if (inst && existing) inst.emitted.get(d)?.push(key);
  };
  const retract = (inst: Instance, d: DancerId): void => {
    const map = slots.get(d);
    const keys = inst.emitted.get(d) ?? [];
    for (const key of keys) map?.delete(key);
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
    if (
      Math.abs(step.pivot) > limits.maxPivotSteppingDeg + 1e-9 &&
      step.lengthPx > limits.tolerancePx
    ) {
      errors.push({
        kind: "PivotTooLarge",
        message: `${d}: a ${Math.abs(step.pivot).toFixed(0)}° turn while stepping at beat ${beat}`,
        call: call.id,
        dancer: d,
        beat,
        span: call.span,
      });
    }
    if (step.lengthPx > limits.tolerancePx) {
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

  // ---- targets ----------------------------------------------------------------

  /**
   * Where each dancer stands and faces when the instance's body starts,
   * from the floor as it is now: an orbit's points on its circle, or the
   * `pre` arrangement for a standing or intrinsic body.
   */
  const bodyTargets = (inst: Instance): Map<DancerId, Pose> => {
    const targets = new Map<DancerId, Pose>();
    const window = inst.figure.windows[0];
    if (inst.dancers.length === 2 && window?.kind === "orbit") {
      const [a, b] = inst.dancers as [DancerId, DancerId];
      const fa = floor[a];
      const fb = floor[b];
      if (!fa || !fb) throw new Error("dancer missing from floor");
      const callA = inst.calls.get(a);
      if (!callA) throw new Error("call missing");
      const axis = midpoint(fa.p, fb.p);
      const r = orbitRadius(inst.figure, window, fa, fb);
      const thetaA = bearing(axis, fa.p);
      const sense = resolveChoice(window.sense, callA.params);
      const sign = sense === "partner-on-right" ? 1 : -1;
      const poseOn = (theta: number, current: DancerFloor, other: Vec2): Pose => {
        const p: Vec2 = [axis[0] + r * dirOf(theta)[0], axis[1] + r * dirOf(theta)[1]];
        const facing = window.facing === "tangent" ? theta + 90 * sign : bearing(p, other);
        void current;
        return { p, facing };
      };
      const pa = poseOn(thetaA, fa, fb.p);
      const pb = poseOn(thetaA + 180, fb, fa.p);
      // With the facing fixed each faces where the other will stand.
      if (window.facing === "fixed") {
        pa.facing = bearing(pa.p, pb.p);
        pb.facing = bearing(pb.p, pa.p);
      }
      targets.set(a, pa);
      targets.set(b, pb);
      return targets;
    }
    // Standing, intrinsic, or solo: the `pre` arrangement from where they are.
    for (const d of inst.dancers) {
      const call = inst.calls.get(d);
      const fd = floor[d];
      if (!call || !fd) throw new Error("dancer missing");
      const partner = call.cast.partner;
      const fp = partner ? floor[partner] : undefined;
      let p = fd.p;
      let facing = fd.facing;
      for (const clause of inst.figure.pre.arrangement) {
        if (clause.who !== "self" || !fp) continue;
        if (clause.kind === "facing") facing = bearing(fd.p, fp.p);
        if (clause.kind === "apart") {
          const d0 = dist(fd.p, fp.p);
          const want = Math.min(Math.max(d0, clause.minPx), clause.maxPx);
          if (Math.abs(want - d0) > 1e-9 && d0 > 1e-9) {
            // Both move symmetrically along their line.
            const mid = midpoint(fd.p, fp.p);
            const dir = dirOf(bearing(mid, fd.p));
            p = [mid[0] + dir[0] * (want / 2), mid[1] + dir[1] * (want / 2)];
          }
        }
      }
      targets.set(d, { p, facing });
    }
    return targets;
  };

  // ---- the body ------------------------------------------------------------

  /** Emit the body over `[from, to)` from the targets; returns where it ends. */
  const emitBody = (inst: Instance, from: number, to: number, start: Map<DancerId, Pose>): void => {
    const n = to - from;
    const window = inst.figure.windows[0];
    inst.bodyEnd = new Map();
    for (const d of inst.dancers) {
      const call = inst.calls.get(d);
      const s = start.get(d);
      if (!call || !s) throw new Error("dancer missing");
      const fd = floor[d];
      if (!fd) throw new Error("dancer missing");
      fd.p = s.p;
      fd.facing = s.facing;
    }
    if (n <= 0) {
      for (const d of inst.dancers) {
        const s = start.get(d);
        if (s) inst.bodyEnd.set(d, { p: s.p, facing: s.facing });
      }
      return;
    }
    if (inst.dancers.length === 2 && window?.kind === "orbit" && inst.replannable) {
      const [a, b] = inst.dancers as [DancerId, DancerId];
      const callA = inst.calls.get(a);
      const sa = start.get(a);
      const sb = start.get(b);
      if (!callA || !sa || !sb) throw new Error("dancer missing");
      const axis = midpoint(sa.p, sb.p);
      const r = dist(axis, sa.p);
      const turns = resolveNumber(window.turns, callA.params);
      const sense = resolveChoice(window.sense, callA.params);
      const sign = sense === "partner-on-right" ? 1 : -1;
      let rate = turns / n;
      if (rate > window.rateMaxTurnsPerBeat + 1e-9) {
        errors.push({
          kind: "RateTooHigh",
          message: `${inst.figure.id}: ${turns} turn(s) in ${n} beats is ${rate.toFixed(3)} turns/beat, over ${window.rateMaxTurnsPerBeat}`,
          call: callA.id,
          span: callA.span,
        });
        rate = window.rateMaxTurnsPerBeat;
      }
      inst.rate = rate;
      const theta0 = { [a]: bearing(axis, sa.p), [b]: bearing(axis, sb.p) };
      const facing0 = { [a]: sa.facing, [b]: sb.facing };
      for (const d of [a, b]) {
        const call = inst.calls.get(d);
        if (!call) throw new Error("call missing");
        const other = d === a ? b : a;
        let prevP: Vec2 = (start.get(d) as Pose).p;
        let prevFacing = facing0[d] ?? 0;
        for (let k = 1; k <= n; k++) {
          const theta = (theta0[d] ?? 0) + sign * 360 * rate * k;
          const thetaOther = (theta0[other] ?? 0) + sign * 360 * rate * k;
          const p: Vec2 = [axis[0] + r * dirOf(theta)[0], axis[1] + r * dirOf(theta)[1]];
          const pOther: Vec2 = [
            axis[0] + r * dirOf(thetaOther)[0],
            axis[1] + r * dirOf(thetaOther)[1],
          ];
          // `fixed` keeps the facing the body started with (a do-si-do goes
          // round back to back); `tangent` follows the arc (an allemande).
          const facing = window.facing === "tangent" ? theta + 90 * sign : (facing0[d] ?? 0);
          void pOther;
          const step: PlannedStep = {
            to: p,
            facing,
            pivot: angleDiff(prevFacing, facing),
            lengthPx: dist(prevP, p),
          };
          const beat = from + k - 1;
          emitStep(d, beat, step, call, "body", inst);
          emitLook(d, beat, inst, call, "body", k - 1);
          prevP = p;
          prevFacing = facing;
        }
        inst.bodyEnd.set(d, { p: prevP, facing: prevFacing });
        const fd = floor[d];
        if (fd) {
          fd.p = prevP;
          fd.facing = prevFacing;
        }
      }
      return;
    }
    // Standing, intrinsic, or a body the planner cannot walk: stand in place.
    for (const d of inst.dancers) {
      const call = inst.calls.get(d);
      const s = start.get(d);
      if (!call || !s) throw new Error("dancer missing");
      if (window?.kind === "intrinsic") {
        for (const line of window.lines) {
          if (line.who !== "self") continue;
          if (line.beat >= n) {
            warnings.push({
              kind: "IntrinsicTruncated",
              message: `${inst.figure.id}: an authored line at beat ${line.beat} falls outside its ${n} beats`,
              call: call.id,
              dancer: d,
              beat: from + line.beat,
            });
            continue;
          }
          const instr: Instr =
            line.op.kind === "stand"
              ? { op: "stand" }
              : line.op.kind === "lean"
                ? { op: "lean", deg: line.op.deg }
                : { op: "look", at: resolveLook(line.op.at, call, d, floor) };
          emit(d, from + line.beat, line.half, instr, call.id, "body", inst);
        }
        // Beats the intrinsic says nothing about still stand and look.
        for (let k = 0; k < n; k++) {
          const has = slots.get(d)?.get(slotKey(from + k, 0));
          if (!has) {
            emit(d, from + k, 0, { op: "stand" }, call.id, "body", inst);
            emitLook(d, from + k, inst, call, "body", k);
          }
        }
      } else {
        for (let k = 0; k < n; k++) {
          emit(d, from + k, 0, { op: "stand" }, call.id, "body", inst);
          emitLook(d, from + k, inst, call, "body", k);
        }
      }
      inst.bodyEnd.set(d, { p: s.p, facing: s.facing });
    }
  };

  // ---- the walk (entry or exit) ------------------------------------------------

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
      const call = inst.calls.get(d);
      const a = poses.get(d);
      const t = targets.get(d);
      if (!call || !a || !t) throw new Error("dancer missing");
      const steps = planSteps(a, t, beats, limits);
      if (!steps) {
        ok = false;
        continue;
      }
      steps.forEach((step, i) => {
        emitStep(d, from + i, step, call, window, inst);
        emitLook(d, from + i, inst, call, window, window === "entry" ? 0 : Infinity);
      });
      const fd = floor[d];
      if (fd) {
        fd.p = t.p;
        fd.facing = t.facing;
      }
    }
    return ok;
  };

  // ---- the seams -----------------------------------------------------------------

  /** The hands `inst` needs at its start, and how each is got. */
  const takeHands = (inst: Instance, previous: Map<DancerId, Instance | undefined>): SeamKind => {
    let seam: SeamKind = "none";
    const done = new Set<string>();
    for (const d of inst.dancers) {
      const call = inst.calls.get(d);
      if (!call) continue;
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
        const prev = previous.get(need.dancer);
        const prevOther = previous.get(need.with);
        const freeBefore =
          prev !== undefined &&
          prevOther !== undefined &&
          prev.end === inst.start &&
          prevOther.end === inst.start &&
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
          emit(
            need.dancer,
            inst.start - 1,
            0,
            instr,
            (prev.calls.get(need.dancer) as CompiledCall).id,
            "exit",
          );
          emit(
            need.with,
            inst.start - 1,
            0,
            instrOther,
            (prevOther.calls.get(need.with) as CompiledCall).id,
            "exit",
          );
          seam = "take-overlapped";
          inst.notes.push(
            `take ${need.hand} hands with ${need.with} (${need.hold}) overlapped on the last beat of ${prev.figure.id}: hands were free`,
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

  /** Release what `inst`'s post frees, given what the next instance wants. */
  const dropHands = (inst: Instance, nextOf: Map<DancerId, Instance | undefined>): SeamKind => {
    let seam: SeamKind = "none";
    for (const d of inst.dancers) {
      const call = inst.calls.get(d);
      const fd = floor[d];
      if (!call || !fd) continue;
      const keeps = holdNeeds(inst.figure.post, call, d);
      const next = nextOf.get(d);
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

  // ---- the main loop -------------------------------------------------------------

  for (const inst of instances) {
    const previous = new Map<DancerId, Instance | undefined>();
    for (const d of inst.dancers) previous.set(d, previousOf(inst, d));
    inst.emitted = new Map(inst.dancers.map((d) => [d, []]));
    inst.bodyEnd = new Map();

    const nobody = inst.dancers.some((d) => inst.calls.get(d)?.cast.partner === undefined);
    inst.replannable = !nobody && inst.figure.windows[0]?.kind === "orbit";

    if (nobody) {
      inst.notes.push(`nobody to ${inst.figure.id} with: stand`);
    }

    // Where the body wants to start, from the floor as the previous figures left it.
    const targets = bodyTargets(inst);
    const poses = new Map<DancerId, Pose>(
      inst.dancers.map((d) => [
        d,
        { p: (floor[d] as DancerFloor).p, facing: (floor[d] as DancerFloor).facing },
      ]),
    );
    let need = 0;
    for (const d of inst.dancers) {
      need = Math.max(need, beatsNeeded(poses.get(d) as Pose, targets.get(d) as Pose, limits));
    }

    // Back-chain: can the previous instance's body give up `need` beats for an exit?
    const prevs = [...new Set(inst.dancers.map((d) => previous.get(d)))];
    const prev = prevs.length === 1 ? prevs[0] : undefined;
    const prevShared =
      prev !== undefined &&
      prev.end === inst.start &&
      prev.dancers.length === inst.dancers.length &&
      inst.dancers.every((d) => prev.dancers.includes(d));
    if (need > 0 && prevShared && prev.replannable) {
      let k = need;
      const minBody = prev.figure.beats.min;
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const bodyBeats = prev.end - prev.start - prev.entry - k;
        if (bodyBeats < minBody) break;
        // Retract the previous body and exit, then re-plan the body shorter.
        for (const d of prev.dancers) retract(prev, d);
        const prevStart = new Map<DancerId, Pose>();
        for (const d of prev.dancers) prevStart.set(d, prev.bodyStart.get(d) as Pose);
        emitBody(prev, prev.start + prev.entry, prev.end - k, prevStart);
        const fromPoses = new Map<DancerId, Pose>();
        for (const d of prev.dancers) fromPoses.set(d, prev.bodyEnd.get(d) as Pose);
        const newTargets = bodyTargets(inst);
        let k2 = 0;
        for (const d of inst.dancers) {
          k2 = Math.max(
            k2,
            beatsNeeded(fromPoses.get(d) as Pose, newTargets.get(d) as Pose, limits),
          );
        }
        if (k2 > k) {
          k = k2;
          continue;
        }
        emitWalk(prev, prev.end - k, k, fromPoses, newTargets, "exit");
        prev.exit = k;
        prev.notes.push(
          `exit: ${k} beat${k === 1 ? "" : "s"} re-planned to land where ${inst.figure.id} starts`,
        );
        for (const [d, t] of newTargets) targets.set(d, t);
        need = 0;
        done = true;
      }
      if (!done) {
        // Restore the previous body at full length: this instance pays its own entry.
        for (const d of prev.dancers) retract(prev, d);
        const prevStart = new Map<DancerId, Pose>();
        for (const d of prev.dancers) prevStart.set(d, prev.bodyStart.get(d) as Pose);
        emitBody(prev, prev.start + prev.entry, prev.end, prevStart);
        inst.notes.push(
          `${prev.figure.id} could not give up its beats; this figure pays its entry`,
        );
      }
    }

    // This instance's own entry.
    inst.entry = need;
    if (need > 0) {
      const fromPoses = new Map<DancerId, Pose>();
      for (const d of inst.dancers)
        fromPoses.set(d, {
          p: (floor[d] as DancerFloor).p,
          facing: (floor[d] as DancerFloor).facing,
        });
      emitWalk(inst, inst.start, need, fromPoses, targets, "entry");
      inst.notes.push(`entry: ${need} beat${need === 1 ? "" : "s"} to reach the body's start`);
    } else if (!nobody) {
      inst.notes.push(`entry: 0 — already where the body starts`);
    }
    inst.seamIn = nobody ? "none" : takeHands(inst, previous);

    // The body, over what is left.
    const bodyStart = inst.start + inst.entry;
    const bodyBeats = inst.end - bodyStart;
    if (!nobody && bodyBeats < inst.figure.beats.min) {
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

    // Releases, given what comes next.
    const nextOf = new Map<DancerId, Instance | undefined>();
    for (const d of inst.dancers) {
      const list = perDancer[d] ?? [];
      const i = list.findIndex((c) => c === inst.calls.get(d));
      const nxt = list[i + 1];
      nextOf.set(d, nxt ? byCall.get(`${d}:${nxt.id}`) : undefined);
    }
    inst.seamOut = nobody ? "none" : dropHands(inst, nextOf);
  }

  // ---- assemble ---------------------------------------------------------------------

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

// ---- helpers ------------------------------------------------------------------------

/**
 * Elision (D8, DA14): a call whose counterpart is nobody and whose figure says
 * `casts.partner: "elide"` is removed and its beats go to the next call
 * (`stretch`) or become a stand (`wait`). Returns each dancer's call list with
 * the spans rewritten.
 */
function elide(
  sequence: CompiledSequence,
  warnings: ScheduleWarning[],
): Record<DancerId, CompiledCall[]> {
  const out: Record<DancerId, CompiledCall[]> = {};
  for (const [d, list] of Object.entries(sequence.perDancer)) {
    const kept: CompiledCall[] = [];
    let carry = 0;
    for (const call of list) {
      const nobody = call.cast.partner === undefined;
      const rule = call.figure.casts.partner;
      if (nobody && rule === "elide") {
        if (call.figure.elide === "stretch") {
          carry += call.beats;
          continue;
        }
        // "wait": keep the call; the scheduler stands it (nobody → stand).
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
      else
        warnings.push({ kind: "IntrinsicTruncated", message: `${d}: every call elided`, call: -1 });
    }
    out[d] = kept;
  }
  void warnings;
  return out;
}

/** Group each dancer's calls into figure instances: same figure, same span, cast together. */
function groupInstances(perDancer: Record<DancerId, CompiledCall[]>): Instance[] {
  const byKey = new Map<string, Instance>();
  for (const [d, list] of Object.entries(perDancer)) {
    for (const call of list) {
      const members = call.cast.partner ? [d, call.cast.partner].sort() : [d];
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
          bodyEnd: new Map(),
          bodyStart: new Map(),
          replannable: false,
        };
        byKey.set(key, inst);
      }
      inst.dancers.push(d);
      inst.calls.set(d, call);
    }
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
}

/** The circle an orbit body runs on: the IR's radius, kept inside the `pre`'s spacing. */
function orbitRadius(
  figure: FigureIR,
  window: Extract<Window, { kind: "orbit" }>,
  a: Pose,
  b: Pose,
): number {
  const apart = figure.pre.arrangement.find((c) => c.kind === "apart" && c.who === "self");
  if (window.axis === "hands") return window.radiusPx;
  if (apart && apart.kind === "apart") {
    const half = dist(a.p, b.p) / 2;
    return Math.min(Math.max(half, apart.minPx / 2), apart.maxPx / 2);
  }
  return window.radiusPx;
}

function counterpartNeed(inst: Instance, need: HoldNeed): HoldNeed {
  const call = inst.calls.get(need.with);
  if (call) {
    const theirs = holdNeeds(inst.figure.pre, call, need.with).find((n) => n.with === need.dancer);
    if (theirs) return theirs;
  }
  return { dancer: need.with, hand: need.hand, hold: need.hold, with: need.dancer };
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
