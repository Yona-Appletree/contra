import type { Node } from "@caller/lang";
import { placesUnder, showValue } from "@caller/lang";
import { posePx } from "../../src/dialect/langDialect.js";
import { OTHER_KIND, colourOfKind, hull } from "../groups.js";
import { ROLE_COLOURS, el, paneShell, svg, type Pane, type View } from "../view.js";

/**
 * The layout of the floor the dance is standing on: every place as a ring with
 * a facing tick, every anchor, every node as a hull in its kind's colour. The
 * user (2026-09-17): *"use it to draw not the individual dancers, but the
 * layout of the set."*
 *
 * It reads `evening.tree` and parses nothing — since M1 the language is the
 * only thing that reads `.dance` text, and this pane is handed the tree it
 * built. A place nobody stands in at setup is drawn faint. The tree does not
 * move, so `setBeat` is a no-op.
 */
const PAD_PX = 5.5;
const PLACE_R_PX = 4;

export function layoutPane(): Pane {
  const { section, body } = paneShell("layout");
  const root = svg("svg", { class: "layout" });
  const note = el("div", "empty");
  const legend = el("div", "legend");
  body.append(root, note, legend);

  let view: View | undefined;

  const draw = (): void => {
    root.replaceChildren();
    legend.replaceChildren();
    const tree = view?.run.evening?.tree;
    if (tree === undefined) {
      note.textContent = "no tree: the dance did not run";
      return;
    }
    note.textContent = "";

    const places = tree.places;
    if (places.length === 0) return;
    const pts = places.map((p) => posePx(p.frame).p);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const min = { x: Math.min(...xs) - 25, y: Math.min(...ys) - 25 };
    const max = { x: Math.max(...xs) + 25, y: Math.max(...ys) + 25 };
    const w = Math.max(body.clientWidth - 8, 120);
    const h = Math.max(body.clientHeight - 40, 120);
    const scale = Math.min(w / (max.x - min.x), h / (max.y - min.y));
    const sx = (x: number): number => (x - min.x) * scale;
    const sy = (y: number): number => (y - min.y) * scale;
    root.setAttribute("width", String((max.x - min.x) * scale));
    root.setAttribute("height", String((max.y - min.y) * scale));

    // Nodes, outermost first so the couples sit on top of their sets.
    const depth = (node: Node): number => node.path.split("/").length;
    for (const node of [...tree.nodes].sort((a, b) => depth(a) - depth(b))) {
      if (node.parent === undefined) continue;
      const under = placesUnder(node);
      if (under.length === 0) continue;
      const hullPts = hull(
        under.map((p) => {
          const q = posePx(p.frame).p;
          return [sx(q[0]), sy(q[1])] as [number, number];
        }),
      );
      const occupied = under.some((p) => p.occupant !== undefined);
      const colour = colourOfKind(node.kind);
      const poly = svg("polygon", {
        points: hullPts.map(([x, y]) => `${String(x)},${String(y)}`).join(" "),
        class: `hull${occupied ? "" : " faint"}`,
        stroke: colour,
        fill: colour,
        "stroke-width": String(2 * PAD_PX * scale),
      });
      poly.append(svg("title", {}, `${node.kind} · ${node.path}`));
      root.append(poly);
      for (const [name, value] of Object.entries(node.anchors)) {
        const mark = svg("g", { class: "anchor", stroke: colour });
        const q = posePx(node.frame).p;
        const s = 3 * scale;
        const x = sx(q[0]);
        const y = sy(q[1]);
        mark.append(
          svg("line", { x1: x - s, y1: y, x2: x + s, y2: y }),
          svg("line", { x1: x, y1: y - s, x2: x, y2: y + s }),
          svg("title", {}, `${name} = ${showValue(value)} · ${node.path}`),
        );
        root.append(mark);
      }
    }

    // Places: a ring in the role's colour, a tick the way it faces.
    for (const place of places) {
      const pose = posePx(place.frame);
      const cx = sx(pose.p[0]);
      const cy = sy(pose.p[1]);
      const r = PLACE_R_PX * scale;
      const colour =
        place.idLabel === "Lark"
          ? ROLE_COLOURS.lark
          : place.idLabel === "Robin"
            ? ROLE_COLOURS.robin
            : OTHER_KIND;
      const g = svg("g", { class: `place${place.occupant === undefined ? " faint" : ""}` });
      const rad = (pose.facing * Math.PI) / 180;
      g.append(
        svg("circle", { cx, cy, r, stroke: colour, fill: "none", "stroke-width": 1.5 }),
        svg("line", {
          x1: cx,
          y1: cy,
          x2: cx + Math.cos(rad) * r * 1.9,
          y2: cy + Math.sin(rad) * r * 1.9,
          stroke: colour,
          "stroke-width": 1.5,
        }),
        svg(
          "title",
          {},
          `${place.path} · (${pose.p[0].toFixed(1)}, ${pose.p[1].toFixed(1)}) ${String(pose.facing)}°`,
        ),
      );
      root.append(g);
    }

    const kinds = [...new Set(tree.nodes.filter((n) => n.parent !== undefined).map((n) => n.kind))];
    for (const kind of kinds) {
      const item = el("span", "legend-item", kind);
      item.style.color = colourOfKind(kind);
      legend.append(item);
    }
    const seated = places.filter((p) => p.occupant !== undefined).length;
    legend.append(
      el("span", "legend-item", `${String(places.length)} places · ${String(seated)} seated`),
    );
  };

  new ResizeObserver(draw).observe(body);

  return {
    el: section,
    setRun(next) {
      view = next;
      draw();
    },
    setBeat() {
      // The tree does not move.
    },
  };
}
