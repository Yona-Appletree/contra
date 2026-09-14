import type { Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import { TRAIL_BREAK_PX, trailStrokes } from "./Trails.js";
import { TRAIL_COLOURS, roleTrailColour } from "../person/Person.js";

describe("trailStrokes", () => {
  it("joins a run of nearby points into one stroke", () => {
    const points: Vec2[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(trailStrokes(points)).toEqual([points]);
  });

  it("continues from the previous frame's last point", () => {
    expect(trailStrokes([[1, 0]], [0, 0])).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
    ]);
  });

  it("breaks rather than drawing a line across the hall", () => {
    const strokes = trailStrokes(
      [
        [0, 0],
        [1, 0],
        [1 + TRAIL_BREAK_PX + 1, 0],
        [1 + TRAIL_BREAK_PX + 2, 0],
      ],
      undefined,
    );
    expect(strokes).toHaveLength(2);
    expect(strokes[0]).toHaveLength(2);
    expect(strokes[1]).toHaveLength(2);
  });

  it("drops a stroke that is a single point", () => {
    expect(trailStrokes([[0, 0]])).toEqual([]);
  });
});

describe("roleTrailColour", () => {
  it("is larks blue, robins rose, the ones darker", () => {
    expect(roleTrailColour("lark")).toBe(TRAIL_COLOURS.lark.twos);
    expect(roleTrailColour("lark", true)).toBe(TRAIL_COLOURS.lark.ones);
    expect(roleTrailColour("robin")).toBe(TRAIL_COLOURS.robin.twos);
    expect(roleTrailColour("robin", true)).toBe(TRAIL_COLOURS.robin.ones);
  });

  it("gives an unknown role set's role a neutral trail", () => {
    expect(roleTrailColour("head")).toBe(TRAIL_COLOURS.other.twos);
  });
});
