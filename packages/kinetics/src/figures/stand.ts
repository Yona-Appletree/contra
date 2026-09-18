import type { FigureIR } from "../ir/Figure.js";

/**
 * **Stand**: the other role's half of a `||` (notes D11) — the larks while
 * the robins walk forward into the wave, the robins while the larks do.
 * Nothing to it: no cast, no hands, stand where you are for the beats and
 * look ahead. The figure before it ramps down into it and the one after
 * pays its own entry from rest, which is what standing still costs.
 */
export const stand: FigureIR = {
  id: "stand",
  params: [{ name: "beats", kind: "number", default: 4 }],
  beats: { nominal: 4, min: 0 },
  pre: { arrangement: [], holds: [] },
  post: { arrangement: [], holds: [] },
  windows: [{ kind: "stand" }],
  look: [{ role: "self", at: "ahead" }],
  elide: "wait",
  casts: {},
};
