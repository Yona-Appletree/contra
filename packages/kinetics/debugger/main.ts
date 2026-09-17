import { contraDialect } from "../src/dialect/contra/Contra.js";
import type { Dialect } from "../src/dialect/Dialect.js";
import { PAIR, PAIR_SOLO } from "../src/dialect/pair/Pair.js";
import { FIXTURE_PROGRAM, run, type Run } from "../src/pipeline.js";
import { cursor } from "./cursor.js";
import { graphsPane } from "./panes/graphs.js";
import { listingPane } from "./panes/listing.js";
import { pixelsPane } from "./panes/pixels.js";
import { sourcePane } from "./panes/source.js";
import { timelinePane } from "./panes/timeline.js";
import { view3dPane } from "./panes/view3d.js";
import { el, type Pane } from "./view.js";

/**
 * The kinetics debugger: every layer of engine 3 on one page, one bar through
 * all of them (DA2). The text, the schedule, the listing, the bodies in three
 * dimensions, every point against its cap, and the floor from above — all of
 * one `run`, all at one beat.
 */
const BPM = 112;

/** Becket's `across` is not the pair's; the preset brings the program with it. */
const DIALECTS: Record<string, { dialect: () => Dialect; source: string }> = {
  pair: { dialect: () => PAIR, source: FIXTURE_PROGRAM },
  "pair-solo": { dialect: () => PAIR_SOLO, source: FIXTURE_PROGRAM },
  "becket ×2 couples": {
    dialect: () => contraDialect({ formation: "becket", couples: 2 }),
    source: FIXTURE_PROGRAM.replace("across", "neighbor"),
  },
};

const app = document.getElementById("app");
if (!app) throw new Error("no #app");

const bar = cursor();
bar.setBpm(BPM);

let dialectKey = "pair";
let source = FIXTURE_PROGRAM;
let picked = "all";
let current: Run | undefined;

const strip = el("div", "transport");
const playButton = el("button", "play", "▶");
const range = el("input", "scrub");
range.type = "range";
range.min = "0";
range.step = "0.0625";
range.value = "0";
const readout = el("span", "beat", "0.00");
const dialectSelect = el("select", "pick");
for (const key of Object.keys(DIALECTS)) dialectSelect.append(new Option(key, key));
const dancerSelect = el("select", "pick");
const complaints = el("span", "complaints");
strip.append(playButton, range, readout, dialectSelect, dancerSelect, complaints);
app.append(strip);

const panes: Pane[] = [
  sourcePane((text) => {
    source = text;
    recompute(false);
  }),
  timelinePane((beat) => {
    bar.pause();
    bar.set(beat);
  }),
  listingPane(),
  view3dPane(),
  graphsPane(),
  pixelsPane(),
];
for (const pane of panes) app.append(pane.el);

function pick(): readonly string[] {
  const dancers = current?.dialect.dancers ?? [];
  return picked === "all" ? dancers : dancers.filter((d) => d === picked);
}

function recompute(resetSource: boolean): void {
  const preset = DIALECTS[dialectKey];
  if (!preset) return;
  if (resetSource) source = preset.source;
  current = run(source, { dialect: preset.dialect(), bpm: BPM });

  const dancers = current.dialect.dancers;
  if (picked !== "all" && !dancers.includes(picked)) picked = "all";
  dancerSelect.replaceChildren(new Option("all", "all"));
  for (const dancer of dancers) dancerSelect.append(new Option(dancer, dancer));
  dancerSelect.value = picked;

  range.max = String(Math.max(current.endBeat, 0.0625));
  bar.setEnd(current.endBeat);

  const errors = current.errors.map((e) => `${e.stage}${e.kind ? ` ${e.kind}` : ""}: ${e.message}`);
  const warnings = current.warnings.map((w) => `${w.kind}: ${w.message}`);
  complaints.textContent =
    errors.length > 0
      ? errors.join("  ·  ")
      : warnings.length > 0
        ? warnings.join("  ·  ")
        : `${current.endBeat} beats · ${dancers.length} dancers · ${(current.solved?.violations.length ?? 0) + (current.executed?.violations.length ?? 0)} proof violations`;
  complaints.className = errors.length > 0 ? "complaints bad" : "complaints";

  const view = { run: current, pick: pick() };
  for (const pane of panes) pane.setRun(view);
  for (const pane of panes) pane.setBeat(bar.beat());
}

bar.subscribe((beat, playing) => {
  range.value = String(beat);
  readout.textContent = beat.toFixed(2);
  playButton.textContent = playing ? "❚❚" : "▶";
  for (const pane of panes) pane.setBeat(beat);
});

playButton.addEventListener("click", () => bar.toggle());
range.addEventListener("input", () => {
  bar.pause();
  bar.set(Number(range.value));
});
dialectSelect.addEventListener("change", () => {
  dialectKey = dialectSelect.value;
  bar.pause();
  bar.set(0);
  recompute(true);
});
dancerSelect.addEventListener("change", () => {
  picked = dancerSelect.value;
  if (current) {
    const view = { run: current, pick: pick() };
    for (const pane of panes) pane.setRun(view);
    for (const pane of panes) pane.setBeat(bar.beat());
  }
});
window.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing =
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement;
  if (event.code === "Space" && !typing) {
    event.preventDefault();
    bar.toggle();
  }
});

recompute(true);
