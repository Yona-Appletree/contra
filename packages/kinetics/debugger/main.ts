import type { Source } from "@caller/lang";
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
import { DANCES, SOURCES, spansOf, timeLabel, type TimeSpan } from "./presets.js";
import { colourOf, el, type Pane } from "./view.js";

/**
 * The kinetics debugger: every layer of engine 3 on one page, one bar through
 * all of them (DA2). The `.dance` text, the tree the language built, the
 * schedule, the listing, the bodies in three dimensions, every point against
 * its cap, and the floor from above — all of one `run`, all at one beat.
 *
 * Since M1 of the kinetics-on-lang plan the first three layers are
 * `@caller/lang`'s: a dance is picked by **name** from the fixtures, the hall
 * facts it declares become its controls, and an edit in the source pane
 * re-runs the whole stack over the edited file.
 */
const BPM = 112;
const SIZES = [1, 2, 3, 4, 5, 6, 7, 8];
const TIMES = [1, 2, 3, 4, 5, 6, 7, 8];

const app = document.getElementById("app");
if (!app) throw new Error("no #app");

const bar = cursor();
bar.setBpm(BPM);

let danceName = DANCES.some((d) => d.name === "butter") ? "butter" : (DANCES[0]?.name ?? "");
let minorSets = 3;
let times = 2;
let picked: DancerId | "all" = "all";
/** The bundled files, with whatever the source pane has edited on top. */
let sources: Source[] = [...SOURCES];
let spans: TimeSpan[] = [];
let current: Run | undefined;

// ---- the transport ---------------------------------------------------------

const transport = el("div", "transport");
const playButton = el("button", "play", "▶");
const range = el("input", "scrub");
range.type = "range";
range.min = "0";
range.step = "0.0625";
range.value = "0";
const readout = el("span", "beat", "beat 0.00");
const danceSelect = el("select", "pick");
for (const dance of DANCES) danceSelect.append(new Option(dance.label, dance.name));
const sizeSelect = el("select", "pick");
for (const n of SIZES) sizeSelect.append(new Option(`${String(n)} minor sets`, String(n)));
const timesSelect = el("select", "pick");
for (const n of TIMES) timesSelect.append(new Option(`× ${String(n)}`, String(n)));
const timeButtons = el("span", "times");
transport.append(playButton, range, readout, timeButtons, danceSelect, sizeSelect, timesSelect);

const chips = el("div", "chips");
const strip = el("div", "complaints");
app.append(transport, chips, strip);

// ---- the panes -------------------------------------------------------------

const panes: Pane[] = [
  sourcePane((file, text) => {
    sources = sources.map((source) => (source.name === file ? { name: file, text } : source));
    recompute();
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
  const dancers = current?.dialect?.dancers ?? [];
  return picked === "all" ? dancers : dancers.filter((d) => d === picked);
};

const redraw = (): void => {
  if (!current) return;
  const view = { run: current, pick: pick() };
  for (const pane of panes) pane.setRun(view);
  for (const pane of panes) pane.setBeat(bar.beat());
};

function recompute(): void {
  const dance = DANCES.find((d) => d.name === danceName);
  const takesSize = dance?.facts.some((f) => f.name === "minor-sets") ?? false;
  sizeSelect.disabled = !takesSize;
  sizeSelect.value = String(minorSets);
  timesSelect.value = String(times);
  danceSelect.value = danceName;

  current = run({
    sources,
    dance: danceName,
    ...(dance === undefined ? {} : { module: dance.module }),
    args: { "minor-sets": minorSets },
    times,
    bpm: BPM,
  });
  spans = spansOf(current.evening);
  const dancers = current.dialect?.dancers ?? [];
  if (picked !== "all" && !dancers.includes(picked)) picked = "all";

  drawChips(current, dancers);
  drawTimes();
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
const drawTimes = (): void => {
  timeButtons.replaceChildren();
  for (const span of spans) {
    const node = el("button", "tbtn", String(span.time));
    node.addEventListener("click", () => {
      bar.pause();
      bar.set(span.offset);
    });
    timeButtons.append(node);
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
  strip.append(el("div", "line", summaryOf(of)));
  for (const c of list) {
    const line = el("div", c.bad ? "line bad" : "line");
    line.append(el("span", "tag", c.tag));
    if (c.where !== "") line.append(el("span", "where", c.where));
    line.append(el("span", "what", c.message));
    if (c.count > 1) line.append(el("span", "count", `×${String(c.count)}`));
    if (c.beat !== undefined) {
      const beat = c.beat;
      line.classList.add("clickable");
      line.addEventListener("click", () => {
        bar.pause();
        bar.set(beat);
        if (c.dancer !== undefined) {
          picked = c.dancer;
          drawChips(of, of.dialect?.dancers ?? []);
          redraw();
        }
      });
    }
    strip.append(line);
  }
};

// ---- wiring ----------------------------------------------------------------

bar.subscribe((beat, playing) => {
  range.value = String(beat);
  readout.textContent = timeLabel(spans, beat);
  playButton.textContent = playing ? "❚❚" : "▶";
  const index = spans.findIndex((s) => beat < s.offset + s.length);
  [...timeButtons.children].forEach((node, i) => {
    node.classList.toggle("on", i === index);
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
danceSelect.addEventListener("change", () => {
  danceName = danceSelect.value;
  bar.pause();
  bar.set(0);
  recompute();
});
sizeSelect.addEventListener("change", () => {
  minorSets = Number(sizeSelect.value);
  bar.pause();
  recompute();
});
timesSelect.addEventListener("change", () => {
  times = Number(timesSelect.value);
  bar.pause();
  recompute();
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

recompute();
