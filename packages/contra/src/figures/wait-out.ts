import type { Beat, PoseSample, Vec2 } from "@caller/core";
import { dirOf, norm, smooth, sub } from "@caller/core";
import type {
  CrossOver,
  EndPose,
  FigureDef,
  Group,
  StationId,
  WaitOutParams,
} from "@caller/choreo";
import { WAIT_OUT, groupStationPose, standing, waitOutStart } from "@caller/choreo";

/**
 * {@link waitOut}'s parameters: the engine's, less `crossTo`, which is read off
 * the waiting couple's own stations instead.
 */
export type ContraWaitOutParams = Omit<WaitOutParams, "crossTo">;

/**
 * `wait-out`, with the crossing chosen from the formation instead of from a
 * parameter the decider has no way to set.
 *
 * `@caller/choreo`'s `wait-out` knows two ways for a waiting couple to reach
 * where the next time through wants it — `'swap'`, for a couple facing each
 * other across the set, and `'mirror'`, for a becket couple standing side by
 * side — but the script decider gives every waiting couple the figure's
 * defaults, so a becket set got the duple improper crossing and ended 51 px
 * from its own station. The couple's two stations say which it is: dancers who
 * face each other swap, dancers who face the same way mirror.
 *
 * Registered under the engine's own id, so the decider picks this up instead;
 * everything else about the figure — the step together, the hold, the step back
 * out, the eight-beat crossing — is the engine's, unchanged.
 */
export const waitOut: FigureDef<ContraWaitOutParams> = {
  id: WAIT_OUT.id,
  call: WAIT_OUT.call,
  describe:
    "The couple at the end of the line has nobody to dance with this time through. They wait it out, then cross over to the other line so they come back in on the other side and as the other kind of couple. In a duple improper set they face each other and swap places; in a becket set they loop round the end of the set together as a couple.",
  lead: WAIT_OUT.lead,
  beats: WAIT_OUT.beats,
  defaults: stripCrossing(WAIT_OUT.defaults),

  sample(group: Group, station: StationId, t: Beat, params: ContraWaitOutParams): PoseSample {
    const engine = resolve(group, params);
    const crossStart = params.beats - params.crossBeats;
    if (engine.crossTo !== "mirror" || t < crossStart) {
      return WAIT_OUT.sample(group, station, t, engine);
    }
    return crossTogether(group, station, t - crossStart, params.crossBeats, engine);
  },

  ends(group: Group, params: ContraWaitOutParams): Record<StationId, EndPose> {
    return WAIT_OUT.ends(group, resolve(group, params));
  },
};

/**
 * The engine's parameters, with the crossing filled in.
 *
 * Always filled in, never read from the call: the script decider hands every
 * waiting couple `wait-out`'s own defaults, so a `crossTo` that arrived here
 * would be the engine's default rather than anybody's decision.
 */
function resolve(group: Group, params: ContraWaitOutParams): WaitOutParams {
  return { ...params, crossTo: crossingOf(group) };
}

/** The engine's defaults, less the crossing this figure works out for itself. */
function stripCrossing(defaults: Omit<WaitOutParams, "beats">): Omit<ContraWaitOutParams, "beats"> {
  const rest: Record<string, unknown> = { ...defaults };
  delete rest["crossTo"];
  return rest as Omit<ContraWaitOutParams, "beats">;
}

/** How far beyond the end of the set a crossing couple loops, px. */
const MIRROR_BOW_PX = 10;

/**
 * The mirror crossing, danced as a couple: the pair walks across the set
 * together, turning around as it goes.
 *
 * `@caller/choreo`'s mirror sends each dancer along their own straight line to
 * the point opposite through the frame centre, and those two lines cross — a
 * becket end couple stands side by side, so its two dancers walk through each
 * other half way over (1.74 px apart at the tightest, against AC6's 8). Turning
 * the couple about its own midpoint while the midpoint travels reaches exactly
 * the same two places, because a point reflection *is* a half turn, and keeps
 * the two dancers their own width apart the whole way.
 */
function crossTogether(
  group: Group,
  station: StationId,
  t: Beat,
  beats: Beat,
  params: WaitOutParams,
): PoseSample {
  const home = groupStationPose(group, station);
  const other = group.stations.find((s) => s.id !== station);
  if (!other) throw new Error(`wait-out: "${station}" has nobody to cross with`);
  const mate = groupStationPose(group, other.id);
  const centre = group.frame.centre;
  const mid: Vec2 = [(home.p[0] + mate.p[0]) / 2, (home.p[1] + mate.p[1]) / 2];
  const offset: Vec2 = [home.p[0] - mid[0], home.p[1] - mid[1]];
  // The couple lands opposite where it *started* the figure, which is the
  // waiting place unless the dance progressed in its own first figure and the
  // couple slid into the waiting place from one place back. `wait-out`'s own
  // `ends` say the same thing, and the two have to agree to 0.01 px.
  const from = waitOutStart(group, params, station);
  const fromMate = waitOutStart(group, params, other.id);
  const midFrom: Vec2 = [(from.p[0] + fromMate.p[0]) / 2, (from.p[1] + fromMate.p[1]) / 2];

  const k = smooth(t / beats);
  const turn = (180 * k * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // Round the end of the set rather than through the middle of it: the couple
  // coming back in and the couple sliding out of that place would otherwise
  // share a lane, and pass 3.8 px apart.
  const away = dirOf(group.frame.axis + 180);
  const bow = MIRROR_BOW_PX * Math.sin(Math.PI * k);
  const travel: Vec2 = [2 * centre[0] - midFrom[0] - mid[0], 2 * centre[1] - midFrom[1] - mid[1]];
  const here: Vec2 = [
    mid[0] + travel[0] * k + offset[0] * cos - offset[1] * sin + away[0] * bow,
    mid[1] + travel[1] * k + offset[0] * sin + offset[1] * cos + away[1] * bow,
  ];
  const moving = t > 0 && t < beats;
  return {
    ...standing(here, home.facing + 180 * k),
    stepRate: moving ? 1 : 0,
    amp: moving ? 1 : 0,
  };
}

/**
 * Which crossing a waiting couple's own stations describe: `'swap'` when the
 * two face each other, `'mirror'` when they stand side by side.
 */
export function crossingOf(group: Group): CrossOver {
  if (group.stations.length !== 2) return "swap";
  const a = groupStationPose(group, group.stations[0]!.id);
  const b = groupStationPose(group, group.stations[1]!.id);
  const toward = norm(sub(b.p, a.p));
  const looking = dirOf(a.facing);
  return looking[0] * toward[0] + looking[1] * toward[1] > 0.5 ? "swap" : "mirror";
}
