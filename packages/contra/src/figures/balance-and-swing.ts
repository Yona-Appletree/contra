import type { Beat, Hand, Side } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraFigure, ContraParams, FigurePlan, PlanContext, Spots } from "./ContraFigure.js";
import { contraFigure, planContext } from "./ContraFigure.js";
import type { BalanceParams } from "./balance.js";
import { balance } from "./balance.js";
import type { EndFacing, SwingParams } from "./swing.js";
import { swing, swingPlan } from "./swing.js";
import type { Pairing } from "./pairing.js";

/** {@link balanceAndSwing}'s parameters: the balance's and the swing's, in one call. */
export interface BalanceAndSwingParams extends ContraParams {
  /** Who balances and swings with whom. */
  pairs: Pairing;
  /** How many of the figure's beats the balance takes. */
  balanceBeats: Beat;
  /** How far the body rocks forward in the balance, px. */
  rock: number;
  /** How far below shoulder height the balance's joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
  /** How many times round the swing goes, in whole and half turns. */
  turns: number;
  /** How far the swing's outstretched hands sit in from the joined shoulders, px. */
  handOffset: number;
  /** Which way the pair faces when the swing opens out. */
  endFacing: EndFacing;
  /** How far each dancer stands from the swing's centre at the end, px; `null` reads it off the set. */
  endHalf: number | null;
}

/**
 * Balance and swing: one call, and one figure.
 *
 * The user, who calls these: "that's really one move, most of the time. very
 * occasionally does a caller call 'balance your partner' and then 2 beats later
 * 'swing your partner.' its almost always 'balance and swing your partner'."
 *
 * Dancing it as two figures is what put the seam in the middle of it, and the
 * seam is what the arms disappeared into. Here the balance's rock flows
 * straight into the swing's turn with **nothing let go**: the lark's left in
 * the robin's right is one floor point from the moment the balance takes it
 * until the pair opens out, and it travels from where the balance holds it to
 * where the swing does over the swing's first beat. The other two hands are the
 * ones that really do change — they were joined for the rock and belong on the
 * back and the shoulder for the turn — so they move from one to the other over
 * that same beat, rather than dropping to the hip and coming back up.
 *
 * `balance` and `swing` stay in the registry for the rare dance that calls them
 * apart; the carried-hold rule covers that seam.
 */
export const balanceAndSwing: ContraFigure<BalanceAndSwingParams> =
  contraFigure<BalanceAndSwingParams>({
    id: "balance-and-swing",
    call: "BALANCE AND SWING",
    describe:
      "Take both hands with the dancer you are facing, step in toward them and back — that is the balance, four beats — and then, without letting go of the hand you are already holding, close into a ballroom hold and buzz round for the rest of the phrase, opening out side by side with the lark on the left and the robin on the right. It is one call and one move: the balance is how you get into the swing, and nobody lets go in between.",
    lead: 4,
    beats: 16,
    defaults: {
      from: {},
      pairs: "neighbors",
      balanceBeats: 4,
      rock: balance.defaults.rock,
      holdDrop: balance.defaults.holdDrop,
      stackPx: balance.defaults.stackPx,
      turns: swing.defaults.turns,
      handOffset: swing.defaults.handOffset,
      endFacing: swing.defaults.endFacing,
      endHalf: swing.defaults.endHalf,
    },

    plan(ctx: PlanContext, params: BalanceAndSwingParams): FigurePlan {
      const rock = Math.min(params.balanceBeats, params.beats / 2);
      const balanced = balance.plan(ctx, rockParams(params, rock));
      // The swing starts from where the rock left everybody, and holds the
      // hands the rock was holding: one context, handed straight on.
      const turn = swingPlan(
        planContext(ctx.stations, ctx.roleSet, ctx.spacing, balanced.ends),
        turnParams(params, rock, balanced.ends),
        {
          joinedAlready: true,
          from: (station: StationId, side: Side): Hand | undefined => {
            const hand = balanced.at(station, rock).hands[side];
            return hand === "down" ? undefined : hand;
          },
        },
      );

      return {
        ends: turn.ends,
        joinsAt: (t) => (t < rock ? balanced.joinsAt(t) : turn.joinsAt(t - rock)),
        at: (station, t) => (t < rock ? balanced.at(station, t) : turn.at(station, t - rock)),
      };
    },
  });

/** The balance half, which holds both hands to its last beat and lets go of neither. */
function rockParams(params: BalanceAndSwingParams, beats: Beat): BalanceParams {
  return {
    ...balance.defaults,
    beats,
    from: params.from,
    pairs: params.pairs,
    rock: params.rock,
    holdDrop: params.holdDrop,
    stackPx: params.stackPx,
    hold: "two",
    openOut: false,
    // Whatever the figure before handed in is handed straight on to the rock;
    // what the rock hands on to the turn is not a boundary at all.
    ...(params.carried === undefined ? {} : { carried: { in: params.carried.in, out: {} } }),
  };
}

/** The swing half, which ends the figure and so owns its outgoing carried holds. */
function turnParams(params: BalanceAndSwingParams, rock: Beat, from: Spots): SwingParams {
  return {
    ...swing.defaults,
    beats: params.beats - rock,
    from,
    pairs: params.pairs,
    turns: params.turns,
    handOffset: params.handOffset,
    endFacing: params.endFacing,
    endHalf: params.endHalf,
    ...(params.carried === undefined ? {} : { carried: { in: {}, out: params.carried.out } }),
  };
}
