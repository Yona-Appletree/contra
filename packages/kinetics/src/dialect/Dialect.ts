import type { Vec2 } from "@caller/core";

/**
 * What the rest of the stack knows about the floor: who is on it, what role
 * each dances, where everybody starts, which way home faces and which side
 * of a couple a dancer takes. It is the **only** place a role name appears
 * (D16). Nothing under `ir/` or `figures/` knows what a lark, a robin, a
 * contra or a set is.
 *
 * Since P4 of the dance-language plan there is one implementation,
 * `treeDialect`, made from a formation's tree; the words in a program
 * (`$partner`, `$minor-set`) are resolved by the compiler against the tree
 * itself, so no selector ever passes through here.
 *
 * **Axes**: x runs across the screen, y down it, z up out of the floor; world
 * units are px at 4 cm/px. A facing is degrees with 0 = +x, and a dancer's
 * right is `facing + 90°` — toward +y, which is down the screen.
 */
export interface Dialect {
  id: DialectId;
  /** Everyone on the floor, in the order the debugger lists them. */
  dancers: readonly DancerId[];
  roleOf(dancer: DancerId): "lark" | "robin";
  /** The facing a dancer's own place has at beat 0 — `home` in an arrangement (across, in a contra line). */
  homeFacing?(dancer: DancerId): number;
  /** Which side of `other` this dancer stands on when the two stand as a couple facing home; undefined when they are not a couple. */
  sideOf?(dancer: DancerId, other: DancerId): "left" | "right" | undefined;
  /** Where everyone stands at beat 0. */
  initial(): SetState;
}

/** The name of a dialect, for the record a compiled sequence carries. */
export type DialectId = string;

/** The name of a dancer. Unique within a dialect. */
export type DancerId = string;

/** Where one dancer is and which way they point. */
export interface DancerState {
  p: Vec2;
  /** Degrees, 0 = +x, increasing toward +y (screen y down). */
  facing: number;
}

/** Everyone, at one moment. */
export interface SetState {
  dancers: Readonly<Record<DancerId, DancerState>>;
}
