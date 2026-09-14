import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { LARKS, ROBINS } from "./pairs.js";

/**
 * Thanks to the Gene, Tom Hinds — duple improper.
 *
 * Source: The Caller's Box dance 10811
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10811`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (4) Neighbor balance  (12) Neighbor swing
 * A2  (8) Right and left through with neighbor   (8) Ladies chain to partner
 * B1  (6) Women right shoulder round 1   (10) Partner swing
 * B2  (8) In long lines, go forward and back   (8) Men allemande left 1 & 1/2
 * ```
 */
export const thanksToTheGene: Dance = contraDance({
  slug: "thanks-to-the-gene",
  title: "Thanks to the Gene",
  author: "Tom Hinds",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 10811, permission: full.",
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
          figure: "right-and-left-through",
          beats: 8,
          params: { couples: "neighbors" },
          call: "RIGHT AND LEFT THROUGH",
        },
        { figure: "robins-chain", beats: 8, call: "ROBINS CHAIN TO PARTNER" },
      ],
    },
    {
      name: "B1",
      figures: [
        {
          figure: "do-si-do",
          beats: 6,
          params: { pairs: ROBINS, amount: 1 },
          call: "ROBINS RIGHT SHOULDER ROUND",
        },
        {
          figure: "swing",
          beats: 10,
          params: { pairs: "partners", endFacing: "across" },
          call: "PARTNER SWING",
        },
      ],
    },
    {
      name: "B2",
      figures: [
        { figure: "long-lines", beats: 8, call: "LONG LINES FORWARD AND BACK" },
        {
          figure: "allemande",
          beats: 8,
          params: { pairs: LARKS, hand: "L", amount: 1.5 },
          call: "LARKS ALLEMANDE LEFT ONE AND A HALF",
        },
      ],
    },
  ],
});
