import type { Dancers } from "./state.js";
import type { Group } from "./Tree.js";
import { expr } from "../lang/format.js";

/**
 * The evaluated tree as text (round 2's gate ask): OpenSCAD's CSG-tree
 * dump for the initial tree — every group with its kind, its frame, what
 * it provides; every anchor; every place with its position, its facing and
 * whoever is seated on it. What the reader gets that the text of the
 * formation does not say: what the loops and the conditions made.
 */
export function printTree(root: Group, dancers?: Dancers): string {
  const lines: string[] = [];
  const fmt = (n: number): string => (Object.is(n, -0) ? "0" : String(Math.round(n * 1000) / 1000));
  const frame = (f: { x: number; y: number; facing: number }): string =>
    `(${fmt(f.x)}, ${fmt(f.y)}) ${fmt(f.facing)}°`;
  const walk = (g: Group, depth: number): void => {
    const pad = "  ".repeat(depth);
    const head = g.name === g.kind ? g.kind : `${g.kind} ${g.name}`;
    lines.push(`${pad}${head} @ ${frame(g.frame)}`);
    for (const [name, a] of Object.entries(g.anchors))
      lines.push(`${pad}  anchor ${name}: ${a.kind} @ ${frame(a.frame)}`);
    for (const p of g.provides)
      lines.push(`${pad}  provide $${p.name}: ${p.type} = ${expr(p.deferred.expr)}`);
    for (const f of g.functions) lines.push(`${pad}  provide ${f.name}() { … }`);
    for (const p of g.places) {
      const who = dancers?.at(p.path);
      lines.push(
        `${pad}  place ${p.name}${p.role === undefined ? "" : ` ${p.role}`} @ ${frame(p.frame)}${who === undefined ? "" : ` ← ${who.id}${who.role !== undefined && who.role !== p.role ? ` (${who.role})` : ""}`}`,
      );
    }
    for (const c of g.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return lines.join("\n") + "\n";
}
