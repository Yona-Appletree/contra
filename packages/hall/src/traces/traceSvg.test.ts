import type { Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import { figureStripSvg } from "./figureStripSvg.js";
import { marchSvg } from "./marchSvg.js";
import { penPlotSvg } from "./penPlotSvg.js";
import { seismographSvg } from "./seismographSvg.js";
import type { TraceView, TraceViewPen } from "./TraceView.js";
import { TRACE_FAMILY_COLOURS, familyColour, penColour } from "./TraceView.js";
import { ROLE_COLOURS } from "../appearance/roleColours.js";
import { inkRuns, num, spreadOffset, traceDraw } from "./traceSvg.js";

/**
 * The four drawings, on a trace made by hand.
 *
 * Nothing here runs a figure: a `TraceView` is plain data and these tests build
 * one, which is the whole reason the renderers take plain data. One case per
 * view, and the properties that matter are the ones a reader would notice —
 * the same bytes twice, a pen per role, the pens not lying on top of each
 * other, a facing tick where the facing is.
 */

/** One pen walking a quarter circle, sampled every quarter beat. */
function pen(dancer: string, role: string, rank: number, offset: Vec2): TraceViewPen {
  const samples = [];
  for (let i = 0; i <= 16; i++) {
    const beat = i / 4;
    const a = (beat / 4) * (Math.PI / 2);
    samples.push({
      beat,
      p: [offset[0] + 10 * Math.cos(a), offset[1] + 10 * Math.sin(a)] as Vec2,
      facing: 90,
      span: beat < 2 ? 0 : 1,
    });
  }
  return { dancer, station: `${String(rank)}${role[0]!.toUpperCase()}`, role, rank, samples };
}

const TRACE: TraceView = {
  from: 0,
  to: 4,
  step: 0.25,
  pens: [
    pen("a", "lark", 1, [-6, -6]),
    pen("b", "robin", 1, [6, -6]),
    pen("c", "lark", 2, [-6, 6]),
    pen("d", "robin", 2, [6, 6]),
  ],
  spans: [
    { figure: "balance", from: 0, to: 2, dancers: ["a", "b", "c", "d"] },
    { figure: "swing", from: 2, to: 4, dancers: ["a", "b", "c", "d"] },
  ],
  cells: [
    { figure: "balance", from: 0, to: 2, family: "balance" },
    { figure: "swing", from: 2, to: 4, family: "swing" },
  ],
  extent: { x: 16, y: 16 },
};

const VIEWS = [
  { name: "pen plot", draw: () => penPlotSvg(TRACE) },
  { name: "march", draw: () => marchSvg(TRACE) },
  { name: "seismograph", draw: () => seismographSvg(TRACE) },
  { name: "figure strip", draw: () => figureStripSvg(TRACE) },
] as const;

describe.each(VIEWS)("$name", (view) => {
  it("gives the same bytes for the same trace", () => {
    expect(view.draw()).toBe(view.draw());
  });

  it("is one SVG document with a ground and a viewBox", () => {
    const svg = view.draw();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('fill="#14110f"');
  });

  it("draws every pen in its own role-and-rank colour", () => {
    const svg = view.draw();
    for (const p of TRACE.pens) expect(svg).toContain(penColour(p.role, p.rank));
  });

  it("writes no number with more than two decimals", () => {
    for (const n of view.draw().matchAll(/-?\d+\.(\d+)/g)) {
      expect(n[1]!.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("the pen plot", () => {
  it("draws a facing tick on every whole beat, for every pen", () => {
    const withTicks = penPlotSvg(TRACE);
    const without = penPlotSvg(TRACE, { facingEvery: 0 });
    const paths = (svg: string): number => [...svg.matchAll(/<path /g)].length;
    // Five whole beats in the window (0…4), four pens, one tick each.
    expect(paths(withTicks) - paths(without)).toBe(5 * 4);
  });

  it("nudges the pens apart, and stops when told to", () => {
    expect(penPlotSvg(TRACE)).not.toBe(penPlotSvg(TRACE, { spread: "none" }));
  });

  it("keeps every pen inside the page", () => {
    expectInside(penPlotSvg(TRACE));
  });

  it("puts the band's rail above the set and a box round the starting places", () => {
    expect(penPlotSvg(TRACE)).toContain("<rect x=");
  });
});

describe("the march", () => {
  it("takes its width from the beat axis and labels the phrases", () => {
    const widthOf = (beatPx: number): number =>
      Number(/viewBox="0 0 ([\d.]+) /.exec(marchSvg(TRACE, { beatPx, phraseBeats: 2 }))![1]);
    // Four beats: ten more pixels to the beat is forty more pixels of page,
    // whatever the margins the set's own width asks for either end.
    expect(widthOf(20) - widthOf(10)).toBe(40);
    const svg = marchSvg(TRACE, { beatPx: 10, phraseBeats: 2 });
    expect(svg).toContain(">A1<");
    expect(svg).toContain(">A2<");
  });

  it("keeps every pen inside the page, however wide the set is", () => {
    expectInside(marchSvg(TRACE));
  });
});

describe("the seismograph", () => {
  it("names its two lanes", () => {
    const svg = seismographSvg(TRACE);
    expect(svg).toContain(">across<");
    expect(svg).toContain(">along<");
  });

  it("draws no facing ticks: an axis of position against time has no floor", () => {
    expect(seismographSvg(TRACE)).toBe(seismographSvg(TRACE, { facingEvery: 0 }));
  });

  it("keeps every pen inside the page", () => {
    expectInside(seismographSvg(TRACE));
  });
});

describe("the figure strip", () => {
  it("gives each call a cell as wide as the call is long, and names it", () => {
    const svg = figureStripSvg(TRACE, { beatPx: 20 });
    expect(svg).toContain(">balance<");
    expect(svg).toContain(">swing<");
    expect([...svg.matchAll(/<svg x="/g)]).toHaveLength(4); // two plots, two captions
  });

  it("takes the name a caller gives it", () => {
    const svg = figureStripSvg(TRACE, { nameOf: (id) => id.toUpperCase() });
    expect(svg).toContain(">BALANCE<");
  });

  it("paints a repeated figure in the same colour twice", () => {
    const repeated: TraceView = {
      ...TRACE,
      cells: TRACE.cells.map((c) => ({ ...c, figure: "balance", family: "balance" })),
    };
    const washes = [
      ...figureStripSvg(repeated).matchAll(
        /<rect x="0\.5" width="[\d.]+" height="[\d.]+" fill="(#[0-9a-f]{6})"/g,
      ),
    ];
    expect(washes).toHaveLength(2);
    expect(washes[0]![1]).toBe(washes[1]![1]);
  });
});

/** Every drawn coordinate, against the box the document declares. */
function expectInside(svg: string): void {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)!;
  const width = Number(box[1]);
  const height = Number(box[2]);
  let points = 0;
  for (const path of svg.matchAll(/ d="([^"]+)"/g)) {
    for (const point of path[1]!.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
      expect(Number(point[1])).toBeGreaterThanOrEqual(0);
      expect(Number(point[1])).toBeLessThanOrEqual(width);
      expect(Number(point[2])).toBeGreaterThanOrEqual(0);
      expect(Number(point[2])).toBeLessThanOrEqual(height);
      points++;
    }
  }
  expect(points).toBeGreaterThan(0);
}

describe("the ink", () => {
  it("breaks a run where a dancer jumps further than feet can carry them", () => {
    const jumpy: TraceViewPen = {
      ...TRACE.pens[0]!,
      samples: [
        { beat: 0, p: [0, 0], facing: 0, span: 0 },
        { beat: 0.25, p: [1, 0], facing: 0, span: 0 },
        { beat: 0.5, p: [90, 0], facing: 0, span: 0 },
        { beat: 0.75, p: [91, 0], facing: 0, span: 0 },
      ],
    };
    expect(inkRuns(jumpy, (s) => s.p)).toHaveLength(2);
  });

  it("keeps only the samples inside a window when given one", () => {
    const runs = inkRuns(TRACE.pens[0]!, (s) => s.p, { window: { from: 2, to: 4 } });
    expect(runs.flat()).toHaveLength(9);
  });
});

describe("the colours", () => {
  it("is larks gold and robins red, with the ones darker than the twos", () => {
    expect(penColour("lark", 0)).toBe(ROLE_COLOURS.lark);
    expect(penColour("robin", 0)).toBe(ROLE_COLOURS.robin);
    expect(penColour("lark", 1)).not.toBe(penColour("lark", 2));
    expect(penColour("nobody", 1)).not.toBe(penColour("lark", 1));
  });

  it("gives an unknown family a colour from the palette, the same one every time", () => {
    expect(TRACE_FAMILY_COLOURS).toContain(familyColour("hey"));
    expect(familyColour("hey")).toBe(familyColour("hey"));
  });
});

describe("the shared helpers", () => {
  it("rounds to hundredths and never writes minus zero", () => {
    expect(num(1 / 3)).toBe("0.33");
    expect(num(-0.001)).toBe("0");
    expect(num(2)).toBe("2");
  });

  it("spreads four pens symmetrically about the middle", () => {
    const draw = traceDraw({ spread: "vertical", spreadPx: 2 });
    const ys = [0, 1, 2, 3].map((i) => spreadOffset(draw, i, 4)[1]);
    expect(ys).toEqual([-3, -1, 1, 3]);
  });
});
