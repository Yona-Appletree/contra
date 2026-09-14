import type { Beat, PoseSample, Side, Vec2 } from "@caller/core";
import { dirOf, dist, leftOf } from "@caller/core";

/**
 * Trajectory assertions: what a figure's dancers actually did, checked against
 * what a caller would say they should do.
 *
 * The oracles in `oracles.ts` ask whether the model is self-consistent. These
 * ask whether the *choreography* is right — did the two of them pass right
 * shoulders in the middle, did he walk backward through the courtesy turn,
 * were those two hands one point the whole way. A figure can be perfectly
 * continuous, perfectly closed and completely wrong, and that is the class of
 * bug this file exists to catch.
 *
 * Nothing here knows what a contra is: it takes sampled poses, ids and floor
 * points. `@caller/contra`'s `figureChecks.ts` is where the contra figures'
 * own assertions live.
 *
 * Every assertion returns a {@link TrajectoryResult} and **never throws**, so a
 * report can print a whole figure's worth of them and a test can assert over
 * the list. A result carries the worst evidence it found, with the beat, so
 * "the hey does not pass in the middle" comes with the number that says so.
 */

/** A span of beats, inclusive. */
export interface BeatWindow {
  from: Beat;
  to: Beat;
}

/** What one assertion found. */
export interface TrajectoryResult {
  /** What was checked, in a caller's words. */
  label: string;
  pass: boolean;
  /** Why, in one sentence, whether it passed or not. */
  note: string;
  /** The measurement that decided it, and where. */
  worst?: { beat: Beat; value: number; unit: string };
}

/** Two hands held as one floor point at an instant, as a figure declares them. */
export interface HandJoinAt {
  a: string;
  aSide: Side;
  b: string;
  bSide: Side;
}

/**
 * Sampled poses, ready to be asked questions about.
 *
 * Built once per figure by {@link sampleTrack} and shared by every assertion,
 * so a figure is sampled once however many things are asked of it.
 */
export interface Track {
  ids: readonly string[];
  beats: readonly Beat[];
  /** The pose of `id` at sample `index`. */
  pose(id: string, index: number): PoseSample;
  /** The hands the figure says are joined at sample `index`. */
  joins(index: number): readonly HandJoinAt[];
  /** The sample index nearest `beat`. */
  indexAt(beat: Beat): number;
}

/** Sample every id at every `step` beats from `0` to `beats`. */
export function sampleTrack(
  ids: readonly string[],
  beats: Beat,
  sample: (id: string, t: Beat) => PoseSample,
  joinsAt: (t: Beat) => readonly HandJoinAt[] = () => [],
  step: Beat = 1 / 32,
): Track {
  const count = Math.round(beats / step);
  const times: Beat[] = [];
  for (let i = 0; i <= count; i++) times.push(i * step);
  const poses = new Map<string, PoseSample[]>();
  for (const id of ids)
    poses.set(
      id,
      times.map((t) => sample(id, t)),
    );
  const joins = times.map((t) => joinsAt(t));
  return {
    ids,
    beats: times,
    pose(id, index) {
      const row = poses.get(id);
      if (!row) throw new Error(`no dancer "${id}" in [${ids.join(", ")}]`);
      const found = row[Math.max(0, Math.min(row.length - 1, index))];
      if (!found) throw new Error(`no sample ${index} for "${id}"`);
      return found;
    },
    joins: (index) => joins[Math.max(0, Math.min(joins.length - 1, index))] ?? [],
    indexAt: (beat) => Math.max(0, Math.min(count, Math.round(beat / step))),
  };
}

/** The sample indices inside a window, or the whole track when none is given. */
function windowOf(track: Track, window?: BeatWindow): { first: number; last: number } {
  if (!window) return { first: 0, last: track.beats.length - 1 };
  return { first: track.indexAt(window.from), last: track.indexAt(window.to) };
}

/** How `passes` is asked. */
export interface PassesOptions {
  /** How close the two have to come, px. */
  within: number;
  /** Where on the floor the pass has to happen. */
  near?: Vec2;
  /** How far from `near` the closest point may be, px. */
  nearPx?: number;
  /** Which of `a`'s shoulders `b` is on at the closest point. */
  shoulder?: Side;
  /** Where in the figure to look. */
  beatWindow?: BeatWindow;
  /** How head-on the two have to be moving: the dot of their unit velocities. */
  opposingDot?: number;
}

