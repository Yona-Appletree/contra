/**
 * A row per dancer, the evening's beats left to right: the moves as bars with
 * their arguments on them, the commits as ticks, the times through separated
 * by a dashed line, and the scrubber as a cursor you can drag.
 *
 * The names stay put in their own column while the beats scroll, because
 * seven times through Butter is 448 beats wide and a row with no name on it
 * says nothing.
 */
import { h, s } from "../dom.js";
import { globalBeat } from "../model.js";
import type { Pane, View } from "../view.js";

const BEAT = 9;
const ROW = 15;
const RULER = 16;

export function timelinesPane(view: View): Pane {
  const evening = view.model.evening;
  if (evening === undefined || evening.times.length === 0) {
    return { fact: "", body: h("div", { class: "empty" }, "nothing ran") };
  }

  const dancers = evening.tree.dancers.map((dancer) => dancer.id);
  const width = view.model.totalBeats * BEAT;
  const height = RULER + dancers.length * ROW;
  const rowOf = new Map(dancers.map((id, index) => [id, RULER + index * ROW]));

  const marks: SVGElement[] = [];
  for (const span of view.model.spans) {
    const x = span.offset * BEAT;
    marks.push(s("line", { class: "time-line", x1: x, x2: x, y1: 0, y2: height }));
    marks.push(s("text", { class: "tick", x: x + 3, y: 11 }, `×${String(span.time)}`));
    for (let beat = 0; beat < span.length; beat += 8) {
      const at = (span.offset + beat) * BEAT;
      marks.push(s("line", { class: "grid", x1: at, x2: at, y1: RULER, y2: height }));
    }
  }

  const bars: SVGElement[] = [];
  for (const time of evening.times) {
    for (const move of time.moves) {
      const y = rowOf.get(move.dancer);
      if (y === undefined) continue;
      const x = globalBeat(view.model.spans, time.time, move.start) * BEAT;
      const w = move.beats * BEAT;
      const out = move.ir === "wait-out";
      bars.push(
        s("rect", {
          class: `bar ${roleClass(move.dancer)}${out ? " out" : ""}`,
          x,
          y: y + 1,
          width: Math.max(1, w - 1),
          height: ROW - 2,
          rx: 2,
        }),
      );
      bars.push(s("text", { class: "bar-name", x: x + 3, y: y + ROW - 5 }, label(move, w)));
    }
    for (const event of time.events) {
      const y = rowOf.get(event.dancer);
      if (y === undefined) continue;
      const x = globalBeat(view.model.spans, time.time, event.beat) * BEAT;
      bars.push(s("line", { class: "commit-tick", x1: x, x2: x, y1: y, y2: y + ROW }));
    }
  }

  const cursor = s("line", {
    class: "cursor",
    x1: view.beat * BEAT,
    x2: view.beat * BEAT,
    y1: 0,
    y2: height,
  });

  const canvas = s(
    "svg",
    { class: "timeline", width: Math.max(width, 1), height, viewBox: `0 0 ${width} ${height}` },
    ...marks,
    ...bars,
    cursor,
  );
  const scrub = (mouse: PointerEvent): void => {
    const box = canvas.getBoundingClientRect();
    view.setBeat(Math.round((mouse.clientX - box.left) / BEAT));
  };
  canvas.addEventListener("pointerdown", (mouse) => {
    canvas.setPointerCapture(mouse.pointerId);
    scrub(mouse);
  });
  canvas.addEventListener("pointermove", (mouse) => {
    if (mouse.buttons === 1) scrub(mouse);
  });

  const names = h(
    "div",
    { class: "names" },
    h("div", { class: "gap" }),
    ...dancers.map((id) => h("div", { class: `row-name ${roleClass(id)}` }, id)),
  );

  return {
    fact: `${String(view.model.totalBeats)} beats`,
    body: h("div", { class: "timelines" }, names, h("div", { class: "track" }, canvas)),
  };
}

/** `swing 0-1R 12`, cut to what the bar can hold. */
function label(
  move: { ir: string; args: readonly { name: string; value: string }[] },
  w: number,
): string {
  const rest = move.args.filter((arg) => arg.name !== "beats").map((arg) => arg.value);
  const full = [move.ir, ...rest].join(" ");
  const room = Math.floor((w - 6) / 5.4);
  return full.length <= room ? full : full.slice(0, Math.max(0, room - 1));
}

/** A dancer's name ends in the initial of its role: `0-1L`, `OT-2R`. */
const roleClass = (dancer: string): string => (dancer.endsWith("L") ? "lark" : "robin");
