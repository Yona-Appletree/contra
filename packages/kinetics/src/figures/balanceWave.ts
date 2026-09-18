import type { FigureIR } from "../ir/Figure.js";
import { balance } from "./balance.js";
import { WAVE_HOLDS } from "./formWave.js";

/**
 * **Balance the wave** (Robins on a Wire's A2 and B1): in the wave you
 * formed, the same hands, the balance — forward on 1, back on 3, a close on
 * 4 — with the whole line joined along itself, everybody facing the opposite
 * way to the dancers beside them.
 *
 * `pre` is `form-wave`'s `post`, so the hands are **carried** and the seam
 * costs nothing; the body is the balance's own intrinsic window, reused
 * line for line; `post` **releases** both hands (D13, as the allemande's
 * does), because what follows — an allemande right with the robin on one
 * side, a shift — takes a hand with somebody else or with nobody, and a
 * hold the `post` kept would never be let go. One-handed at the ends by the
 * cast rule, as `form-wave` is.
 *
 * The rock is the balance's three px. The old library's wave balanced one
 * px (`packages/contra/src/library/figures/balance-wave.ts`, the user's
 * FR-A2: *"people don't move past each other when balancing"*) because two
 * dancers facing opposite ways shear the line by twice the rock; here the
 * hand is at the midpoint of the two hips, which the shear does not move,
 * and the number is left for G1's eye.
 */
export const balanceWave: FigureIR = {
  id: "balance-wave",
  params: [
    { name: "right", kind: "dancer", role: "right" },
    { name: "left", kind: "dancer", role: "left" },
    { name: "beats", kind: "number", default: 4 },
  ],
  beats: balance.beats,
  pre: { arrangement: [], holds: WAVE_HOLDS },
  post: { arrangement: [], holds: [] },
  windows: balance.windows,
  look: [{ role: "self", at: "ahead" }],
  elide: "stretch",
  casts: { right: "free", left: "free" },
};
