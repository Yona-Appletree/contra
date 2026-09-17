import type { Beat, PoseSample, Side, Vec2 } from "@caller/core";
import { armShortfall, dist } from "@caller/core";
import type { Formation, Frame, Group, StationId } from "@caller/choreo";
import { createGroup, frame as makeFrame, withDefaults } from "@caller/choreo";
import type { ContraFigure, ContraParams, Spot, Spots } from "./ContraFigure.js";
import { planContext, worldSpot } from "./ContraFigure.js";
import { handBehindShoulder } from "./forwardAngle.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";

/**
 * The postcondition probes every figure's test runs, over one group, off the
 * timeline: reach (AC1), joined hands, exact ends, and collisions (AC6).
 *
 * The frame is deliberately not the identity — a set at an angle, off the
 * origin — because a figure that has quietly done its geometry in world px
 * rather than the frame's own axes passes at the origin and fails here.
 */
export const PROBE_FRAME: Frame = makeFrame([17, -23], 37);

/** How finely a figure is probed: the plan's AC1 step. */
export const PROBE_STEP: Beat = 1 / 8;

/** What a probe found. */
export interface FigureProbe {
  /** The worst arm shortfall, px. AC1 wants 0. */
  maxShort: number;
  worstShort?: { station: StationId; t: Beat; side: Side };
  /** The worst gap between two hands the figure says are joined, px. */
  maxJoinGap: number;
  worstJoin?: { a: StationId; b: StationId; t: Beat };
  /** How far the pose at `t = beats` is from what `ends` promised, px. */
  maxEndError: number;
  /** How far the pose at `t = 0` is from where the figure was told to start, px. */
  maxStartError: number;
  /** The closest two torso centres came, px. AC6 wants more than 8. */
  minDistance: number;
  worstPair?: { a: StationId; b: StationId; t: Beat };
  /** The longest a working hand was held behind its own shoulder line, beats. */
  maxHeldBehind: Beat;
  worstBehind?: { station: StationId; side: Side; from: Beat; until: Beat };
  /** How many samples were taken. */
  samples: number;
}

/** One group of a formation, on a frame that is not the identity. */
export function probeGroup(formation: Formation, n = 4, frame: Frame = PROBE_FRAME): Group {
  const stations = formation.group(n);
  const members: Record<StationId, string> = {};
  for (const station of stations) members[station.id] = `d/${station.id}`;
  return createGroup(
    { id: "probe", kind: "set", frame, stations, members, couples: [] },
    formation.roleSet,
  );
}

/** Pairs of stations a figure is allowed to bring closer than AC6's 8 px. */
export type Contacts = readonly (readonly [StationId, StationId])[];

const isContact = (contacts: Contacts, a: StationId, b: StationId): boolean =>
  contacts.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** Run every probe over a figure, sampled at every {@link PROBE_STEP}. */
export function probeFigure<P extends ContraParams>(
  def: ContraFigure<P>,
  params: Partial<Omit<P, "beats">> & { beats?: Beat } = {},
  options: { group?: Group; contacts?: Contacts } = {},
): FigureProbe {
  const group = options.group ?? probeGroup(DUPLE_IMPROPER);
  const contacts = options.contacts ?? [];
  const resolved = withDefaults(def, params, params.beats ?? def.beats);
  const plan = def.plan(
    planContext(group.stations, group.roleSet, group.frame.spacing, resolved.from),
    resolved,
  );
  const ids = group.stations.map((s) => s.id);
  const beats = resolved.beats;

  const probe: FigureProbe = {
    maxShort: 0,
    maxJoinGap: 0,
    maxEndError: 0,
    maxStartError: 0,
    minDistance: Infinity,
    maxHeldBehind: 0,
    samples: 0,
  };

  /** Where each hand's current run of being held behind its shoulder began. */
  const behindSince = new Map<string, Beat>();

  const steps = Math.round(beats / PROBE_STEP);
  for (let i = 0; i <= steps; i++) {
    const t = i * PROBE_STEP;
    const poses = new Map<StationId, PoseSample>();
    for (const id of ids) poses.set(id, def.sample(group, id, t, resolved));
    probe.samples += ids.length;

    for (const id of ids) {
      const pose = poses.get(id)!;
      const velocity = velocityOf(def, group, id, t, beats, resolved);
      const short = armShortfall(pose, t, velocity);
      for (const side of ["L", "R"] as const) {
        if (short[side] > probe.maxShort) {
          probe.maxShort = short[side];
          probe.worstShort = { station: id, t, side };
        }
        const key = `${id}${side}`;
        if (!handBehindShoulder(pose, side)) {
          behindSince.delete(key);
          continue;
        }
        const from = behindSince.get(key) ?? t;
        behindSince.set(key, from);
        if (t - from > probe.maxHeldBehind) {
          probe.maxHeldBehind = t - from;
          probe.worstBehind = { station: id, side, from, until: t };
        }
      }
    }

    for (const join of plan.joinsAt(t)) {
      const a = poses.get(join.a)?.hands[join.aSide];
      const b = poses.get(join.b)?.hands[join.bSide];
      if (!a || !b || a === "down" || b === "down") {
        probe.maxJoinGap = Infinity;
        probe.worstJoin = { a: join.a, b: join.b, t };
        continue;
      }
      const gap = dist(a.p, b.p);
      if (gap > probe.maxJoinGap) {
        probe.maxJoinGap = gap;
        probe.worstJoin = { a: join.a, b: join.b, t };
      }
    }

    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const a = ids[x]!;
        const b = ids[y]!;
        if (isContact(contacts, a, b)) continue;
        const d = dist(poses.get(a)!.p, poses.get(b)!.p);
        if (d < probe.minDistance) {
          probe.minDistance = d;
          probe.worstPair = { a, b, t };
        }
      }
    }
  }

  const ends = def.ends(group, resolved);
  const start = planContext(group.stations, group.roleSet, group.frame.spacing, resolved.from);
  for (const id of ids) {
    const last = def.sample(group, id, beats, resolved);
    const end = ends[id];
    if (end) probe.maxEndError = Math.max(probe.maxEndError, dist(last.p, end.p));
    const first = def.sample(group, id, 0, resolved);
    probe.maxStartError = Math.max(
      probe.maxStartError,
      dist(first.p, worldSpot(group.frame, start.spot(id)).p),
    );
  }
  return probe;
}

