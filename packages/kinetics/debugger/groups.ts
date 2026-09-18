import type { Node } from "@caller/lang";
import { ancestorOfKind, nodesOfKind, placesUnder } from "@caller/lang";
import type { DancerId } from "../src/dialect/Dialect.js";
import { posePx } from "../src/dialect/langDialect.js";
import type { Run } from "../src/pipeline.js";
import type { Membership } from "../src/sequence/CompiledSequence.js";

/**
 * The language's tree in time, for the panes: which seating is current at a
 * beat, which of its groups are occupied then, and which of them the followed
 * dancer is in. Membership changes only where the language committed an event,
 * so a beat's seating is the one the call under the bar was read against.
 */

/** One hue per kind of group; a kind not listed gets the last. */
export const KIND_COLOURS: Record<string, string> = {
  Couple: "#e7b96b",
  MinorSet: "#7fb3d5",
  MajorSet: "#9fd08a",
  Station: "#c9a0dc",
  Pair: "#e7b96b",
  Square: "#9fd08a",
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

/** The kind whose id the timeline's lanes are coloured by. */
export const SET_KIND = "MinorSet";

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
  node: Node;
  colour: string;
  /** The hull's corners, in world px, counter-clockwise. */
  hullPx: [number, number][];
  /** Whether the followed dancer is a member. */
  mine: boolean;
}

/** Every occupied group at a seating, the root left out, the followed dancer's lineage marked. */
export function boxesAt(run: Run, membership: Membership, followed: readonly DancerId[]): Box[] {
  const tree = run.evening?.tree;
  if (tree === undefined) return [];
  const mine = new Set<string>();
  for (const d of followed) {
    const path = membership.placeOf.get(d);
    if (path === undefined) continue;
    for (let at = nodeAt(tree.nodes, path); at !== undefined; at = at.parent) mine.add(at.path);
  }
  const boxes: Box[] = [];
  for (const node of tree.nodes) {
    if (node.parent === undefined) continue;
    const places = placesUnder(node);
    if (places.length === 0) continue;
    if (!places.some((p) => membership.dancerOf.has(p.path))) continue;
    boxes.push({
      node,
      colour: colourOfKind(node.kind),
      hullPx: hull(places.map((p) => posePx(p.frame).p as [number, number])),
      mine: mine.has(node.path),
    });
  }
  return boxes;
}

/** The index of the minor set a dancer is in at a seating, or -1 when out. */
export function minorSetIndex(run: Run, membership: Membership, dancer: DancerId): number {
  const tree = run.evening?.tree;
  const path = membership.placeOf.get(dancer);
  if (tree === undefined || path === undefined) return -1;
  const set = ancestorOfKind(nodeAt(tree.nodes, path), SET_KIND);
  if (set === undefined) return -1;
  return nodesOfKind(tree, SET_KIND).indexOf(set);
}

const nodeAt = (nodes: readonly Node[], path: string): Node | undefined =>
  nodes.find((node) => node.path === path);

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
