import type { Ctx } from "./evaluate.js";
import { evalError, evalExpr } from "./evaluate.js";
import type { Modules } from "./evaluate.js";
import { unit } from "./Frame.js";
import type { Group, Place } from "./Tree.js";
import { centreOf, groupsOf, placesOf } from "./Tree.js";
import type { Value } from "./values.js";

/**
 * Who stands in which place (P2): the only mutable state in the model, and
 * it changes only when a figure commits it. The user's *"some groups are
 * fixed, others move … your placement in them changes with time. that's
 * part of the script of the dance"*: the tree is fixed; this moves.
 *
 * Membership is **declared, not measured** (DA7): a couple half-way through
 * a promenade is still a member of the minor set it left until `progress()`
 * says otherwise, which is what lets `$partner` keep answering while the
 * bodies are between sets.
 */
export interface Membership {
  /** Place path → dancer. */
  dancerOf: ReadonlyMap<string, string>;
  /** Dancer → place path. */
  placeOf: ReadonlyMap<string, string>;
}

export const membership = (
  pairs: Iterable<readonly [placePath: string, dancer: string]>,
): Membership => {
  const dancerOf = new Map<string, string>();
  const placeOf = new Map<string, string>();
  for (const [place, dancer] of pairs) {
    dancerOf.set(place, dancer);
    placeOf.set(dancer, place);
  }
  return { dancerOf, placeOf };
};

/**
 * Seat the floor at beat 0: every group that says `seat = …` fills the
 * groups its seating names; a tree with no `seat` anywhere fills every
 * place. Dancers are named the way a caller numbers them — couple 1's lark
 * is `1L`, its robin `1R` — counting `couple` groups in tree order, and a
 * place outside any couple is named after itself.
 */
export function seatAll(root: Group, mods: Modules): Membership {
  const seatedGroups: Group[] = [];
  let declared = false;
  for (const group of groupsOf(root)) {
    if (group.seat === undefined) continue;
    declared = true;
    const plan = evalExpr(group.seat.expr, deferredCtx(mods, group));
    if (plan.kind !== "seating")
      throw evalError(
        `seat = … must be a seating (alternate(minor-set), all(couple)), not a ${plan.kind}`,
        group.seat.expr.span,
      );
    const kind = plan.args["kind"];
    const kindName = kind?.kind === "string" ? kind.value : "";
    const every = plan.args["every"];
    const step = every?.kind === "number" ? every.value : 2;
    const ofKind = groupsOf(group).filter((g) => g.kind === kindName);
    ofKind.forEach((g, i) => {
      if (plan.name === "all" || i % step === 0) seatedGroups.push(g);
    });
  }
  if (!declared) seatedGroups.push(root);
  return seatGroups(seatedGroups);
}

/** Fill every place under the given groups, in order, naming dancers by couple. */
export function seatGroups(groups: readonly Group[]): Membership {
  const pairs: [string, string][] = [];
  let couple = 0;
  const seen = new Set<string>();
  const seatCouple = (c: Group): void => {
    couple += 1;
    for (const place of placesOf(c)) {
      if (seen.has(place.path)) continue;
      seen.add(place.path);
      pairs.push([place.path, `${String(couple)}${roleInitial(place)}`]);
    }
  };
  for (const group of groups) {
    for (const g of groupsOf(group)) if (g.kind === "couple") seatCouple(g);
    for (const place of placesOf(group)) {
      if (seen.has(place.path)) continue;
      seen.add(place.path);
      pairs.push([place.path, place.name]);
    }
  }
  return membership(pairs);
}

const roleInitial = (place: Place): string =>
  place.role === undefined ? place.name : place.role.charAt(0).toUpperCase();

/** The context a `next` or `seat` expression is evaluated in: the group's own environment, no dancer. */
const deferredCtx = (mods: Modules, group: Group): Ctx => ({
  mods,
  env: group.next?.env ?? group.seat?.env ?? new Map(),
  world: (f) => f,
});

/**
 * The membership after one progression: every group that declares `next`
 * moves the dancers under it by its plan. A dancer under no such group stays.
 */
