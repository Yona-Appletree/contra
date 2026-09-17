import type { Span } from "../lang/syntax.js";
import type { Group, Place } from "./Tree.js";
import { chainTo, groupsOf, placeAt, placesOf } from "./Tree.js";

/**
 * Who stands where, and who they are (round 2, P2): the only mutable state
 * in the model. The user's walk: *"everything in the tree is mutable … all
 * of that stuff … those mutations are represented as events on the
 * timeline."* A dancer is `{ id, role, place }`; the chain of groups above
 * them and every `$` they can read follow from the place at read time.
 *
 * State changes only at a **commit**: the assignments every dancer queued
 * during a beat are applied together, then the invariants are checked. Reads
 * within the beat saw the state before it. That is what lets "everyone
 * progresses at once" be true without anybody coordinating.
 */
export interface Dancer {
  id: string;
  /** A Role member's name (`Lark`), from the place at instantiation, changed only by `$role = …`. */
  role?: string;
  /** The place's path. */
  place: string;
}

/** The state of everybody, immutable between commits. */
export interface Dancers {
  readonly list: readonly Dancer[];
  byId(id: string): Dancer | undefined;
  /** Who stands on a place, or nobody. */
  at(placePath: string): Dancer | undefined;
}

export const dancersOf = (list: readonly Dancer[]): Dancers => {
  const byId = new Map(list.map((d) => [d.id, d]));
  const at = new Map(list.map((d) => [d.place, d]));
  return { list, byId: (id) => byId.get(id), at: (p) => at.get(p) };
};

/**
 * Place path → dancer and dancer → place path, the view the rest of the
 * stack reads (the scheduler's seats, the debugger's lanes). Derived from
 * {@link Dancers}; never the other way round.
 */
export interface Membership {
  dancerOf: ReadonlyMap<string, string>;
  placeOf: ReadonlyMap<string, string>;
}

export const membershipOf = (dancers: Dancers): Membership => ({
  dancerOf: new Map(dancers.list.map((d) => [d.place, d.id])),
  placeOf: new Map(dancers.list.map((d) => [d.id, d.place])),
});

/**
 * Instantiate the dancers a floor's `dancers;` statements asked for: every
 * unfilled place under each seated group, in tree order, named the way a
 * caller numbers them — couple 1's lark is `1L`, its robin `1R`, counting
 * `couple` groups as they are met; a place outside any couple is named after
 * itself. The role is copied from the place: the initial state of the world.
 */
export function instantiate(seated: readonly Group[]): Dancers {
  const list: Dancer[] = [];
  const seen = new Set<string>();
  let couple = 0;
  const seatPlace = (place: Place, id: string): void => {
    if (seen.has(place.path)) return;
    seen.add(place.path);
    const d: Dancer = { id, place: place.path };
    if (place.role !== undefined) d.role = place.role;
    list.push(d);
  };
  for (const group of seated) {
    for (const g of groupsOf(group)) {
      if (g.kind !== "couple") continue;
      const places = placesOf(g).filter((p) => !seen.has(p.path));
      if (places.length === 0) continue;
      couple += 1;
      for (const place of places) seatPlace(place, `${String(couple)}${initial(place)}`);
    }
    for (const place of placesOf(group)) seatPlace(place, place.name);
  }
  return dancersOf(list);
}

const initial = (place: Place): string =>
  place.role === undefined ? place.name : place.role.charAt(0).toUpperCase();

/**
 * One reassignment a dancer queued: `$place = …`, `$minor-set = …`,
 * `$couple = …` or `$role = …`, at a beat, from a span. A dancer's
 * assignments in one beat are resolved together at the commit.
 */
export interface Assignment {
  dancer: string;
  beat: number;
  property: "place" | "role" | string;
  /** A place path, a group path, a child name (for `$couple = "twos"`), or a Role member. */
  value: string;
  span: Span;
}

/** Something the commit found wrong: two dancers on a place, a dancer nowhere. */
export interface StateViolation {
  message: string;
  dancers: string[];
  beat: number;
  span?: Span;
}

/**
 * Apply a beat's assignments together and check the invariants.
 *
 * The rule for a dancer's new place is "the same slot as before unless told
 * otherwise": `$place` is exact; `$<kind> = G` (a group of that kind) keeps
 * the dancer's couple slot name and role under `G`, or takes `$couple`'s
 * value when that is set too — a group, or a child name of the new set;
 * `$role` changes who they are. A dancer with no assignments stays.
 */
