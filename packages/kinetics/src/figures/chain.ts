import { HOLD_SPACING_PX } from "@caller/core";
import type { FigureIR } from "../ir/Figure.js";

/**
 * How far to her own left of the set's centre each crossing robin passes, px:
 * **half the clearance** two dancers keep, 4.25, so the two robins — whose
 * paths are point reflections of each other through that centre — go by
 * right shoulders 8.5 px apart. The old library's number
 * (`packages/contra/src/library/figures/robins-chain.ts`, `CHAIN_PASS_PX`),
 * for the same reason: exactly the room every other figure for two leaves
 * the pair beside it. The clearance check (`motion/clearance.ts`) is what
 * says whether it is enough once the executor has splined the walk.
 */
export const CHAIN_PASS_PX = 4.5;

/**
 * How far the receiving lark steps to his right while she crosses, px: 3.
 * With her arriving a hold's spacing (14 px) beyond him, that puts the turn's
 * axis exactly halfway between his place and the place beside him — the
 * old library's "small circle centred halfway between his own place and the
 * place beside him" — so opening the turn out to a place's spacing lands the
 * couple on the two places.
 */
export const CHAIN_RECEIVE_PX = 3;

/**
 * Which beat of the eight the crossing robin joins the lark's turn on:
 * **4** — half the figure to pull by and cross, half to turn. The user,
 * 2026-09-16, watching the old chain: *"in the chain the pull-by is still too
 * fast and the turn too slow. it should be about 4 beats each."*
 */
export const CHAIN_JOIN_BEAT = 4;

/**
 * **Robins chain** (Butter's A2: "(8) robins chain to partner"): the robins
 * pull by right hands in the middle over four beats and courtesy turn with
 * the lark on the other side over four.
 *
 * The user, watching a video walkthrough (F10 of the old library): *"the
 * larks orbit backwards 1 full turn around the point between where they and
 * the robin started. the robins pull by to join the larks 1/4 of the way
 * through … they both finish the orbit."* The lark's part: he receives her —
 * a step to his right while she crosses, so the turn's axis is the point
 * halfway between his place and the place beside him — and the couple turns
 * as one, he backing, she walking forward, facing out of the set together
 * half way round and back in at the end, with the robin now on his right.
 * The turn is danced at a hold's spacing and opens out on to the two places
 * as it comes round, so the figure ends in the line, facing across.
 *
 * `who` says which role crosses (a "larks chain" is one word changed); `to`
 * is who each crossing dancer ends beside — Butter's `partner`, who is
 * across the set after the neighbour swing; a chain to `neighbor` is the
 * same figure. Written as data in the crossing dancer's own lane frame:
 * across in half-widths, along in half-places, so the middle of the set is
 * `(0, −1)` — half a place to her left of the line between her and him.
 *
 * The courtesy hold is a placeholder like the swing's ballroom hold: left
 * hands, stacked, the robin's on top (the rendering contract), taken as the
 * pull-by ends. The pull-by's own right hands are not modelled: the other
 * robin is not in this figure's cast, and the holds gallery is where a hand
 * across two figures gets ruled on.
 *
 * Every number here sits on a limit: a full turn in four beats is a quarter
 * turn a beat, the orbit's rate cap and the stepping pivot cap both, and the
 * reversal into the turn — she arrives walking one way and leaves facing the
 * other — is two ninety-degree pivots over the last two steps of the
 * crossing. The scheduler says so the moment a floor is skewed enough to
 * push any of them over.
 */
export const chain: FigureIR = {
  id: "chain",
  params: [
    { name: "to", kind: "dancer" },
    { name: "who", kind: "role" },
    { name: "beats", kind: "number", default: 8 },
  ],
  beats: { nominal: 8, min: 8 },
  pre: {
    arrangement: [{ kind: "facing", who: "self", toward: "partner" }],
    holds: [],
  },
  post: {
    arrangement: [
      {
        kind: "beside",
        who: "self",
        of: "partner",
        side: "as-couple",
        spacingPx: 20,
        facing: "same",
        centre: "left-seat",
      },
    ],
    holds: [],
  },
  windows: [
    {
      kind: "parallel",
      beats: CHAIN_JOIN_BEAT,
      parts: [
        {
          // The crossing role: across through the middle, keeping her own
          // left of the centre, to the far side of the lark's turn — a hold's
          // spacing beyond where his step puts him, seventeen px from his
          // place — arriving facing the way he faces.
          kind: "path",
          who: { role: "who" },
          points: [
            { beat: 0, x: -1, y: 0 },
            { beat: 2, x: 0, y: -1, left: CHAIN_PASS_PX },
            { beat: 3, x: 0.6, y: -1.55, facing: 270 },
            { beat: 4, x: 1, y: -(HOLD_SPACING_PX + CHAIN_RECEIVE_PX) / 10, facing: 180 },
          ],
        },
        {
          // The other role receives: a step to the right while she crosses,
          // still facing across, so the turn's axis sits between the two
          // places of the couple she is joining.
          kind: "path",
          who: { role: "who", not: true },
          points: [
            { beat: 0, x: -1, y: 0, facing: 0 },
            { beat: 2, x: -1, y: 0, facing: 0 },
            { beat: 4, x: -1, y: CHAIN_RECEIVE_PX / 10, facing: 0 },
          ],
        },
      ],
    },
    {
      // The courtesy turn: one full turn as a couple, the one on the left
      // (the lark) backing. From the crossing dancer's side her partner is
      // on her left and she walks forward, so the pair turns anticlockwise
      // on the screen. Close, at a hold's spacing; open on to the places.
      kind: "orbit",
      beats: 8 - CHAIN_JOIN_BEAT,
      axis: "midpoint",
      turns: 1,
      sense: "partner-on-left",
      facing: "couple",
      radiusPx: HOLD_SPACING_PX / 2,
      rateMaxTurnsPerBeat: 0.25,
      openPx: 20,
      holds: [{ hold: "courtesy", hand: "left", with: "partner" }],
    },
  ],
  look: [{ role: "self", at: "partner", elseAt: "ahead" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