/**
 * `a` and `b` pass each other: they come within `within` px, near `near`,
 * travelling in opposite directions, with `b` on `a`'s named shoulder at the
 * closest point.
 *
 * This is the assertion a hey is made of. A weave that has become two people
 * orbiting a lane rather than two people passing shoulder to shoulder fails it
 * on the shoulder test while passing everything else.
 */
export function passes(
  track: Track,
  a: string,
  b: string,
  options: PassesOptions,
): TrajectoryResult {
  const label = `${a} and ${b} pass${options.shoulder ? ` ${options.shoulder} shoulders` : ""}${
    options.beatWindow ? ` around beat ${midBeat(options.beatWindow)}` : ""
  }`;
  const { first, last } = windowOf(track, options.beatWindow);
  let closest = Infinity;
  let at = first;
  for (let i = first; i <= last; i++) {
    const gap = dist(track.pose(a, i).p, track.pose(b, i).p);
    if (gap < closest) {
      closest = gap;
      at = i;
    }
  }
  const beat = track.beats[at] ?? 0;
  if (closest > options.within) {
    return fail(
      label,
      `they never come closer than ${closest.toFixed(2)} px, and a pass is ${options.within} px`,
      beat,
      closest,
      "px",
    );
  }

  const pa = track.pose(a, at);
  const pb = track.pose(b, at);
  if (options.near) {
    const midpoint: Vec2 = [(pa.p[0] + pb.p[0]) / 2, (pa.p[1] + pb.p[1]) / 2];
    const off = dist(midpoint, options.near);
    const allowed = options.nearPx ?? options.within;
    if (off > allowed) {
      return fail(
        label,
        `they pass ${off.toFixed(2)} px away from where they should, which is more than ${allowed} px`,
        beat,
        off,
        "px",
      );
    }
  }

  const va = velocity(track, a, at);
  const vb = velocity(track, b, at);
  const speeds = Math.hypot(va[0], va[1]) * Math.hypot(vb[0], vb[1]);
  const opposing = speeds < 1e-9 ? 0 : (va[0] * vb[0] + va[1] * vb[1]) / speeds;
  const wantOpposing = options.opposingDot ?? 0;
  if (opposing > -wantOpposing && opposing >= 0) {
    return fail(
      label,
      `they are not moving past each other — their velocities agree (dot ${opposing.toFixed(3)})`,
      beat,
      opposing,
      "dot",
    );
  }

  if (options.shoulder) {
    const side = shoulderOf(pa, pb.p);
    if (side !== options.shoulder) {
      return fail(
        label,
        `at the closest point ${b} is on ${a}'s ${side}, not their ${options.shoulder}`,
        beat,
        closest,
        "px",
      );
    }
  }

  return {
    label,
    pass: true,
    note: `they come ${closest.toFixed(2)} px apart at beat ${beat.toFixed(2)}`,
    worst: { beat, value: closest, unit: "px" },
  };
}

/**
 * `id` walks backward over the window: they travel, and what they travel is
 * behind them.
 *
 * A courtesy turn is a lark walking backward while the robin walks forward
 * round him. A lark who stands still, or who turns to face the way he is
 * going, is doing something else, and this is what says so.
 *
 * The measurement is the *net* displacement over the window projected on the
 * facing at the middle of it, rather than the instantaneous velocity at every
 * sample: a courtesy turn is a curve, and at the two ends of one the dancer is
 * barely moving, where an instantaneous direction is numerical noise.
 * `minTravelPx` is what separates walking from standing still — a dancer who
 * covers less than a pixel over a beat is not walking anywhere.
 */
export function walksBackward(
  track: Track,
  id: string,
  window: BeatWindow,
  minTravelPx = 1,
): TrajectoryResult {
  const label = `${id} walks backward from beat ${window.from} to ${window.to}`;
  const { first, last } = windowOf(track, window);
  const start = track.pose(id, first);
  const end = track.pose(id, last);
  const mid = track.pose(id, Math.round((first + last) / 2));
  const beat = track.beats[last] ?? 0;

  const moved: Vec2 = [end.p[0] - start.p[0], end.p[1] - start.p[1]];
  const travelled = Math.hypot(moved[0], moved[1]);
  if (travelled < minTravelPx) {
    return fail(
      label,
      `they do not walk anywhere: ${travelled.toFixed(3)} px over the whole window`,
      beat,
      travelled,
      "px",
    );
  }
  const face = dirOf(mid.facing);
  const along = moved[0] * face[0] + moved[1] * face[1];
  if (along > -minTravelPx) {
    return fail(
      label,
      `only ${(-along + 0).toFixed(3)} px of the ${travelled.toFixed(3)} px they travel is behind them`,
      beat,
      along,
      "px",
    );
  }
  return {
    label,
    pass: true,
    note: `they travel ${travelled.toFixed(2)} px, ${(-along).toFixed(2)} px of it behind them`,
    worst: { beat, value: along, unit: "px" },
  };
}

