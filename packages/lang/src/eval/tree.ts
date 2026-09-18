/**
 * The evaluated tree: what `setup` built, and who is standing where.
 *
 * A {@link Node} is one invocation of a group — its id, its parameters, its
 * frame, its anchors and its children. A node whose declaration writes
 * `dancer();` anywhere in its body is a **place**: it can hold one dancer, and
 * it holds none when the `dancer();` did not run (becket's ends are declared
 * `seated = false` in a hall that has nobody waiting yet).
 *
 * A {@link Dancer} is a person. Its `id` is minted once, at setup, from where
 * it started (`0-1L` is the lark of the ones of minor set 0, `OT-1L` the lark
 * of the couple waiting at the top), and never changes: the person is the
 * constant and the place is what the progression moves them through. `at` is
 * their place right now, which the commit at the end of a beat rewrites.
 */
import type { GroupDecl } from "../syntax/ast.js";
import type { Frame } from "./frame.js";
import type { Value } from "./value.js";

export interface Node {
  /** The group's name — `MinorSet`, `Couple`, `Role`. */
  kind: string;
  decl: GroupDecl;
  /** The module the declaration came from, so two `MajorSet`s stay apart. */
  module: string;
  /** This node's id: an enum member or an `i32`. */
  id: Value;
  /** The id as text, for a path or a dump: `Ones`, `0`, `OutTop`. */
  idLabel: string;
  /** `MinorSet(0)` — this node alone. */
  label: string;
  /** `MajorSet(1)/Station(In)/MinorSet(0)` — the node and everyone above it. */
  path: string;
  params: Readonly<Record<string, Value>>;
  frame: Frame;
  anchors: Record<string, Value>;
  children: Node[];
  parent?: Node;
  /** Whether the declaration's body writes `dancer();`: this node is a place. */
  place: boolean;
  /** Who is standing here, when anyone is. */
  occupant?: Dancer;
}

export interface Dancer {
  /** `0-1L` — minted at setup from where this person started. */
  id: string;
  /** The place they started in, which the dump reads when nothing has moved. */
  home: Node;
  /** The place they are in now. */
  at: Node;
}

export interface Tree {
  roots: Node[];
  /** Every node, in the order `setup` built them. */
  nodes: Node[];
  /** Every place, occupied or not, in tree order. */
  places: Node[];
  /** Every person, in tree order. */
  dancers: Dancer[];
  byId: Map<string, Dancer>;
}

/** The nearest node of kind `kind` at or above `node`, or nothing. */
export function ancestorOfKind(node: Node | undefined, kind: string): Node | undefined {
  for (let at = node; at !== undefined; at = at.parent) if (at.kind === kind) return at;
  return undefined;
}

/** The kinds on a node's path, innermost first. A path never repeats a kind (§3). */
export function kindsOf(node: Node | undefined): string[] {
  const out: string[] = [];
  for (let at = node; at !== undefined; at = at.parent) out.push(at.kind);
  return out;
}

/** The nodes on a path, outermost first. */
export function lineageOf(node: Node): Node[] {
  const out: Node[] = [];
  for (let at: Node | undefined = node; at !== undefined; at = at.parent) out.unshift(at);
  return out;
}

/** Every node of a kind, in tree order. */
export const nodesOfKind = (tree: Tree, kind: string): Node[] =>
  tree.nodes.filter((node) => node.kind === kind);

/** Every place below `node` (or `node` itself when it is one), in tree order. */
export function placesUnder(node: Node): Node[] {
  const out: Node[] = [];
  const walk = (at: Node): void => {
    if (at.place) out.push(at);
    for (const child of at.children) walk(child);
  };
  walk(node);
  return out;
}

/** Does this group's body write `dancer();`? Then every node of it is a place. */
export function declaresDancer(decl: GroupDecl): boolean {
  let found = false;
  const walkStmts = (stmts: readonly unknown[]): void => {
    for (const stmt of stmts) walkStmt(stmt as Record<string, unknown>);
  };
  const walkStmt = (stmt: Record<string, unknown>): void => {
    if (found) return;
    const kind = stmt["kind"];
    if (kind === "expr") {
      const expr = stmt["expr"] as Record<string, unknown> | undefined;
      if (expr?.["kind"] === "call" && expr["callee"] === "dancer") found = true;
      const block = stmt["block"];
      if (Array.isArray(block)) walkStmts(block);
      return;
    }
    for (const value of Object.values(stmt)) {
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === "object") walkStmts(value);
      } else if (value !== null && typeof value === "object") {
        walkStmt(value as Record<string, unknown>);
      }
    }
  };
  walkStmts(decl.body);
  return found;
}

/**
 * The short name of an id, for a dancer's name: `Ones` is `1`, `Lark` is `L`,
 * `OutTop` is `OT`, `In` disappears (it is the ordinary case and saying so in
 * every name would only make them longer), and a number is itself.
 */
export function abbreviateId(label: string): string {
  const known: Record<string, string> = {
    Ones: "1",
    Twos: "2",
    Threes: "3",
    Fours: "4",
    Lark: "L",
    Robin: "R",
    In: "",
    OutTop: "OT",
    OutBottom: "OB",
  };
  if (label in known) return known[label] ?? label;
  if (/^-?\d+$/.test(label)) return label;
  const capitals = label.replace(/[^A-Z]/g, "");
  return capitals.length > 0 ? capitals : label;
}

/**
 * A person's name, from the place they started in: every id on the path but
 * the root's, abbreviated, joined with `-`, and the innermost stuck straight
 * on the end — `0-1L`, `OT-1L`, `3R`. Readable out loud, which is the point:
 * a diagnostic that says "0-1L and 0-2R want the same place" is a sentence.
 */
export function dancerIdFor(place: Node, singleRoot: boolean): string {
  const line = lineageOf(place);
  const parts = (singleRoot ? line.slice(1) : line)
    .map((node) => abbreviateId(node.idLabel))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "1";
  const last = parts[parts.length - 1] ?? "";
  return parts.slice(0, -1).join("-") + last;
}

/** The path of a place with the root dropped: what an event prints as. */
export function shortPath(node: Node): string {
  const line = lineageOf(node);
  return (line.length > 1 ? line.slice(1) : line).map((at) => at.label).join("/");
}
