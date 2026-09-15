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
import {
  WAIT_OUT,
  frameAngle,
  framePoint,
  groupStation,
  groupStationPose,
  standing,
  waitOutStart,
} from "@caller/choreo";
import { COUPLE_PITCH_PX } from "../formation/becket.js";

/**
 * {@link waitOut}'s parameters: the engine's, less `crossTo`, which is read off
 * the waiting couple's own stations instead, plus {@link crossShort}.
 */
export type ContraWaitOutParams = Omit<WaitOutParams, "crossTo"> & {
  /**
   * Whether a mirror crossing lands **one couple place short** of the place the
   * couple comes in on — M9c. Defaults `false`, which is the engine's own
   * landing, station for station.
   *
   * This is the whole of the becket end-of-set fix and it belongs to the
   * *planner*, not to the formation, because it is a claim about what a cycle
   * boundary does to the bodies:
   *
   * - A time through that begins **where the last one left everybody**
   *   (`contraCyclePlanner`'s `"standing"`, which is the figure model's whole
   *   point) leaves every dancer one couple place behind the place their new
   *   slot names, and the first figure walks them in. `progressed 40.0000 px`
   *   is that distance, printed for every becket dance since M6. A waiting
   *   couple whose crossing finished *on* the progressed place was therefore
   *   the one body the boundary moved — and it landed on the couple that had
   *   just danced there, which had not moved yet. That is the `collision
   *   0.000 px` at beat 64 that M9b measured on Are You 'Most Done? and The
   *   Set Monster at every checked length.
   * - A time through that restarts from the formation's **first places**
   *   (`legacyCyclePlanner`, and `defaultCyclePlanner` — today's shipped path
   *   and AC1's baseline) teleports every dancer on to their new place at the
   *   boundary, so the waiting couple has to be on its own or the seam is
   *   40 px wide. `sequence.test.ts`'s becket closure is what says so.
   *
   * So the planner that knows which of the two it is sets this, and a dance
   * never writes it.
   */
  crossShort: boolean;
};

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
    // `cross: false` (M2's waiting-couple sweep) means there is nothing to
    // cross to yet this instance — mirror this exactly as the engine's own
    // `geometry` does (no crossing beats at all), rather than reading
    // `crossBeats` on its own and crossing anyway.
    const crossBeats = params.cross ? params.crossBeats : 0;
    const crossStart = params.beats - crossBeats;
    if (engine.crossTo !== "mirror" || !params.cross || t < crossStart) {
      return WAIT_OUT.sample(group, station, t, engine);
    }
    return crossTogether(group, station, t - crossStart, crossBeats, engine, params.crossShort);
  },

  ends(group: Group, params: ContraWaitOutParams): Record<StationId, EndPose> {
    const engine = resolve(group, params);
    if (engine.crossTo !== "mirror" || !params.cross || !params.crossShort) {
      return WAIT_OUT.ends(group, engine);
    }
    const centre = group.frame.centre;
    const out: Record<StationId, EndPose> = {};
    for (const s of group.stations) {
      const from = crossFrom(group, s.id);
      out[s.id] = {
        p: [2 * centre[0] - from.p[0], 2 * centre[1] - from.p[1]],
        facing: from.facing + 180,
      };
    }
    return out;
  },
};

/**
 * Where a becket couple's crossing is reckoned from: its own waiting place,
 * **one couple place back along its own line** — M9c.
 *
 * `@caller/choreo`'s mirror reckons the crossing from where the couple *started*
 * the figure (`WaitOutParams.startPlaces`, which is the waiting place unless a
 * dance says otherwise), and reflecting the waiting place through the wait
 * frame's centre lands the couple exactly on the dancing place it comes in on.
 * That is one couple place too far, and the collision it causes is a rule of
 * the formation rather than a fault in any dance:
 *
 * **A becket cycle boundary moves the slots and leaves every body where it
 * stands.** Every dancer therefore ends a time through one couple place *behind*
 * the place their next time through calls theirs, and the first figure of that
 * time through walks them the rest of the way — that is what `progressed
 * 40.0000 px` has always been reporting. The waiting couple was the one body
 * the boundary did move, because its crossing is planned to finish on the
 * progressed place; so it arrived on a place the couple that had just danced
 * there was still standing on, and the two shared a point at exactly beat 64
 * (Are You 'Most Done? and The Set Monster, every checked length; M9b measured
 * it). Reckoned from one couple place back, the waiting couple is behind its
 * new place by exactly what everybody else is behind theirs, and the dance
 * gathers all of them together.
 *
 * **Butter does not move by a pixel**, and that is the check on this rule
 * rather than a coincidence. A becket dance that slides in its own first figure
 * writes `Dance.startPlaces` — `BECKET_BEFORE_SLIDE`, whose two wait stations
 * are this very point — so the landing this computes is the landing Butter has
 * always had. The difference is that it is now the formation's rule for every
 * becket dance instead of one record's special case.
 *
 * Only the mirror crossing is reckoned this way: a duple improper couple swaps
 * across its own waiting row, which no dancing place is on.
 */
function crossFrom(group: Group, station: StationId): EndPose {
  const s = groupStation(group, station);
  return {
    // Local `+y` runs along the frame's axis, and a wait frame is turned end
    // for end at the bottom of the set, so `+y` is "one place back along my own
    // line" at both ends — the same sign `BECKET_BEFORE_SLIDE` uses.
    p: framePoint(group.frame, [s.p[0], s.p[1] + COUPLE_PITCH_PX]),
    facing: frameAngle(group.frame, s.facing),
  };
}

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
  const rest: Record<string, unknown> = { ...defaults, crossShort: false };
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
  crossShort: boolean,
): PoseSample {
  const home = groupStationPose(group, station);
  const other = group.stations.find((s) => s.id !== station);
  if (!other) throw new Error(`wait-out: "${station}" has nobody to cross with`);
  const mate = groupStationPose(group, other.id);
  const centre = group.frame.centre;
  const mid: Vec2 = [(home.p[0] + mate.p[0]) / 2, (home.p[1] + mate.p[1]) / 2];
  const offset: Vec2 = [home.p[0] - mid[0], home.p[1] - mid[1]];
  // Where the crossing is reckoned from: one couple place back along the
  // couple's own line when the planner asked for the short landing
  // ({@link crossFrom}), and otherwise where the couple started the figure —
  // the waiting place unless the dance progressed in its own first figure and
  // the couple slid into the waiting place from one place back. `ends` says the
  // same thing either way, and the two have to agree to 0.01 px.
  const at = (id: StationId): EndPose =>
    crossShort ? crossFrom(group, id) : waitOutStart(group, params, id);
  const from = at(station);
  const fromMate = at(other.id);
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
