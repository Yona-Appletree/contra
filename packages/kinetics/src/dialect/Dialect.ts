import type { Vec2 } from "@caller/core";

/**
 * A dialect is where the dancers live: who is on the floor, where they stand
 * at beat 0, what role each of them dances, and what the selector words in a
 * program mean from any one dancer's point of view.
 *
 * It is the **only** place a role name appears (D16). Nothing under `lang/`,
 * `ir/` or `figures/` knows what a lark, a robin, a contra or a set is, so a
 * square dance is another dialect rather than another engine. There are two:
 * the pair (`dialect/pair`), and contra's two long lines (`dialect/contra`),
 * whose relation tables — `partner`, `neighbor`, `left-diagonal`, … — are
 * offsets on the set's lattice rather than two literals.
 *
 * Selects are the seam (DA14, the user at 00:26: *"a person does this stuff.
 * they do it with respect to named … slots"*). A program binds the people it
 * is relative to, the dialect resolves each binding per dancer, and a binding
 * that comes back nobody is what an end effect is made of.
 *
 * **Axes**: x runs across the screen, y down it, z up out of the floor; world
 * units are px at 4 cm/px. A facing is degrees with 0 = +x, and a dancer's
 * right is `facing + 90°` — toward +y, which is down the screen. So the lark
 * at (−10, 0) facing 0 looks toward +x, and the robin on their right would
 * stand toward +y.
 */
export interface Dialect {
  id: DialectId;
  /** Everyone on the floor, in the order the debugger lists them. */
  dancers: readonly DancerId[];
  roleOf(dancer: DancerId): "lark" | "robin";
  /** The role words a program may say (a figure's `role` parameter is checked against them). */
  roleNames?: readonly string[];
  /** The facing a dancer's own place has in this dialect — `home` in an arrangement (across, in a contra line). */
  homeFacing?(dancer: DancerId): number;
  /** Which side of `other` this dancer stands on when the two stand as a couple facing home; undefined when they are not a couple. */
  sideOf?(dancer: DancerId, other: DancerId): "left" | "right" | undefined;
  /** Where everyone stands at beat 0. */
  initial(): SetState;
  /**
   * A selector word, from this dancer's point of view: a dancer id, or nobody.
   * An unknown word throws; `compile` catches it and reports the call's span.
   */
  select(selector: string, from: DancerId, state: SetState): DancerId | undefined;
  /** The words this dialect knows, for the error message. */
  selectors: readonly string[];
  /**
   * The **group** words this dialect knows (`hands-four`), if any.
   *
   * A group is a selector that answers with several dancers rather than one:
   * the ring a circle or a balance the ring is danced by. `compile` reads this
   * list to decide which resolver a `select` statement wants, so a dialect
   * that has no groups — the pair — simply leaves both members off.
   */
  groups?: readonly string[];
  /**
   * A group word, from this dancer's point of view: the dancers in the order
   * the figure is danced in (for `hands-four`, clockwise round the ring from
   * the asking dancer), or nobody where the group does not exist — a dancer at
   * the end of a line is in no hands four, and `if (four) { … } else { … }`
   * branches on that. An unknown word throws, as {@link Dialect.select} does.
   */
  group?(word: string, from: DancerId, state: SetState): DancerId[] | undefined;
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

/** The error a dialect throws for a word it has not got. */
export const unknownSelector = (dialect: Dialect, selector: string): Error =>
  new Error(
    `${dialect.id} does not know the selector "${selector}": ${dialect.selectors.join(" | ")}`,
  );
