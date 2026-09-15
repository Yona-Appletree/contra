import type { Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import { figureStripSvg } from "./figureStripSvg.js";
import { marchSvg } from "./marchSvg.js";
import { penPlotSvg } from "./penPlotSvg.js";
import { seismographSvg } from "./seismographSvg.js";
import type { TraceView, TraceViewPen } from "./TraceView.js";
import { TRACE_FAMILY_COLOURS, familyColour, penColour } from "./TraceView.js";
import { ROLE_COLOURS } from "../appearance/roleColours.js";
import {
  WAKE_REACH_PER_PEN_WIDTH,
  facingReach,
  inkRuns,
  num,
  spreadOffset,
  traceDraw,
} from "./traceSvg.js";
import { MARCH_WAKE_PER_PEN_WIDTH } from "./marchSvg.js";

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
    const withTicks = penPlotSvg(TRACE, { facing: "ticks" });
    const without = penPlotSvg(TRACE, { facing: "ticks", facingEvery: 0 });
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

describe("the facing styles (T3, tuned and made the default by T5)", () => {
  it("defaults to the wake, the style the user picked", () => {
    expect(penPlotSvg(TRACE)).toBe(penPlotSvg(TRACE, { facing: "wake" }));
    expect(marchSvg(TRACE)).toBe(marchSvg(TRACE, { facing: "wake" }));
    expect(traceDraw().facing).toBe("wake");
  });

  it("still draws ticks and arrowheads when asked", () => {
    expect(penPlotSvg(TRACE, { facing: "ticks" })).not.toBe(penPlotSvg(TRACE));
    expect(penPlotSvg(TRACE, { facing: "arrowheads" })).not.toBe(penPlotSvg(TRACE));
  });

  it("wake draws the same bytes twice and stays inside the page", () => {
    const svg = penPlotSvg(TRACE, { facing: "wake" });
    expect(svg).toBe(penPlotSvg(TRACE, { facing: "wake" }));
    // One band per pen, each under its own blurred mask: no gradient, whose
    // one fixed direction cannot follow a band that turns (T5).
    expect(svg).not.toContain("<linearGradient");
    expect([...svg.matchAll(/<mask id="mask-wk/g)]).toHaveLength(TRACE.pens.length);
    expect([...svg.matchAll(/<feGaussianBlur/g)]).toHaveLength(TRACE.pens.length);
    expectInside(svg);
  });

  it("wake fades to transparent, not to black, so a crossing pen still shows", () => {
    const svg = penPlotSvg(TRACE, { facing: "wake" });
    expect(svg).not.toContain("#000");
  });

  it("wake names its masks after their own path data, so a page of plots does not share one", () => {
    // These SVGs are inlined into one document, where `url(#…)` finds the
    // first element with that id anywhere on the page.
    const ids = (svg: string): string[] => [...svg.matchAll(/id="mask-(\w+)"/g)].map((m) => m[1]!);
    const hey = ids(penPlotSvg(TRACE, { facing: "wake" }));
    const wider = ids(penPlotSvg(TRACE, { facing: "wake", wakePx: 9 }));
    expect(new Set(hey).size).toBe(hey.length);
    expect(hey.some((id) => wider.includes(id))).toBe(false);
  });

  it("wake plumbs through the march too, at its own narrower reach", () => {
    expect(marchSvg(TRACE, { facing: "wake" })).toContain("<mask id=");
    // The march magnifies the set a third as much, so its wake is half as far
    // out: the same reach in px would be three times as much of one dancer's
    // own loop.
    expect(MARCH_WAKE_PER_PEN_WIDTH * 2).toBe(WAKE_REACH_PER_PEN_WIDTH);
  });

  it("arrowheads draws one mark a phrase, not one a beat, and stays inside the page", () => {
    const svg = penPlotSvg(TRACE, { facing: "arrowheads", phraseBeats: 2 });
    expect(svg).toBe(penPlotSvg(TRACE, { facing: "arrowheads", phraseBeats: 2 }));
    const withTicks = penPlotSvg(TRACE, { facing: "ticks", facingEvery: 1 });
    const withArrows = penPlotSvg(TRACE, { facing: "arrowheads", phraseBeats: 2 });
    const paths = (s: string): number => [...s.matchAll(/<path /g)].length;
    // The window is 4 beats; a phrase of 2 puts a mark at 0, 2 and 4 — three
    // per pen, against ticks' five (one for every whole beat 0..4).
    expect(paths(withArrows)).toBeLessThan(paths(withTicks));
    expectInside(withArrows);
  });

  it("every style's own reach is what the margins hold", () => {
    // A tick and an arrowhead reach `facingPx`; a wake reaches `wakePx`,
    // which is wider and has to be reserved as such (T5).
    expectInside(penPlotSvg(TRACE, { facing: "wake", wakePx: 24 }));
    expectInside(penPlotSvg(TRACE, { facing: "ticks", facingPx: 20 }));
    expectInside(penPlotSvg(TRACE, { facing: "arrowheads", facingPx: 20 }));
    expectInside(marchSvg(TRACE, { facing: "wake", wakePx: 24 }));
    expect(facingReach(traceDraw({ facing: "wake", wakePx: 9 }))).toBe(9);
    expect(facingReach(traceDraw({ facing: "ticks", wakePx: 9 }))).toBe(4);
  });
});

describe("the wake's smoothness (T5)", () => {
  /**
   * A pen walking a straight line with the shakes: its facing wobbles ±24°
   * from sample to sample, which is the size of the jitter the simulation's
   * own facing really carries (the quiet motion, the sway, a turn caught
   * between two samples).
   */
  const shaky: TraceView = {
    ...TRACE,
    pens: [
      {
        ...TRACE.pens[0]!,
        samples: Array.from({ length: 33 }, (_, i) => ({
          beat: i / 4,
          p: [-8 + i * 0.5, 0] as Vec2,
          facing: 90 + (i % 2 === 0 ? 24 : -24),
          span: 0,
        })),
      },
    ],
  };

  it("turns the band's centre line by no more than 8° from one step to the next", () => {
    // The threshold, stated: 8°. The same pen drawn from its raw facing —
    // what T3 did — turns by more than 80°, which is the staircase the user
    // saw as "kinda jagged". The band is stroked with round joins, so what a
    // reader sees is smoother again than its own centre line.
    expect(sharpestTurn(bandOf(penPlotSvg(shaky, { facing: "wake" })))).toBeLessThan(8);
    expect(sharpestTurn(rawBand(shaky, penPlotSvg(shaky, { facing: "wake" })))).toBeGreaterThan(80);
  });

  it("holds a real turn while it smooths the shakes away", () => {
    // TRACE's pens walk a quarter circle facing one way throughout, so the
    // centre line is the ink's own quarter circle, offset: sixteen steps of
    // the same 5.6°, which the smoothing must not flatten.
    const turns = bandOf(penPlotSvg(TRACE, { facing: "wake" })).map((run) => sharpestTurn([run]));
    for (const turn of turns) expect(turn).toBeGreaterThan(5);
  });

  /** Every wake band's centre line in a drawing, as runs of points. */
  function bandOf(svg: string): Vec2[][] {
    const runs: Vec2[][] = [];
    for (const g of svg.matchAll(/<g mask="url\(#mask-[^"]+\)"[^>]*><path d="([^"]+)"/g)) {
      for (const run of g[1]!.split("M").filter(Boolean)) {
        const points: Vec2[] = [];
        for (const pair of run.split("L")) {
          const [x, y] = pair.trim().split(" ").map(Number);
          if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
            points.push([x, y]);
          }
        }
        runs.push(points);
      }
    }
    return runs;
  }

  /** The same band, built from the raw facing instead of the smoothed one. */
  function rawBand(trace: TraceView, svg: string): Vec2[][] {
    const reach = traceDraw().wakePx;
    const ink = bandOf(svg)[0]!;
    return [
      trace.pens[0]!.samples.map((sample, i): Vec2 => {
        const radians = (sample.facing * Math.PI) / 180;
        const from = ink[i]!;
        return [
          from[0] + (Math.cos(radians) * reach) / 2,
          from[1] + (Math.sin(radians) * reach) / 2,
        ];
      }),
    ];
  }

  /** The sharpest corner between two consecutive steps, in degrees. */
  function sharpestTurn(runs: readonly Vec2[][]): number {
    let worst = 0;
    for (const run of runs) {
      for (let i = 2; i < run.length; i++) {
        const a: Vec2 = [run[i - 1]![0] - run[i - 2]![0], run[i - 1]![1] - run[i - 2]![1]];
        const b: Vec2 = [run[i]![0] - run[i - 1]![0], run[i]![1] - run[i - 1]![1]];
        if (Math.hypot(...a) < 1e-6 || Math.hypot(...b) < 1e-6) continue;
        const turn = Math.abs(
          (Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI,
        );
        worst = Math.max(worst, turn);
      }
    }
    return worst;
  }
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
