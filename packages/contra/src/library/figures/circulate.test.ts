import { describe, expect, it } from "vitest";
import { circulateDefinition } from "./circulate.js";
import type { PathStep } from "../kinds/waypoints.js";
import type { WaypointShape } from "../FigureDefinition.js";

/**
 * **The box circulate, as data** (FR-B1, DD43).
 *
 * The user: *"everyone is in long wavy lines up and down the set. alternating
 * face in, face out. the people facing out orbit around to face in while the
 * ones facing in walk across the set. you stay in your current minor set."*
 *
 * Four sentences, four assertions. What cannot be asserted here is the dancing,
 * which is `pnpm dance whoosh` and the strip; what can is that the definition
 * says each of the four things and says nothing else.
 */
describe("the box circulate", () => {
  const shape = circulateDefinition.shape as WaypointShape;
  const tracks = shape.tracks as Readonly<Record<string, readonly PathStep[]>>;

  it("routes the two tracks off which role is facing in, not off the role itself", () => {
    expect(shape.by).toEqual({ param: "facesIn", then: "crossing", else: "looping" });
    expect(Object.keys(tracks).sort()).toEqual(["crossing", "looping"]);
    // The wave's own clause, and the same parameter `balance-wave` reads.
    expect(circulateDefinition.params).toMatchObject({ defaults: { facesIn: "lark" } });
  });

  it("sends the ones facing in straight across the set, turning nobody round", () => {
    const step = tracks["crossing"]![0]!;
    expect(step.pose.p).toEqual({ point: "slot", line: "other", along: 0 });
    expect(step.pose.facing).toEqual({
      angle: "facingOf",
      role: { role: "self" },
      at: "start",
    });
    expect(step.around).toBeUndefined();
  });

  it("loops the ones facing out to the other place of their own box, facing in", () => {
    const step = tracks["looping"]![0]!;
    // **The other place of the box, not the next minor set's**: `along` counts
    // the way the dancer travels, and the two couples of a minor set travel
    // opposite ways, so one place on names the other half of the same four from
    // either end of it.
    expect(step.pose.p).toEqual({ point: "slot", line: "same", along: 1 });
    // They arrive facing in — read across the set from the place they land on,
    // because "in" is one direction for one line and the other for the other.
    expect(step.pose.facing).toEqual({
      angle: "bearing",
      from: { point: "slot", line: "same", along: 1 },
      to: { point: "slot", line: "other", along: 1 },
    });
    expect(step.around).toBeDefined();
  });

  it("is plain data, like every other definition", () => {
    expect(JSON.parse(JSON.stringify(circulateDefinition))).toEqual(circulateDefinition);
  });
});
