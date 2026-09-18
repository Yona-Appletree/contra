/**
 * The tree as text, OpenSCAD's CSG dump shape: one indented line per node,
 * its frame in metres, its anchors under it, and the dancer at each leaf.
 *
 * This is what a test reads and what `pnpm lang tree` prints (P4). A golden is
 * read by a diff (AGENTS.md), so the shape is one fact per line and nothing is
 * pretty-printed into columns that move when a name gets longer.
 */
import { showFrame } from "./frame.js";
import type { Node, Tree } from "./tree.js";
import { showValue } from "./value.js";

export function printTree(tree: Tree): string {
  const out: string[] = [];
  for (const root of tree.roots) printNode(root, 0, out);
  return out.join("\n");
}

function printNode(node: Node, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  const anchors = Object.entries(node.anchors);
  const inner = node.children.length > 0 || anchors.length > 0;
  const head = `${pad}${node.label} [${showFrame(node.frame)}]`;

  if (!inner) {
    out.push(`${head}${node.place ? ` { ${node.occupant?.id ?? "empty"} }` : " { }"}`);
    return;
  }
  out.push(`${head} {`);
  for (const [name, value] of anchors) out.push(`${pad}  anchor ${name} = ${showValue(value)}`);
  if (node.place) out.push(`${pad}  dancer ${node.occupant?.id ?? "empty"}`);
  for (const child of node.children) printNode(child, depth + 1, out);
  out.push(`${pad}}`);
}
