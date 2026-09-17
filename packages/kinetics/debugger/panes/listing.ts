import { formatLine } from "../../src/asm/listing.js";
import { colourOf, el, paneShell, type Pane, type View } from "../view.js";

/**
 * The assembly as a dancer would say it: one line per slot, the beat under the
 * bar lit, and the pane scrolled to keep it in sight. With more than one
 * dancer picked, each line says whose it is.
 */
export function listingPane(): Pane {
  const { section, body } = paneShell("listing");
  const list = el("div", "listing");
  body.append(list);

  let rows: { beat: number; node: HTMLElement }[] = [];
  let lit = -1;

  return {
    el: section,
    setRun(next: View) {
      const { run, pick } = next;
      const named = pick.length > 1;
      const all: { beat: number; half: number; dancer: string; text: string }[] = [];
      for (const dancer of pick) {
        for (const line of run.listings[dancer] ?? []) {
          all.push({ beat: line.beat, half: line.half, dancer, text: formatLine(line) });
        }
      }
      all.sort((a, b) => a.beat - b.beat || a.half - b.half || a.dancer.localeCompare(b.dancer));
      list.replaceChildren();
      rows = all.map((line) => {
        const node = el("div", "line");
        if (named) {
          const who = el("span", "who", line.dancer);
          who.style.color = colourOf(run, line.dancer);
          node.append(who);
        }
        node.append(el("span", "said", line.text));
        list.append(node);
        return { beat: line.beat, node };
      });
      lit = -1;
    },
    setBeat(beat) {
      const now = Math.floor(beat);
      if (now === lit) return;
      lit = now;
      let first: HTMLElement | undefined;
      for (const row of rows) {
        const on = row.beat === now;
        row.node.classList.toggle("lit", on);
        if (on && !first) first = row.node;
      }
      first?.scrollIntoView({ block: "nearest" });
    },
  };
}
