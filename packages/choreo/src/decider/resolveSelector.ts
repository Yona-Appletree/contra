import type { Selector } from "../dance/Dance.js";
import type { Formation, GroupSelector, Station, StationId } from "../formation/Formation.js";

/**
 * Which stations of a group a `Selector` names.
 *
 * `'all'` is every station and an array names them directly; anything else is a
 * tag the formation defines, so `choreo` never learns what a lark is. A tag the
 * formation does not define is an error, not an empty selection — a dance that
 * says `who: 'larks'` in a square is a bug in the dance.
 *
 * `group` is the call's own {@link GroupSelector}: which partition `stations`
 * came out of, and therefore which tag table answers for them. Two partitions
 * can produce groups of the same size, so the count cannot say it. The tags are
 * then filtered down to the ids this particular group has, which is what lets
 * one abstract definition serve a selector's widest shape and its narrowest.
 */
export function resolveSelector(
  selector: Selector | undefined,
  formation: Formation,
  group: GroupSelector,
  stations: readonly Station[],
): StationId[] {
  const ids = stations.map((s) => s.id);
  if (selector === undefined || selector === "all") return ids;

  if (Array.isArray(selector)) {
    for (const id of selector) {
      if (!ids.includes(id)) {
        throw new Error(`selector names station "${id}", not one of [${ids.join(", ")}]`);
      }
    }
    return [...selector];
  }

  const tags = formation.tags(group);
  const tagged = tags[selector];
  if (!tagged) {
    throw new Error(
      `formation "${formation.id}" has no tag "${selector}" in "${group}" (has: ${Object.keys(tags).join(", ")})`,
    );
  }
  return tagged.filter((id) => ids.includes(id));
}

/** The stations a selection leaves out, who stand while the others dance. */
export const complementOf = (
  stations: readonly Station[],
  selected: readonly StationId[],
): StationId[] => stations.map((s) => s.id).filter((id) => !selected.includes(id));
