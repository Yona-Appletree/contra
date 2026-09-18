import type { CompiledCall } from "../../src/sequence/CompiledSequence.js";
import { el, paneShell, type Pane, type View } from "../view.js";

/**
 * The `.dance` text, editable, with a picker over **every file the dance
 * reads** — the dance's own module and the ones it `use`s, as the playground's
 * source pane has it. The call the bar is inside is lit in the file it was
 * written in — painted on a layer under the text, since a textarea shows its
 * selection only while it has the caret. What it bound and how its figure
 * reads are the deck's `bindings` tab (M9): the text is the thing beside the
 * picture.
 *
 * Typing re-runs the whole stack after 150 ms of quiet. The textarea is never
 * written back to while it has the caret, so an edit is not fought over by its
 * own run.
 */
export function sourcePane(onEdit: (file: string, text: string) => void): Pane {
  const { section, head, body } = paneShell("source");
  const files = el("select", "pick");
  head.append(files);
  const code = el("div", "code");
  const lit = el("pre", "source-lit");
  const text = el("textarea", "source-text");
  text.spellcheck = false;
  code.append(lit, text);
  body.append(code);
  text.addEventListener("scroll", () => {
    lit.scrollTop = text.scrollTop;
    lit.scrollLeft = text.scrollLeft;
  });

  let timer = 0;
  text.addEventListener("input", () => {
    clearTimeout(timer);
    const file = files.value;
    timer = window.setTimeout(() => onEdit(file, text.value), 150);
  });

  let view: View | undefined;
  let shown: CompiledCall | undefined;
  /** A fresh run redraws even when there is still no call — a dance that does not parse has none. */
  let stale = true;
  /** The file the reader chose; the call's own file wins until they choose one. */
  let chosen: string | undefined;

  files.addEventListener("change", () => {
    chosen = files.value;
    stale = true;
    draw(lastBeat);
  });

  let lastBeat = 0;

  const fileNames = (): string[] => {
    if (!view) return [];
    const program = view.run.program;
    if (program === undefined) return view.run.sources.map((s) => s.name);
    return [...program.modules.keys()].map((name) => `${name}.dance`).sort();
  };

  const textOf = (name: string): string =>
    view?.run.sources.find((s) => s.name === name)?.text ?? "";

  /** The text once more on the layer under the textarea, the call's span marked. */
  const paint = (body: string, span?: { start: number; end: number }): void => {
    lit.replaceChildren();
    if (span === undefined) {
      lit.textContent = body;
    } else {
      const mark = el("mark", "call", body.slice(span.start, span.end));
      lit.append(body.slice(0, span.start), mark, body.slice(span.end));
    }
    lit.scrollTop = text.scrollTop;
    lit.scrollLeft = text.scrollLeft;
  };

  const show = (name: string, span?: { start: number; end: number }): void => {
    if (files.value !== name) files.value = name;
    const body = textOf(name);
    if (document.activeElement !== text && text.value !== body) text.value = body;
    paint(text.value, text.value === body ? span : undefined);
    if (span === undefined || document.activeElement === text) return;
    // Scroll the call into view without stealing the caret.
    const before = body.slice(0, span.start).split("\n").length - 1;
    const lines = Math.max(body.split("\n").length, 1);
    text.scrollTop = Math.max(0, (before / lines) * text.scrollHeight - text.clientHeight / 2);
    lit.scrollTop = text.scrollTop;
  };

  const draw = (beat: number): void => {
    lastBeat = beat;
    if (!view) return;
    const dancer = view.pick[0];
    const calls = dancer === undefined ? [] : (view.run.sequence?.perDancer[dancer] ?? []);
    const call = calls.find((c) => beat >= c.start && beat < c.end) ?? calls[calls.length - 1];
    if (!stale && call === shown) return;
    stale = false;
    shown = call;
    const wanted = chosen ?? call?.span.file ?? fileNames()[0];
    if (wanted !== undefined) {
      show(wanted, call !== undefined && call.span.file === wanted ? call.span : undefined);
    }
  };

  return {
    el: section,
    setRun(next) {
      view = next;
      const names = fileNames();
      const keep = chosen !== undefined && names.includes(chosen) ? chosen : undefined;
      chosen = keep;
      if (
        [...files.options].map((o) => o.value).join(" ") !== names.join(" ") &&
        document.activeElement !== files
      ) {
        files.replaceChildren();
        for (const name of names) files.append(new Option(name, name));
      }
      shown = undefined;
      stale = true;
    },
    setBeat: draw,
  };
}
