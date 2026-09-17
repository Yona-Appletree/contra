import { printFigure } from "../../src/ir/print.js";
import type { CompiledCall } from "../../src/lang/compile.js";
import { el, paneShell, type Pane, type View } from "../view.js";

/**
 * The program, editable, with the call the bar is inside named beneath it and
 * that call's figure printed as the IR actually holds it.
 *
 * Typing recompiles after 150 ms of quiet. The textarea is never written back
 * to while it has the caret, so an edit is not fought over by its own run.
 */
export function sourcePane(onEdit: (text: string) => void): Pane {
  const { section, body } = paneShell("source");
  const text = el("textarea", "source-text");
  text.spellcheck = false;
  const crumb = el("div", "crumb");
  const bindings = el("div", "bindings");
  const ir = el("pre", "ir");
  body.append(text, crumb, bindings, ir);

  let timer = 0;
  text.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => onEdit(text.value), 150);
  });

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
      if (document.activeElement !== text && text.value !== next.run.source) {
        text.value = next.run.source;
      }
      shown = undefined;
      stale = true;
    },
    setBeat: draw,
  };
}
