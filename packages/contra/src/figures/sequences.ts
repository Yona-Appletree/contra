import type { Dance } from "@caller/choreo";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDance } from "./chain.js";

/**
 * The duple improper sequence the milestone asks for: circle left three
 * quarters, swing your partner, long lines, robins chain, star left, balance
 * and swing your neighbour.
 *
 * The star goes **half** way round. The brief does not say how far it goes, and
 * the dance only progresses for one answer: the neighbour swing at the end is
 * the identity on places from a becket-like arrangement, so everything before
 * it has to add up to the progression on its own, and the star is the only
 * figure in the list with a free number in it. Star left half way is what makes
 * the whole thing close.
 */
export const DUPLE_SEQUENCE: Dance = contraDance({
  slug: "m8-duple-sequence",
  title: "The Duple Sequence",
  author: "M8",
  formation: DUPLE_IMPROPER,
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "circle", beats: 8, params: { direction: "left", places: 3 } },
        { figure: "swing", beats: 8, params: { pairs: "partners", endFacing: "across" } },
      ],
    },
    {
      name: "A2",
      figures: [
        { figure: "long-lines", beats: 8 },
        { figure: "robins-chain", beats: 8 },
      ],
    },
    {
      name: "B1",
      figures: [
        { figure: "star", beats: 8, params: { hand: "L", places: 2 } },
        { figure: "do-si-do", beats: 8, params: { pairs: "neighbors", amount: 1 } },
      ],
    },
    {
      name: "B2",
      figures: [
        { figure: "balance", beats: 4, params: { pairs: "neighbors" } },
        { figure: "swing", beats: 12, params: { pairs: "neighbors", endFacing: "across" } },
      ],
    },
  ],
});

/**
 * The becket sequence, which M7 could not write: everything in it is the
 * identity on places, and the slide at the end is becket's progression.
 */
export const BECKET_SEQUENCE: Dance = contraDance({
  slug: "m8-becket-sequence",
  title: "The Becket Sequence",
  author: "M8",
  formation: BECKET,
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "circle", beats: 8, params: { direction: "left", places: 4 } },
        { figure: "long-lines", beats: 8 },
      ],
    },
    {
      name: "A2",
      figures: [
        { figure: "right-and-left-through", beats: 8 },
        { figure: "right-and-left-through", beats: 8 },
      ],
    },
    {
      name: "B1",
      figures: [
        { figure: "star", beats: 8, params: { hand: "R", places: 4 } },
        { figure: "star", beats: 8, params: { hand: "L", places: 4 } },
      ],
    },
    {
      name: "B2",
      figures: [
        { figure: "balance", beats: 4, params: { pairs: "partners" } },
        { figure: "swing", beats: 8, params: { pairs: "partners", endFacing: "across" } },
        { figure: "slide-left", beats: 4 },
      ],
    },
  ],
});
