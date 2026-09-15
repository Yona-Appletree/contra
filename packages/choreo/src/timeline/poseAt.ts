import type { Beat, BodyPath, Plant, PoseSample, Vec2 } from "@caller/core";
import {
  FOOT_REST_FORWARD_PX,
  FOOT_REST_LATERAL_PX,
  clamp01,
  easeSeam,
  memoPlants,
  plantedGait,
  seamProgress,
} from "@caller/core";
import type { DancerId, StationId } from "../formation/Formation.js";
import { stationOf } from "../group/Group.js";
import type { FigureEvent, Timeline } from "./Timeline.js";

/**
 * Where a dancer is at a beat: the figure instance that owns the beat, sampled,
 * eased out of the previous instance across the seam.
 *
 * The seam is `@caller/core`'s: `easeSeam(prev, next, seamProgress(t), beat)`
 * over the first `SEAM_BEATS` of the new figure, with `prev` the previous figure
 * sampled at its own last beat. Hands, facing and lean cross-fade; position
 * comes from the figure that is running, which is why closure has to hold to
 * 0.01 px — nothing here hides a gap. The beat goes in because a hand one side
 * leaves `'down'` is eased to or from where the hang actually puts it at that
 * instant, so the take and the release animate instead of switching.
 *
 * **And the feet** (M10): every sample whose figure left `feet` undefined and
 * whose `amp` is above zero gets the planted gait. See {@link gaitFeet}.
 */
export function poseAt(timeline: Timeline, dancer: DancerId, beat: Beat): PoseSample {
  const event = timeline.figureAt(dancer, beat);
  if (!event) throw new Error(`dancer "${dancer}" has no figure at beat ${beat}`);
  const here = withGait(
    timeline,
    event,
    dancer,
    beat,
    sampleEvent(timeline, event, dancer, beat - event.start),
  );

  const k = seamProgress(beat - event.start);
  if (k >= 1) return here;
  const previous = timeline.figureBefore(dancer, event.start);
  if (!previous) return here;

  const there = sampleEvent(timeline, previous, dancer, previous.end - previous.start);
  return easeSeam(there, here, k, beat);
}

/** One figure event sampled for one dancer, `t` beats in. */
export function sampleEvent(
  timeline: Timeline,
  event: FigureEvent,
  dancer: DancerId,
  t: Beat,
): PoseSample {
  const group = timeline.group(event.group);
  const station = bindingOf(event, dancer) ?? stationOf(group, dancer);
  if (station === undefined) {
    throw new Error(`dancer "${dancer}" is not bound in figure "${event.figure}"`);
  }
  const def = timeline.registry.get(event.figure);
  return def.sample(group, station, t, event.params);
}

/** Which station a dancer is bound to in this event. */
export function bindingOf(event: FigureEvent, dancer: DancerId): StationId | undefined {
  for (const [station, id] of Object.entries(event.bindings)) {
    if (id === dancer) return station;
  }
  return undefined;
}

/**
 * **The timeline's gait** (M10, A4/DD2).
 *
 * The planted gait needs the body path at beats *other than the one being
 * drawn*: the plant at whole beat `k` reads the body there and its velocity
 * half a beat later, and the plant a dancer is standing on at the start of a
 * figure was put down during the **previous** one. And three different things
 * produce poses — the library's interpreted definitions, `@caller/choreo`'s own
 * engine figures (`walk-to-station`, `wait-out`, `take-hands`, `standing`), and,
 * until M11, the bridged coded figures. This is the lowest layer that has a
 * time-addressable body path for every dancer on every one of those paths, that
 * knows the event's absolute `start` (which is what carries the parity), and
 * that can reach the previous event. A gait written as an interpreter service
 * would have left the engine figures and the legacy path with no foot motion at
 * all once `quietMotion` stopped supplying it.
 *
 * A sample that carries `feet` — the swing's buzz step — is returned as it is: a
 * figure that has said what its feet do still wins, exactly as before. A sample
 * with `amp === 0` is standing, and gets rest feet from `quietMotion` downstream.
 * In between, the gait is scaled by `amp`, so a dancer easing out of a figure
 * eases their feet back to rest with everything else.
 *
 * ### The seam
 *
 * Nothing here touches it. `easeSeam` copies `feet` from the incoming sample,
 * and the plants either side of a figure boundary are computed on the *absolute*
 * body path, so a foot planted in the figure before is still on the same floor
 * point a beat into the figure after. That is a seam that got better for free.
 *
 * ### The cost
 *
 * Plants change only at whole beats — two per dancer per beat, three body
 * samples each — and they are memoised per (event, dancer) in a `WeakMap` keyed
 * on the `FigureEvent`, which dies with the timeline. The memo is a cache and
 * not state: same inputs, same feet.
 */
