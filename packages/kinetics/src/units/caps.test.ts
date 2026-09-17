import { describe, expect, it } from "vitest";
import { POINTS } from "../body/Body.js";
import { CAPS, capsAtTempo } from "./caps.js";
import { tempo } from "./Tempo.js";

describe("CAPS", () => {
  it("has an entry for every body point", () => {
    for (const point of POINTS) {
      expect(CAPS[point]).toBeDefined();
    }
  });

  it("carries the cap table verbatim", () => {
    expect(CAPS.hip).toEqual({ speedCmPerS: 140, accelCmPerS2: 250 });
    expect(CAPS.footL).toEqual({ speedCmPerS: 300, accelCmPerS2: 1200 });
    expect(CAPS.footR).toEqual({ speedCmPerS: 300, accelCmPerS2: 1200 });
    expect(CAPS.handL).toEqual({ speedCmPerS: 220, accelCmPerS2: 900 });
    expect(CAPS.handR).toEqual({ speedCmPerS: 220, accelCmPerS2: 900 });
    expect(CAPS.shoulderL).toEqual({ speedCmPerS: 170, accelCmPerS2: 350 });
    expect(CAPS.shoulderR).toEqual({ speedCmPerS: 170, accelCmPerS2: 350 });
    expect(CAPS.elbowL).toEqual({ speedCmPerS: 200, accelCmPerS2: 800 });
    expect(CAPS.elbowR).toEqual({ speedCmPerS: 200, accelCmPerS2: 800 });
    expect(CAPS.head).toEqual({ speedCmPerS: 170, accelCmPerS2: 350 });
  });
});

describe("capsAtTempo", () => {
  it("converts the hand's cap to px/beat and px/beat² at 112 bpm", () => {
    const at = capsAtTempo(tempo(112));
    expect(at.handL.speedPxPerBeat).toBeCloseTo(29.46, 1);
    expect(at.handL.accelPxPerBeat2).toBeCloseTo(64.6, 1);
  });
});
