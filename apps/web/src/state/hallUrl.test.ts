import { DEMO_DANCES } from "@caller/contra";
import { medleys, tunes } from "@caller/music";
import { describe, expect, it } from "vitest";
import { lineUpStartBeat } from "../program.js";
import { MAX_LINES, MIN_LINES, readLines, readSeed, readTunePin, startBeatFor } from "./hallUrl.js";

describe("readLines", () => {
  it("is two lines — the shipped hall — with no ?lines= at all", () => {
    expect(readLines(new URLSearchParams(""))).toBe(2);
    expect(readLines(new URLSearchParams("zoom=2&beat=8"))).toBe(2);
  });

  it("reads ?lines=<n> for the third set the URL can ask for", () => {
    expect(readLines(new URLSearchParams("lines=1"))).toBe(1);
    expect(readLines(new URLSearchParams("lines=3"))).toBe(3);
  });

  it("clamps rather than refusing: a hall is the page", () => {
    expect(readLines(new URLSearchParams("lines=0"))).toBe(MIN_LINES);
    expect(readLines(new URLSearchParams("lines=-4"))).toBe(MIN_LINES);
    expect(readLines(new URLSearchParams("lines=99"))).toBe(MAX_LINES);
    expect(readLines(new URLSearchParams("lines=2.6"))).toBe(3);
  });

  it("falls back to two when ?lines= is not a number", () => {
    expect(readLines(new URLSearchParams("lines=lots"))).toBe(2);
  });
});

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

/**
 * U4 requirement 6: the Stage's route reader picks the beat a freshly chosen
 * dance starts at — the beginning of its own line-up, not its dancing beat
 * 0 — while `?beat=` still wins outright, for a golden or a test.
 */
describe("startBeatFor", () => {
  it("is beat 0 with no dance in the route — the ordinary start of an evening", () => {
    expect(startBeatFor(undefined, new URLSearchParams(""))).toBe(0);
  });

  it("is the line-up start for a dance named in the route", () => {
    expect(startBeatFor("butter", new URLSearchParams(""))).toBe(
      lineUpStartBeat(DEMO_DANCES.length),
    );
    // Not beat 0: the whole point is that it does not start dancing yet.
    expect(startBeatFor("butter", new URLSearchParams(""))).not.toBe(0);
  });

  it("still honours an explicit ?beat=, dance or no dance", () => {
    expect(startBeatFor(undefined, new URLSearchParams("beat=8"))).toBe(8);
    expect(startBeatFor("butter", new URLSearchParams("beat=8"))).toBe(8);
  });
});

/**
 * P5, Q2: `?tune=` names either a bundled **tune** (pin that dance) or a
 * **medley** (pin the evening, which is what it has always meant and what the
 * Tunes tab's set links still write).
 */
describe("readTunePin", () => {
  it("reads a bundled tune's slug as a tune pin", () => {
    expect(readTunePin("soldiers-joy", tunes, medleys)).toEqual({
      kind: "tune",
      slug: "soldiers-joy",
    });
  });

  it("reads a medley's slug as a medley pin — the Tunes tab's own #/?tune=<set>", () => {
    expect(readTunePin("reel-set", tunes, medleys)).toEqual({ kind: "medley", slug: "reel-set" });
    expect(readTunePin("kesh-set", tunes, medleys)).toEqual({ kind: "medley", slug: "kesh-set" });
  });

  it("is nothing at all for nonsense, an empty value or no parameter", () => {
    expect(readTunePin("nonsense", tunes, medleys)).toBeUndefined();
    expect(readTunePin("", tunes, medleys)).toBeUndefined();
    expect(readTunePin(undefined, tunes, medleys)).toBeUndefined();
    // "shuffle" is the page's own sentinel, not something either list holds.
    expect(readTunePin("shuffle", tunes, medleys)).toBeUndefined();
  });

  it("prefers a tune when a slug is in both lists — the select is what writes it", () => {
    const pin = readTunePin("both", [{ slug: "both" }], [{ slug: "both" }]);
    expect(pin).toEqual({ kind: "tune", slug: "both" });
  });
});
