import type { Beat, PoseSample, Side, Vec2 } from "@caller/core";
import { dist } from "@caller/core";
import type { Formation, Frame, Group, StationId } from "@caller/choreo";
import { createGroup, frame as makeFrame, withDefaults } from "@caller/choreo";
import type { ContraFigure, ContraParams } from "./ContraFigure.js";
import { planContext, worldSpot } from "./ContraFigure.js";
import { armShortfall } from "../pair/armShortfall.js";
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
    samples: 0,
  };

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
