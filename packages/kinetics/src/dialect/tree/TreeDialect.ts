import type { DancerId, Dialect, SetState } from "../Dialect.js";
import type { Floor } from "../../tree/floor.js";
import { placeAt } from "../../tree/Tree.js";
import type { Frame } from "../../tree/Frame.js";

/** The engine's world unit: px at 4 cm each, so 25 to the metre. */
export const METRE_PX = 25;

/** A frame in metres as the engine's px pose. */
export const framePx = (f: Frame): { p: [number, number]; facing: number } => ({
  p: [Math.round(f.x * METRE_PX * 100) / 100, Math.round(f.y * METRE_PX * 100) / 100],
  facing: f.facing,
});

/**
 * The tree as the rest of the stack sees it (P4): who is on the floor, what
 * role each dances, where everybody starts, which way home faces, and which
 * side of a couple a dancer takes. The scheduler, the executor, the listing
 * and the debugger read only these; the words in a program are the
 * compiler's, and it reads the tree itself.
 */
export function treeDialect(floor: Floor): Dialect {
  const dancers = [...floor.initial.placeOf.keys()];
  const placeOf = (id: DancerId) => {
    const path = floor.initial.placeOf.get(id);
    return path === undefined ? undefined : placeAt(floor.root, path);
  };
  const roleOf = (id: DancerId): "lark" | "robin" =>
    placeOf(id)?.role === "Robin" ? "robin" : "lark";
  return {
    id: floor.name,
    dancers,
    roleOf,
    homeFacing: (id) => placeOf(id)?.frame.facing ?? 0,
    // As a couple facing home, the lark stands on the robin's left.
    sideOf: (a, b) =>
      roleOf(a) === roleOf(b) ? undefined : roleOf(a) === "lark" ? "left" : "right",
    initial: (): SetState => ({
      dancers: Object.fromEntries(
        dancers.map((id) => {
          const place = placeOf(id);
          return [id, place === undefined ? { p: [0, 0], facing: 0 } : framePx(place.frame)];
        }),
      ),
    }),
  };
}
