import type { Beat, PoseSample } from "@caller/core";
import { easeSeam, seamProgress } from "@caller/core";
import type { DancerId, StationId } from "../formation/Formation.js";
import { stationOf } from "../group/Group.js";
import type { FigureEvent, Timeline } from "./Timeline.js";

/**
 * Where a dancer is at a beat: the figure instance that owns the beat, sampled,
 * eased out of the previous instance across the seam.
 *
 * The seam is `@caller/core`'s: `easeSeam(prev, next, seamProgress(t))` over the
 * first `SEAM_BEATS` of the new figure, with `prev` the previous figure sampled
 * at its own last beat. Hands, facing and lean cross-fade; position comes from
 * the figure that is running, which is why closure has to hold to 0.01 px —
 * nothing here hides a gap.
 */
export function poseAt(timeline: Timeline, dancer: DancerId, beat: Beat): PoseSample {
  const event = timeline.figureAt(dancer, beat);
  if (!event) throw new Error(`dancer "${dancer}" has no figure at beat ${beat}`);
  const here = sampleEvent(timeline, event, dancer, beat - event.start);

  const k = seamProgress(beat - event.start);
  if (k >= 1) return here;
  const previous = timeline.figureBefore(dancer, event.start);
  if (!previous) return here;

  const there = sampleEvent(timeline, previous, dancer, previous.end - previous.start);
  return easeSeam(there, here, k);
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
