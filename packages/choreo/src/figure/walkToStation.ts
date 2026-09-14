import type { Angle, Beat, PoseSample } from "@caller/core";
import type { StationId } from "../formation/Formation.js";
import type { Group } from "../group/Group.js";
import { groupStationPose } from "../group/Group.js";
import type { EndPose, FigureDef, FigureParams } from "./FigureDef.js";
import { standing, walking } from "./standing.js";
import { DEFAULT_BOW_PX, walkStep } from "./walkPath.js";

/**
 * `walk-to-station`'s parameters. Everything is data, so a dance carrying them
 * survives `JSON.parse(JSON.stringify(dance))` unchanged.
 */
export interface WalkToStationParams extends FigureParams {
  /** Station → the station whose place it walks to. Left out means stay put. */
  to: Record<StationId, StationId>;
  /** Station → the station it walks from. Default: its own. Overridden by `origins`. */
  from: Record<StationId, StationId>;
  /** Station → where it actually starts, in world px. Overrides `from`. */
  origins: Record<StationId, EndPose>;
  /** Extra degrees added to the end facing. */
  turn: Record<StationId, number>;
  /** How far each dancer bows to their own right while travelling, in px. */
  bowPx: number;
}

/**
 * The placeholder figure: every dancer walks from one station to another, or
 * stands where it already is.
 *
 * It is the engine's own test instrument, not a contra figure — M8 fills the
 * library with real ones. The decider also uses it twice over: for the dancers
 * a figure call's `who` leaves out, who simply stand, and for the eight-beat
 * line-up gap between dances, with `origins` set to where the previous dance
 * left everybody. `origins` is the only way a *pure* figure can know where a
 * dancer came from, and it is plain data, so it still serialises.
 *
 * A station with no `to` entry ends where it started, which is what makes the
 * same figure serve as "stand still".
 */
export const WALK_TO_STATION: FigureDef<WalkToStationParams> = {
  id: "walk-to-station",
  call: "WALK TO YOUR PLACE",
  lead: 2,
  beats: 8,
  defaults: { to: {}, from: {}, origins: {}, turn: {}, bowPx: DEFAULT_BOW_PX },

  sample(group: Group, station: StationId, t: Beat, params: WalkToStationParams): PoseSample {
    const step = walkStep(
      startPose(group, station, params),
      endPose(group, station, params),
      t,
      params.beats,
      params.bowPx,
    );
    return step.moving ? walking(step.p, step.facing) : standing(step.p, step.facing);
  },

  ends(group: Group, params: WalkToStationParams): Record<StationId, EndPose> {
    const out: Record<StationId, EndPose> = {};
    for (const s of group.stations) out[s.id] = endPose(group, s.id, params);
    return out;
  },
};

function startPose(group: Group, station: StationId, params: WalkToStationParams): EndPose {
  return params.origins[station] ?? groupStationPose(group, params.from[station] ?? station);
}

function endPose(group: Group, station: StationId, params: WalkToStationParams): EndPose {
  const target = params.to[station];
  const base = target === undefined ? startPose(group, station, params) : groupStationPose(group, target);
  const turn: Angle = params.turn[station] ?? 0;
  return turn === 0 ? base : { p: base.p, facing: base.facing + turn };
}
