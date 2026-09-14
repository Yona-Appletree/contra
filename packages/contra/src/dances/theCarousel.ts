import type { Dance } from "@caller/choreo";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";
import { ROBINS } from "./pairs.js";

/**
 * The Carousel, Tom Hinds — duple improper.
 *
 * Source: The Caller's Box dance 10324
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10324`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (8) In long lines, go forward and back   (8) Women allemande left 1 & 1/2
 * A2  (16) Hey (PR;ML;NR;WL;PR;ML;NR;WL)
 * B1  (4) Partner balance   (12) Partner swing
 * B2  (6) Circle left 3/4   (10) Neighbor swing
 * ```
 */
export const theCarousel: Dance = contraDance({
  slug: "the-carousel",
  title: "The Carousel",
  author: "Tom Hinds",
  formation: DUPLE_IMPROPER,
  notes: "The Caller's Box 10324, permission: full.",
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "long-lines", beats: 8, call: "LONG LINES FORWARD AND BACK" },
        {
          figure: "allemande",
          beats: 8,
          params: { pairs: ROBINS, hand: "L", amount: 1.5 },
          call: "ROBINS ALLEMANDE LEFT ONE AND A HALF",
        },
      ],
    },
    {
      name: "A2",
      figures: [{ figure: "hey", beats: 16, call: "FULL HEY FOR FOUR" }],
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
        {
          figure: "circle",
          beats: 6,
          params: { direction: "left", places: 3 },
          call: "CIRCLE LEFT THREE QUARTERS",
        },
        {
          figure: "swing",
          beats: 10,
          params: { pairs: "neighbors", endFacing: "across" },
          call: "NEIGHBOR SWING",
        },
      ],
    },
  ],
});
