import type { Beat, PoseSample, Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { EndPose, FigureDef, FigureParams } from "../figure/FigureDef.js";
import { createFigureRegistry } from "../figure/FigureDef.js";
import type { Station, StationId } from "../formation/Formation.js";
import { frame } from "../formation/Frame.js";
import type { Group } from "../group/Group.js";
import { createGroup } from "../group/Group.js";
import type { Timeline } from "../timeline/Timeline.js";
import { createTimeline } from "../timeline/Timeline.js";
import { TRACE_STEP, sampleTrace, stationRank } from "./sampleTrace.js";

/**
 * The trace sampler, on a formation that is not a contra.
 *
 * Two "couples" of one dancer each on a ring, with two figures: one that walks
 * a station a quarter of the way round and one that stands. Everything the
 * sampler claims — that a sample's tag is the figure event that owns that beat,
 * that the window's ends land where they are asked to, that positions come back
 * in the frame's own axes, that a call with a `who` still gets one strip cell —
 * is checkable on that much and on nothing contra-shaped at all.
 */

interface TurnParams extends FigureParams {
  /** How far round the ring the dancer walks, in degrees. */
  degrees: number;
}

const RADIUS = 20;

/** Where a station stands at angle `a`, in the group's local axes. */
const onRing = (a: number): Vec2 => [
  RADIUS * Math.cos((a * Math.PI) / 180),
  RADIUS * Math.sin((a * Math.PI) / 180),
];

const STATIONS: readonly Station[] = [
  { id: "1a", role: "inside", facing: 0, p: onRing(0) },
  { id: "2a", role: "outside", facing: 180, p: onRing(180) },
];

const HOME: Record<StationId, number> = { "1a": 0, "2a": 180 };

/** Walk round the ring; `degrees: 0` is standing still. */
const TURN: FigureDef<TurnParams> = {
  id: "turn",
  call: "TURN",
  lead: 0,
  beats: 8,
  defaults: { degrees: 90 },
  sample(group: Group, station: StationId, t: Beat, params: TurnParams): PoseSample {
    const start = HOME[station] ?? 0;
    const a = start + params.degrees * (t / params.beats);
    const local = onRing(a);
    return {
      p: [group.frame.centre[0] + local[0], group.frame.centre[1] + local[1]],
      facing: a + 90,
      look: a + 90,
      lean: 0,
      hands: { L: "down", R: "down" },
      stepRate: 1,
      buzz: false,
      flare: 0,
      amp: 0,
    };
  },
  ends(_group: Group, params: TurnParams): Record<StationId, EndPose> {
    return Object.fromEntries(
      STATIONS.map((s) => {
        const a = (HOME[s.id] ?? 0) + params.degrees;
        return [s.id, { p: onRing(a), facing: a + 90 }];
      }),
    );
  },
};

/** A second figure id, so a window can hold two different calls. */
const STAND: FigureDef<TurnParams> = {
  ...TURN,
  id: "stand",
  call: "STAND",
  defaults: { degrees: 0 },
};

/** The two dancers, and a timeline of back-to-back calls over them. */
function ringTimeline(calls: readonly { figure: string; beats: Beat; only?: StationId }[]): {
  timeline: Timeline;
  dancers: string[];
} {
  const members = { "1a": "d1", "2a": "d2" };
  const group = createGroup(
    {
      id: "ring",
      kind: "set",
      frame: frame([100, 40], 90),
      stations: STATIONS,
      members,
      couples: [],
    },
    { roles: ["inside", "outside"], top: "inside" },
  );
  const timeline = createTimeline(createFigureRegistry([TURN, STAND]));
  timeline.addGroup(group);
  let start: Beat = 0;
  for (const call of calls) {
    const bindings =
      call.only === undefined ? members : { [call.only]: members[call.only as "1a" | "2a"] };
    timeline.add({
      kind: "figure",
      group: "ring",
      figure: call.figure,
      params: { beats: call.beats, degrees: call.figure === "stand" ? 0 : 90 },
      bindings,
      start,
      end: start + call.beats,
    });
    if (call.only !== undefined) {
      const other = call.only === "1a" ? "2a" : "1a";
      timeline.add({
        kind: "figure",
        group: "ring",
        figure: "stand",
        params: { beats: call.beats, degrees: 0 },
        bindings: { [other]: members[other] },
        start,
        end: start + call.beats,
      });
    }
    start += call.beats;
  }
  return { timeline, dancers: ["d1", "d2"] };
}

describe("sampleTrace", () => {
  it("samples eight times a beat and lands exactly on both ends", () => {
    const { timeline, dancers } = ringTimeline([{ figure: "turn", beats: 8 }]);
    const trace = sampleTrace(timeline, { to: 8, dancers });
    const pen = trace.pens[0]!;
    expect(trace.step).toBe(TRACE_STEP);
    expect(pen.samples).toHaveLength(8 * 8 + 1);
    expect(pen.samples[0]!.beat).toBe(0);
    expect(pen.samples.at(-1)!.beat).toBe(8);
  });

  it("reports positions in the frame's own axes, not the world's", () => {
    const { timeline, dancers } = ringTimeline([{ figure: "turn", beats: 8 }]);
    const trace = sampleTrace(timeline, { to: 8, dancers });
    // The group sits at world (100, 40); the two stations sit on a ring of 20
    // about it, so every set-local point is 20 px from the local origin.
    for (const pen of trace.pens) {
      for (const sample of pen.samples) {
        expect(Math.hypot(sample.p[0], sample.p[1])).toBeCloseTo(RADIUS, 6);
      }
    }
    expect(trace.extent.x).toBeCloseTo(RADIUS, 6);
  });

  it("tags every sample with the figure event the timeline says owns that beat", () => {
    const { timeline, dancers } = ringTimeline([
      { figure: "turn", beats: 4 },
      { figure: "stand", beats: 4 },
      { figure: "turn", beats: 4 },
    ]);
    const trace = sampleTrace(timeline, { to: 12, dancers });
    for (const pen of trace.pens) {
      for (const sample of pen.samples) {
        const event = timeline.figureAt(pen.dancer, Math.min(sample.beat, 12 - 1e-9));
        const span = trace.spans[sample.span]!;
        expect(span.figure).toBe(event?.figure);
        expect(span.from).toBe(event?.start);
        expect(span.to).toBe(event?.end);
      }
    }
    expect(trace.spans.map((s) => s.figure)).toEqual(["turn", "stand", "turn"]);
  });

  it("reads the role and the rank off the station the window opened on", () => {
    const { timeline, dancers } = ringTimeline([{ figure: "turn", beats: 8 }]);
    const trace = sampleTrace(timeline, { to: 8, dancers });
    expect(trace.pens.map((p) => [p.station, p.role, p.rank])).toEqual([
      ["1a", "inside", 1],
      ["2a", "outside", 2],
    ]);
  });

  it("gives a call with a `who` one strip cell, named for the figure and not the filler", () => {
    const { timeline, dancers } = ringTimeline([{ figure: "turn", beats: 8, only: "1a" }]);
    const trace = sampleTrace(timeline, { to: 8, dancers, filler: ["stand"] });
    expect(trace.spans).toHaveLength(2);
    expect(trace.cells).toEqual([{ figure: "turn", from: 0, to: 8, family: "turn" }]);
  });

  it("colours a cell by whatever `familyOf` says", () => {
    const { timeline, dancers } = ringTimeline([{ figure: "turn", beats: 8 }]);
    const trace = sampleTrace(timeline, { to: 8, dancers, familyOf: () => "walking" });
    expect(trace.cells[0]!.family).toBe("walking");
  });

  it("refuses a window that does not run forwards", () => {
    const { timeline, dancers } = ringTimeline([{ figure: "turn", beats: 8 }]);
    expect(() => sampleTrace(timeline, { from: 4, to: 4, dancers })).toThrow(/run forwards/);
  });

  it("refuses a window no dancer is covered over", () => {
    const { timeline, dancers } = ringTimeline([{ figure: "turn", beats: 8 }]);
    expect(() => sampleTrace(timeline, { to: 40, dancers })).toThrow(/no dancer is covered/);
  });
});

describe("stationRank", () => {
  it("reads the leading digits of a station id, and 0 when there are none", () => {
    expect(stationRank("1L")).toBe(1);
    expect(stationRank("2R")).toBe(2);
    expect(stationRank("WL")).toBe(0);
    expect(stationRank("12x")).toBe(12);
  });
});
