import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { ROBINS } from "./pairs.js";

/**
 * Contra Cockaigne, Devin Nordson — duple improper.
 *
 * Source: The Caller's Box dance 4361
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=4361`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (4) Neighbor balance  (12) Neighbor swing
 * A2  (8) In long lines, go forward and back   (8) Women allemande right 1 & 1/2
 * B1  (4) Partner balance   (12) Partner swing
 * B2  (8) Ladies chain to neighbor   (8) Star left 1
 * ```
 */
export const contraCockaigne: Dance = contraDance({
  slug: "contra-cockaigne",
  title: "Contra Cockaigne",
  author: "Devin Nordson",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 4361, permission: full.",
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
        { figure: "long-lines", beats: 8, call: "LONG LINES FORWARD AND BACK" },
        {
          figure: "allemande",
          beats: 8,
          params: { pairs: ROBINS, hand: "R", amount: 1.5 },
          call: "ROBINS ALLEMANDE RIGHT ONE AND A HALF",
        },
      ],
    },
    {
      name: "B1",
      figures: [
        { figure: "balance", beats: 4, params: { pairs: "partners" }, call: "PARTNER BALANCE" },
        {
          figure: "swing",
          beats: 12,
          params: { pairs: "partners", endFacing: "across" },
          call: "AND SWING",
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
