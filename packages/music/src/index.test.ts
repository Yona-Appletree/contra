import { createClock } from "@caller/core";
import { describe, expect, it } from "vitest";
import { Card, createPlayer, Notation, tunes } from "./index.js";

describe("@caller/music", () => {
  it("exports the real API: player, tunes, components", () => {
    expect(typeof createPlayer).toBe("function");
    expect(typeof Card).toBe("function");
    expect(typeof Notation).toBe("function");
    expect(tunes.length).toBeGreaterThanOrEqual(3);
  });

  it("no longer exports a clock of its own: the clock is `@caller/core`'s", async () => {
    const surface = await import("./index.js");
    expect("createClock" in surface).toBe(false);
    expect(typeof createClock).toBe("function");
  });
});
