import { describe, expect, it } from "vitest";
import { createFigureRegistry } from "../figure/FigureDef.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import { createGroup } from "../group/Group.js";
import { SQUARE, squareStations } from "../testing/square.js";
import { frame } from "../formation/Frame.js";
import type { FigureEvent } from "./Timeline.js";
import { createTimeline } from "./Timeline.js";

const group = () =>
  createGroup(
    {
      id: "g",
      kind: "set",
      frame: frame([0, 0], 90),
      stations: squareStations(),
      members: Object.fromEntries(squareStations().map((s) => [s.id, `d-${s.id}`])),
      couples: [],
    },
    SQUARE.roleSet,
  );

const figure = (start: number, end: number, dancers: string[]): FigureEvent => ({
  kind: "figure",
  group: "g",
  figure: "walk-to-station",
  params: { beats: end - start, to: {}, from: {}, origins: {}, turn: {}, bowPx: 0 },
  bindings: Object.fromEntries(dancers.map((d, i) => [`s${i}`, d])),
  start,
  end,
});

const timeline = () => {
  const t = createTimeline(createFigureRegistry([WALK_TO_STATION]));
  t.addGroup(group());
  return t;
};

describe("the timeline", () => {
  it("refuses a figure event for a group it has never been given", () => {
    const t = createTimeline(createFigureRegistry([WALK_TO_STATION]));
    expect(() => t.add(figure(0, 8, ["a"]))).toThrow(/unknown group/);
  });

  it("refuses to put one dancer in two figures at once", () => {
    const t = timeline();
    t.add(figure(0, 8, ["a"]));
    expect(() => t.add(figure(4, 12, ["a"]))).toThrow(/while still in/);
  });

  it("lets two dancers dance different figures over the same beats", () => {
    const t = timeline();
    t.add(figure(0, 8, ["a"]));
    t.add(figure(0, 8, ["b"]));
    expect(t.figures()).toHaveLength(2);
  });

  it("reports coverage as the least-covered dancer", () => {
    const t = timeline();
    t.add(figure(0, 16, ["a"]));
    t.add(figure(0, 8, ["b"]));
    expect(t.covered()).toBe(8);
  });

  it("is covered to the start beat before anybody dances", () => {
    expect(timeline().covered()).toBe(0);
  });

  it("finds the figure that owns a beat, and gives the last one its own end", () => {
    const t = timeline();
    t.add(figure(0, 8, ["a"]));
    t.add(figure(8, 16, ["a"]));
    expect(t.figureAt("a", 0)!.start).toBe(0);
    expect(t.figureAt("a", 7.999)!.start).toBe(0);
    expect(t.figureAt("a", 8)!.start).toBe(8);
    expect(t.figureAt("a", 16)!.start).toBe(8);
    expect(t.figureAt("a", -1)).toBeUndefined();
    expect(t.figureAt("nobody", 1)).toBeUndefined();
  });

  it("finds the figure before a seam", () => {
    const t = timeline();
    t.add(figure(0, 8, ["a"]));
    t.add(figure(8, 16, ["a"]));
    expect(t.figureBefore("a", 8)!.start).toBe(0);
    expect(t.figureBefore("a", 0)).toBeUndefined();
  });

  it("lists what is being said at a beat", () => {
    const t = timeline();
    t.add({ kind: "utterance", speaker: "caller", text: "BALANCE", start: 2, end: 6 });
    t.add({ kind: "utterance", speaker: { dancer: "a" }, text: "whee", start: 5, end: 7 });
    expect(t.utterancesAt(1)).toHaveLength(0);
    expect(t.utterancesAt(5).map((u) => u.text)).toEqual(["BALANCE", "whee"]);
    expect(t.utterancesAt(6).map((u) => u.text)).toEqual(["whee"]);
  });

  it("names the group a figure event points at", () => {
    const t = timeline();
    expect(t.group("g").id).toBe("g");
    expect(() => t.group("nope")).toThrow(/no group "nope"/);
  });
});
