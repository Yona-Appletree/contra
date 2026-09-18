import { angleOf } from "@caller/core";
import type { Frame, Node, Tree } from "@caller/lang";
import { ancestorOfKind, facing } from "@caller/lang";
import type { DancerId, DancerState, Dialect, SetState } from "./Dialect.js";

/**
 * The floor as the rest of the stack sees it, read straight off
 * `@caller/lang`'s tree: who is on it, what role each dances, where everybody
 * starts, which way home faces, and which side of a couple a dancer takes.
 *
 * This is the **only** place a role name appears (D16): `roleOf` asks the
 * nearest `Role` ancestor what its id is called and says `robin` or `lark`,
 * and nothing under `ir/`, `figures/` or `schedule/` ever learns the word.
 * A role is where you stand, so a dancer's role is read from the place they
 * **started** in — a dance that swaps roles mid-way moves the person, not
 * the dialect.
 */
export function langDialect(tree: Tree): Dialect {
  const dancers = tree.dancers.map((dancer) => dancer.id);
  const homeOf = new Map(tree.dancers.map((dancer) => [dancer.id, dancer.home]));
  const roleOf = (id: DancerId): "lark" | "robin" =>
    ancestorOfKind(homeOf.get(id), ROLE_KIND)?.idLabel === "Robin" ? "robin" : "lark";
  return {
    id: tree.roots[0]?.kind ?? "floor",
    dancers,
    roleOf,
    homeFacing: (id) => {
      const home = homeOf.get(id);
      return home === undefined ? 0 : posePx(home.frame).facing;
    },
    // As a couple facing home, the lark stands on the robin's left.
    sideOf: (a, b) =>
      roleOf(a) === roleOf(b) ? undefined : roleOf(a) === "lark" ? "left" : "right",
    initial: (): SetState => ({
      dancers: Object.fromEntries(
        dancers.map((id) => {
          const home = homeOf.get(id);
          return [id, home === undefined ? { p: [0, 0], facing: 0 } : posePx(home.frame)];
        }),
      ),
    }),
  };
}

/** The group whose id says which role a dancer dances. */
const ROLE_KIND = "Role";

/** The engine's world unit: px at 4 cm each, so 25 to the metre. */
export const METRE_PX = 25;

/** Millimetres to the engine's px: 25 px to the metre, 1000 mm to the metre. */
export const MM_PX = METRE_PX / 1000;

/**
 * A lang frame as the engine's pose (notes D4, **corrected**: see below).
 *
 * Both frames put the top of the hall at the top of the screen — lang's `+y`
 * runs down the hall and the engine's `+y` runs down the screen — so `y` goes
 * straight across. `x` does not: **the two frames have opposite handedness**,
 * and mapping them straight through mirrors every dancer without moving one.
 *
 * lang: a node's own `+x` is to its right and its own `+y` is in front of it
 * (`eval/frame.ts`), so facing × right is `-1`. The engine: a facing is
 * degrees from `+x` and a dancer's right is `facing + 90°`, so facing × right
 * is `+1`. Two frames that disagree about which way is right disagree about
 * every "shift **left**", about which side of the robin the lark stands, and
 * about which way a ring goes round — none of which a spike with no motion
 * could see, and all of which the first animated Butter did (M1, risk R1).
 *
 * A reflection is the whole of the difference, so one reflection is the whole
 * of the fix: mirror `x`, which keeps the hall's top at the top and swaps the
 * two lines, and take the facing through the mirrored unit vector so that a
 * dancer still faces the way they walk. Left stays left, and the becket's
 * ones — laid on lang's `-x` line and travelling `+1` in set id — walk down
 * the hall on their own left, as a caller says they do.
 */
export function posePx(f: Frame): DancerState {
  const dir = facing(f);
  return {
    p: [round2(-f.x * MM_PX), round2(f.y * MM_PX)],
    facing: normalizeDeg(angleOf(-dir.x, dir.y)),
  };
}

/** The same mirror on a bare point, for a bearing taken in lang's frame. */
export const mirrorX = (x: number): number => -x;

/** A place's pose from a lang node, for a seat the tree still holds. */
export const posePxOf = (node: Node): DancerState => posePx(node.frame);

/** Two decimal places, and never `-0`: a pose is compared, and `-0` is a trap. */
const round2 = (n: number): number => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

/** Degrees into `[0, 360)`, to the hundredth — a pose is compared, not accumulated. */
export const normalizeDeg = (deg: number): number => {
  const whole = Math.round(deg * 100) / 100;
  return ((whole % 360) + 360) % 360;
};
