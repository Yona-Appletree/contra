import type { DancerId } from "../dialect/Dialect.js";
import type { Contract } from "../ir/Figure.js";
import { resolveChoice } from "../ir/Figure.js";
import type { Hand, HoldId } from "../ir/Hold.js";
import type { CompiledCall } from "../lang/compile.js";

/**
 * How one figure's hands become the next figure's hands (D13, DA9): a hold
 * the next figure needs and this one already has with the same person is
 * carried; a take whose hands are free during the previous figure's last
 * beat overlaps that beat; otherwise it costs an entry slot; a drop overlaps
 * the next figure's first beat when its `pre` needs no hands.
 */
export type SeamKind = "none" | "carried" | "take-overlapped" | "take" | "drop-overlapped" | "drop";

/** One hold a contract asks of one dancer, resolved. */
export interface HoldNeed {
  dancer: DancerId;
  hand: Hand;
  hold: HoldId;
  with: DancerId;
}

/** The holds a contract asks of this dancer, from their own call. */
export const holdNeeds = (contract: Contract, call: CompiledCall, dancer: DancerId): HoldNeed[] => {
  const needs: HoldNeed[] = [];
  for (const ref of contract.holds) {
    const withId = ref.with === "self" ? dancer : call.cast[ref.with];
    if (withId === undefined) continue;
    needs.push({
      dancer,
      hand: resolveChoice(ref.hand, call.params),
      hold: resolveChoice(ref.hold, call.params),
      with: withId,
    });
  }
  return needs;
};
