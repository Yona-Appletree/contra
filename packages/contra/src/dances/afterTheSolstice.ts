import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { LARKS } from "./pairs.js";

/**
 * After the Solstice, Lisa Greenleaf — duple improper.
 *
 * Source: The Caller's Box dance 4696
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=4696`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (8) Neighbor do-si-do   (8) Neighbor swing
 * A2  (8) Long lines, go forward and back   (8) Men allemande left 1 & 1/2
 * B1  (4) Partner balance   (12) Partner swing
 * B2  (8) Right and left through with partner   (6) Circle left 3/4
 *     (2) Pass through along (NR)
 * ```
 */
export const afterTheSolstice: Dance = contraDance({
  slug: "after-the-solstice",
  title: "After the Solstice",
  author: "Lisa Greenleaf",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 4696, permission: full.",
  phrases: [
    {
      name: "A1",
      figures: [
        {
          figure: "do-si-do",
          beats: 8,
          params: { pairs: "neighbors", amount: 1 },
          call: "NEIGHBOR DO-SI-DO",
        },
        {
          figure: "swing",
          beats: 8,
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
          params: { pairs: LARKS, hand: "L", amount: 1.5 },
          call: "LARKS ALLEMANDE LEFT ONE AND A HALF",
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
        {
          figure: "right-and-left-through",
          beats: 8,
          params: { couples: "partners" },
          call: "RIGHT AND LEFT THROUGH",
        },
        {
          figure: "circle",
          beats: 6,
          params: { direction: "left", places: 3 },
          call: "CIRCLE LEFT THREE QUARTERS",
        },
        {
          figure: "pass-through",
          beats: 2,
          params: { direction: "along" },
          call: "PASS THROUGH ALONG THE SET",
        },
      ],
    },
  ],
});
