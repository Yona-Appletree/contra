import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { LARKS } from "./pairs.js";

/**
 * Neighbor, Neighbor on the Wall, Maia McCormick — duple improper.
 *
 * Source: The Caller's Box dance 14399
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=14399`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (8) In long lines, go forward and back   (8) Neighbor swing
 * A2  (8) Ladies chain to partner   (8) Hey 1/2 (WR;NL;MR)
 * B1  (4) Partner balance   (12) Partner swing
 * B2  (8) Men allemande left 1 & 1/2   (8) Neighbor swing
 * ```
 */
export const neighborNeighborOnTheWall: Dance = contraDance({
  slug: "neighbor-neighbor-on-the-wall",
  title: "Neighbor, Neighbor on the Wall",
  author: "Maia McCormick",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 14399, permission: full.",
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "long-lines", beats: 8, call: "LONG LINES FORWARD AND BACK" },
        {
          figure: "swing",
          beats: 8,
          params: { pairs: "neighbors", endFacing: "across" },
          call: "NEIGHBOR SWING",
        },
      ],
    },
    {
      name: "A2",
      figures: [
        { figure: "robins-chain", beats: 8, call: "ROBINS CHAIN TO PARTNER" },
        { figure: "hey", beats: 8, params: { half: true }, call: "HALF A HEY" },
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
        {
          figure: "allemande",
          beats: 8,
          params: { pairs: LARKS, hand: "L", amount: 1.5 },
          call: "LARKS ALLEMANDE LEFT ONE AND A HALF",
        },
        {
          figure: "swing",
          beats: 8,
          params: { pairs: "neighbors", endFacing: "across" },
          call: "NEIGHBOR SWING",
        },
      ],
    },
  ],
});