/**
 * The span of beats over which a figure *declares* two named hands joined.
 *
 * `handsJoined` needs a window, and the honest one to give it is the figure's
 * own: a take that runs longer than the caller of the assertion guessed is not
 * a defect, and a window picked by hand turns into a tuning knob. Returns
 * `undefined` when the figure never declares this join at all, which is itself
 * worth reporting.
 */
export function joinWindow(
  track: Track,
  a: string,
  aSide: Side,
  b: string,
  bSide: Side,
): BeatWindow | undefined {
  const declares = (i: number): boolean =>
    track
      .joins(i)
      .some(
        (j) =>
          (j.a === a && j.aSide === aSide && j.b === b && j.bSide === bSide) ||
          (j.a === b && j.aSide === bSide && j.b === a && j.bSide === aSide),
      );
  let from: Beat | undefined;
  let to: Beat | undefined;
  for (let i = 0; i < track.beats.length; i++) {
    if (!declares(i)) continue;
    from ??= track.beats[i];
    to = track.beats[i];
  }
  return from === undefined || to === undefined ? undefined : { from, to };
}

/**
 * Two named hands are one floor point for the whole window, and neither is
 * ever let go of.
 *
 * "One shared floor point" is AC2; this adds *and never released*, which is
 * what the user is describing when they say the arms disappear between the
 * balance and the swing.
 */
export function handsJoined(
  track: Track,
  a: string,
  aSide: Side,
  b: string,
  bSide: Side,
  window: BeatWindow,
  tolerancePx = 0.1,
): TrajectoryResult {
  const label = `${a}'s ${aSide} stays joined to ${b}'s ${bSide} from beat ${window.from} to ${window.to}`;
  const { first, last } = windowOf(track, window);
  let worst = 0;
  let beat = track.beats[first] ?? 0;
  for (let i = first; i <= last; i++) {
    const ha = track.pose(a, i).hands[aSide];
    const hb = track.pose(b, i).hands[bSide];
    const at = track.beats[i] ?? 0;
    if (ha === "down" || hb === "down") {
      return fail(label, `a hand is let go at beat ${at.toFixed(3)}`, at, Infinity, "px");
    }
    if (!Number.isFinite(ha.p[0]) || !Number.isFinite(hb.p[0])) {
      return fail(label, `a hand is not a number at beat ${at.toFixed(3)}`, at, NaN, "px");
    }
    const gap = dist(ha.p, hb.p);
    if (gap > worst) {
      worst = gap;
      beat = at;
    }
  }
  if (worst > tolerancePx) {
    return fail(label, `the two hands are ${worst.toFixed(3)} px apart`, beat, worst, "px");
  }
  return {
    label,
    pass: true,
    note: `never more than ${worst.toFixed(4)} px apart`,
    worst: { beat, value: worst, unit: "px" },
  };
}

/**
 * A hand does not move *relative to the dancer's own body* over the window.
 *
 * The user on long lines: "arms don't really move in that figure, everyone's
 * just holding hands." The dancers walk in and out, so the hand moves across
 * the room; what should not change is where the hand is with respect to the
 * shoulder it hangs from.
 */
export function handsStill(
  track: Track,
  id: string,
  window: BeatWindow,
  tolerancePx: number,
  side?: Side,
): TrajectoryResult {
  const sides: Side[] = side ? [side] : ["L", "R"];
  const label = `${id}'s ${side ?? "hands"} stay still on the body from beat ${window.from} to ${window.to}`;
  const { first, last } = windowOf(track, window);
  let worst = 0;
  let beat = track.beats[first] ?? 0;
  for (const s of sides) {
    const start = localHand(track.pose(id, first), s);
    if (!start)
      return fail(label, `the ${s} hand is not placed at the start`, beat, Infinity, "px");
    for (let i = first; i <= last; i++) {
      const here = localHand(track.pose(id, i), s);
      const at = track.beats[i] ?? 0;
      if (!here)
        return fail(label, `the ${s} hand is let go at beat ${at.toFixed(3)}`, at, Infinity, "px");
      const moved = Math.hypot(here[0] - start[0], here[1] - start[1], here[2] - start[2]);
      if (moved > worst) {
        worst = moved;
        beat = at;
      }
    }
  }
  if (worst > tolerancePx) {
    return fail(
      label,
      `a hand moves ${worst.toFixed(3)} px on the body, and ${tolerancePx} px is the most it should`,
      beat,
      worst,
      "px",
    );
  }
  return {
    label,
    pass: true,
    note: `never more than ${worst.toFixed(3)} px of movement on the body`,
    worst: { beat, value: worst, unit: "px" },
  };
}

