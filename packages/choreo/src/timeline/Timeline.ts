import type { Beat } from "@caller/core";
import type { DancerId, GroupId, StationId } from "../formation/Formation.js";
import type { FigureRegistry } from "../figure/FigureDef.js";
import type { Group } from "../group/Group.js";

/** One figure instance: one group dancing one figure over a span of beats. */
export interface FigureEvent {
  kind: "figure";
  group: GroupId;
  figure: string;
  params: object;
  bindings: Record<StationId, DancerId>;
  start: Beat;
  end: Beat;
}

/** One thing said: the caller's call, or a dancer's own words. */
export interface UtteranceEvent {
  kind: "utterance";
  speaker: "caller" | { dancer: DancerId };
  text: string;
  start: Beat;
  end: Beat;
}

/**
 * The seam between the layers: everything below produces these, everything
 * above reads them and never calls a figure directly.
 */
export type TimelineEvent = FigureEvent | UtteranceEvent;

/**
 * The events a decider has produced, indexed for the two questions the layers
 * above ask: what is this dancer doing at this beat, and what is being said.
 */
export interface Timeline {
  registry: FigureRegistry;
  events(): readonly TimelineEvent[];
  figures(): readonly FigureEvent[];
  utterances(): readonly UtteranceEvent[];
  /** The group a figure event names. */
  group(id: GroupId): Group;
  addGroup(group: Group): void;
  add(event: TimelineEvent): void;
  /** Through what beat every dancer has a figure. */
  covered(): Beat;
  /** Every dancer the timeline has ever mentioned. */
  dancers(): DancerId[];
  /** The figure this dancer is dancing at `beat`, or `undefined` before the start. */
  figureAt(dancer: DancerId, beat: Beat): FigureEvent | undefined;
  /** The figure this dancer danced immediately before the one starting at `start`. */
  figureBefore(dancer: DancerId, start: Beat): FigureEvent | undefined;
  /** Every figure this dancer dances, in order. */
  figuresOf(dancer: DancerId): readonly FigureEvent[];
  /** What is being said at `beat`. */
  utterancesAt(beat: Beat): UtteranceEvent[];
}

/** An empty timeline over `registry`. */
export function createTimeline(registry: FigureRegistry): Timeline {
  const all: TimelineEvent[] = [];
  const figureEvents: FigureEvent[] = [];
  const utteranceEvents: UtteranceEvent[] = [];
  const groups = new Map<GroupId, Group>();
  const byDancer = new Map<DancerId, FigureEvent[]>();

  const forDancer = (dancer: DancerId): FigureEvent[] => {
    let list = byDancer.get(dancer);
    if (!list) {
      list = [];
      byDancer.set(dancer, list);
    }
    return list;
  };

  return {
    registry,
    events: () => all,
    figures: () => figureEvents,
    utterances: () => utteranceEvents,

    group(id) {
      const g = groups.get(id);
      if (!g) throw new Error(`timeline has no group "${id}"`);
      return g;
    },
    addGroup(group) {
      groups.set(group.id, group);
    },

    add(event) {
      all.push(event);
      if (event.kind === "utterance") {
        utteranceEvents.push(event);
        return;
      }
      if (!groups.has(event.group)) {
        throw new Error(`figure event names unknown group "${event.group}"`);
      }
      figureEvents.push(event);
      for (const dancer of Object.values(event.bindings)) {
        const list = forDancer(dancer);
        const last = list[list.length - 1];
        if (last && event.start < last.end) {
          throw new Error(
            `dancer "${dancer}" would dance "${event.figure}" at ${event.start} while still in "${last.figure}" until ${last.end}`,
          );
        }
        list.push(event);
      }
    },

    covered() {
      let through = Infinity;
      for (const list of byDancer.values()) {
        const last = list[list.length - 1];
        through = Math.min(through, last ? last.end : -Infinity);
      }
      return Number.isFinite(through) ? through : 0;
    },

    dancers: () => [...byDancer.keys()],
    figuresOf: (dancer) => byDancer.get(dancer) ?? [],

    figureAt(dancer, beat) {
      const list = byDancer.get(dancer);
      if (!list || list.length === 0) return undefined;
      // Events are appended in order, so a binary search is exact.
      let lo = 0;
      let hi = list.length - 1;
      let found: FigureEvent | undefined;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const ev = list[mid]!;
        if (beat < ev.start) hi = mid - 1;
        else {
          found = ev;
          lo = mid + 1;
        }
      }
      if (!found) return undefined;
      // The last event owns its own end beat, so `poseAt` works at the edge of
      // what the decider has produced.
      return beat < found.end || found === list[list.length - 1] ? found : undefined;
    },

    figureBefore(dancer, start) {
      const list = byDancer.get(dancer);
      if (!list) return undefined;
      let previous: FigureEvent | undefined;
      for (const ev of list) {
        if (ev.start >= start) break;
        previous = ev;
      }
      return previous;
    },

    utterancesAt: (beat) => utteranceEvents.filter((u) => u.start <= beat && beat < u.end),
  };
}
