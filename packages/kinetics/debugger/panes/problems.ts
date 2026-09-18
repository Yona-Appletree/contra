import type { DancerId } from "../../src/dialect/Dialect.js";
import { complaintsOf, summaryOf } from "../complaints.js";
import { el, paneShell, type Pane, type View } from "../view.js";

/**
 * What the run says is wrong, under the text it says it about (M9, layout B):
 * one line per complaint — the stage, the dancer and call and beat, the
 * message — and the run's own summary as the last, muted line. Clicking a line
 * takes the bar to its beat and follows its dancer.
 */
export function problemsPane(onJump: (beat: number, dancer: DancerId | undefined) => void): Pane {
  const { section, body } = paneShell("problems");

  return {
    el: section,
    setRun({ run }: View) {
      const list = complaintsOf(run);
      body.replaceChildren();
      section.classList.toggle(
        "bad",
        list.some((c) => c.bad),
      );
      for (const c of list) {
        const line = el("div", c.bad ? "problem bad" : "problem");
        line.append(el("span", "tag", c.tag));
        line.append(el("span", "where", c.where));
        const what = el("span", "what", c.message);
        if (c.count > 1) what.append(el("span", "count", ` ×${String(c.count)}`));
        line.append(what);
        line.title = `${c.tag}\n${c.where}\n${c.message}`;
        if (c.beat !== undefined) {
          const beat = c.beat;
          line.classList.add("clickable");
          line.addEventListener("click", () => {
            onJump(beat, c.dancer);
          });
        }
        body.append(line);
      }
      body.append(el("div", "problem summary", summaryOf(run)));
    },
    setBeat() {
      // Nothing moves with the bar: the list is the run's.
    },
  };
}
