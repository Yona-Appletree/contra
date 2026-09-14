import type { Dance } from "@caller/choreo";
import { BECKET, BECKET_BEFORE_SLIDE } from "../formation/becket.js";
import { PLACE_PITCH_PX } from "../formation/dupleImproper.js";
import { contraDance } from "../figures/chain.js";

/**
 * Butter, Gene Hubert — becket.
 *
 * Source: The Caller's Box dance 10320
 * (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10320`),
 * which states `Permission: full`.
 *
 * ```text
 * A1  (2) Shift left  (6) Circle left 3/4  (8) Neighbor swing
 * A2  (8) In long lines, go forward and back   (8) Ladies chain to partner
 * B1  (16) Hey (WR;NL;MR;PL;WR;NL;MR)
 * B2  (4) Partner balance   (12) Partner swing
 * ```
 *
 * The shift is becket's progression and it happens in the **first two beats**,
 * which is why this dance needed `Dance.startPlaces`: the minor set the rest of
 * the time through runs in is the one the shift makes, so every dancer —
 * including the couple waiting at each end — starts one couple place back along
 * their own line and slides in. Everything after the shift is the identity on
 * places, so the dance closes exactly on {@link BECKET_BEFORE_SLIDE} in the
 * progressed set.
 */
export const butter: Dance = contraDance({
  slug: "butter",
  title: "Butter",
  author: "Gene Hubert",
  formation: BECKET,
  notes: "The Caller's Box 10320, permission: full.",
  startPlaces: BECKET_BEFORE_SLIDE,
  // The couple waiting at each end slides off the end of the line in the same
  // two beats as everybody else. `wait-out` takes four to step together by
  // default, and a couple still sliding at beat 2 comes 0.064 px from the
  // couple sliding into the place it is leaving — AC6 wants 8.
  waitOut: { joinBeats: 2 },
  phrases: [
    {
      name: "A1",
      figures: [
        { figure: "slide-left", beats: 2, call: "SHIFT LEFT" },
        {
          figure: "circle",
          beats: 6,
          params: { direction: "left", places: 3 },
          call: "CIRCLE LEFT THREE QUARTERS",
        },
        {
          figure: "swing",
          beats: 8,
          // A circle three quarters out of becket leaves the four in a duple
          // improper minor set, where the two dancers of a pair stand one place
          // pitch apart along their own line rather than a line's width across
          // it. `endHalf` is that half pitch, so the swing opens out on the
          // becket lattice and the chain after it lands on the stations.
          params: { pairs: "neighbors", endFacing: "across", endHalf: PLACE_PITCH_PX / 2 },
          call: "NEIGHBOR SWING",
        },
      ],
    },
    {
      name: "A2",
      figures: [
        { figure: "long-lines", beats: 8, call: "LONG LINES FORWARD AND BACK" },
        { figure: "robins-chain", beats: 8, call: "ROBINS CHAIN TO YOUR PARTNER" },
      ],
    },
    {
      name: "B1",
      figures: [
        { figure: "hey", beats: 16, params: { start: "robins-right" }, call: "HEY FOR FOUR" },
      ],
    },
    {
      name: "B2",
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
  ],
});
