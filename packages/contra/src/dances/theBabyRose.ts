import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";

/**
 * The Baby Rose, David Kaynor — duple improper.
 *
 * Source: The Caller's Box dance 10273
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10273`),
 * which states `Permission: full`. Figures and beat counts are that page's,
 * figure for figure; nothing here is reconstructed from memory.
 *
 * ```text
 * A1  (4) Neighbor balance      (12) Neighbor swing
 * A2  (8) Circle left 3/4        (8) Partner do-si-do
 * B1  (4) Partner balance       (12) Partner swing
 * B2  (8) Ladies chain to neighbor (8) Star left 1
 * ```
 */
export const theBabyRose: Dance = contraDance({
  slug: "the-baby-rose",
  title: "The Baby Rose",
  author: "David Kaynor",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 10273, permission: full.",
  phrases: [
    {
      name: "A1",
      figures: [
        {
          figure: "balance-and-swing",
          beats: 16,
          params: { pairs: "neighbors", endFacing: "across" },
          call: "NEIGHBOR BALANCE AND SWING",
        },
      ],
    },
    {
      name: "A2",
      figures: [
        {
          figure: "circle",
          beats: 8,
          params: { direction: "left", places: 3 },
          call: "CIRCLE LEFT THREE QUARTERS",
        },
        {
          figure: "do-si-do",
          beats: 8,
          params: { pairs: "partners", amount: 1 },
          call: "PARTNER DO-SI-DO",
        },
      ],
    },
    {
      name: "B1",
      figures: [
        {
          figure: "balance-and-swing",
          beats: 16,
          params: { pairs: "partners", endFacing: "across" },
          call: "PARTNER BALANCE AND SWING",
        },
      ],
    },
    {
      name: "B2",
      figures: [
        { figure: "robins-chain", beats: 8, call: "ROBINS CHAIN" },
        { figure: "star", beats: 8, params: { hand: "L", places: 4 }, call: "STAR LEFT ONCE" },
      ],
    },
  ],
});
