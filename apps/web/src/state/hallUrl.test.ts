import { describe, expect, it } from "vitest";
import { readSeed } from "./hallUrl.js";

describe("readSeed", () => {
  it("reads a finite ?seed=<n> straight through", () => {
    expect(readSeed(new URLSearchParams("seed=42"))).toBe(42);
    expect(readSeed(new URLSearchParams("seed=-7"))).toBe(-7);
    expect(readSeed(new URLSearchParams("seed=3.5"))).toBe(3.5);
  });

  it("falls back to the date when there is no ?seed=", () => {
    const seed = readSeed(new URLSearchParams(""), new Date("2026-09-14T12:00:00Z"));
    expect(seed).toBe(20260914);
  });

  it("falls back to the date when ?seed= is not a number", () => {
    const seed = readSeed(
      new URLSearchParams("seed=soldiers-joy"),
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(seed).toBe(20260102);
  });

  it("is the same seed for every moment of one UTC day", () => {
    const morning = readSeed(new URLSearchParams(""), new Date("2026-09-14T00:00:01Z"));
    const night = readSeed(new URLSearchParams(""), new Date("2026-09-14T23:59:59Z"));
    expect(morning).toBe(night);
  });

  it("differs from one day to the next, so the evening differs day to day", () => {
    const today = readSeed(new URLSearchParams(""), new Date("2026-09-14T12:00:00Z"));
    const tomorrow = readSeed(new URLSearchParams(""), new Date("2026-09-15T12:00:00Z"));
    expect(today).not.toBe(tomorrow);
  });

  it("reproduces the same seed for the same explicit URL every time", () => {
    const a = readSeed(new URLSearchParams("seed=123"), new Date("2026-01-01T00:00:00Z"));
    const b = readSeed(new URLSearchParams("seed=123"), new Date("2030-12-31T23:59:59Z"));
    expect(a).toBe(b);
  });
});