function withGait(
  timeline: Timeline,
  event: FigureEvent,
  dancer: DancerId,
  beat: Beat,
  here: PoseSample,
): PoseSample {
  if (here.feet !== undefined) return here;
  const amp = clamp01(here.amp);
  if (amp <= 0) return here;

  const gait = gaitFor(timeline, event, dancer);
  const feet = plantedGait(gait.body, beat, { plants: gait.plants });
  if (amp >= 1) return { ...here, feet };
  return {
    ...here,
    feet: { L: toward(feet.L, REST_L, amp), R: toward(feet.R, REST_R, amp) },
  };
}

const REST_L: Vec2 = [FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX];
const REST_R: Vec2 = [FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX];

/** `rest + (foot − rest) × amp`: the gait faded out as a dancer settles. */
const toward = (foot: Vec2, rest: Vec2, amp: number): Vec2 => [
  rest[0] + (foot[0] - rest[0]) * amp,
  rest[1] + (foot[1] - rest[1]) * amp,
];

/**
 * One dancer's body path in **absolute** beats, around one event.
 *
 * Inside the event, the event's own sample. Outside it, **the neighbouring
 * figure's** — the previous one for a beat before the start, the next one for a
 * beat after the end — each at its own local beat, clamped to its own range.
 *
 * It has to reach both ways, and the reason is the plant at a figure boundary.
 * A foot that lands exactly on the beat two figures meet on is placed from the
 * body's velocity half a beat *later*, which is the next figure's; a path that
 * simply held its last beat would report that velocity as zero and put the
 * plant on the dancer's rest, while the next figure — asking about the same
 * plant from its own side — would put it a full stride ahead. The foot would
 * jump 5 px at every seam in the dance. With the path continued both ways the
 * two sides compute the *same* plant, and the seam is continuous in the feet
 * exactly as closure makes it continuous in the body.
 */
function bodyPathOf(timeline: Timeline, event: FigureEvent, dancer: DancerId): BodyPath {
  return (t) => {
    if (t >= event.start && t <= event.end) return poseOf(timeline, event, dancer, t - event.start);
    const neighbour =
      t > event.end
        ? figureAfter(timeline, dancer, event)
        : timeline.figureBefore(dancer, event.start);
    if (!neighbour) {
      return poseOf(timeline, event, dancer, t > event.end ? event.end - event.start : 0);
    }
    const local = Math.min(Math.max(t - neighbour.start, 0), neighbour.end - neighbour.start);
    return poseOf(timeline, neighbour, dancer, local);
  };
}

/** The figure this dancer dances immediately after `event`, if there is one. */
function figureAfter(
  timeline: Timeline,
  dancer: DancerId,
  event: FigureEvent,
): FigureEvent | undefined {
  const events = timeline.figuresOf(dancer);
  const at = events.indexOf(event);
  return at < 0 ? undefined : events[at + 1];
}

const poseOf = (
  timeline: Timeline,
  event: FigureEvent,
  dancer: DancerId,
  t: Beat,
): { p: Vec2; facing: number } => {
  const s = sampleEvent(timeline, event, dancer, t);
  return { p: s.p, facing: s.facing };
};

/**
 * The body path and the plant memo for one (event, dancer).
 *
 * Keyed on the `FigureEvent` in a `WeakMap`, so it dies with the timeline and
 * nothing has to remember to clear it. A cache, not state: every input is the
 * timeline's own data and the same inputs give the same feet.
 */
const GAITS = new WeakMap<
  FigureEvent,
  Map<DancerId, { body: BodyPath; plants: (k: number) => Plant }>
>();

function gaitFor(
  timeline: Timeline,
  event: FigureEvent,
  dancer: DancerId,
): { body: BodyPath; plants: (k: number) => Plant } {
  let byDancer = GAITS.get(event);
  if (!byDancer) {
    byDancer = new Map();
    GAITS.set(event, byDancer);
  }
  const found = byDancer.get(dancer);
  if (found) return found;
  const body = bodyPathOf(timeline, event, dancer);
  const made = { body, plants: memoPlants(body) };
  byDancer.set(dancer, made);
  return made;
}
