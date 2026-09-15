import type { Angle, Beat, PoseSample } from "@caller/core";
import { angleLerp, smooth } from "@caller/core";
import type { StationId } from "../formation/Formation.js";
import type { Group } from "../group/Group.js";
import { groupStationPose } from "../group/Group.js";
import type { EndPose, FigureDef, FigureParams } from "./FigureDef.js";
import { standing } from "./standing.js";

/** `thanks`'s parameters. All data, so a dance carrying them still serialises. */
export interface ThanksParams extends FigureParams {
  /** Station → where it actually stands, in world px. Default: its own station. */
  origins: Record<StationId, EndPose>;
  /**
   * The world angle each station turns to face for the **first** half —
   * their partner, the person the timeline says they danced the last time
   * through with. `null` keeps whatever facing the dancer came in with,
   * which is what a station with nobody to thank wants (a lone waiting
   * couple has already turned to face each other as partners, so its second
   * half has nobody left to be a neighbour).
   *
   * The decider computes this per station, one call ahead of the figure:
   * `@caller/choreo` figures are pure functions of a group and a beat, and
   * "who is my partner" is a question about the *set*, which only the
   * decider has in hand.
   */
  partnerFace: Record<StationId, Angle | null>;
  /** As {@link partnerFace}, for the **second** half — the neighbour across. */
  neighbourFace: Record<StationId, Angle | null>;
  /** Beats spent turning toward this half's target, at the start of the half. */
  turnBeats: Beat;
  /** Beats, once turned, that the acknowledging nod takes. */
  nodBeats: Beat;
  /** How far the head tips for the nod, degrees, before it comes back up. */
  nodDeg: Angle;
}

/**
 * The thanks at the end of a dance: everybody turns and nods to the people
 * they danced it with, instead of clapping.
 *
 * The user: "no one claps in contra." Nobody travels — a dance ends with the
 * hall standing in its lines, and this is the beat or two before the caller
 * picks the microphone back up. Over the first half of the stretch every
 * dancer turns to face their **partner** and gives a small acknowledging nod;
 * over the second half, their **neighbour** across. Arms stay relaxed at the
 * dancer's sides throughout — no hands are ever placed — and the nod is a
 * head motion only (`look`, never `facing`'s body-lean or the dancer's own
 * `p`), so nothing here reads to the motion oracle as a bow that dips the
 * torso.
 *
 * Form-neutral, like everything else in this package: which way a partner or
 * a neighbour is is a parameter, not something this figure works out — the
 * decider reads the set's own couples for that.
 */
export const THANKS: FigureDef<ThanksParams> = {
  id: "thanks",
  call: "THANK YOUR PARTNER",
  describe:
    "Stop where you are. Turn to your partner — the person you just danced this with — and give them a small nod: nothing that bends you forward, just a little tip of the head. Then turn to your neighbour across and do the same. Arms stay down at your sides the whole time; nobody claps and nobody bows. It is what a hall does for ten seconds at the end of every dance, and no dance calls it — the caller's script puts it between two dances.",
  lead: 0,
  beats: 8,
  defaults: {
    origins: {},
    partnerFace: {},
    neighbourFace: {},
    turnBeats: 1.5,
    nodBeats: 1,
    nodDeg: 10,
  },

  sample(group: Group, station: StationId, t: Beat, params: ThanksParams): PoseSample {
    const start = startPose(group, station, params);
    const half = params.beats / 2;
    const firstLeg = t < half;
    const legT = firstLeg ? t : t - half;
    const legTarget = firstLeg
      ? (params.partnerFace[station] ?? null)
      : (params.neighbourFace[station] ?? null);
    const legFrom = firstLeg
      ? start.facing
      : facingAt(start.facing, half, params.partnerFace[station] ?? null, params.turnBeats);
    const facing = facingAt(legFrom, legT, legTarget, params.turnBeats);
    return {
      ...standing(start.p, facing),
      look: facing + nodOffset(legT, params),
    };
  },

  ends(group: Group, params: ThanksParams): Record<StationId, EndPose> {
    const out: Record<StationId, EndPose> = {};
    for (const s of group.stations) {
      const start = startPose(group, s.id, params);
      const half = params.beats / 2;
      const afterFirst = facingAt(
        start.facing,
        half,
        params.partnerFace[s.id] ?? null,
        params.turnBeats,
      );
      const finalFacing = facingAt(
        afterFirst,
        half,
        params.neighbourFace[s.id] ?? null,
        params.turnBeats,
      );
      out[s.id] = { p: start.p, facing: finalFacing };
    }
    return out;
  },
};

/** Where this station's dancer is standing when the thanks starts. */
const startPose = (group: Group, station: StationId, params: ThanksParams): EndPose =>
  params.origins[station] ?? groupStationPose(group, station);

/**
 * The facing `t` beats into one half: eased from where the dancer started
 * that half toward `target`, or unchanged if there is nobody to face.
 */
function facingAt(from: Angle, t: Beat, target: Angle | null, turnBeats: Beat): Angle {
  if (target === null) return from;
  const k = turnBeats <= 0 ? 1 : smooth(Math.min(1, Math.max(0, t / turnBeats)));
  return angleLerp(from, target, k);
}

/**
 * The head's extra angle, `legT` beats into one half: zero until the turn is
 * over, a single raised-cosine bump of {@link ThanksParams.nodDeg} degrees
 * over the next {@link ThanksParams.nodBeats}, then zero again for the rest
 * of the hold. A nod, not an oscillation — it happens once per half, not on
 * every beat the way the old applause's clap did.
 */
function nodOffset(legT: Beat, params: ThanksParams): number {
  const { turnBeats, nodBeats, nodDeg } = params;
  if (nodBeats <= 0 || nodDeg === 0) return 0;
  const k = (legT - turnBeats) / nodBeats;
  if (k < 0 || k > 1) return 0;
  return nodDeg * Math.sin(Math.PI * k);
}
