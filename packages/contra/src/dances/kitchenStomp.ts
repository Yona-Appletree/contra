import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { LARKS } from "./pairs.js";

/**
 * Kitchen Stomp, Becky Hill — duple improper.
 *
 * Source: The Caller's Box dance 10541
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10541`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (4) Neighbor balance  (12) Neighbor swing
 * A2  (8) Men allemande left 1 & 1/2   (8) Partner swing
 * B1  (8) Ladies chain to neighbor  (4) Balance ring  (4) Petronella turn
 * B2  (4) Balance ring  (4) Petronella turn  (8) Star left 1
 * ```
 */
export const kitchenStomp: Dance = contraDance({
  slug: "kitchen-stomp",
  title: "Kitchen Stomp",
  author: "Becky Hill",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 10541, permission: full.",
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "balance", beats: 4, params: { pairs: "neighbors" }, call: "NEIGHBOR BALANCE" },
        {
          figure: "swing",
          beats: 12,
          params: { pairs: "neighbors", endFacing: "across" },
          call: "AND SWING",
        },
      ],
    },
    {
      name: "A2",
      figures: [
        {
          figure: "allemande",
          beats: 8,
          params: { pairs: LARKS, hand: "L", amount: 1.5 },
          call: "LARKS ALLEMANDE LEFT ONE AND A HALF",
        },
        {
          figure: "swing",
          beats: 8,
          params: { pairs: "partners", endFacing: "across" },
          call: "PARTNER SWING",
        },
      ],
    },
    {
      name: "B1",
      figures: [
        { figure: "robins-chain", beats: 8, call: "ROBINS CHAIN" },
        { figure: "balance-ring", beats: 4, call: "BALANCE THE RING" },
        { figure: "petronella", beats: 4, call: "PETRONELLA TURN" },
      ],
    },
    {
      name: "B2",
      figures: [
        { figure: "balance-ring", beats: 4, call: "BALANCE THE RING" },
        { figure: "petronella", beats: 4, call: "PETRONELLA TURN" },
        { figure: "star", beats: 8, params: { hand: "L", places: 4 }, call: "STAR LEFT ONCE" },
      ],
    },
  ],
});
