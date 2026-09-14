import { describe, expect, it } from "vitest";
import {
  ARM_REACH_PX,
  CM_PER_PX,
  FOOT_SWING_PX,
  FOREARM_PX,
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  RENDERING_CONTRACT,
  SEAM_BEATS,
  SHOULDER_WIDTH_PX,
  TORSO_SWAY_DEG,
  UPPER_ARM_PX,
} from "./RenderingContract.js";

/**
 * AGENTS.md, "Invariants (rendering contract)": these numbers are unit tests in
 * `@caller/core`, not just numbers in a document. Changing one is a reversal
 * (director rubric E-look), even by a pixel.
 */
describe("the rendering contract", () => {
  it("arms are two fixed 7.5 px bones adding to a 15 px reach", () => {
    expect(UPPER_ARM_PX).toBe(7.5);
    expect(FOREARM_PX).toBe(7.5);
    expect(ARM_REACH_PX).toBe(15);
    expect(UPPER_ARM_PX + FOREARM_PX).toBe(ARM_REACH_PX);
  });

  it("shoulders 11 px, hold spacing 14 px, lines 18 px further apart, 4 cm per px", () => {
    expect(SHOULDER_WIDTH_PX).toBe(11);
    expect(HOLD_SPACING_PX).toBe(14);
    expect(LINE_OFFSET_PX).toBe(18);
    expect(CM_PER_PX).toBe(4);
  });

  it("foot swing +/-2.6 px, torso sway 1.5 degrees, no vertical bounce", () => {
    expect(FOOT_SWING_PX).toBe(2.6);
    expect(TORSO_SWAY_DEG).toBe(1.5);
    expect(RENDERING_CONTRACT.verticalBouncePx).toBe(0);
  });

  it("positions live on the 1/256 px grid and seams last 0.4 beat", () => {
    expect(RENDERING_CONTRACT.positionQuantumPx).toBe(1 / 256);
    expect(SEAM_BEATS).toBe(0.4);
  });
});
