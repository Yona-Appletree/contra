/**
 * The commit timeline: every beat at the end of which something moved, across
 * the whole evening, and what moved.
 *
 * A place is a path four segments long and an ordinary progression changes one
 * of them, so a row shows the run of segments from the first change to the
 * last and elides the rest with `…` — `…/MinorSet(0)/… → …/MinorSet(1)/…` is
 * a couple moving up a set, and the couple going out has no run to elide
 * because leaving the line changes the whole path. The full path is on the
 * row's tooltip.
 */
import { h } from "../dom.js";
import { globalBeat, roleOf } from "../model.js";
import type { Pane, View } from "../view.js";

export function eventsPane(view: View): Pane {
  const rows: Node[] = [];
  let commits = 0;

  for (const time of view.model.evening?.times ?? []) {
    const beats = [...new Set(time.events.map((event) => event.beat))].sort((a, b) => a - b);
    for (const beat of beats) {
      commits += 1;
      const at = globalBeat(view.model.spans, time.time, beat);
      rows.push(
        h(
          "div",
          { class: `commit${at === view.beat ? " on" : ""}`, "data-beat": at },
          `time ${String(time.time)} · beat ${String(beat)}`,
        ),
      );
      for (const event of time.events.filter((e) => e.beat === beat)) {
        rows.push(
          h(
            "div",
            { class: "event", "data-beat": at },
            h("span", { class: `who ${roleClass(event.dancer, event.from)}` }, event.dancer),
            path(event.from, event.to),
            h("span", { class: "arrow" }, "→"),
            path(event.to, event.from),
          ),
        );
      }
    }
  }

  const body = h("div", { class: "events" }, ...rows);
  body.addEventListener("click", (mouse) => {
    const row = (mouse.target as HTMLElement | null)?.closest("[data-beat]");
    const beat = row?.getAttribute("data-beat");
    if (beat !== null && beat !== undefined) view.setBeat(Number(beat));
  });
  if (rows.length === 0) return { fact: "", body: h("div", { class: "empty" }, "nothing commits") };
  return { fact: `${String(commits)} commits`, body };
}

/** One side of an event: the segments that changed, the rest as `…`. */
function path(mine: string, theirs: string): HTMLElement {
  const own = mine.split("/");
  const other = theirs.split("/");
  const differs = own.map((segment, index) => segment !== other[index]);
  const first = differs.indexOf(true);
  if (first === -1) return h("span", { class: "place same", title: mine }, "—");
  const last = differs.lastIndexOf(true);

  const parts: Node[] = [];
  if (first > 0) parts.push(h("span", { class: "same" }, "…/"));
  own.slice(first, last + 1).forEach((segment, index) => {
    if (index > 0) parts.push(h("span", { class: "same" }, "/"));
    parts.push(h("span", { class: differs[first + index] === true ? "changed" : "same" }, segment));
  });
  if (last < own.length - 1) parts.push(h("span", { class: "same" }, "/…"));
  return h("span", { class: "place", title: mine }, ...parts);
}

const roleClass = (dancer: string, place: string): string => {
  const role = roleOf(place) ?? (dancer.endsWith("L") ? "Lark" : "Robin");
  return role === "Lark" ? "lark" : "robin";
};
