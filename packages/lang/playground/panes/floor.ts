/**
 * Where everybody got to: the hall seen from above, at the last commit on or
 * before the scrubber's beat.
 *
 * This is positions **at rest** and nothing else (notes D6). The language says
 * where a dancer stands between commits and says nothing about the path from
 * one to the next, so neither does this pane: it jumps when the commit does.
 * A place nobody is standing in is a hollow ring, which is how a couple that
 * is not yet seated reads.
 *
 * The hall's `+y` runs **down** the hall (`frame.ts`), and a picture of a hall
 * wants its top at the top, so the whole thing is drawn turned through 180°:
 * `(x, y)` goes to `(-x, y)` in an SVG whose own `y` already points down. That
 * is a rotation and not a reflection, so a dancer's left hand is still on the
 * side `left(spacing / 2)` put it.
 */
import { h, s } from "../dom.js";
import { localBeat, roleOf, snapshotAt } from "../model.js";
import type { Pane, View } from "../view.js";

/** Millimetres. A dancer is a dot 0.3 m across, facing where their frame faces. */
const DOT = 150;
const TICK = 300;
/** How far out from the dot its name sits — away from the middle of the hall,
 * which is where the heading ticks and the other line are. */
const NAME = 240;
/** Room for the names either side, and for the marker above. */
const PAD_X = 1500;
const PAD_Y = 900;

export function floorPane(view: View): Pane {
  const places = view.model.places;
  if (places.length === 0) return { fact: "", body: h("div", { class: "empty" }, "no floor") };

  const snapshot = snapshotAt(view.model, view.beat);
  const taken = new Map((snapshot?.positions ?? []).map((at) => [at.place, at]));

  const xs = places.map((place) => -place.x);
  const ys = places.map((place) => place.y);
  const minX = Math.min(...xs) - PAD_X;
  const maxX = Math.max(...xs) + PAD_X;
  const minY = Math.min(...ys) - PAD_Y;
  const maxY = Math.max(...ys) + PAD_Y;
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;

  const marks: SVGElement[] = [];
  for (const place of places) {
    if (taken.has(place.path)) continue;
    marks.push(s("circle", { class: "empty-place", cx: -place.x, cy: place.y, r: DOT }));
  }
  for (const at of snapshot?.positions ?? []) {
    const role = roleOf(at.place) === "Lark" ? "lark" : "robin";
    const rad = (at.heading * Math.PI) / 180;
    marks.push(
      s("line", {
        class: `heading ${role}`,
        x1: -at.x,
        y1: at.y,
        x2: -at.x + Math.sin(rad) * TICK,
        y2: at.y + Math.cos(rad) * TICK,
      }),
      s("circle", { class: `dot ${role}`, cx: -at.x, cy: at.y, r: DOT }),
      s(
        "text",
        {
          class: "who",
          x: -at.x + (-at.x < middle ? -(DOT + NAME) : DOT + NAME),
          y: at.y + 60,
          "text-anchor": -at.x < middle ? "end" : "start",
        },
        at.dancer,
      ),
    );
  }

  marks.push(
    s(
      "text",
      { class: "top-mark", x: middle, y: minY + 320, "text-anchor": "middle" },
      "top of the hall",
    ),
  );

  const canvas = s(
    "svg",
    {
      class: "floor",
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
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
