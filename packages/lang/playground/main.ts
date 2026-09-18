/**
 * The dance language playground: one page, six panes, one evaluation behind
 * all of them.
 *
 * The `.dance` files are bundled as text by vite, so nothing here reads a
 * disk; editing the textarea re-runs the whole pipeline — parse, check, build
 * the floor, run the evening — and every pane redraws from the result. What
 * the panes show is the language's own answer and nothing derived: the tree as
 * `printTree` writes it, the commits as the evaluator recorded them, and the
 * dots where the last commit left everybody.
 */
import { h, fill } from "./dom.js";
import type { DanceOption, Model } from "./model.js";
import { evaluate, localBeat } from "./model.js";
import { diagnosticsPane } from "./panes/diagnostics.js";
import { eventsPane } from "./panes/events.js";
import { floorPane } from "./panes/floor.js";
import { timelinesPane } from "./panes/timelines.js";
import { treePane } from "./panes/tree.js";
import type { Pane, View } from "./view.js";
import type { Span } from "../src/syntax/ast.js";

const RAW = import.meta.glob("../dances/**/*.dance", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** `../dances/broken/other-in-is.dance` → `broken/other-in-is.dance`. */
const BUNDLED = new Map(
  Object.entries(RAW)
    .map(([path, text]) => [path.replace(/^\.\.\/dances\//, ""), text] as const)
    .sort((a, b) => a[0].localeCompare(b[0])),
);

const edits = new Map<string, string>();
const state = {
  file: BUNDLED.has("butter.dance") ? "butter.dance" : ([...BUNDLED.keys()][0] ?? ""),
  dance: undefined as DanceOption | undefined,
  minorSets: 3,
  times: 7,
  beat: 0,
};

const sourcesNow = (): { name: string; text: string }[] =>
  [...BUNDLED].map(([name, text]) => ({ name, text: edits.get(name) ?? text }));

let model: Model = run();

function run(): Model {
  return evaluate({
    sources: sourcesNow(),
    file: state.file,
    ...(state.dance === undefined ? {} : { dance: state.dance }),
    minorSets: state.minorSets,
    times: state.times,
  });
}

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

const text = h("textarea", { class: "source-text", spellcheck: "false" });
const filePick = h("select", { class: "pick" });
const dancePick = h("select", { class: "pick" });
const setsInput = h("input", { class: "num", type: "number", min: "1", max: "12" });
const timesInput = h("input", { class: "num", type: "number", min: "1", max: "24" });
const scrub = h("input", { class: "scrub", type: "range", min: "0", step: "1" });
const readout = h("span", { class: "beat" });
const uses = h("span", { class: "uses" });

const panes = {
  source: section("source"),
  tree: section("tree"),
  events: section("events"),
  timelines: section("timelines"),
  floor: section("floor"),
  diagnostics: section("diagnostics"),
};

function section(name: string): { root: HTMLElement; fact: HTMLElement; body: HTMLElement } {
  const fact = h("span", { class: "fact" });
  const body = h("div", { class: "body" });
  const root = h(
    "section",
    { "data-pane": name },
    h("h2", {}, h("span", { class: "pane-name" }, name), fact),
    body,
  );
  return { root, fact, body };
}

// The source pane's header is the picker itself: the file, and the modules it
// names, which are the only other files this one can see.
panes.source.root.querySelector("h2")?.replaceChildren(filePick, uses);
panes.source.body.append(text);

const app = document.querySelector("#app");
app?.append(
  h(
    "div",
    { class: "transport" },
    dancePick,
    h("label", {}, "sets", setsInput),
    h("label", {}, "×", timesInput),
    scrub,
    readout,
  ),
  panes.source.root,
  panes.tree.root,
  panes.events.root,
  panes.floor.root,
  panes.timelines.root,
  panes.diagnostics.root,
);

// ---------------------------------------------------------------------------
// The view the panes are handed
// ---------------------------------------------------------------------------

const view: View = {
  get model() {
    return model;
  },
  get beat() {
    return state.beat;
  },
  get file() {
    return state.file;
  },
  setBeat(beat) {
    state.beat = Math.max(0, Math.min(beat, model.totalBeats));
    draw();
  },
  show(file, span) {
    if (BUNDLED.has(file) && file !== state.file) {
      state.file = file;
      reevaluate();
    }
    if (span === undefined) return;
    select(span);
  },
};

function select(span: Span): void {
  text.focus();
  text.setSelectionRange(span.start, span.end);
  // Put the caret's line roughly in the middle of the box.
  const before = text.value.slice(0, span.start).split("\n").length;
  const rows = Math.max(1, Math.round(text.clientHeight / 17));
  text.scrollTop = Math.max(0, (before - Math.floor(rows / 2)) * 17);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function reevaluate(): void {
  model = run();
  state.dance = model.dance;
  state.beat = Math.min(state.beat, model.totalBeats);
  draw();
}

function draw(): void {
  if (text.dataset["file"] !== state.file) {
    text.value = edits.get(state.file) ?? BUNDLED.get(state.file) ?? "";
    text.dataset["file"] = state.file;
  }

  fill(
    filePick,
    ...[...BUNDLED.keys()].map((name) =>
      h("option", { value: name, selected: name === state.file }, name),
    ),
  );
  fill(
    uses,
    ...model.uses.flatMap((module) => [
      h("button", { class: "chip", "data-file": `${module}.dance` }, module),
    ]),
  );
  fill(
    dancePick,
    ...model.dances.map((dance) =>
      h(
        "option",
        {
          value: `${dance.module}::${dance.name}`,
          selected: dance.module === model.dance?.module && dance.name === model.dance.name,
        },
        `${dance.name} · ${dance.module}`,
      ),
    ),
  );
  setsInput.value = String(state.minorSets);
  timesInput.value = String(state.times);
  scrub.max = String(Math.max(1, model.totalBeats));
  scrub.value = String(state.beat);
  const where = localBeat(model.spans, state.beat);
  readout.textContent = `×${String(where.time)} beat ${String(where.beat)} · ${String(state.beat)}/${String(model.totalBeats)}`;

  put(panes.tree, treePane(view));
  put(panes.events, eventsPane(view));
  put(panes.timelines, timelinesPane(view));
  put(panes.floor, floorPane(view));
  put(panes.diagnostics, diagnosticsPane(view));
}

function put(target: { fact: HTMLElement; body: HTMLElement }, pane: Pane): void {
  target.fact.textContent = pane.fact;
  fill(target.body, pane.body);
}

// ---------------------------------------------------------------------------
// The controls
// ---------------------------------------------------------------------------

let pending: number | undefined;
text.addEventListener("input", () => {
  edits.set(state.file, text.value);
  if (pending !== undefined) clearTimeout(pending);
  pending = window.setTimeout(reevaluate, 250);
});

filePick.addEventListener("change", () => {
  state.file = filePick.value;
  reevaluate();
});

uses.addEventListener("click", (mouse) => {
  const file = (mouse.target as HTMLElement | null)?.getAttribute("data-file");
  if (file !== null && file !== undefined) view.show(file);
});

dancePick.addEventListener("change", () => {
  const [module, name] = dancePick.value.split("::");
  state.dance = module === undefined || name === undefined ? undefined : { module, name };
  state.beat = 0;
  reevaluate();
});

setsInput.addEventListener("change", () => {
  state.minorSets = Math.max(1, Number(setsInput.value) || 1);
  state.beat = 0;
  reevaluate();
});

timesInput.addEventListener("change", () => {
  state.times = Math.max(1, Number(timesInput.value) || 1);
  reevaluate();
});

scrub.addEventListener("input", () => {
  view.setBeat(Number(scrub.value));
});

state.dance = model.dance;
draw();
