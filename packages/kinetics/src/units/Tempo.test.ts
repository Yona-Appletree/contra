import { describe, expect, it } from "vitest";
import { pxPerBeat, pxPerBeat2, tempo } from "./Tempo.js";

describe("Tempo", () => {
  it("converts a speed in cm/s to px/beat at 112 bpm", () => {
    expect(pxPerBeat(tempo(112), 140)).toBeCloseTo(18.75, 9);
  });

  it("converts an acceleration in cm/s² to px/beat² at 112 bpm", () => {
    expect(pxPerBeat2(tempo(112), 250)).toBeCloseTo(17.9, 1);
  });
});
