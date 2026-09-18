import type { Source } from "@caller/lang";
import type { DancerId } from "../src/dialect/Dialect.js";
import { run, type Run } from "../src/pipeline.js";
import type { CompiledCall } from "../src/sequence/CompiledSequence.js";
import { cursor } from "./cursor.js";
import { bindingsPane } from "./panes/bindings.js";
import { figurePane } from "./panes/figure.js";
import { graphsPane } from "./panes/graphs.js";
import { layoutPane } from "./panes/layout.js";
import { listingPane } from "./panes/listing.js";
import { pixelsPane } from "./panes/pixels.js";
import { problemsPane } from "./panes/problems.js";
import { sourcePane } from "./panes/source.js";
import { timelinePane } from "./panes/timeline.js";
import { treePane } from "./panes/tree.js";
import { view3dPane } from "./panes/view3d.js";
import { DANCES, SOURCES, spansOf, timeLabel, type TimeSpan } from "./presets.js";
import { colourOf, el, type Pane } from "./view.js";

/**
 * The kinetics debugger as the review instrument (M9, from the spike
 * `spikes/debugger-instrument/`): one flat screen, hairlines between its
 * cells. The **tape** across the top — the mode, the dance, the transport and
 * a ruler of the followed dancer's calls. The **text** down the left with its
 * **problems** under it. On the right, in dance mode, the **whole hall at 2×**,
 * the **3d** under it turned to whichever set was clicked, and under that a
 * **deck** of one tab at a time — timeline, graphs, listing, tree, layout,
 * bindings — that folds to its tab row. Figure mode holds its place until the
 * figure language exists.
 *
 * The first three layers are `@caller/lang`'s: a dance is picked by **name**
 * from the fixtures, the hall facts it declares become its controls, and an
 * edit in the text re-runs the whole stack over the edited file.
 */
const BPM = 112;
const SIZES = [1, 2, 3, 4, 5, 6, 7, 8];
const TIMES = [1, 2, 3, 4, 5, 6, 7, 8];

const app = document.getElementById("app");
if (!app) throw new Error("no #app");

const bar = cursor();
bar.setBpm(BPM);

/**
 * The opening state, from the URL when it says: `?dance=butter&sets=3&times=2
 * &beat=12&set=2&mode=dance` — so a headless capture, or an agent in the
 * edit-and-look loop, can open the instrument on exactly the picture it wants.
 * `set=hall` is the whole line.
 */
const query = new URLSearchParams(window.location.search);
const queryNumber = (name: string): number | undefined => {
  const value = query.get(name);
  return value === null || value === "" || Number.isNaN(Number(value)) ? undefined : Number(value);
};

let danceName = DANCES.some((d) => d.name === "butter") ? "butter" : (DANCES[0]?.name ?? "");
{
  const wanted = query.get("dance");
  if (wanted !== null && DANCES.some((d) => d.name === wanted)) danceName = wanted;
}
let minorSets = queryNumber("sets") ?? 3;
let times = queryNumber("times") ?? 2;
let picked: DancerId | "all" = "all";
/** The bundled files, with whatever the source pane has edited on top. */
let sources: Source[] = [...SOURCES];
let spans: TimeSpan[] = [];
let current: Run | undefined;
let mode: "dance" | "figure" = query.get("mode") === "figure" ? "figure" : "dance";
/** Whether the bar is going round inside the running call. */
let looping = false;

// ---- the tape --------------------------------------------------------------

const tape = el("div", "tape");
const modes = el("span", "modes");
const danceMode = el("button", "mode on", "dance");
const figureMode = el("button", "mode", "figure");
modes.append(danceMode, figureMode);
const danceSelect = el("select", "pick");
for (const dance of DANCES) danceSelect.append(new Option(dance.label, dance.name));
const sizeSelect = el("select", "pick");
for (const n of SIZES) sizeSelect.append(new Option(`${String(n)} minor sets`, String(n)));
const timesSelect = el("select", "pick");
for (const n of TIMES) timesSelect.append(new Option(`× ${String(n)}`, String(n)));
const prevButton = el("button", "tbtn", "⏮");
prevButton.title = "the call before";
const playButton = el("button", "tbtn play", "▶");
const nextButton = el("button", "tbtn", "⏭");
nextButton.title = "the call after";
const loopButton = el("button", "tbtn loop", "⟲");
loopButton.title = "loop the running call";
const ruler = el("div", "ruler");
const readout = el("span", "beat", "beat 0.00");
tape.append(
  modes,
  danceSelect,
  sizeSelect,
  timesSelect,
  prevButton,
  playButton,
  nextButton,
  loopButton,
  ruler,
  readout,
);