/**
 * Where a figure leaves everybody, in the frame's own axes: the same answer a
 * dance chains on, which is what a figure's own test should be written against.
 */
export function figureMoves<P extends ContraParams>(
  def: ContraFigure<P>,
  params: Partial<Omit<P, "beats">> & { beats?: Beat } = {},
  formation: Formation = DUPLE_IMPROPER,
): Spots {
  const resolved = withDefaults(def, params, params.beats ?? def.beats);
  return def.moves(resolved, formation.group(4));
}

/** Where a formation's station stands, frame-local: what a figure's ends are read against. */
export function stationSpot(formation: Formation, id: StationId): Spot {
  const station = formation.group(4).find((s) => s.id === id);
  if (!station) throw new Error(`no station "${id}" in ${formation.id}`);
  return { p: station.p, facing: station.facing };
}

/** How far apart two places are, for a test that wants an exact end. */
export const spotError = (a: Spot, b: Spot): number => dist(a.p, b.p);

/** What a figure has to answer to, in px. The plan's own numbers. */
export interface FigureLimits {
  /** AC1: every arm reaches its hand. */
  short: number;
  /** Two hands the figure joins are one point. */
  joinGap: number;
  /** AC5: `ends` is exact, and so is the start. */
  seam: number;
  /** AC6: no two torso centres closer than this, contacts aside. */
  distance: number;
  /**
   * How long a working hand may be held behind its own shoulder line, beats.
   *
   * An arm can pull toward something in front of the shoulder and push away
   * from it; it can do neither to something behind the shoulder line, which is
   * gate G1's allemande ruling ("the arm is angled _forward_ not back … it
   * would be _very_ uncomfy"). A hand still **passes** behind — a pull-by's
   * does, and so does the hand a courtesy turn takes round a back — so this is
   * a bound on how long a figure leaves one there, not on whether it happens.
   *
   * Four beats is half a phrase, and the figure library's own worst is 3.1: the
   * hand `robins-chain` carries round the courtesy turn. The swing used to hold
   * one there for its whole six turning beats, and for ten inside a
   * `balance-and-swing` — the robin's joined hand landed behind her own
   * shoulder, which is what this number exists to stop coming back.
   */
  heldBehind: Beat;
}

/** The limits every figure is held to unless its own test says otherwise. */
export const FIGURE_LIMITS: FigureLimits = {
  short: 0,
  joinGap: 0.1,
  seam: 0.01,
  distance: 8,
  heldBehind: 4,
};

/**
 * Everything wrong with a figure, as sentences; empty is the figure passing.
 *
 * A list rather than an assertion so `testing.ts` stays free of the test runner
 * and can be read — and run — by anything.
 */
export function figureProblems(probe: FigureProbe, limits: Partial<FigureLimits> = {}): string[] {
  const want = { ...FIGURE_LIMITS, ...limits };
  const problems: string[] = [];
  const where = (at: unknown): string => JSON.stringify(at ?? {});
  if (probe.maxShort > want.short) {
    problems.push(
      `an arm falls ${probe.maxShort.toFixed(4)} px short of its hand at ${where(probe.worstShort)}`,
    );
  }
  if (probe.maxJoinGap > want.joinGap) {
    problems.push(
      `joined hands are ${probe.maxJoinGap.toFixed(4)} px apart at ${where(probe.worstJoin)}`,
    );
  }
  if (probe.maxEndError > want.seam) {
    problems.push(`the pose at the end is ${probe.maxEndError.toExponential(3)} px from "ends"`);
  }
  if (probe.maxStartError > want.seam) {
    problems.push(
      `the pose at the start is ${probe.maxStartError.toExponential(3)} px from where the figure was told to start`,
    );
  }
  if (probe.minDistance <= want.distance) {
    problems.push(
      `two dancers come ${probe.minDistance.toFixed(3)} px apart at ${where(probe.worstPair)}`,
    );
  }
  if (probe.maxHeldBehind > want.heldBehind) {
    problems.push(
      `a hand is held ${probe.maxHeldBehind.toFixed(3)} beats behind its own shoulder at ${where(probe.worstBehind)}`,
    );
  }
  return problems;
}

/** The floor velocity a figure gives a dancer, for the quiet motion. */
function velocityOf<P extends ContraParams>(
  def: ContraFigure<P>,
  group: Group,
  station: StationId,
  t: Beat,
  beats: Beat,
  params: P,
): Vec2 {
  const dt = Math.min(t + 0.05, beats) - t;
  if (dt <= 0) return [0, 0];
  const here = def.sample(group, station, t, params);
  const next = def.sample(group, station, t + dt, params);
  return [(next.p[0] - here.p[0]) / dt, (next.p[1] - here.p[1]) / dt];
}
