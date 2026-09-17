import type { Ctx } from "./evaluate.js";
import { evalExpr } from "./evaluate.js";
import type { Modules } from "./evaluate.js";
import type { Membership } from "./membership.js";
import type { Group, Place } from "./Tree.js";
import { chainTo, groupsOf, placeAt } from "./Tree.js";
import type { Value } from "./values.js";
import { NOBODY } from "./values.js";

/**
 * `$name`, for one dancer (P2): the one-sigil rule's second half.
 *
 * The dancer's place has a chain of groups above it. `$kind-name` binds the
 * innermost group of that kind on the chain (`$couple`, `$minor-set`).
 * Otherwise the chain is walked innermost first for a group that provides
 * the name, and its expression is evaluated with `me` bound to the child of
 * that group on the way down — the place itself at the bottom, the couple
 * one level up.
 *
 * Two answers are kept apart on purpose: a name **no group of the formation
 * provides** is a compile error the checker reports with a span; a name that
 * is provided but evaluates to **nobody** is the end effect (a couple out at
 * the end has a `$partner` and no `$neighbor`). `providedNames` is the
 * static half, `resolve` the dynamic one.
 */
export interface Resolved {
  value: Value;
  /** Whether any group on the dancer's chain provides the name (else `value` is nobody by default). */
  provided: boolean;
}

export function resolve(
  name: string,
  dancerPlacePath: string,
  root: Group,
  mods: Modules,
  membership?: Membership,
): Resolved {
  const place = placeAt(root, dancerPlacePath);
  if (place === undefined) return { value: NOBODY, provided: false };
  const chain = chainTo(root, dancerPlacePath);
  // `$minor-set`: the innermost group of that kind.
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const group = chain[i] as Group;
    if (group.kind === name) return { value: { kind: "group", group }, provided: true };
  }
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const group = chain[i] as Group;
    const provide = group.provides.find((p) => p.name === name);
    if (provide === undefined) continue;
    const me: Group | Place = chain[i + 1] ?? place;
    const ctx: Ctx = {
      mods,
      env: provide.deferred.env,
      world: (f) => f,
      rel: {
        group,
        place,
        root,
        me,
        dyn: (other) =>
          other === name
            ? undefined
            : resolve(other, dancerPlacePath, root, mods, membership).value,
      },
    };
    return { value: evalExpr(provide.deferred.expr, ctx), provided: true };
  }
  return { value: NOBODY, provided: false };
}

/** Every `$name` some group of the tree provides, plus every kind a group has — the static answer. */
export function providedNames(root: Group): Set<string> {
  const names = new Set<string>();
  for (const group of groupsOf(root)) {
    names.add(group.kind);
    for (const p of group.provides) names.add(p.name);
  }
  return names;
}
