import type { Angle, Vec2 } from "@caller/core";
import type {
  DancerId,
  GroupPlan,
  RoleName,
  RoleSet,
  Station,
  StationId,
} from "../formation/Formation.js";
import { stationById, stationPose } from "../formation/Formation.js";
import type { Frame } from "../formation/Frame.js";

/**
 * The frame a figure runs in, together with everything a pure figure needs to
 * place a dancer: the layout it is dancing on, who is on each station, and the
 * role set that says whose hand stacks on top.
 *
 * A `Group` is minted fresh for every time through, so it is immutable and its
 * `id` identifies one instance, not one place on the floor.
 */
export interface Group {
  id: string;
  frame: Frame;
  members: Readonly<Record<StationId, DancerId>>;
  stations: readonly Station[];
  roleSet: RoleSet;
}

/** The group a plan describes, ready for figures to sample. */
export const createGroup = (plan: GroupPlan, roleSet: RoleSet): Group => ({
  id: plan.id,
  frame: plan.frame,
  members: plan.members,
  stations: plan.stations,
  roleSet,
});

/** One station of a group, by id. */
export const groupStation = (group: Group, id: StationId): Station =>
  stationById(group.stations, id);

/** Where a station of this group stands, in world px. */
export const groupStationPose = (group: Group, id: StationId): { p: Vec2; facing: Angle } =>
  stationPose(group.frame, groupStation(group, id));

/** The role the dancer on this station started the figure in. */
export const stationRole = (group: Group, id: StationId): RoleName => groupStation(group, id).role;

/** Which station a dancer stands on, or `undefined` if they are not in the group. */
export function stationOf(group: Group, dancer: DancerId): StationId | undefined {
  for (const [station, id] of Object.entries(group.members)) {
    if (id === dancer) return station;
  }
  return undefined;
}