// ---- the columns -----------------------------------------------------------

const left = el("div", "left");
const right = el("div", "right");
app.append(tape, left, right);

const source = sourcePane((file, text) => {
  sources = sources.map((s) => (s.name === file ? { name: file, text } : s));
  recompute();
});
const problems = problemsPane((beat, dancer) => {
  bar.pause();
  bar.set(beat);
  if (dancer !== undefined) {
    picked = dancer;
    drawChips();
    redraw();
  }
});
left.append(source.el, problems.el);

const pixels = pixelsPane((set) => {
  setFocus(set);
});
const view3d = view3dPane(() => {
  setFocus(undefined);
});
const figure = figurePane();

// ---- the deck: one tab at a time, folded with ▾ ------------------------------

const deckPanes: Record<string, Pane> = {
  timeline: timelinePane((beat) => {
    bar.pause();
    bar.set(beat);
  }),
  graphs: graphsPane(),
  listing: listingPane(),
  tree: treePane(),
  layout: layoutPane(),
  bindings: bindingsPane(),
};
const deck = el("div", "deck");
const tabbar = el("div", "tabbar");
const deckBody = el("div", "deck-body");
const chips = el("span", "chips");
const fold = el("button", "fold", "▾");
fold.title = "fold the deck away";
let tab = "timeline";
const tabButtons = new Map<string, HTMLButtonElement>();
for (const name of Object.keys(deckPanes)) {
  const button = el("button", "tab", name);
  button.addEventListener("click", () => {
    showTab(tab === name ? "" : name);
  });
  tabButtons.set(name, button);
  tabbar.append(button);
}
tabbar.append(el("span", "spacer"), chips, fold);
fold.addEventListener("click", () => {
  showTab(tab === "" ? "timeline" : "");
});
deck.append(tabbar, deckBody);

function showTab(name: string): void {
  tab = name;
  for (const [n, button] of tabButtons) button.classList.toggle("on", n === name);
  fold.textContent = name === "" ? "▴" : "▾";
  deckBody.hidden = name === "";
  const pane = deckPanes[name];
  if (pane === undefined) {
    deckBody.replaceChildren();
    return;
  }
  deckBody.replaceChildren(pane.el);
  // Drawn into a box that was not there a moment ago: its width is new.
  if (current) {
    pane.setRun({ run: current, pick: pick() });
    pane.setBeat(bar.beat());
  }
}

/** The panes that are on the screen right now — the only ones worth a redraw. */
const activePanes = (): Pane[] => {
  const deckPane = deckPanes[tab];
  return mode === "dance"
    ? [source, problems, pixels, view3d, ...(deckPane === undefined ? [] : [deckPane])]
    : [source, problems];
};

const layoutRight = (): void => {
  right.replaceChildren(...(mode === "dance" ? [pixels.el, view3d.el, deck] : [figure.el]));
  danceMode.classList.toggle("on", mode === "dance");
  figureMode.classList.toggle("on", mode === "figure");
};
layoutRight();
showTab(tab);

// ---- what the bar is inside --------------------------------------------------

/**
 * Whose bodies the panes are about, the one they follow first. With nobody
 * picked that is everybody, led by the first dancer who is not waiting out at
 * the start — a couple out at the top has one 64-beat call, and a text, a
 * ruler and a listing of that say nothing about the dance.
 */
const pick = (): readonly DancerId[] => {
  const dancers = current?.dialect?.dancers ?? [];
  if (picked !== "all") return dancers.filter((d) => d === picked);
  const perDancer = current?.sequence?.perDancer ?? {};
  const lead = dancers.find((d) => perDancer[d]?.[0]?.figure.id !== "wait-out");
  return lead === undefined ? dancers : [lead, ...dancers.filter((d) => d !== lead)];
};

/** The followed dancer's calls, in order: the tape's ruler and the jumps read these. */
const callsOf = (): readonly CompiledCall[] => {
  const dancer = pick()[0];
  return dancer === undefined ? [] : (current?.sequence?.perDancer[dancer] ?? []);
};
const callAt = (beat: number): CompiledCall | undefined =>
  callsOf().find((c) => beat >= c.start && beat < c.end);