/** `id` stays where they started for the whole window, within `tolerancePx`. */
export function staysOnPlace(
  track: Track,
  id: string,
  window: BeatWindow,
  tolerancePx: number,
): TrajectoryResult {
  const label = `${id} stays on their place from beat ${window.from} to ${window.to}`;
  const { first, last } = windowOf(track, window);
  const home = track.pose(id, first).p;
  let worst = 0;
  let beat = track.beats[first] ?? 0;
  for (let i = first; i <= last; i++) {
    const away = dist(track.pose(id, i).p, home);
    if (away > worst) {
      worst = away;
      beat = track.beats[i] ?? 0;
    }
  }
  if (worst > tolerancePx) {
    return fail(label, `they travel ${worst.toFixed(3)} px`, beat, worst, "px");
  }
  return {
    label,
    pass: true,
    note: `never more than ${worst.toFixed(3)} px off their place`,
    worst: { beat, value: worst, unit: "px" },
  };
}

/** `id` finishes the figure on `station`, within `tolerancePx`. */
export function endsOn(
  track: Track,
  id: string,
  station: { id?: string; p: Vec2 },
  tolerancePx: number,
): TrajectoryResult {
  const label = `${id} ends on ${station.id ?? `(${station.p[0].toFixed(1)}, ${station.p[1].toFixed(1)})`}`;
  const last = track.beats.length - 1;
  const beat = track.beats[last] ?? 0;
  const away = dist(track.pose(id, last).p, station.p);
  if (away > tolerancePx) {
    return fail(label, `they end ${away.toFixed(3)} px away`, beat, away, "px");
  }
  return {
    label,
    pass: true,
    note: `they end ${away.toFixed(4)} px away`,
    worst: { beat, value: away, unit: "px" },
  };
}

/** Which of `pose`'s shoulders the point `p` lies on. */
export function shoulderOf(pose: PoseSample, p: Vec2): Side {
  const left = leftOf(pose.facing);
  const dx = p[0] - pose.p[0];
  const dy = p[1] - pose.p[1];
  return left[0] * dx + left[1] * dy > 0 ? "L" : "R";
}

/** The floor velocity of `id` at a sample, px per beat, by central difference. */
export function velocity(track: Track, id: string, index: number): Vec2 {
  const last = track.beats.length - 1;
  const a = Math.max(0, index - 1);
  const b = Math.min(last, index + 1);
  const dt = (track.beats[b] ?? 0) - (track.beats[a] ?? 0);
  if (dt <= 0) return [0, 0];
  const pa = track.pose(id, a).p;
  const pb = track.pose(id, b).p;
  return [(pb[0] - pa[0]) / dt, (pb[1] - pa[1]) / dt];
}

/** A placed hand in the dancer's own frame: forward, to their right, and up. */
function localHand(pose: PoseSample, side: Side): readonly [number, number, number] | undefined {
  const hand = pose.hands[side];
  if (hand === "down") return undefined;
  if (!Number.isFinite(hand.p[0]) || !Number.isFinite(hand.drop)) return undefined;
  const rad = (pose.facing * Math.PI) / 180;
  const dx = hand.p[0] - pose.p[0];
  const dy = hand.p[1] - pose.p[1];
  return [
    dx * Math.cos(rad) + dy * Math.sin(rad),
    -dx * Math.sin(rad) + dy * Math.cos(rad),
    -hand.drop,
  ];
}

const midBeat = (w: BeatWindow): string => ((w.from + w.to) / 2).toFixed(1);

const fail = (
  label: string,
  note: string,
  beat: Beat,
  value: number,
  unit: string,
): TrajectoryResult => ({ label, pass: false, note, worst: { beat, value, unit } });
