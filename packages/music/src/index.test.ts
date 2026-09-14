import { describe, expect, it } from "vitest";
import { Card, createClock, createPlayer, Notation, tunes } from "./index.js";

describe("@caller/music", () => {
  it("exports the real API: clock, player, tunes, components", () => {
    expect(typeof createClock).toBe("function");
    expect(typeof createPlayer).toBe("function");
    expect(typeof Card).toBe("function");
    expect(typeof Notation).toBe("function");
    expect(tunes.length).toBeGreaterThanOrEqual(3);
  });
});
