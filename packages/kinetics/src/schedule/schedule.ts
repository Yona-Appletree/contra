import type { Vec2 } from "@caller/core";
import { ARM_REACH_PX, angleDiff, dirOf, dist, leftOf, rightOf } from "@caller/core";
import type { Foot, Instr, LookAt, Slot, WindowName } from "../asm/Instruction.js";
import type { Program } from "../asm/Program.js";
import type { DancerId, Dialect } from "../dialect/Dialect.js";
import type { FigureIR, HoldRef, LookTarget, Role, Who, Window } from "../ir/Figure.js";
import { resolveChoice, resolveNumber } from "../ir/Figure.js";
import type { CompiledCall, CompiledSequence } from "../sequence/CompiledSequence.js";
import type { Tempo } from "../units/Tempo.js";
import { TAKE_BEATS } from "../units/limits.js";
import { capsAtTempo } from "../units/caps.js";
import { PLACE_PX } from "./drift.js";
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
  /**
   * Where the body left this dancer, before the exit walks anywhere. The
   * drift check (`drift.ts`) compares it with the seat the language committed:
   * a figure that ends a place away from the seat its dance says it ends on is
   * a warning with a beat and a distance, not a picture nobody looks at.
   */
  bodyEnd?: Pose;
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
  const hipAccelCap = capsAtTempo(tempo).hip.accelPxPerBeat2;
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

  // ---- who a window is for -------------------------------------------------------

  /**
   * Whether `d` is one of the dancers `who` names. A figure-role
   * (`who: "partner"`) is read from the first dancer's point of view — used by
   * figures whose two roles do different things; a `{ role }` is the word a
   * `role` parameter holds, matched against the dialect's own role for `d`,
   * so the figure names a role without ever spelling one (D16).
   */
  const roleMatches = (inst: Instance, d: DancerId, who: Who | undefined): boolean => {
    if (who === undefined || who === "self") return true;
    const first = inst.dancers[0] as DancerId;
    if (typeof who === "object") {
      const word = inst.calls.get(first)?.params[who.role];
      const is = typeof word === "string" && dialect.roleOf(d) === word;
      return who.not ? !is : is;
    }
    return inst.calls.get(first)?.cast[who] === d;
  };

  /** The window `d` starts the body in: the first, or the part of a first `parallel` that names them. */
  const firstWindowFor = (inst: Instance, d: DancerId): Window | undefined => {
    const first = inst.figure.windows[0];
    if (first?.kind !== "parallel") return first;
    return first.parts.find((part) => roleMatches(inst, d, part.who));
  };

  // ---- the cruise ramp -----------------------------------------------------------

  /** Whether this dancer took a step in the beat before `beat`. */
  const wasStepping = (d: DancerId, beat: number): boolean =>
    (slots.get(d)?.get(slotKey(beat - 1, 0))?.instrs ?? []).some((i) => i.op === "step");
  /** Whether this dancer stands still once the instance ends: no next call, or one whose body does not walk. */
  const stopsAfter = (inst: Instance, d: DancerId): boolean => {
    const next = neighbourOf(inst, d, 1);
    if (!next) return true;
    const kind = firstWindowFor(next, d)?.kind;
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
  /**
   * Home as it is **during this call**: the facing of the dancer's own place
   * at that point of the dance. A couple that has crossed to the other line
   * at an end faces the other way from where it started the evening, so the
   * dialect's beat-0 answer is only the fallback.
   */
  const homeOf = (inst: Instance, d: DancerId): number =>
    inst.calls.get(d)?.seatAfter.facing ?? homeFacing(d);
  const castOf = (inst: Instance, d: DancerId, role: Role): DancerId | undefined =>
    role === "self" ? d : inst.calls.get(d)?.cast[role];
  /** Whether `d` walks backward in a `couple` orbit: the one on the couple's left does. */
  const backsInCouple = (inst: Instance, d: DancerId): boolean => {
    const partner = castOf(inst, d, "partner");
    return partner !== undefined && dialect.sideOf?.(d, partner) === "left";
  };

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
    // A ring runs where the dancers already stand (their mean distance from
    // the centroid), no tighter than the IR's radius and no wider than hands
    // can join across: a hands four circles from its seats rather than
    // walking in to a drawn circle first.
    if (w.axis === "centroid") {
      const axis = centroid(dancers.map((d) => poseOf(d).p));
      const mean = dancers.reduce((sum, d) => sum + dist(axis, poseOf(d).p), 0) / dancers.length;
      return Math.min(Math.max(mean, w.radiusPx), RING_MAX_RADIUS_PX);
    }
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
    const leads = first?.kind === "parallel" ? first.parts : first === undefined ? [] : [first];
    if (!inst.nobody) {
      for (const lead of leads) {
        const dancers = inst.dancers.filter((d) => roleMatches(inst, d, lead.who));
        if (lead.kind === "orbit") orbitTargets(inst, lead, dancers, targets);
        // A path starts on its first waypoint: the entry walks everyone on to
        // the track, so a hey's four leave from the places whatever the
        // figure before left them.
        if (lead.kind === "path") for (const d of dancers) targets.set(d, pathStart(inst, lead, d));
      }
    }
    // A body that begins on a circle or a track: whoever it does not name
    // stays put. Otherwise everyone is laid out by the `pre`.
    const laid = targets.size > 0;
    for (const d of inst.dancers) {
      if (targets.has(d)) continue;
      targets.set(d, laid ? poseOf(d) : arrangementTarget(inst, d, inst.figure.pre.arrangement));
    }
    return targets;
  };

  /** The orbit's points on its circle, evened out in ring order from the first dancer's bearing. */
  const orbitTargets = (
    inst: Instance,
    orbit: Extract<Window, { kind: "orbit" }>,
    dancers: DancerId[],
    targets: Map<DancerId, Pose>,
  ): void => {
    if (dancers.length < 2) return;
    const axis = centroid(dancers.map((d) => poseOf(d).p));
    const call0 = inst.calls.get(dancers[0] as DancerId) as CompiledCall;
    const sign = orbitSign(resolveChoice(orbit.sense, call0.params));
    const r = orbitRadius(inst, orbit, dancers);

    const theta0 = bearing(axis, poseOf(dancers[0] as DancerId).p);
    const ordered = ringOrder(inst, dancers, axis);
    ordered.forEach((d, i) => {
      const theta = theta0 + (sign * 360 * i) / ordered.length;
      const p: Vec2 = [axis[0] + r * dirOf(theta)[0], axis[1] + r * dirOf(theta)[1]];
      targets.set(d, {
        p,
        facing: orbitFacing(
          orbit,
          theta,
          sign,
          poseOf(d).facing,
          () => {
            const partner = castOf(inst, d, "partner");
            return partner ? bearing(p, poseOf(partner).p) : poseOf(d).facing;
          },
          backsInCouple(inst, d),
        ),
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
  };

  // ---- the lane frame ------------------------------------------------------------

  /**
   * The frame a `path` window's waypoints are in, for one dancer, from the
   * floor as it is now: the origin at the centroid of the figure's dancers,
   * `x` across the lane from `self` toward the dancer across from them in
   * half-widths, `y` along it to `self`'s right in half-places. The dancer
   * across is the ring neighbour further away (a hands four is wider than it
   * is long) or, for a pair, the counterpart.
   */
  interface Lane {
    origin: Vec2;
    /** Degrees, the lane's across direction from `self`'s side. */
    acrossDeg: number;
    halfWidthPx: number;
    mirror: boolean;
  }

  const laneFrame = (inst: Instance, w: Extract<Window, { kind: "path" }>, d: DancerId): Lane => {
    const call = inst.calls.get(d) as CompiledCall;
    const me = poseOf(d);
    const across = acrossOf(inst, d);
    const other = across === undefined ? undefined : poseOf(across).p;
    const acrossDeg = other === undefined ? me.facing : bearing(me.p, other);
    const halfWidthPx = other === undefined ? PLACE_PX : dist(me.p, other) / 2;
    const mirror = w.mirror !== undefined && call.params[w.mirror.param] === w.mirror.when;
    return {
      origin: centroid(inst.dancers.map((x) => poseOf(x).p)),
      acrossDeg,
      halfWidthPx,
      mirror,
    };
  };

  /** The dancer across the lane from `d`: the further ring neighbour, else the counterpart. */
  const acrossOf = (inst: Instance, d: DancerId): DancerId | undefined => {
    const call = inst.calls.get(d);
    if (call?.group === undefined) return call?.cast.partner;
    const me = poseOf(d).p;
    const candidates = [call.cast.left, call.cast.right].filter(
      (x): x is DancerId => x !== undefined && inst.calls.has(x),
    );
    let best: DancerId | undefined;
    let far = -1;
    for (const c of candidates) {
      const away = dist(me, poseOf(c).p);
      if (away > far) {
        far = away;
        best = c;
      }
    }
    return best;
  };

  const laneToWorld = (lane: Lane, x: number, y: number): Vec2 => {
    const ax = dirOf(lane.acrossDeg);
    const ay = rightOf(lane.acrossDeg);
    const sy = lane.mirror ? -y : y;
    const along = sy * (PLACE_PX / 2);
    return [
      lane.origin[0] + ax[0] * x * lane.halfWidthPx + ay[0] * along,
      lane.origin[1] + ax[1] * x * lane.halfWidthPx + ay[1] * along,
    ];
  };

  const laneFacing = (lane: Lane, deg: number): number =>
    lane.acrossDeg + (lane.mirror ? -deg : deg);

  /** Where a path's first waypoint puts `d`, facing as they face now. */
  const pathStart = (inst: Instance, w: Extract<Window, { kind: "path" }>, d: DancerId): Pose => {
    const lane = laneFrame(inst, w, d);
    const first = w.points[0];
    if (first === undefined) return poseOf(d);
    const call = inst.calls.get(d) as CompiledCall;
    const phase = w.lap?.phase.find((ph) => roleMatches(inst, d, ph.who))?.beats ?? 0;
    const at = pathPointAt(worldPath(w, lane, call), w, phase);
    return { p: at.p, facing: at.facing ?? poseOf(d).facing };
  };

  /** A path's waypoints in world px, each `left` offset applied off the line between its neighbours. */
  interface WorldPoint {
    beat: number;
    p: Vec2;
    facing?: number;
  }
  const worldPath = (
    w: Extract<Window, { kind: "path" }>,
    lane: Lane,
    call: CompiledCall,
  ): WorldPoint[] => {
    void call;
    const raw = w.points.map((wp) => ({
      beat: wp.beat,
      p: laneToWorld(lane, wp.x, wp.y),
      ...(wp.facing === undefined ? {} : { facing: laneFacing(lane, wp.facing) }),
    }));
    const closed = w.lap !== undefined;
    const last = raw.length - 1;
    return raw.map((pt, i) => {
      const left = w.points[i]?.left ?? 0;
      if (left === 0) return pt;
      // On a closed lap the first and last points are the same point, so
      // their neighbours wrap round it.
      const prev = i > 0 ? raw[i - 1] : closed ? raw[Math.max(last - 1, 0)] : raw[0];
      const next = i < last ? raw[i + 1] : closed ? raw[Math.min(1, last)] : raw[last];
      const heading = bearing((prev as WorldPoint).p, (next as WorldPoint).p);
      const off = leftOf(heading);
      return { ...pt, p: [pt.p[0] + off[0] * left, pt.p[1] + off[1] * left] };
    });
  };

  /**
   * The point of a path at `beat` along it: on the segment the beat falls in,
   * a waypoint's own facing when the beat lands on it. A lap wraps.
   */
  const pathPointAt = (
    pts: WorldPoint[],
    w: Extract<Window, { kind: "path" }>,
    beat: number,
  ): { p: Vec2; facing?: number } => {
    const first = pts[0] as WorldPoint;
    const last = pts[pts.length - 1] as WorldPoint;
    const length = last.beat - first.beat;
    let b = beat;
    if (w.lap !== undefined && length > 0) {
      b = first.beat + ((((beat - first.beat) % length) + length) % length);
      // The lap's end is its start, but the last waypoint is the one that says so.
      if (Math.abs(b - first.beat) < 1e-9 && beat > first.beat + 1e-9) b = last.beat;
    }
    if (b <= first.beat)
      return { p: first.p, ...(first.facing === undefined ? {} : { facing: first.facing }) };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as WorldPoint;
      const z = pts[i] as WorldPoint;
      if (b > z.beat + 1e-9) continue;
      if (Math.abs(b - z.beat) < 1e-9)
        return { p: z.p, ...(z.facing === undefined ? {} : { facing: z.facing }) };
      const t = z.beat > a.beat ? (b - a.beat) / (z.beat - a.beat) : 1;
      return { p: [a.p[0] + (z.p[0] - a.p[0]) * t, a.p[1] + (z.p[1] - a.p[1]) * t] };
    }
    return { p: last.p, ...(last.facing === undefined ? {} : { facing: last.facing }) };
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
        if (clause.toward === "home") facing = homeOf(inst, d);
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
        let mid = midpoint(me.p, poseOf(other).p);
        const f = clauses.some((c) => c.kind === "facing" && c.toward === "home")
          ? homeOf(inst, d)
          : facing;
        if (clause.centre === "left-seat") {
          // Move the centre along the home facing onto the left-hand dancer's seat line.
          const leftOne = side === "left" ? d : other;
          const seat = inst.calls.get(leftOne)?.seatAfter.p;
          if (seat) {
            const along = dirOf(f);
            const t = (seat[0] - mid[0]) * along[0] + (seat[1] - mid[1]) * along[1];
            mid = [mid[0] + along[0] * t, mid[1] + along[1] * t];
          }
        }
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
    /**
     * Whether the orbit keeps turning through its last beats: yes when the
     * next figure orbits too (a do-si-do flowing into an allemande), no when
     * it walks or stands (a swing opening out into the line).
     */
    keepTurning: boolean;
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
      const named = (window: Window): DancerId[] =>
        window.kind === "parallel"
          ? inst.dancers.filter((d) => window.parts.some((part) => roleMatches(inst, d, part.who)))
          : inst.dancers.filter((d) => roleMatches(inst, d, window.who));
      const dancers = named(w);
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
      const lastSpan = span.to === to;
      if (w.kind === "parallel") {
        for (const part of w.parts)
          emitWindow(
            inst,
            part,
            span.from,
            n,
            named(part),
            from,
            lastSpan ? blend : undefined,
            start,
            lastSpan,
          );
      } else {
        emitWindow(
          inst,
          w,
          span.from,
          n,
          dancers,
          from,
          lastSpan ? blend : undefined,
          start,
          lastSpan,
        );
      }
    }
    for (const d of inst.dancers) inst.bodyEnd.set(d, poseOf(d));
  };

  /** One window of a body over one span, for the dancers it names. */
  const emitWindow = (
    inst: Instance,
    w: Window,
    spanFrom: number,
    n: number,
    dancers: DancerId[],
    from: number,
    blend: ExitBlend | undefined,
    start: Map<DancerId, Pose>,
    lastSpan: boolean,
  ): void => {
    const to = spanFrom + n;
    const span = { from: spanFrom, to };
    if (w.holds !== undefined && w.holds.length > 0)
      takeWindowHolds(inst, w.holds, dancers, spanFrom);
    {
      switch (w.kind) {
        case "parallel":
          for (const part of w.parts)
            emitWindow(
              inst,
              part,
              spanFrom,
              n,
              dancers.filter((d) => roleMatches(inst, d, part.who)),
              from,
              blend,
              start,
              lastSpan,
            );
          break;
        case "path":
          emitPath(inst, w, span.from, n, dancers, from, lastSpan);
          break;
        case "orbit":
          emitOrbit(inst, w, span.from, n, dancers, from, blend);
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
            const shares = fractionsFor(d, span.from, n, !lastSpan || stopsAfter(inst, d));
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
        case "walk-to-seat":
          for (const d of dancers) {
            const call = inst.calls.get(d) as CompiledCall;
            const me = poseOf(d);
            const target: Pose = { p: call.seatAfter.p, facing: call.seatAfter.facing };
            const lastWindow = lastSpan;
            const steps =
              planSteps(
                me,
                target,
                n,
                limits,
                fractionsFor(d, span.from, n, !lastWindow || stopsAfter(inst, d)),
              ) ?? [];
            if (
              steps.length === 0 &&
              (dist(me.p, target.p) > limits.tolerancePx ||
                Math.abs(angleDiff(me.facing, target.facing)) > limits.toleranceDeg)
            ) {
              errors.push({
                kind: "StepTooLong",
                message: `${d}: ${inst.figure.id} walks ${(dist(me.p, target.p) * tempo.cmPerPx).toFixed(0)} cm to its seat in ${n} beats`,
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
            if (steps.length > 0) setPose(d, target);
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
              if (line.op.kind === "step") {
                // A rock: a step along the facing, and the floor pose moves with it.
                const me = poseOf(d);
                const dir = dirOf(me.facing);
                const to: Vec2 = [
                  me.p[0] + dir[0] * line.op.forwardPx,
                  me.p[1] + dir[1] * line.op.forwardPx,
                ];
                emitStep(
                  d,
                  span.from + line.beat,
                  { to, facing: me.facing, pivot: 0, lengthPx: Math.abs(line.op.forwardPx) },
                  call,
                  "body",
                  inst,
                );
                setPose(d, { p: to, facing: me.facing });
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
  };

  /**
   * A `path` window: each named dancer walks their own copy of the waypoints
   * in their own lane frame, one step a beat, the path's nominal beats spread
   * over the window's. The facing follows the heading, or a waypoint's own
   * where a step lands on one. The steps go through `emitStep`, so a stride
   * too long or a turn too sharp is the scheduler's usual complaint.
   */
  const emitPath = (
    inst: Instance,
    w: Extract<Window, { kind: "path" }>,
    from: number,
    n: number,
    dancers: DancerId[],
    bodyFrom: number,
    lastSpan: boolean,
  ): void => {
    void lastSpan;
    if (w.points.length === 0) return;
    for (const d of dancers) {
      const call = inst.calls.get(d) as CompiledCall;
      const lane = laneFrame(inst, w, d);
      const pts = worldPath(w, lane, call);
      const first = pts[0] as WorldPoint;
      const last = pts[pts.length - 1] as WorldPoint;
      const length = last.beat - first.beat;
      const phase = w.lap?.phase.find((ph) => roleMatches(inst, d, ph.who))?.beats ?? 0;
      const amount = w.lap?.amount === undefined ? 1 : resolveNumber(w.lap.amount, call.params);
      const covered = w.lap === undefined ? length : length * amount;
      let prev: Pose = poseOf(d);
      for (let k = 1; k <= n; k++) {
        const at = pathPointAt(pts, w, first.beat + phase + (covered * k) / n);
        const moved = dist(prev.p, at.p) > limits.tolerancePx;
        const heading = moved ? bearing(prev.p, at.p) : prev.facing;
        const facingRaw = at.facing ?? heading;
        const facing = prev.facing + angleDiff(prev.facing, facingRaw);
        const step: PlannedStep = {
          to: at.p,
          facing,
          pivot: angleDiff(prev.facing, facing),
          lengthPx: dist(prev.p, at.p),
        };
        emitStep(d, from + k - 1, step, call, "body", inst);
        emitLook(d, from + k - 1, inst, call, "body", from + k - 1 - bodyFrom);
        prev = { p: at.p, facing };
      }
      setPose(d, prev);
    }
  };

  /**
   * Holds a window takes at its start: the take ramps in over the
   * `TAKE_BEATS` before it, inside this figure's own beats, and the floor
   * remembers the hands so the figure's end lets go of them. Emitted every
   * time the body is planned — a take of a hold already held opens no new
   * span in the executor — so a re-plan cannot lose them.
   */
  const takeWindowHolds = (
    inst: Instance,
    holds: readonly HoldRef[],
    dancers: DancerId[],
    beat: number,
  ): void => {
    const contract = { arrangement: [], holds };
    const done = new Set<string>();
    for (const d of dancers) {
      const call = inst.calls.get(d) as CompiledCall;
      for (const need of holdNeeds(contract, call, d)) {
        if (!inst.calls.has(need.with)) {
          errors.push({
            kind: "Unplannable",
            message: `${d}: ${need.with} is not dancing this ${inst.figure.id} at beat ${beat}`,
            call: call.id,
            dancer: d,
            beat,
            span: call.span,
          });
          continue;
        }
        const otherNeed = counterpartNeed(inst, need, contract);
        const pairKey =
          [`${need.dancer}/${need.hand}`, `${otherNeed.dancer}/${otherNeed.hand}`]
            .sort()
            .join("+") +
          ":" +
          need.hold;
        if (done.has(pairKey)) continue;
        done.add(pairKey);
        const fd = floor[need.dancer];
        const fo = floor[need.with];
        if (!fd || !fo) continue;
        const at = Math.max(beat - TAKE_BEATS, inst.start);
        const otherCall = inst.calls.get(need.with) as CompiledCall;
        emit(
          need.dancer,
          at,
          0,
          { op: "hold", hand: need.hand, with: need.with, hold: need.hold },
          call.id,
          "body",
          inst,
        );
        emit(
          need.with,
          at,
          0,
          { op: "hold", hand: otherNeed.hand, with: need.dancer, hold: need.hold },
          otherCall.id,
          "body",
          inst,
        );
        setHand(fd, need.hand, { hold: need.hold, with: need.with });
        setHand(fo, otherNeed.hand, { hold: need.hold, with: need.dancer });
        inst.notes.push(
          `take ${need.hand} hands with ${need.with} (${need.hold}) at beat ${beat}, inside the body`,
        );
      }
    }
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
    // The orbit's own cruise ramp: half a step to start from standing, half a
    // step to stop; `progress[k]` is how far round the body is after step k.
    // The rate cap is a cap on the **fastest step**, which with a ramp is a
    // middle one, not on the average.
    const lastWindow = from + n === inst.end - inst.exit || blend !== undefined;
    // A spiral settles: the last beat of a swing is a landing, not a sprint,
    // and the figure after it may well set off the other way.
    const shares = fractionsFor(
      dancers[0] as DancerId,
      from,
      n,
      lastWindow && (blend !== undefined || stopsAfter(inst, dancers[0] as DancerId)),
    );
    const freeze = blend !== undefined && !blend.keepTurning;
    const orbitSteps = freeze ? Math.max(1, n - blend.beats) : n;
    // Frozen, the orbit's own steps ramp down before the spiral takes over.
    const orbitShares = freeze
      ? fractionsFor(dancers[0] as DancerId, from, orbitSteps, true)
      : shares;
    const peakShare = Math.max(...orbitShares);
    const maxTurns = w.rateMaxTurnsPerBeat / peakShare;
    let turns: number;
    if (w.turns === "free") {
      turns = freeTurns(inst, w, dancers, axis, sign, n, maxTurns);
    } else {
      turns = resolveNumber(w.turns, call0.params);
    }
    let rate = turns / n;
    if (turns > maxTurns + 1e-9) {
      errors.push({
        kind: "RateTooHigh",
        message: `${inst.figure.id}: ${turns} turn(s) in ${n} beats is ${(turns * peakShare).toFixed(3)} turns on its fastest beat, over ${w.rateMaxTurnsPerBeat}`,
        call: call0.id,
        span: call0.span,
      });
      turns = maxTurns;
      rate = turns / n;
    }
    inst.rate = rate;
    if (w.buzz) {
      for (const d of dancers) {
        const call = inst.calls.get(d) as CompiledCall;
        emit(d, from, 0, { op: "buzz", on: true }, call.id, "body", inst);
        emit(d, from + n - 1, 1, { op: "buzz", on: false }, call.id, "body", inst);
      }
    }
    // With an exit blend the turns complete over the first `n − k` steps and
    // the last `k` are the spiral alone: the swing opens out, it does not go
    // on turning at a growing radius (a 27 px chord at 19 px out).
    const progress: number[] = [0];
    for (let k = 0; k < n; k++) {
      const f = k < orbitSteps ? (orbitShares[k] ?? 0) : 0;
      progress.push(Math.min(1, (progress[progress.length - 1] ?? 0) + f));
    }
    // The open-out: over the last beats the radius eases to half the spacing
    // the figure ends at, the orbit still turning — a courtesy turn let out
    // on to the two places. The scheduler's own spiral (a blend) does this
    // with the next figure's start instead, and wins when it is there.
    const openR = w.openPx === undefined || blend !== undefined ? undefined : w.openPx / 2;
    const rAt = (k: number): number => {
      if (openR === undefined || k <= n - OPEN_BEATS) return r;
      return r + (openR - r) * smoothstep((k - (n - OPEN_BEATS)) / OPEN_BEATS);
    };
    const posAt = (d: DancerId, k: number): Vec2 => {
      const theta = (theta0.get(d) ?? 0) + sign * 360 * turns * (progress[k] ?? 1);
      const rk = rAt(k);
      return [axis[0] + rk * dirOf(theta)[0], axis[1] + rk * dirOf(theta)[1]];
    };
    for (const d of dancers) {
      const call = inst.calls.get(d) as CompiledCall;
      const startFacing = poseOf(d).facing;
      const target = blend?.targets.get(d);
      const backs = backsInCouple(inst, d);
      let prev: Pose = poseOf(d);
      let spiralFacing: number | undefined;
      for (let k = 1; k <= n; k++) {
        const theta = (theta0.get(d) ?? 0) + sign * 360 * turns * (progress[k] ?? 1);
        let p = posAt(d, k);
        let facing = orbitFacing(
          w,
          theta,
          sign,
          startFacing,
          () => {
            const partner = castOf(inst, d, "partner");
            return partner && dancers.includes(partner)
              ? bearing(p, posAt(partner, k))
              : startFacing;
          },
          backs,
        );
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
          const thetaK = (freeze ? thetaEnd : theta) + (thetaT - thetaEnd) * sBlend;
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
    maxTurns: number,
  ): number => {
    const d0 = dancers[0] as DancerId;
    const post = arrangementTarget(inst, d0, inst.figure.post.arrangement);
    const thetaEnd = bearing(axis, post.p);
    const theta0 = bearing(axis, poseOf(d0).p);
    let fraction = (((thetaEnd - theta0) * sign) % 360) / 360;
    if (fraction < 0) fraction += 1;
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
          : !["orbit", "walk", "pass", "path"].includes(firstWindowFor(inst, d)?.kind ?? "");
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
        if (!inst.calls.has(need.with)) {
          errors.push({
            kind: "Unplannable",
            message: `${d}: ${need.with} is not dancing this ${inst.figure.id} at beat ${inst.start}`,
            call: call.id,
            dancer: d,
            beat: inst.start,
            span: call.span,
          });
          continue;
        }
        const otherNeed = counterpartNeed(inst, need);
        // One shared line per pair of hands: the same hold seen from the other
        // side is the same seam, and a two-hand hold is two seams.
        const pairKey =
          [`${need.dancer}/${need.hand}`, `${otherNeed.dancer}/${otherNeed.hand}`]
            .sort()
            .join("+") +
          ":" +
          need.hold;
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
      !inst.nobody &&
      inst.dancers.every((d) =>
        ["orbit", "walk", "path"].includes(firstWindowFor(inst, d)?.kind ?? ""),
      );
    if (inst.nobody) inst.notes.push(`nobody to ${inst.figure.id} with: stand`);

    // Back-chain: can the previous instance's body give up `need` beats for an exit?
    const prevs = [...new Set(inst.dancers.map((d) => neighbourOf(inst, d, -1)))];
    const prev = prevs.length === 1 ? prevs[0] : undefined;
    const prevShared =
      prev !== undefined &&
      prev.end === inst.start &&
      prev.dancers.length === inst.dancers.length &&
      inst.dancers.every((d) => prev.dancers.includes(d));

    // Where this figure wants to start. When the previous figure can be
    // re-planned, its **soft end** — where its own `post` would put everyone,
    // a swing's "beside your partner in the line" — is the ground this
    // figure's `pre` is laid on, so the exit delivers both at once; the
    // `pre` alone would leave the couple wherever the orbit stopped.
    let targets: Map<DancerId, Pose>;
    if (prevShared && prev.replannable) {
      const bodyEnd = new Map<DancerId, Pose>(prev.dancers.map((d) => [d, poseOf(d)]));
      for (const d of prev.dancers)
        setPose(d, arrangementTarget(prev, d, prev.figure.post.arrangement));
      targets = bodyTargets(inst);
      for (const d of prev.dancers) setPose(d, bodyEnd.get(d) as Pose);
    } else {
      targets = bodyTargets(inst);
    }
    let need = 0;
    for (const d of inst.dancers)
      need = Math.max(need, beatsNeeded(poseOf(d), targets.get(d) as Pose, limits));
    // A walk from standing to standing cannot cover as much in a beat as one
    // step's length says: the hip's acceleration cap bounds it. Bang-bang from
    // rest to rest covers `a · (n/2)²`, so `n ≥ 2 √(d / a)`.
    // From standing, the same bound is the honest one whether or not the body
    // then walks on: a body cannot be at walking speed a beat after standing.
    const fromRest = inst.dancers.every((d) => !wasStepping(d, inst.start));
    if (fromRest) {
      for (const d of inst.dancers) {
        const dPx = dist(poseOf(d).p, (targets.get(d) as Pose).p);
        if (dPx > limits.tolerancePx)
          need = Math.max(need, Math.ceil(2 * Math.sqrt(dPx / hipAccelCap)));
      }
    }
    // With the cruise ramp the first step is a half one, so the others are
    // longer than an even share: add beats until the longest fits.
    for (const d of inst.dancers) {
      const dPx = dist(poseOf(d).p, (targets.get(d) as Pose).p);
      if (dPx <= limits.tolerancePx) continue;
      for (let guard = 0; guard < 8; guard++) {
        const shares = fractionsFor(d, inst.start, Math.max(need, 1), false);
        if (Math.max(...shares) * dPx <= limits.maxStepPx + 1e-9) break;
        need = Math.max(need, 1) + 1;
      }
    }

    if (need > 0 && prevShared && prev.replannable) {
      const prevLast = prev.figure.windows[prev.figure.windows.length - 1];
      const prevKind = prevLast?.kind === "parallel" ? prevLast.parts[0]?.kind : prevLast?.kind;
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
          emitBody(prev, prev.start + prev.entry, prev.end, prev.bodyStart, {
            beats: k,
            targets,
            keepTurning: inst.figure.windows[0]?.kind === "orbit",
          });
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
      const end = inst.bodyEnd.get(d);
      if (end !== undefined) sc.bodyEnd = end;
      calls[d].push(sc);
    }
    calls[d].sort((x, y) => x.call.start - y.call.start);
  }
  return { calls, programs, errors, warnings, endBeat };
}

// ---- helpers ------------------------------------------------------------------------------

/** How far a passing dancer veers off the straight line, px. */
const PASS_VEER_PX = 3;

/** The widest a ring may be: neighbours 14 √2 ≈ 20 px apart, hands meeting 10 px from each hip. */
const RING_MAX_RADIUS_PX = 14;

/** The fewest beats an orbit spirals out over, when its body can spare them. */
const SPIRAL_MIN_BEATS = 2;

/** The beats an orbit with an `openPx` opens out over, still turning. */
const OPEN_BEATS = 2;

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
  backs = false,
): number {
  switch (w.facing) {
    case "tangent":
      return theta + 90 * sign;
    // As a couple: the one on the right walks the arc forward, the one on
    // the left faces the same way and backs round it.
    case "couple":
      return backs ? theta - 90 * sign : theta + 90 * sign;
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

function counterpartNeed(
  inst: Instance,
  need: HoldNeed,
  contract: Parameters<typeof holdNeeds>[0] = inst.figure.pre,
): HoldNeed {
  const call = inst.calls.get(need.with);
  if (call) {
    const theirs = holdNeeds(contract, call, need.with).filter((n) => n.with === need.dancer);
    // Two hands joined (a two-hand hold): my right meets their left.
    const opposite = theirs.find((n) => n.hand !== need.hand);
    if (theirs.length > 1 && opposite) return opposite;
    if (theirs[0]) return theirs[0];
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
