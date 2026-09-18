import { SHOULDER_WIDTH_PX } from "@caller/core";
import type { FigureIR } from "../ir/Figure.js";

/**
 * **Shoulder round** — a gypsy (Robins on a Wire's B2: "(8) Partner right
 * shoulder round"): come in beside each other, the named shoulders toward
 * each other, and walk forward round the point between you with your eyes
 * on each other the whole way. No hands. The user, on the old library's
 * version (`packages/contra/src/library/figures/shoulder-round.ts`): *"the
 * couples stand beside each other, eyes locked, and orbit around the center
 * point. its not face-to-face."*
 *
 * An orbit of the pair's midpoint on the **tangent** — the body faces the
 * way it is going, so the named shoulder is on the inside — at half a
 * shoulder's width, which puts the two shoulder to shoulder; the **head**
 * does the looking (`look: partner`), not the body. `shoulder` sets the
 * sense: a right shoulder round goes the way an allemande right does.
 * `amount-quarters` is quarter turns, so once round is four.
 */
export const shoulderRound: FigureIR = {
  id: "shoulder-round",
  params: [
    { name: "with", kind: "dancer" },
    { name: "shoulder", kind: "enum", choices: ["right", "left"], default: "right" },
    { name: "amount-quarters", kind: "number", default: 4 },
    { name: "beats", kind: "number", default: 8 },
  ],
  beats: { nominal: 8, min: 4 },
  pre: {
    arrangement: [
      { kind: "facing", who: "self", toward: "partner" },
      {
        kind: "apart",
        who: "self",
        from: "partner",
        minPx: SHOULDER_WIDTH_PX,
        maxPx: SHOULDER_WIDTH_PX,
      },
    ],
    holds: [],
  },
  post: {
    arrangement: [{ kind: "facing", who: "self", toward: "partner" }],
    holds: [],
  },
  windows: [
    {
      kind: "orbit",
      axis: "midpoint",
      turns: { param: "amount-quarters", scale: 0.25 },
      sense: {
        param: "shoulder",
        cases: { right: "partner-on-right", left: "partner-on-left" },
      },
      facing: "tangent",
      radiusPx: SHOULDER_WIDTH_PX / 2,
      rateMaxTurnsPerBeat: 0.25,
    },
  ],
  look: [{ role: "self", at: "partner" }],
  elide: "stretch",
  casts: { partner: "stand" },
};
