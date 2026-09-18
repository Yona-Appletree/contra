/**
 * Where everybody got to: the hall seen from above, at the last commit on or
 * before the scrubber's beat.
 *
 * This is positions **at rest** and nothing else (notes D6). The language says
 * where a dancer stands between commits and says nothing about the path from
 * one to the next, so neither does this pane: it jumps when the commit does.
 * A place nobody is standing in is a hollow ring, which is how the couple
 * waiting at the top reads before it comes in.
 */
import { h, s } from "../dom.js";
import { localBeat, roleOf, snapshotAt } from "../model.js";
import type { Pane, View } from "../view.js";

/** Millimetres. A dancer is a dot 0.3 m across, facing where their frame faces. */
const DOT = 150;
const TICK = 300;
/** How far above the dot its name sits: clear of the heading tick. */
const NAME = 430;
const PAD = 700;

export function floorPane(view: View): Pane {
  const places = view.model.places;
  if (places.length === 0) return { fact: "", body: h("div", { class: "empty" }, "no floor") };

  const snapshot = snapshotAt(view.model, view.beat);
  const taken = new Map((snapshot?.positions ?? []).map((at) => [at.place, at]));

  const xs = places.map((place) => place.x);
  const ys = places.map((place) => place.y);
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD;
  const maxY = Math.max(...ys) + PAD;

  const marks: SVGElement[] = [];
  for (const place of places) {
    if (taken.has(place.path)) continue;
    marks.push(s("circle", { class: "empty-place", cx: place.x, cy: -place.y, r: DOT }));
  }
  for (const at of snapshot?.positions ?? []) {
    const role = roleOf(at.place) === "Lark" ? "lark" : "robin";
    const rad = (at.heading * Math.PI) / 180;
    marks.push(
      s("line", {
        class: `heading ${role}`,
        x1: at.x,
        y1: -at.y,
        x2: at.x - Math.sin(rad) * TICK,
        y2: -(at.y + Math.cos(rad) * TICK),
      }),
      s("circle", { class: `dot ${role}`, cx: at.x, cy: -at.y, r: DOT }),
      s("text", { class: "who", x: at.x, y: -at.y - NAME, "text-anchor": "middle" }, at.dancer),
    );
  }

  // Which way is up: the frames' +y, which `frame.ts` calls up the hall and a
  // heading of 0 faces along. Drawn with +y up and +x right, so a dancer's
  // left hand is the picture's left — the only mapping that keeps the larks
  // where `left(spacing / 2)` put them.
  const x0 = minX + 250;
  marks.push(
    s("path", {
      class: "axis",
      d: `M ${x0} ${-(minY + 250)} L ${x0} ${-(minY + 1100)} M ${x0 - 110} ${-(minY + 950)} L ${x0} ${-(minY + 1100)} L ${x0 + 110} ${-(minY + 950)}`,
    }),
    s("text", { class: "axis-name", x: x0 + 190, y: -(minY + 620) }, "+y"),
  );

  const canvas = s(
    "svg",
    {
      class: "floor",
      viewBox: `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`,
      preserveAspectRatio: "xMidYMid meet",
    },
    ...marks,
  );

  const where = localBeat(view.model.spans, view.beat);
  const fact =
    snapshot === undefined
      ? "nothing yet"
      : snapshot.at === "setup"
        ? "setup"
        : `time ${String(snapshot.time)} · beat ${String(snapshot.beat)} committed`;
  return { fact: `${fact} · at ×${String(where.time)} b${String(where.beat)}`, body: canvas };
}
