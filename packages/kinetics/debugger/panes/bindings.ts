import { printFigure } from "../../src/ir/print.js";
import type { CompiledCall } from "../../src/sequence/CompiledSequence.js";
import { el, paneShell, type Pane, type View } from "../view.js";

/**
 * The call the bar is inside, for the followed dancer: its path and span,
 * what each argument resolved to for them, and its figure printed as the IR
 * holds it. Out of the main view and into the deck (M9): a tab for the reader
 * who asks *what did this bind*, not a strip everybody scrolls past.
 */
export function bindingsPane(): Pane {
  const { section, body } = paneShell("bindings");
  const crumb = el("div", "crumb");
  const bindings = el("div", "bindings");
  const ir = el("pre", "ir");
  body.append(crumb, bindings, ir);

  let view: View | undefined;
  let shown: CompiledCall | undefined;
  let stale = true;

  return {
    el: section,
    setRun(next) {
      view = next;
      shown = undefined;
      stale = true;
    },
    setBeat(beat) {
      if (!view) return;
      const dancer = view.pick[0];
      const calls = dancer === undefined ? [] : (view.run.sequence?.perDancer[dancer] ?? []);
      const call = calls.find((c) => beat >= c.start && beat < c.end) ?? calls[calls.length - 1];
      if (!stale && call === shown) return;
      stale = false;
      shown = call;
      crumb.textContent =
        call === undefined
          ? "—"
          : `${call.path}  ·  ${String(call.start)}–${String(call.end)}  ·  ${dancer ?? ""}`;
      bindings.textContent =
        call === undefined
          ? ""
          : Object.entries(call.bindings)
              .map(([name, who]) => `${name} = ${who}`)
              .join("   ");
      ir.textContent = call === undefined ? "" : printFigure(call.figure, call.params);
    },
  };
}
