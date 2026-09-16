import { REEL } from "@caller/core";
import { describe, expect, it } from "vitest";
import { barAt, keyName, positionText } from "./tuneText.js";

const reel = { meter: REEL, beatsPerCycle: 64 as const };

describe("keyName", () => {
  it("says the mode a player would say", () => {
    expect(keyName("D")).toBe("D major");
    expect(keyName("Em")).toBe("E minor");
    expect(keyName("AMix")).toBe("A mixolydian");
    expect(keyName("Bb")).toBe("B♭ major");
    expect(keyName("F#m")).toBe("F♯ minor");
    expect(keyName("Edor")).toBe("E dorian");
  });

  it("leaves a key it cannot read alone", () => {
    expect(keyName("none")).toBe("none");
  });
});

describe("positionText and barAt", () => {
  it("counts in below beat 0, then names the phrase and the bar", () => {
    expect(positionText(reel, -4)).toBe("counting in");
    expect(positionText(reel, 0)).toBe("A1 · bar 1");
    expect(positionText(reel, 15)).toBe("A1 · bar 8");
    expect(positionText(reel, 16)).toBe("A2 · bar 1");
    expect(positionText(reel, 63)).toBe("B2 · bar 8");
  });

  it("wraps every cycle", () => {
    expect(barAt(reel, 64)).toBe(0);
    expect(barAt(reel, 130)).toBe(1);
    expect(positionText(reel, 64 + 32)).toBe("B1 · bar 1");
  });
});
