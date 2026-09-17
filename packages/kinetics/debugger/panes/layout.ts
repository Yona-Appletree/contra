import { parse } from "../../src/lang/parser.js";
import type { Frame } from "../../src/tree/Frame.js";
import { unit } from "../../src/tree/Frame.js";
import type { Group } from "../../src/tree/Tree.js";
import { groupsOf, placesOf } from "../../src/tree/Tree.js";
import { buildFormation, collect } from "../../src/tree/evaluate.js";
import { seatAll } from "../../src/tree/membership.js";
import { num } from "../../src/tree/values.js";
import { OTHER_KIND, colourOfKind, hull } from "../groups.js";
import { ROLE_COLOURS, el, paneShell, svg, type Pane } from "../view.js";

/**
 * The layout of a formation, from its text, with nobody on it (P3): every
 * place as a ring with a facing tick, every anchor, every group as a hull
 * in its kind's colour. The user (2026-09-17): *"use it to draw not the
 * individual dancers, but the layout of the set."*
 *
 * The groups the seating fills at beat 0 are drawn full; the interleaved
 * ones a progression will fill next time are drawn faint (DA9). This pane
 * does not follow the bar — the tree does not move — so `setBeat` is a no-op.
 */
const FILES = import.meta.glob("../../dances/formations/*.dance", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const PRELUDE = (
  import.meta.glob("../../dances/prelude.dance", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>
)["../../dances/prelude.dance"] as string;

const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1, -".dance".length);
const FORMATIONS = Object.keys(FILES)
  .map(nameOf)
  .filter((n) => n !== "common")
  .sort();
const COMMON = FILES["../../dances/formations/common.dance"] as string;

const PAD_M = 0.22;
const PLACE_R_M = 0.16;

export function layoutPane(): Pane {
  const { section, head, body } = paneShell("layout");
  const pick = el("select", "pick");
  for (const name of FORMATIONS) pick.append(new Option(name, name));
  pick.value = FORMATIONS.includes("becket") ? "becket" : (FORMATIONS[0] ?? "");
  const size = el("input", "size");
  size.type = "number";
  size.min = "1";
  size.max = "8";
  size.value = "3";
  const sizeLabel = el("label", "size-label", "minor sets ");
  sizeLabel.append(size);
  head.append(pick, sizeLabel);
  const root = svg("svg", { class: "layout" });
  const note = el("div", "empty");
  const legend = el("div", "legend");
  body.append(root, note, legend);

  let sizedFor = "";
  const draw = (): void => {
    const name = pick.value;
    const text = FILES[`../../dances/formations/${name}.dance`];
    if (text === undefined) return;
    root.replaceChildren();
    legend.replaceChildren();
    let tree: Group;
    let seated: Set<string>;
    try {
      const mods = collect([parse(PRELUDE), parse(COMMON), parse(text)]);
      const module = mods.modules.get(name);
      const sizeParam = module?.params.find((p) => p.name === "minor-sets" || p.name === "couples");
      size.disabled = sizeParam === undefined;
      // A formation's own default, the first time it is shown.
      if (sizeParam !== undefined && pick.value !== sizedFor) {
        sizedFor = pick.value;
        const fallback = sizeParam.default;
        if (fallback?.kind === "number") size.value = String(fallback.value);
      }
      const args = sizeParam === undefined ? {} : { [sizeParam.name]: num(Number(size.value)) };
      tree = buildFormation(mods, name, args);
      seated = new Set(seatAll(tree, mods).dancerOf.keys());
      note.textContent = "";
    } catch (error) {
      note.textContent = error instanceof Error ? error.message : String(error);
      return;
    }

    const places = placesOf(tree);
    const groups = groupsOf(tree);
    const xs = places.map((p) => p.frame.x);
    const ys = places.map((p) => p.frame.y);
    const min = { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1 };
    const max = { x: Math.max(...xs) + 1, y: Math.max(...ys) + 1 };
    const w = Math.max(body.clientWidth - 8, 120);
    const h = Math.max(body.clientHeight - 40, 120);
    const scale = Math.min(w / (max.x - min.x), h / (max.y - min.y));
    const sx = (x: number): number => (x - min.x) * scale;
    const sy = (y: number): number => (y - min.y) * scale;
    root.setAttribute("width", String((max.x - min.x) * scale));
    root.setAttribute("height", String((max.y - min.y) * scale));

    // Groups, outermost first so the couples sit on top of their sets.
    const depth = (g: Group): number => g.path.split("/").length;
    for (const group of [...groups].sort((a, b) => depth(a) - depth(b))) {
      if (group === tree) continue;
      const pts = placesOf(group).map((p) => [sx(p.frame.x), sy(p.frame.y)] as [number, number]);
      if (pts.length === 0) continue;
      const hullPts = hull(pts);
      const occupied = placesOf(group).some((p) => seated.has(p.path));
      const colour = colourOfKind(group.kind);
      const poly = svg("polygon", {
        points: hullPts.map(([x, y]) => `${String(x)},${String(y)}`).join(" "),
        class: `hull${occupied ? "" : " faint"}`,
        stroke: colour,
        fill: colour,
        "stroke-width": String(2 * PAD_M * scale),
      });
      poly.append(svg("title", {}, `${group.kind} · ${group.path}`));
      root.append(poly);
      for (const [anchorName, anchor] of Object.entries(group.anchors)) {
        root.append(
          anchorMark(anchorName, anchor.kind, anchor.frame, group, sx, sy, scale, colour),
        );
      }
    }

    // Places: a ring in the role's colour, a tick the way it faces.
    for (const place of places) {
      const cx = sx(place.frame.x);
      const cy = sy(place.frame.y);
      const r = PLACE_R_M * scale;
      const colour =
        place.role === "Lark"
          ? ROLE_COLOURS.lark
          : place.role === "Robin"
            ? ROLE_COLOURS.robin
            : OTHER_KIND;
      const g = svg("g", { class: `place${seated.has(place.path) ? "" : " faint"}` });
      const d = unit(place.frame.facing);
      g.append(
        svg("circle", { cx, cy, r, stroke: colour, fill: "none", "stroke-width": 1.5 }),
        svg("line", {
          x1: cx,
          y1: cy,
          x2: cx + d.x * r * 1.9,
          y2: cy + d.y * r * 1.9,
          stroke: colour,
          "stroke-width": 1.5,
        }),
        svg(
          "title",
          {},
          `${place.path}${place.role === undefined ? "" : ` · ${place.role}`} · (${String(place.frame.x)}, ${String(place.frame.y)}) ${String(place.frame.facing)}°`,
        ),
      );
      root.append(g);
    }

    const kinds = [...new Set(groups.filter((g) => g !== tree).map((g) => g.kind))];
    for (const kind of kinds) {
      const item = el("span", "legend-item", kind);
      item.style.color = colourOfKind(kind);
      legend.append(item);
    }
    legend.append(
      el("span", "legend-item", `${String(places.length)} places · ${String(seated.size)} seated`),
    );
  };

  pick.addEventListener("change", draw);
  size.addEventListener("input", draw);
  new ResizeObserver(draw).observe(body);

  return {
    el: section,
    setRun() {
      draw();
    },
    setBeat() {
      // The tree does not move.
    },
  };
}

/** A point as a small cross, a line dashed with a tick along its normal, a direction as an arrow from the group's frame. */
function anchorMark(
  name: string,
  kind: "point" | "line" | "direction",
  frame: Frame,
  group: Group,
  sx: (x: number) => number,
  sy: (y: number) => number,
  scale: number,
  colour: string,
): SVGElement {
  const g = svg("g", { class: "anchor", stroke: colour });
  const d = unit(frame.facing);
  const s = 0.12 * scale;
  if (kind === "point") {
    const x = sx(frame.x);
    const y = sy(frame.y);
    g.append(
      svg("line", { x1: x - s, y1: y, x2: x + s, y2: y }),
      svg("line", { x1: x, y1: y - s, x2: x, y2: y + s }),
    );
  } else if (kind === "line") {
    const x = sx(frame.x);
    const y = sy(frame.y);
    const len = 1.2 * scale;
    g.append(
      svg("line", {
        x1: x - d.x * len,
        y1: y - d.y * len,
        x2: x + d.x * len,
        y2: y + d.y * len,
        "stroke-dasharray": "4 3",
      }),
      // The normal: what facing the line means.
      svg("line", { x1: x, y1: y, x2: x - d.y * s * 2, y2: y + d.x * s * 2 }),
    );
  } else {
    const x = sx(group.frame.x);
    const y = sy(group.frame.y);
    const len = 0.6 * scale;
    const tip = { x: x + d.x * len, y: y + d.y * len };
    g.append(
      svg("line", { x1: x, y1: y, x2: tip.x, y2: tip.y }),
      svg("line", {
        x1: tip.x,
        y1: tip.y,
        x2: tip.x - (d.x - d.y) * s,
        y2: tip.y - (d.y + d.x) * s,
      }),
      svg("line", {
        x1: tip.x,
        y1: tip.y,
        x2: tip.x - (d.x + d.y) * s,
        y2: tip.y - (d.y - d.x) * s,
      }),
    );
  }
  g.append(svg("title", {}, `${kind} ${name} · ${group.path}`));
  return g;
}
