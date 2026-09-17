import type { DancerId } from "../src/dialect/Dialect.js";
import { framePx } from "../src/dialect/tree/TreeDialect.js";
import type { Run } from "../src/pipeline.js";
import type { Membership } from "../src/tree/membership.js";
import type { Group } from "../src/tree/Tree.js";
import { chainTo, groupsOf, placesOf } from "../src/tree/Tree.js";

/**
 * The tree in time, for the panes (P5): which seating is current at a beat,
 * which groups are occupied then, and which of them the followed dancer is
 * in. Membership changes only at `progress()`, so a beat's seating is the
 * snapshot the call under the bar was compiled with.
 */

/** One hue per kind of group; a kind not listed gets the last. */
export const KIND_COLOURS: Record<string, string> = {
  couple: "#e7b96b",
  "minor-set": "#7fb3d5",
  "major-set": "#9fd08a",
  four: "#c9a0dc",
  square: "#9fd08a",
  "big-circle": "#9fd08a",
};
export const OTHER_KIND = "#a8977f";
export const colourOfKind = (kind: string): string => KIND_COLOURS[kind] ?? OTHER_KIND;

/** The minor sets' own hues in the timeline lanes, by index along the set. */
export const SET_COLOURS = [
  "#7fb3d5",
  "#c9a0dc",
  "#9fd08a",
  "#e7b96b",
  "#d58f7f",
  "#7fd5c9",
  "#b5b5b5",
  "#d5c97f",
];

/** The seating index current at `beat`: the call under the bar's, for any dancer who has one. */
export function membershipIndexAt(run: Run, beat: number): number {
  const sequence = run.sequence;
  if (!sequence) return 0;
  for (const calls of Object.values(sequence.perDancer)) {
    const call = calls.find((c) => beat >= c.start && beat < c.end) ?? calls[calls.length - 1];
    if (call) return call.membership;
  }
  return 0;
}

export const membershipAt = (run: Run, beat: number): Membership | undefined =>
  run.sequence?.memberships[membershipIndexAt(run, beat)];

/** A group as the floor panes draw it: its hull in world px, and who is in it. */
export interface Box {
  group: Group;
  colour: string;
  /** The hull's corners, in world px, counter-clockwise. */
  hullPx: [number, number][];
  /** Whether the followed dancer is a member. */
  mine: boolean;
}

/** Every occupied group at a seating, root left out, with the followed dancer's chain marked. */
export function boxesAt(run: Run, membership: Membership, followed: readonly DancerId[]): Box[] {
  const root = run.floor.root;
  const mine = new Set<string>();
  for (const d of followed) {
    const path = membership.placeOf.get(d);
    if (path !== undefined) for (const g of chainTo(root, path)) mine.add(g.path);
  }
  const boxes: Box[] = [];
  for (const group of groupsOf(root)) {
    if (group === root) continue;
    const places = placesOf(group);
    if (!places.some((p) => membership.dancerOf.has(p.path))) continue;
    const pts = places.map((p) => framePx(p.frame).p as [number, number]);
    boxes.push({
      group,
      colour: colourOfKind(group.kind),
      hullPx: hull(pts),
      mine: mine.has(group.path),
    });
  }
  return boxes;
}

/** The index of the minor set a dancer is in at a seating, or -1 when out. */
export function minorSetIndex(run: Run, membership: Membership, dancer: DancerId): number {
  const path = membership.placeOf.get(dancer);
  if (path === undefined) return -1;
  const sets = groupsOf(run.floor.root).filter((g) => g.kind === "minor-set");
  return sets.findIndex((set) => placesOf(set).some((p) => p.path === path));
}

/** Andrew's monotone chain: the convex hull, counter-clockwise; a single point or pair comes back as is. */
export function hull(points: readonly [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(
        lower[lower.length - 2] as [number, number],
        lower[lower.length - 1] as [number, number],
        p,
      ) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (
      upper.length >= 2 &&
      cross(
        upper[upper.length - 2] as [number, number],
        upper[upper.length - 1] as [number, number],
        p,
      ) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** The hull grown outward by `pad` world px, so a box sits around its dancers rather than through them. */
export function padHull(pts: readonly [number, number][], pad: number): [number, number][] {
  if (pts.length === 0) return [];
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return [x + (dx / l) * pad, y + (dy / l) * pad];
  });
}
