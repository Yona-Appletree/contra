import type { Selector } from "../dance/Dance.js";
import type { Formation, Station, StationId } from "../formation/Formation.js";

/**
 * Which stations of a group a `Selector` names.
 *
 * `'all'` is every station and an array names them directly; anything else is a
 * tag the formation defines, so `choreo` never learns what a lark is. A tag the
 * formation does not define is an error, not an empty selection — a dance that
 * says `who: 'larks'` in a square is a bug in the dance.
 */
export function resolveSelector(
  selector: Selector | undefined,
  formation: Formation,
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

  const tags = formation.tags(stations.length);
  const tagged = tags[selector];
  if (!tagged) {
    throw new Error(
      `formation "${formation.id}" has no tag "${selector}" for a group of ${stations.length} (has: ${Object.keys(tags).join(", ")})`,
    );
  }
  return tagged.filter((id) => ids.includes(id));
}

/** The stations a selection leaves out, who stand while the others dance. */
export const complementOf = (
  stations: readonly Station[],
  selected: readonly StationId[],
): StationId[] => stations.map((s) => s.id).filter((id) => !selected.includes(id));
