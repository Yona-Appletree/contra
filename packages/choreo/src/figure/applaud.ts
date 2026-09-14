import type { Angle, Beat, PoseSample } from "@caller/core";
import { angleLerp, bodyPoint, smooth } from "@caller/core";
import type { StationId } from "../formation/Formation.js";
import type { Group } from "../group/Group.js";
import { groupStationPose } from "../group/Group.js";
import type { EndPose, FigureDef, FigureParams } from "./FigureDef.js";
import { standing } from "./standing.js";

/** `applaud`'s parameters. All data, so a dance carrying them still serialises. */
export interface ApplaudParams extends FigureParams {
  /** Station → where it actually stands, in world px. Default: its own station. */
  origins: Record<StationId, EndPose>;
  /**
   * The world angle everybody turns to face while they clap — the band.
   *
   * `null` keeps whatever facing the dancer came in with, which is what a form
   * with nobody to applaud wants. The decider passes the **set** frame's axis
   * turned end for end (up the set, where the stage is), never a group frame's:
   * a group at the bottom end of a becket line runs in a reversed frame, and
   * those dancers would otherwise applaud the back wall.
   */
  face: Angle | null;
  /** Beats spent turning toward {@link face} before the hands come up. */
  turnBeats: Beat;
  /** Claps per beat, before each dancer's own jitter. */
  clapsPerBeat: number;
  /** How far in front of the chest the hands meet, px. */
  forwardPx: number;
  /** How far out to each side the hands part between claps, px. */
  spreadPx: number;
  /** How far below shoulder height the hands clap, px. */
  dropPx: number;
}

/**
 * The applause at the end of a dance: everybody turns toward the band and
 * claps where they stand.
 *
 * Nobody travels — a dance ends with the hall standing in its lines, and this
 * is the beat or two before the caller picks the microphone back up. The two
 * hands meet in front of the chest and part again, which is what a clap looks
 * like from above; the head follows the body round to the band. Each dancer
 * claps at their own slightly different rate, seeded from their own id, so
 * eighteen dancers read as a hall applauding rather than as a drill team — the
 * same overlapping-clap idea the synthesised applause in `@caller/music` is
 * built on.
 *
 * Form-neutral, like everything else in this package: which way the band is is
 * a parameter, not something this figure works out.
 */
export const APPLAUD: FigureDef<ApplaudParams> = {
  id: "applaud",
  call: "GIVE THE BAND A HAND",
  describe:
    "Stop where you are, turn to face the band at the top of the hall, and clap: the hands come together in front of the chest and part again, a couple of claps to the beat, everybody at their own rate. Nobody moves their feet. It is what a hall does for ten seconds at the end of every dance, and no dance calls it — the caller's script puts it between two dances.",
  lead: 0,
  beats: 8,
  defaults: {
    origins: {},
    face: null,
    turnBeats: 2,
    clapsPerBeat: 1.5,
    forwardPx: 6,
    spreadPx: 5.5,
    dropPx: 6,
  },

  sample(group: Group, station: StationId, t: Beat, params: ApplaudParams): PoseSample {
    const start = startPose(group, station, params);
    const facing = facingAt(start.facing, t, params);
    const half = params.spreadPx * clapPhase(t, params, group.members[station] ?? station);
    return {
      ...standing(start.p, facing),
      hands: {
        L: { p: bodyPoint(start.p, facing, params.forwardPx, -half), drop: params.dropPx },
        R: { p: bodyPoint(start.p, facing, params.forwardPx, half), drop: params.dropPx },
      },
    };
  },

  ends(group: Group, params: ApplaudParams): Record<StationId, EndPose> {
    const out: Record<StationId, EndPose> = {};
    for (const s of group.stations) {
      const start = startPose(group, s.id, params);
      out[s.id] = { p: start.p, facing: facingAt(start.facing, params.beats, params) };
    }
    return out;
  },
};

/** Where this station's dancer is standing when the clapping starts. */
const startPose = (group: Group, station: StationId, params: ApplaudParams): EndPose =>
  params.origins[station] ?? groupStationPose(group, station);

/** The facing `t` beats in: eased from where the dancer was toward the band. */
function facingAt(from: Angle, t: Beat, params: ApplaudParams): Angle {
  if (params.face === null) return from;
  const k = params.turnBeats <= 0 ? 1 : smooth(Math.min(1, Math.max(0, t / params.turnBeats)));
  return angleLerp(from, params.face, k);
}

/**
 * How far apart the hands are, `t` beats in: 0 with the hands together at the
 * moment of a clap, 1 with them fully parted between two.
 *
 * Every dancer's hands start together and then drift out of step, because each
 * one claps at a rate scaled by a number derived from their own id. It is a
 * hash rather than a random number so a figure stays pure: the same dancer
 * claps the same way every time the renderer samples this beat.
 */
export function clapPhase(t: Beat, params: ApplaudParams, who: string): number {
  const jitter = hashUnit(who);
  const rate = params.clapsPerBeat * (CLAP_RATE_SPREAD.lo + CLAP_RATE_SPREAD.range * jitter);
  return (1 - Math.cos(Math.PI * 2 * (t * rate + jitter))) / 2;
}

/** The slowest and fastest clapper, as a fraction of `clapsPerBeat`. */
const CLAP_RATE_SPREAD = { lo: 0.85, range: 0.3 };

/** A stable number in `[0, 1)` from a string: FNV-1a, folded into a unit. */
export function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
