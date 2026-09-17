import type { SeamKind } from "../../src/schedule/seams.js";
import { colourOf, paneShell, svg, type Pane, type View } from "../view.js";

const ROW = 26;
const GUTTER = 44;
const RULER = 14;

/** `⇢` take, `⇠` drop, `=` carried; the overlapped ones get a dotted tick beneath. */
const GLYPH: Record<SeamKind, string> = {
  none: "",
  carried: "=",
  take: "⇢",
  "take-overlapped": "⇢",
  drop: "⇠",
  "drop-overlapped": "⇠",
};

/**
 * The compiled sequence and the schedule in one picture: a row per dancer, a
 * bar per call, and inside each bar the entry, the body and the exit the
 * scheduler decided on. The seam glyphs sit on the boundaries with the
 * scheduler's own notes as their tooltip, so *why* a take overlaps the
 * previous figure's last beat is one hover away.
 */
export function timelinePane(onScrub: (beat: number) => void): Pane {
  const { section, body } = paneShell("timeline");
  const root = svg("svg", { class: "timeline" });
  body.append(root);

  let view: View | undefined;
  let cursorLine: SVGLineElement | undefined;
  let width = 0;
  let plotW = 0;
  let endBeat = 1;

  const beatToX = (beat: number): number => GUTTER + (beat / endBeat) * plotW;
  const xToBeat = (x: number): number => ((x - GUTTER) / plotW) * endBeat;

  const draw = (): void => {
    if (!view) return;
    const { run } = view;
    width = Math.max(body.clientWidth - 2, 160);
    plotW = Math.max(width - GUTTER - 6, 20);
    endBeat = Math.max(run.endBeat, 1);
    const dancers = run.dialect.dancers;
    const height = RULER + dancers.length * ROW + 4;
    root.replaceChildren();
    root.setAttribute("width", String(width));
    root.setAttribute("height", String(height));
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);

    for (let beat = 0; beat <= endBeat; beat += 4) {
      const x = beatToX(beat);
      root.append(svg("line", { x1: x, y1: RULER - 4, x2: x, y2: height, class: "grid" }));
      root.append(svg("text", { x: x + 2, y: RULER - 5, class: "tick" }, String(beat)));
    }

    dancers.forEach((dancer, i) => {
      const top = RULER + i * ROW;
      root.append(
        svg("text", { x: 2, y: top + 15, class: "rowname", fill: colourOf(run, dancer) }, dancer),
      );
      const calls = run.schedule?.calls[dancer] ?? [];
      for (const call of calls) {
        const x0 = beatToX(call.call.start);
        const x1 = beatToX(call.call.end);
        const title = svg("title", {}, [call.call.path, ...call.notes].join("\n"));
        const group = svg("g", { class: "call" });
        group.append(title);
        const window = (from: number, to: number, cls: string): void => {
          if (to <= from) return;
          group.append(
            svg("rect", {
              x: beatToX(from),
              y: top + 3,
              width: Math.max(beatToX(to) - beatToX(from), 1),
              height: ROW - 9,
              class: cls,
            }),
          );
        };
        window(call.body[0], call.body[1], "w-body");
        window(call.entry[0], call.entry[1], "w-edge");
        window(call.exit[0], call.exit[1], "w-edge");
        group.append(
          svg("rect", {
            x: x0,
            y: top + 3,
            width: Math.max(x1 - x0, 1),
            height: ROW - 9,
            class: "call-outline",
          }),
        );
        group.append(
          svg("text", { x: x0 + 4, y: top + ROW - 9, class: "call-name" }, call.call.figure.id),
        );
        seam(group, call.seamIn, x0, top);
        seam(group, call.seamOut, x1, top);
        root.append(group);
      }
    });

    cursorLine = svg("line", { x1: 0, y1: RULER - 6, x2: 0, y2: height, class: "cursor" });
    root.append(cursorLine);
  };

  const seam = (group: SVGGElement, kind: SeamKind, x: number, top: number): void => {
    const glyph = GLYPH[kind];
    if (glyph === "") return;
    group.append(svg("text", { x: x - 4, y: top + 12, class: "seam" }, glyph));
    if (kind.endsWith("-overlapped")) {
      group.append(
        svg("line", { x1: x - 5, y1: top + 15, x2: x + 5, y2: top + 15, class: "seam-overlap" }),
      );
    }
  };

  const scrub = (event: PointerEvent): void => {
    const rect = root.getBoundingClientRect();
    onScrub(Math.max(0, Math.min(xToBeat(event.clientX - rect.left), endBeat)));
  };
  root.addEventListener("pointerdown", (event) => {
    root.setPointerCapture(event.pointerId);
    scrub(event);
  });
  root.addEventListener("pointermove", (event) => {
    if (event.buttons & 1) scrub(event);
  });

  new ResizeObserver(() => {
    if (Math.abs(body.clientWidth - 2 - width) > 1) draw();
  }).observe(body);

  return {
    el: section,
    setRun(next) {
      view = next;
      draw();
    },
    setBeat(beat) {
      const x = beatToX(beat);
      cursorLine?.setAttribute("x1", String(x));
      cursorLine?.setAttribute("x2", String(x));
    },
  };
}
