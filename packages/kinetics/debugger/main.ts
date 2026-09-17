import type { DancerId } from "../src/dialect/Dialect.js";
import { run, type Run } from "../src/pipeline.js";
import { complaintsOf, summaryOf } from "./complaints.js";
import { cursor } from "./cursor.js";
import { graphsPane } from "./panes/graphs.js";
import { layoutPane } from "./panes/layout.js";
import { listingPane } from "./panes/listing.js";
import { pixelsPane } from "./panes/pixels.js";
import { sourcePane } from "./panes/source.js";
import { timelinePane } from "./panes/timeline.js";
import { treePane } from "./panes/tree.js";
import { view3dPane } from "./panes/view3d.js";
import {
  FORMATIONS,
  LIBRARY,
  MOVES,
  PRESETS,
  TIME_THROUGH_BEATS,
  resolveFormation,
  timeLabel,
  timesThrough,
} from "./presets.js";
import { colourOf, el, type Pane } from "./view.js";

/**
 * The kinetics debugger: every layer of engine 3 on one page, one bar through
 * all of them (DA2). The text, the schedule, the listing, the bodies in three
 * dimensions, every point against its cap, and the floor from above — all of
 * one `run`, all at one beat.
 *
 * P12 grew it from the pair to a hall: a program to dance, a floor to dance it
 * on, a time through to jump to, and one dancer of the many to follow.
 */
const BPM = 112;
const SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

const app = document.getElementById("app");
if (!app) throw new Error("no #app");

const bar = cursor();
bar.setBpm(BPM);

let presetKey = "pair";
let size: number | undefined;
let source = PRESETS.pair?.source ?? "";
let picked: DancerId | "all" = "all";
let current: Run | undefined;

// ---- the transport ---------------------------------------------------------

const transport = el("div", "transport");
const playButton = el("button", "play", "▶");
const range = el("input", "scrub");
range.type = "range";
range.min = "0";
range.step = "0.0625";
range.value = "0";
const readout = el("span", "beat", timeLabel(0));
const presetSelect = el("select", "pick");
for (const [key, preset] of Object.entries(PRESETS)) {
  presetSelect.append(new Option(preset.label, key));
}
const formationSelect = el("select", "pick");
for (const f of FORMATIONS) formationSelect.append(new Option(f, f));
const sizeSelect = el("select", "pick");
for (const n of SIZES) sizeSelect.append(new Option(`${String(n)} minor sets`, String(n)));
const times = el("span", "times");
transport.append(playButton, range, readout, times, presetSelect, formationSelect, sizeSelect);

const chips = el("div", "chips");
const strip = el("div", "complaints");
app.append(transport, chips, strip);

// ---- the panes -------------------------------------------------------------

const panes: Pane[] = [
  sourcePane((text) => {
    source = text;
    recompute(false);
  }),
  layoutPane(),
  timelinePane((beat) => {
    bar.pause();
    bar.set(beat);
  }),
  listingPane(),
  view3dPane(),
  graphsPane(),
  pixelsPane(),
  treePane(),
];
for (const pane of panes) app.append(pane.el);

const pick = (): readonly DancerId[] => {
  const dancers = current?.dialect.dancers ?? [];
  return picked === "all" ? dancers : dancers.filter((d) => d === picked);
};

const redraw = (): void => {
  if (!current) return;
  const view = { run: current, pick: pick() };
  for (const pane of panes) pane.setRun(view);
  for (const pane of panes) pane.setBeat(bar.beat());
};

function recompute(resetSource: boolean): void {
  const preset = PRESETS[presetKey];
  if (!preset) return;
  if (resetSource) source = preset.source;
  // The dance owns its floor; the hall says how long the set is.
  formationSelect.disabled = true;
  sizeSelect.value = String(size ?? preset.size ?? 2);

  current = run(source, {
    moves: MOVES,
    library: LIBRARY,
    resolve: resolveFormation,
    dynamics: { "minor-sets": size ?? preset.size ?? 2 },
    bpm: BPM,
  });
  const dancers = current.dialect.dancers;
  if (picked !== "all" && !dancers.includes(picked)) picked = "all";

  drawChips(current, dancers);
  drawTimes(current);
  drawComplaints(current);

  range.max = String(Math.max(current.endBeat, 0.0625));
  bar.setEnd(current.endBeat);
  redraw();
}

/** `all`, then everybody in their own role's colour: click one to follow it. */
const drawChips = (of: Run, dancers: readonly DancerId[]): void => {
  chips.replaceChildren();
  const chip = (label: string, dancer: DancerId | "all"): void => {
    const node = el("button", "chip", label);
    const colour = dancer === "all" ? "var(--ink)" : colourOf(of, dancer);
    if (picked === dancer) {
      node.classList.add("on");
      node.style.background = colour;
      node.style.borderColor = colour;
    } else {
      node.style.color = colour;
      node.style.borderColor = colour;
    }
    node.addEventListener("click", () => {
      picked = dancer;
      drawChips(of, dancers);
      redraw();
    });
    chips.append(node);
  };
  chip("all", "all");
  for (const dancer of dancers) chip(dancer, dancer);
};

/** One button per time through; the bar lands on its first beat. */
const drawTimes = (of: Run): void => {
  times.replaceChildren();
  const n = timesThrough(of.endBeat);
  for (let i = 1; i <= n; i++) {
    const node = el("button", "tbtn", String(i));
    node.addEventListener("click", () => {
      bar.pause();
      bar.set((i - 1) * TIME_THROUGH_BEATS);
    });
    times.append(node);
  }
};

const drawComplaints = (of: Run): void => {
  const list = complaintsOf(of);
  strip.replaceChildren();
  strip.classList.toggle(
    "bad",
    list.some((c) => c.bad),
  );
  if (list.length === 0) {
    strip.append(el("div", "line", summaryOf(of)));
    return;
  }
  for (const c of list) {
    const line = el("div", c.bad ? "line bad" : "line");
    line.append(el("span", "tag", c.tag));
    if (c.where !== "") line.append(el("span", "where", c.where));
    line.append(el("span", "what", c.message));
    if (c.count > 1) line.append(el("span", "count", `×${String(c.count)}`));
    strip.append(line);
  }
};

// ---- wiring ----------------------------------------------------------------

bar.subscribe((beat, playing) => {
  range.value = String(beat);
  readout.textContent = timeLabel(beat);
  playButton.textContent = playing ? "❚❚" : "▶";
  const time = Math.floor(beat / TIME_THROUGH_BEATS);
  [...times.children].forEach((node, i) => {
    node.classList.toggle("on", i === time);
  });
  for (const pane of panes) pane.setBeat(beat);
});

playButton.addEventListener("click", () => {
  bar.toggle();
});
range.addEventListener("input", () => {
  bar.pause();
  bar.set(Number(range.value));
});
presetSelect.addEventListener("change", () => {
  presetKey = presetSelect.value;
  size = PRESETS[presetKey]?.size;
  bar.pause();
  bar.set(0);
  recompute(true);
});
sizeSelect.addEventListener("change", () => {
  size = Number(sizeSelect.value);
  bar.pause();
  recompute(false);
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

presetSelect.value = presetKey;
recompute(true);
