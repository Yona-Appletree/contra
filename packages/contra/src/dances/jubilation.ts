import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { LARKS } from "./pairs.js";

/**
 * Jubilation, Gene Hubert — duple improper.
 *
 * Source: The Caller's Box dance 10526
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10526`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (4) Neighbor balance  (12) Neighbor swing
 * A2  (8) Men allemande left 1 & 1/2   (8) Partner allemande right 1 & 1/2
 * B1  (8) Hey 1/2 (WL;NR;ML)   (8) Partner swing
 * B2  (8) In long lines, go forward and back   (8) Ladies chain to neighbor
 * ```
 */
export const jubilation: Dance = contraDance({
  slug: "jubilation",
  title: "Jubilation",
  author: "Gene Hubert",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 10526, permission: full.",
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
          figure: "allemande",
          beats: 8,
          params: { pairs: "partners", hand: "R", amount: 1.5 },
          call: "PARTNER ALLEMANDE RIGHT ONE AND A HALF",
        },
      ],
    },
    {
      name: "B1",
      figures: [
        { figure: "hey", beats: 8, params: { half: true }, call: "HALF A HEY" },
        {
          figure: "swing",
          beats: 8,
          params: { pairs: "partners", endFacing: "across" },
          call: "PARTNER SWING",
        },
      ],
    },
    {
      name: "B2",
      figures: [
        { figure: "long-lines", beats: 8, call: "LONG LINES FORWARD AND BACK" },
        { figure: "robins-chain", beats: 8, call: "ROBINS CHAIN" },
      ],
    },
  ],
});
