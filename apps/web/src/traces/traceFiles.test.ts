import { concurrentCalls, danceBeats } from "@caller/choreo";
import { ALL_DANCES, DEMO_DANCE_SLUGS, danceBySlug } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { figureTiles } from "../galleryTiles.js";
import { danceTrace } from "./danceTrace.js";
import { figureTrace } from "./figureTrace.js";
import { TRACES_BANNER, traceFiles, traceIndex } from "./traceFiles.js";
import { traceDrawings } from "./traceDrawings.js";

/**
 * One case per figure and one per dance, never a single case over all of them:
 * a figure whose trace stops being drawable should name itself in the failure,
 * not hide inside a loop that says "traces".
 */

const FIGURES = figureTiles().map((tile) => ({ key: tile.key, tile }));
// **Every encoded dance, not only the Stage's** (M9b): a lab dance is drawn
// too, so a review gate has a strip for every acceptance dance to look at.
const DANCES = ALL_DANCES.map((dance) => ({ slug: dance.slug }));

describe.each(FIGURES)("the figure $key", ({ tile }) => {
  it("traces its looping window, in the group of four the tile dances", () => {
    const trace = figureTrace(tile);
    expect(trace.from).toBe(tile.window.start);
    expect(trace.to).toBe(tile.window.start + tile.window.beats);
    expect(trace.pens).toHaveLength(Object.keys(tile.group.members).length);
    expect(trace.cells.length).toBeGreaterThan(0);
    for (const pen of trace.pens) expect(pen.samples.length).toBeGreaterThan(1);
  });

  it("draws four views, the same bytes twice", () => {
    const trace = figureTrace(tile);
    const once = traceDrawings(trace, tile.title);
    const twice = traceDrawings(trace, tile.title);
    expect(once).toEqual(twice);
    for (const svg of Object.values(once)) expect(svg.endsWith("</svg>")).toBe(true);
  });
});

describe.each(DANCES)("the dance $slug", ({ slug }) => {
  it("traces one time through with one pen per dancer of one minor set", () => {
    const dance = danceBySlug(slug)!;
    const trace = danceTrace(dance);
    expect(trace.from).toBe(0);
    // **The whole record**, which is 64 beats for a one-pass dance and 128 for
    // a two-pass one (Anna's Reel, Jeremy Corners). It was written as a literal
    // 64 while every dance drawn was one of the Stage's.
    expect(trace.to).toBe(danceBeats(dance));
    expect(trace.pens).toHaveLength(4);
    expect(trace.pens.map((p) => p.role).sort()).toEqual(["lark", "lark", "robin", "robin"]);
    expect(trace.pens.map((p) => p.rank).sort()).toEqual([1, 1, 2, 2]);
  });

  it("gives one strip cell per figure the dance calls", () => {
    const dance = danceBySlug(slug)!;
    const trace = danceTrace(dance);
    const called = dance.phrases.flatMap((phrase) => phrase.figures);
    // **The strict count is the Stage's** (M9b). A strip cell is a figure the
    // *traced four* really danced, which is one per written call exactly when
    // every call reaches all four of them. That is true of every dance on the
    // Stage and is what this has always asserted. It is not true of a lab
    // dance, and the ways it fails are the dance's own diagnosis rather than
    // the strip's: a concurrent call draws one cell per branch (Fatal
    // Attraction's "(2) Women cast back || Men go forward"), and a call the
    // traced four are all standing out of draws one hold-place cell where the
    // record wrote two (Are You 'Most Done?'s diagonal hey at six couples).
    //
    // **Nor of a dance whose own figure carries the progression** (M9g). Are
    // You 'Most Done?'s hey shifts the seating at beat 48, so the couple the
    // shift puts out waits the rest of the time through and the strip draws it:
    // a `wait-out` cell over beats 48–64 that no call of the record wrote. It
    // is the dance's own diagnosis in the same way the two above are.
    //
    // What has to hold for every dance is that the cells run in order, each
    // covers real beats, and together they span the window end to end — which
    // is what makes the picture a strip of the dance rather than of part of it.
    const carriesTheShift = dance.phrases.some((phrase) =>
      phrase.figures.some((figure) =>
        concurrentCalls(figure).some((call) => call.params?.["progresses"] !== undefined),
      ),
    );
    if (DEMO_DANCE_SLUGS.includes(slug) && !carriesTheShift) {
      expect(trace.cells).toHaveLength(called.length);
      expect(trace.cells.map((cell) => cell.to - cell.from)).toEqual(called.map((f) => f.beats));
    }
    expect(trace.cells.length).toBeGreaterThan(0);
    let at = trace.from;
    for (const cell of trace.cells) {
      expect(cell.from).toBeGreaterThanOrEqual(trace.from);
      expect(cell.to).toBeGreaterThan(cell.from);
      expect(cell.to).toBeLessThanOrEqual(trace.to);
      at = Math.max(at, cell.to);
    }
    expect(trace.cells[0]!.from).toBe(trace.from);
    expect(at).toBe(trace.to);
  });

  it("tags every sample with a figure the timeline actually ran", () => {
    const dance = danceBySlug(slug)!;
    const trace = danceTrace(dance);
    for (const pen of trace.pens) {
      for (const sample of pen.samples) {
        expect(sample.span).toBeGreaterThanOrEqual(0);
        const span = trace.spans[sample.span]!;
        expect(sample.beat).toBeGreaterThanOrEqual(span.from);
        expect(sample.beat).toBeLessThanOrEqual(span.to);
      }
    }
  });

  it("is cached, so a card re-rendering on the beat does not re-decide it", () => {
    const dance = danceBySlug(slug)!;
    expect(danceTrace(dance)).toBe(danceTrace(dance));
  });
});

describe("the export", () => {
  it("writes four views of every figure and every dance", () => {
    const files = traceFiles();
    expect(files).toHaveLength((FIGURES.length + DANCES.length) * 4);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
    for (const file of files) expect(file.path.endsWith(".svg")).toBe(true);
  });

  it("indexes them all, with a banner saying not to edit it by hand", () => {
    const files = traceFiles();
    const index = traceIndex(files);
    expect(index.startsWith(TRACES_BANNER)).toBe(true);
    for (const key of [...FIGURES.map((f) => f.key), ...DANCES.map((d) => d.slug)]) {
      expect(index).toContain(`\`${key}\``);
    }
    for (const file of files) expect(index).toContain(`./${file.path}`);
  });

  it("writes an index prettier has nothing to say about", () => {
    const rows = traceIndex(traceFiles())
      .split("\n")
      .filter((line) => line.startsWith("|"));
    expect(rows.length).toBeGreaterThan(FIGURES.length);
    const widths = new Set(rows.map((row) => row.length));
    // Two tables, so two row widths; a ragged table would give many more.
    expect(widths.size).toBe(2);
  });
});
