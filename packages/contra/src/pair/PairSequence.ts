import type { Beat, PoseSample, Vec2 } from "@caller/core";
import { SEAM_BEATS, easeSeam, seamProgress } from "@caller/core";
import type { PairCall } from "./FigureDef.js";
import { SAMPLE_DT, pairCall } from "./FigureDef.js";
import { allemande } from "./allemande.js";
import { balance } from "./balance.js";
import { doSiDo } from "./do-si-do.js";
import { fallBack } from "./fall-back.js";
import { swing } from "./swing.js";
import { walkIn } from "./walk-in.js";
import type { PairFrame, PairRole } from "./PairFrame.js";
import { DEFAULT_PAIR_FRAME } from "./PairFrame.js";

/** One dancer as the renderer wants them: a pose and the floor velocity behind it. */
export interface PairDancerSample {
  pose: PoseSample;
  /** px per beat, which is what `quietMotion` needs to swing the feet. */
  velocity: Vec2;
}

/** Both dancers at one beat of a sequence, and which figure they are in. */
export interface PairSequenceSample {
  beat: Beat;
  /** Index into the sequence's calls. */
  index: number;
  /** Beats into that figure. */
  t: Beat;
  call: PairCall;
  lark: PairDancerSample;
  robin: PairDancerSample;
}

/**
 * A loop of figures on one pair, and the only thing here that knows about
 * order. M7's timeline replaces it; until then the pair page needs something
 * to play and the closure tests need something to check.
 */
export interface PairSequence {
  readonly calls: readonly PairCall[];
  /** Total length, in beats. */
  readonly beats: Beat;
  /** The beat each call starts on. */
  readonly starts: readonly Beat[];
  /** Which call is running at `beat`, wrapping. */
  indexAt(beat: Beat): number;
  /** One dancer's pose at an absolute beat, seam-eased into the figure before. */
  poseAt(beat: Beat, role: PairRole): PoseSample;
  /** Both dancers with velocities, ready for a frame. */
  sampleAt(beat: Beat): PairSequenceSample;
}

export function createPairSequence(calls: readonly PairCall[]): PairSequence {
  const starts: Beat[] = [];
  let total = 0;
  for (const call of calls) {
    starts.push(total);
    total += call.beats;
  }

  const wrap = (beat: Beat): Beat => ((beat % total) + total) % total;

  const indexAt = (beat: Beat): number => {
    const b = wrap(beat);
    let i = calls.length - 1;
    while (i > 0 && b < (starts[i] as Beat)) i--;
    return i;
  };

  const poseAt = (beat: Beat, role: PairRole): PoseSample => {
    const b = wrap(beat);
    const i = indexAt(b);
    const call = calls[i] as PairCall;
    const t = b - (starts[i] as Beat);
    const pose = call.sample(role, t);
    if (t >= SEAM_BEATS) return pose;
    const previous = calls[(i + calls.length - 1) % calls.length] as PairCall;
    return easeSeam(previous.sample(role, previous.beats), pose, seamProgress(t));
  };

  const dancerAt = (beat: Beat, role: PairRole): PairDancerSample => {
    const pose = poseAt(beat, role);
    const next = poseAt(beat + SAMPLE_DT, role);
    return {
      pose,
      velocity: [(next.p[0] - pose.p[0]) / SAMPLE_DT, (next.p[1] - pose.p[1]) / SAMPLE_DT],
    };
  };

  return {
    calls,
    beats: total,
    starts,
    indexAt,
    poseAt,
    sampleAt: (beat) => {
      const b = wrap(beat);
      const i = indexAt(b);
      return {
        beat: b,
        index: i,
        t: b - (starts[i] as Beat),
        call: calls[i] as PairCall,
        lark: dancerAt(b, "lark"),
        robin: dancerAt(b, "robin"),
      };
    },
  };
}

/** The pair with the lark on the left, and the same pair after they have swapped sides. */
const LARK_LEFT: PairFrame = DEFAULT_PAIR_FRAME;
const LARK_RIGHT: PairFrame = { ...DEFAULT_PAIR_FRAME, axis: 0 };

/**
 * The two-dancers spike's 64-beat sequence, figure for figure: A1 walk in and
 * take two hands, balance, swing; A2 allemande left 1½, do-si-do; B1 balance,
 * swing; B2 allemande left once, fall back. It closes on itself, which is what
 * the closure test checks.
 */
export const DEMO_PAIR_SEQUENCE: PairSequence = createPairSequence([
  pairCall(walkIn, LARK_LEFT),
  pairCall(balance, LARK_LEFT),
  pairCall(swing, LARK_LEFT, { turns: 2, beats: 8 }),
  pairCall(allemande, LARK_LEFT, { hand: "L", amount: 1.5 }),
  pairCall(doSiDo, LARK_RIGHT),
  pairCall(balance, LARK_RIGHT, { takeHands: true }),
  pairCall(swing, LARK_RIGHT, { turns: 2.5, beats: 12 }),
  pairCall(allemande, LARK_LEFT, { hand: "L", amount: 1 }),
  // The allemande has already let the hands go.
  pairCall(fallBack, LARK_LEFT, { release: false }),
]);
