import type { Trace } from "@caller/choreo";
import { DEMO_DANCES } from "@caller/contra";
import { figureTiles } from "../galleryTiles.js";
import { danceTrace } from "./danceTrace.js";
import { figureTrace } from "./figureTrace.js";
import { traceDrawings } from "./traceDrawings.js";

/**
 * Every figure and every dance, four ways, as files.
 *
 * Pure: it builds the bytes and the index and touches no filesystem, exactly as
 * `reportMotion.ts` does for the motion report — `apps/web/scripts/writeTraces.mjs`
 * is the eighteen lines of `node:fs` that put them on disk, and `pnpm
 * traces:export` is what runs it. Keeping the builder pure is what lets a test
 * assert one figure's SVG without a temp directory.
 *
 * These are what a rebuilt blog post uses, and they are regenerated on every
 * run like the strips, so a figure that changes shows up as a diff.
 */
export function traceFiles(): TraceFile[] {
  const files: TraceFile[] = [];
  for (const tile of figureTiles()) {
    files.push(...drawingsOf("figures", tile.key, tile.title, figureTrace(tile)));
  }
  for (const dance of DEMO_DANCES) {
    files.push(...drawingsOf("dances", dance.slug, dance.title, danceTrace(dance)));
  }
  return files;
}

/** One file: where it goes under `apps/web/e2e/traces/`, and what is in it. */
export interface TraceFile {
  /** A path relative to the traces directory, e.g. `figures/swing-pen.svg`. */
  path: string;
  /** `"figures"` or `"dances"`. */
  kind: TraceFileKind;
  /** The figure id or the dance slug. */
  key: string;
  /** Which of the four views. */
  view: TraceFileView;
  /** What the thing is called, for the index. */
  title: string;
  /** How many beats the trace covers. */
  beats: number;
  /** How many strip cells it has. */
  cells: number;
  content: string;
}

/** Which half of the export a file belongs to. */
export type TraceFileKind = "figures" | "dances";

/** The four views, in the order the post put them. */
export type TraceFileView = "pen" | "march" | "seismograph" | "strip";

/** The four views of one thing. */
function drawingsOf(kind: TraceFileKind, key: string, title: string, trace: Trace): TraceFile[] {
  const drawings = traceDrawings(trace, title);
  const views: TraceFileView[] = ["pen", "march", "seismograph", "strip"];
  return views.map((view) => ({
    path: `${kind}/${key}-${view}.svg`,
    kind,
    key,
    view,
    title,
    beats: trace.to - trace.from,
    cells: trace.cells.length,
    content: drawings[view],
  }));
}

/**
 * The index the export writes beside the files.
 *
 * Padded by hand so that generated markdown survives `pnpm format:check`
 * without anybody running prettier over it, which is the convention
 * `e2e/strips/README.md` already follows.
 */
export function traceIndex(files: readonly TraceFile[]): string {
  const figures = rowsFor(files, "figures");
  const dances = rowsFor(files, "dances");
  return [
    TRACES_BANNER,
    "",
    "# Traces",
    "",
    "Every figure and every dance drawn four ways from the simulation: the pen",
    "plot (the whole window on the set), the march (the set sliding right as the",
    "beats pass), the seismograph (each dancer across the set, then along it,",
    "against time) and the figure strip (one small plot per call, the cell as wide",
    "as the call is long).",
    "",
    "Nothing compares these against anything — they are what a reviewer looks at,",
    "and what a post about the simulation embeds. `pnpm traces:export` rewrites",
    "the whole directory, so a figure whose motion changes shows up here as a",
    "diff.",
    "",
    "The pens are the four dancers of one minor set: **larks gold, robins red**,",
    "the ones darker than the twos. Each pen is nudged a couple of pixels along a",
    "diagonal so the last one drawn does not bury the other three, and a tick on",
    "every beat points the way that dancer was facing.",
    "",
    "## Figures",
    "",
    "One instance of each figure, looping, in the group of four the Moves page",
    "shows it in.",
    "",
    table(COLUMNS, figures),
    "",
    "## Dances",
    "",
    "One time through of each dance, one minor set, with the real progression.",
    "",
    table(COLUMNS, dances),
    "",
  ].join("\n");
}

/** The first line of the index: this file is generated. */
export const TRACES_BANNER =
  "<!-- Written by `pnpm traces:export` on every run. Do not edit by hand. -->";

/** The index's columns. */
const COLUMNS = ["what", "beats", "cells", "pen plot", "march", "seismograph", "figure strip"];

/** One row per thing, with a link to each of its four views. */
function rowsFor(files: readonly TraceFile[], kind: TraceFileKind): string[][] {
  const keys = [...new Set(files.filter((f) => f.kind === kind).map((f) => f.key))];
  return keys.map((key) => {
    const own = files.filter((f) => f.kind === kind && f.key === key);
    const first = own[0]!;
    const link = (view: TraceFileView): string => {
      const file = own.find((f) => f.view === view);
      return file === undefined ? "" : `[${view}](./${file.path})`;
    };
    return [
      `\`${key}\``,
      String(first.beats),
      String(first.cells),
      link("pen"),
      link("march"),
      link("seismograph"),
      link("strip"),
    ];
  });
}

/** A markdown table, padded so prettier has nothing to say about it. */
function table(header: readonly string[], rows: readonly string[][]): string {
  const width = header.map((h, i) =>
    Math.max(3, h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((c, i) => c.padEnd(width[i]!)).join(" | ")} |`;
  return [line(header), line(width.map((w) => "-".repeat(w))), ...rows.map((r) => line(r))].join(
    "\n",
  );
}