export function progress(root: Group, mods: Modules, current: Membership): Membership {
  const moved = new Map<string, string>(current.placeOf);
  for (const group of groupsOf(root)) {
    if (group.next === undefined) continue;
    const plan = evalExpr(group.next.expr, { mods, env: group.next.env, world: (f) => f });
    if (plan.kind !== "progression")
      throw evalError(`next = … must be a progression, not a ${plan.kind}`, group.next.expr.span);
    const map = progressionMap(plan.name, plan.args, group, root);
    for (const [dancer, place] of current.placeOf) {
      const target = map.get(place);
      if (target !== undefined) moved.set(dancer, target);
    }
  }
  return membership([...moved].map(([dancer, place]) => [place, dancer] as const));
}

/**
 * Where every place under `group` sends its occupant, for the named plan.
 *
 * `duple-progression(along, out-top, out-bottom)`: the minor sets under the
 * group, ordered along `along`; the couple at child index 0 of a set moves
 * to the next set along, the couple at index 1 to the previous, each into
 * the same child index and the place of its own role. Off the `along` end
 * the index-0 couple takes `out-top`; off the other end the index-1 couple
 * takes `out-bottom`. A couple in `out-top` comes back into the last set
 * along at index 1 (it has crossed to the other line and turned), one in
 * `out-bottom` into the first set at index 0 — bite A's one becket end, and
 * Q1 of that plan is still the user's.
 *
 * `triple-progression`: the same for three couples a set, with the twos and
 * threes trading indices as the ones pass — an approximation, flagged in the
 * notes. `circle-progression`: the sets in ring order, wrapping, no outs.
 * `none`: everybody stays.
 */
function progressionMap(
  name: string,
  args: Readonly<Record<string, Value>>,
  group: Group,
  root: Group,
): Map<string, string> {
  const map = new Map<string, string>();
  if (name === "none") return map;
  const sets = groupsOf(group).filter((g) => g.kind === "minor-set");
  if (sets.length === 0) return map;
  const along = args["along"];
  const ordered =
    along !== undefined && along.kind === "anchor"
      ? [...sets].sort(
          (a, b) =>
            projection(a, along.kind === "anchor" ? along.anchor.frame.facing : 0) -
            projection(b, along.anchor.frame.facing),
        )
      : sets;
  const outTop = args["out-top"]?.kind === "group" ? args["out-top"].group : undefined;
  const outBottom = args["out-bottom"]?.kind === "group" ? args["out-bottom"].group : undefined;
  const n = ordered.length;
  const wrap = name === "circle-progression";

  const send = (from: Group, to: Group | undefined): void => {
    if (to === undefined) return;
    for (const place of placesOf(from)) {
      const target = matchingPlace(place, from, to);
      if (target !== undefined) map.set(place.path, target.path);
    }
  };
  const target = (s: number, c: number): Group | undefined => {
    if (wrap) return ordered[((s % n) + n) % n]?.children[c];
    return ordered[s]?.children[c];
  };

  ordered.forEach((set, s) => {
    set.children.forEach((couple, c) => {
      if (name === "triple-progression") {
        // The ones move one couple place along; the twos step back past them
        // to be the threes of the set above; the threes stay put and become
        // the twos of the ones' new set. See the notes: an approximation.
        if (c === 0) send(couple, s + 1 < n ? target(s + 1, 0) : outTop);
        else if (c === 1) send(couple, s - 2 >= 0 ? target(s - 2, 2) : outBottom);
        else send(couple, target(s + 1, 1));
        return;
      }
      if (c === 0) send(couple, wrap || s + 1 < n ? target(s + 1, 0) : outTop);
      else send(couple, wrap || s - 1 >= 0 ? target(s - 1, 1) : outBottom);
    });
  });
  // Back in from the ends: the couple that left the top comes in at the top, on the other side.
  if (outTop !== undefined) send(outTop, target(n - 1, 1));
  if (outBottom !== undefined) send(outBottom, target(0, 0));
  void root;
  return map;
}

/** How far along a direction a group's centre sits. */
const projection = (group: Group, facing: number): number => {
  const c = centreOf(group);
  const d = unit(facing);
  return Math.round((c.x * d.x + c.y * d.y) * 1000) / 1000;
};

/**
 * The place in `to` a mover takes: the one at the same relative path (`b/robin`
 * in a line of four), else the same role, else the same name.
 */
const matchingPlace = (place: Place, from: Group, to: Group): Place | undefined => {
  const relative = place.path.slice(from.path.length);
  const places = placesOf(to);
  return (
    places.find((p) => p.path.slice(to.path.length) === relative) ??
    (place.role === undefined ? undefined : places.find((p) => p.role === place.role)) ??
    places.find((p) => p.name === place.name)
  );
};
