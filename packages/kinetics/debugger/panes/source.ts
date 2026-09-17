import { printFigure } from "../../src/ir/print.js";
import type { CompiledCall } from "../../src/lang/compile.js";
import { printTree } from "../../src/tree/print.js";
import { expandSource, filesFor } from "../presets.js";
import { el, paneShell, type Pane, type View } from "../view.js";

/**
 * The program, editable, with the call the bar is inside named beneath it and
 * that call's figure printed as the IR actually holds it.
 *
 * Typing recompiles after 150 ms of quiet. The textarea is never written back
 * to while it has the caret, so an edit is not fought over by its own run.
 */
export function sourcePane(onEdit: (text: string) => void): Pane {
  const { section, head, body } = paneShell("source");
  // What to show: the dance (editable), any file it reads (where becket
  // comes from), everything in one text, or the evaluated initial tree with
  // the seating — the CSG-tree dump.
  const mode = el("select", "pick");
  const fillModes = (source: string): void => {
    const was = mode.value;
    mode.replaceChildren();
    mode.append(new Option("the dance", "dance"));
    for (const [name] of filesFor(source)) mode.append(new Option(name, `file:${name}`));
    mode.append(
      new Option("everything, in one text", "everything"),
      new Option("the evaluated tree", "tree"),
    );
    mode.value = [...mode.options].some((o) => o.value === was) ? was : "dance";
  };
  fillModes("");
  head.append(mode);
  const text = el("textarea", "source-text");
  text.spellcheck = false;
  const crumb = el("div", "crumb");
  const bindings = el("div", "bindings");
  const ir = el("pre", "ir");
  body.append(text, crumb, bindings, ir);

  let timer = 0;
  text.addEventListener("input", () => {
    if (mode.value !== "dance") return;
    clearTimeout(timer);
    timer = window.setTimeout(() => onEdit(text.value), 150);
  });
  const showMode = (): void => {
    if (!view) return;
    text.readOnly = mode.value !== "dance";
    if (mode.value === "dance") text.value = view.run.source;
    else if (mode.value === "everything") text.value = expandSource(view.run.source);
    else
      text.value =
        view.run.floor === undefined
          ? "no floor"
          : printTree(view.run.floor.root, view.run.floor.dancers);
  };
  mode.addEventListener("change", showMode);

  let view: View | undefined;
  let shown: CompiledCall | undefined;
  /** A fresh run redraws even when there is still no call — a program that does not parse has none. */
  let stale = true;

  const draw = (beat: number): void => {
    if (!view) return;
    const dancer = view.pick[0];
    const calls = dancer === undefined ? [] : (view.run.sequence?.perDancer[dancer] ?? []);
    const call = calls.find((c) => beat >= c.start && beat < c.end) ?? calls[calls.length - 1];
    if (!stale && call === shown) return;
    stale = false;
    shown = call;
    crumb.textContent =
      call === undefined ? "—" : `${call.path}  ·  ${call.start}–${call.end}  ·  ${dancer}`;
    // What each $ the call read resolved to, for this dancer, at this seating.
    bindings.textContent =
      call === undefined
        ? ""
        : Object.entries(call.bindings)
            .map(([name, who]) => `$${name} = ${who}`)
            .join("   ");
    ir.textContent = call === undefined ? "" : printFigure(call.figure, call.params);
  };

  return {
    el: section,
    setRun(next) {
      view = next;
      fillModes(next.run.source);
      if (mode.value !== "dance") showMode();
      else if (document.activeElement !== text && text.value !== next.run.source) {
        text.value = next.run.source;
      }
      shown = undefined;
      stale = true;
    },
    setBeat: draw,
  };
}