/** Land on a call's first beat; with the loop on, the loop becomes that call. */
const seek = (call: CompiledCall): void => {
  if (looping) bar.setLoop([call.start, call.end]);
  bar.set(call.start);
};
const jump = (by: number): void => {
  const calls = callsOf();
  if (calls.length === 0) return;
  const at = calls.findIndex((c) => bar.beat() >= c.start && bar.beat() < c.end);
  const index = at < 0 ? 0 : (at + by + calls.length) % calls.length;
  const call = calls[index];
  if (call) seek(call);
};
const setLooping = (on: boolean): void => {
  looping = on;
  const call = callAt(bar.beat());
  bar.setLoop(on && call ? [call.start, call.end] : undefined);
  loopButton.classList.toggle("on", on);
};

/** Turn the 3d to one minor set, by the tree's count; none is the whole hall. */
const setFocus = (set: number | undefined): void => {
  pixels.setFocus(set);
  view3d.setFocus(set);
};

let cells: { el: HTMLElement; fill: HTMLElement; call: CompiledCall }[] = [];
const drawRuler = (): void => {
  ruler.replaceChildren();
  cells = callsOf().map((call) => {
    const cell = el("div", "call");
    cell.style.setProperty("--w", String(Math.max(call.end - call.start, 0.5)));
    const fill = el("div", "fill");
    cell.append(fill, el("b", undefined, call.figure.id));
    cell.title = `${call.path} · ${String(call.start)}–${String(call.end)}`;
    cell.addEventListener("click", () => {
      seek(call);
    });
    ruler.append(cell);
    return { el: cell, fill, call };
  });
};
const frameRuler = (beat: number): void => {
  for (const { el: cell, fill, call } of cells) {
    const on = beat >= call.start && beat < call.end;
    cell.classList.toggle("on", on);
    fill.style.width = on
      ? `${String(((beat - call.start) / (call.end - call.start)) * 100)}%`
      : "0";
  }
};

const redraw = (): void => {
  if (!current) return;
  const view = { run: current, pick: pick() };
  for (const pane of activePanes()) pane.setRun(view);
  for (const pane of activePanes()) pane.setBeat(bar.beat());
  drawRuler();
  frameRuler(bar.beat());
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

  drawChips();
  bar.setEnd(current.endBeat);
  setLooping(looping);
  redraw();
}

/** `all`, then everybody in their own role's colour: click one to follow it. */
const drawChips = (): void => {
  chips.replaceChildren();
  const of = current;
  if (!of) return;
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
      drawChips();
      redraw();
    });
    chips.append(node);
  };
  chip("all", "all");
  for (const dancer of of.dialect?.dancers ?? []) chip(dancer, dancer);
};

// ---- wiring ----------------------------------------------------------------

bar.subscribe((beat, playing) => {
  readout.textContent = timeLabel(spans, beat);
  playButton.textContent = playing ? "❚❚" : "▶";
  frameRuler(beat);
  for (const pane of activePanes()) pane.setBeat(beat);
});

playButton.addEventListener("click", () => {
  bar.toggle();
});
prevButton.addEventListener("click", () => {
  jump(-1);
});
nextButton.addEventListener("click", () => {
  jump(1);
});
loopButton.addEventListener("click", () => {
  setLooping(!looping);
});
danceMode.addEventListener("click", () => {
  mode = "dance";
  layoutRight();
  redraw();
});
figureMode.addEventListener("click", () => {
  mode = "figure";
  layoutRight();
  redraw();
});
danceSelect.addEventListener("change", () => {
  danceName = danceSelect.value;
  bar.pause();
  bar.setLoop(undefined);
  bar.set(0);
  setFocus(undefined);
  recompute();
});
sizeSelect.addEventListener("change", () => {
  minorSets = Number(sizeSelect.value);
  bar.pause();
  setFocus(undefined);
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
  if (typing) return;
  if (event.code === "Space") {
    event.preventDefault();
    bar.toggle();
  } else if (event.code === "ArrowLeft") {
    jump(-1);
  } else if (event.code === "ArrowRight") {
    jump(1);
  }
});

recompute();
{
  const beat = queryNumber("beat");
  if (beat !== undefined) bar.set(beat);
  // Something to look at: the set the URL names, else the hall's middle one.
  const set = query.get("set");
  if (set === "hall") setFocus(undefined);
  else setFocus(queryNumber("set") ?? (minorSets > 1 ? Math.floor(minorSets / 2) : undefined));
}
