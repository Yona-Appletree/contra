import type { Expr } from "../lang/syntax.js";
import type { Frame } from "./Frame.js";
import type { Env } from "./values.js";

/**
 * The tree a formation evaluates to (P2): groups, places and anchors, every
 * frame already in the root's coordinates — the world, in metres. Static:
 * nothing here moves once built. Who stands where is `Membership`'s.
 *
 * The user (2026-09-17): *"the tree is right, too, and that gives you scopes
 * with names and types, that figures can require"*. A group's `provides` are
 * those scopes: a `$name` a move needs is found by walking up from the
 * dancer's place, innermost group first.
 */
export interface Group {
  /** `becket/major-set/minor-set#1/ones` — the names of the ancestors, joined. */
  path: string;
  /** The module the group was made from: its kind (`couple`, `minor-set`). */
  kind: string;
  /** The name the parent gave it, or `kind#index` for an anonymous one. */
  name: string;
  frame: Frame;
  places: readonly Place[];
  children: readonly Group[];
  anchors: Readonly<Record<string, Anchor>>;
  /** The `$` variables this group offers, as expressions to be evaluated with `me`. */
  provides: readonly Provide[];
  /** The progression, when this group declares one. */
  next?: Deferred;
  /** Which of its groups are occupied at beat 0, when this group says. */
  seat?: Deferred;
}

export interface Place {
  /** `…/ones/lark` */
  path: string;
  name: string;
  /** A Role member's name (`Lark`), when the place has one. */
  role?: string;
  frame: Frame;
}

/**
 * A point, a line or a direction — one shape, three uses: a point uses the
 * frame's origin, a line its origin and its facing (the line runs along the
 * facing; facing the line means facing its normal), a direction the facing
 * only.
 */
export interface Anchor {
  kind: "point" | "line" | "direction";
  frame: Frame;
}

/** `provide $partner: Place = other(me);` — evaluated per dancer, later. */
export interface Provide {
  name: string;
  type: string;
  deferred: Deferred;
}

/** An expression and the environment it was written in, to evaluate later. */
export interface Deferred {
  expr: Expr;
  env: Env;
}

/** Every group under `root`, `root` first, depth first in declaration order. */
export function groupsOf(root: Group): Group[] {
  const out: Group[] = [root];
  for (const child of root.children) out.push(...groupsOf(child));
  return out;
}

/** Every place under `group`, depth first in declaration order. */
export function placesOf(group: Group): Place[] {
  const out: Place[] = [...group.places];
  for (const child of group.children) out.push(...placesOf(child));
  return out;
}

/** The groups on the way from `root` down to the place at `path`, `root` first; empty when no such place. */
export function chainTo(root: Group, path: string): Group[] {
  const walk = (group: Group, chain: Group[]): Group[] | undefined => {
    const here = [...chain, group];
    if (group.places.some((p) => p.path === path)) return here;
    for (const child of group.children) {
      const found = walk(child, here);
      if (found) return found;
    }
    return undefined;
  };
  return walk(root, []) ?? [];
}

export const placeAt = (root: Group, path: string): Place | undefined =>
  placesOf(root).find((p) => p.path === path);

export const groupAt = (root: Group, path: string): Group | undefined =>
  groupsOf(root).find((g) => g.path === path);

/** A group's members: its child groups, then its places, in declaration order. */
export const membersOf = (group: Group): (Group | Place)[] => [...group.children, ...group.places];

export const isGroup = (m: Group | Place): m is Group => "children" in m;

/** The centre of a group: the mean of its places, facing as the group does. */
export function centreOf(group: Group): Frame {
  const places = placesOf(group);
  if (places.length === 0) return group.frame;
  const x = places.reduce((s, p) => s + p.frame.x, 0) / places.length;
  const y = places.reduce((s, p) => s + p.frame.y, 0) / places.length;
  return { x, y, facing: group.frame.facing };
}