export function commit(
  root: Group,
  before: Dancers,
  assignments: readonly Assignment[],
  beat: number,
): { after: Dancers; violations: StateViolation[] } {
  const violations: StateViolation[] = [];
  const byDancer = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const list = byDancer.get(a.dancer) ?? [];
    list.push(a);
    byDancer.set(a.dancer, list);
  }
  const next: Dancer[] = before.list.map((d) => {
    const mine = byDancer.get(d.id);
    if (mine === undefined) return d;
    const out: Dancer = { ...d };
    let base: Group | undefined;
    let slot: string | undefined;
    for (const a of mine) {
      if (a.property === "role") {
        out.role = a.value;
        continue;
      }
      if (a.property === "place") {
        out.place = a.value;
        continue;
      }
      // `$minor-set = <group>` names a group by path; `$couple = "twos"` a slot by name.
      const found = groupsOf(root).find((g) => g.path === a.value);
      if (found !== undefined) base = found;
      else slot = a.value;
    }
    if (base !== undefined || slot !== undefined) {
      const target = targetPlace(root, d, base, slot);
      if (target === undefined) {
        const first = mine[0] as Assignment;
        violations.push({
          message: `${d.id}: no place for me under ${base?.path ?? slot ?? "?"} ($${first.property})`,
          dancers: [d.id],
          beat,
          span: first.span,
        });
      } else out.place = target;
    }
    return out;
  });

  // Invariants: every dancer somewhere that exists, nobody sharing a place.
  const seen = new Map<string, string>();
  for (const d of next) {
    if (placeAt(root, d.place) === undefined) {
      violations.push({
        message: `${d.id} is on a place that does not exist: ${d.place}`,
        dancers: [d.id],
        beat,
      });
      continue;
    }
    const other = seen.get(d.place);
    if (other !== undefined) {
      const span = byDancer.get(d.id)?.[0]?.span ?? byDancer.get(other)?.[0]?.span;
      violations.push({
        message: `${other} and ${d.id} are both on ${d.place} at beat ${String(beat)}`,
        dancers: [other, d.id],
        beat,
        ...(span === undefined ? {} : { span }),
      });
    }
    seen.set(d.place, d.id);
  }
  return { after: dancersOf(next), violations };
}

/**
 * The place a dancer takes under `base` (a group of the assigned kind)
 * and/or in `slot` (a child name of the set, from `$couple = "twos"`): the
 * same slot names as the ones they hold now at every level nothing says
 * otherwise, and the place of their role, else of their name, else the
 * first. "The same slot as before unless told otherwise."
 */
function targetPlace(
  root: Group,
  d: Dancer,
  base: Group | undefined,
  slot: string | undefined,
): string | undefined {
  const chain = chainTo(root, d.place);
  const set =
    base ??
    (slot === undefined ? undefined : chain.find((g) => g.children.some((c) => c.name === slot)));
  if (set === undefined) return undefined;
  // My old sub-chain below the level the new set stands at: the slot names to keep.
  let anchor = chain.findIndex((g) => g.kind === set.kind);
  if (anchor < 0) {
    const childKind = set.children[0]?.kind;
    anchor =
      childKind === undefined ? chain.length : chain.findIndex((g) => g.kind === childKind) - 1;
  }
  const oldSub = anchor >= 0 && anchor < chain.length ? chain.slice(anchor + 1) : [];
  let holder: Group = set;
  const first = slot ?? oldSub[0]?.name;
  if (first !== undefined && holder.children.length > 0) {
    const c = holder.children.find((x) => x.name === first || x.path === first);
    if (c === undefined) return undefined;
    holder = c;
  }
  for (const g of oldSub.slice(1)) {
    const c = holder.children.find((x) => x.name === g.name);
    if (c === undefined) break;
    holder = c;
  }
  const places = placesOf(holder);
  const myName = placeAt(root, d.place)?.name;
  return (
    (d.role === undefined ? undefined : places.find((p) => p.role === d.role)?.path) ??
    places.find((p) => p.name === myName)?.path ??
    places[0]?.path
  );
}
