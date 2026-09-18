import type { Span } from "@caller/lang";
import type { DancerId, DancerState } from "../dialect/Dialect.js";
import type { FigureIR, Params, Role } from "../ir/Figure.js";

/**
 * Every dancer's script, in the shape the scheduler takes: one flat list of
 * calls per dancer, and the seatings those calls were read against.
 *
 * Since M1 of the kinetics-on-lang plan this is **not** compiled here. It is
 * made from `@caller/lang`'s evening by `fromLang.ts`: the language owns the
 * text, the tree, the beats and who stands where, and this is the handful of
 * facts the kinematics need out of it. Nothing below this file knows there is
 * a language at all.
 */
export interface CompiledSequence {
  /** The root group's kind — `MajorSet`, `Pair`. */
  dialect: string;
  title?: string;
  perDancer: Readonly<Record<DancerId, readonly CompiledCall[]>>;
  /** The seatings, in order: after setup, then after each commit of the evening. */
  memberships: readonly Membership[];
}

/**
 * One call in one dancer's script, with the beats it owns and the people it
 * is dancing it with: everything the scheduler needs to plan an entry and an
 * exit, and everything the debugger needs to show where it came from.
 */
export interface CompiledCall {
  /** Position in this dancer's flat list. */
  id: number;
  figure: FigureIR;
  /** The call's arguments, defaults filled in. Dancers are in the cast. */
  params: Params;
  /** What the language said the move takes. */
  beats: number;
  /** Beats from the top of the **evening**, not of the time through. */
  start: number;
  end: number;
  /** The debugger's breadcrumb: the move's `ir` name. */
  path: string;
  /** Of the call in its `.dance` file, so the source pane can light it. */
  span: Span;
  /**
   * This dancer's view of the figure's roles. `partner: undefined` is nobody
   * — the language found no-one — and the scheduler makes that a stand (DA14).
   */
  cast: Readonly<Record<Role, DancerId | undefined>>;
  /** The whole group, in ring order from `self`, for a figure danced by a group. */
  group?: readonly DancerId[];
  /** This dancer's seat once the call has ended — moved, when a commit came before (D6). */
  seatAfter: DancerState;
  /** Every argument as the language printed it, for the source pane. */
  bindings: Readonly<Record<string, string>>;
  /** Which seating (`CompiledSequence.memberships`) the call was read against. */
  membership: number;
}

/**
 * Who stands in which place at one moment. Declared, not measured (DA7): the
 * bodies move continuously and this changes only where the language committed
 * an event.
 */
export interface Membership {
  /** Place path → dancer. */
  dancerOf: ReadonlyMap<string, DancerId>;
  /** Dancer → place path. */
  placeOf: ReadonlyMap<DancerId, string>;
}

export const membership = (
  pairs: Iterable<readonly [placePath: string, dancer: DancerId]>,
): Membership => {
  const dancerOf = new Map<string, DancerId>();
  const placeOf = new Map<DancerId, string>();
  for (const [place, dancer] of pairs) {
    dancerOf.set(place, dancer);
    placeOf.set(dancer, place);
  }
  return { dancerOf, placeOf };
};
