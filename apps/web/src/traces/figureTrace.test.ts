import { describe, expect, it } from "vitest";
import { figureTiles, tileByKey } from "../galleryTiles.js";
import { figureTrace } from "./figureTrace.js";

describe("figureTrace's cache (F9 regression)", () => {
  it("does not serve one build's trace for another sharing the same tile key", () => {
    // Two builds of the same figure, same `key` ("hey"), different `Timeline`s
    // — exactly what a figure-defaults override does to the Moves gallery when
    // the tiles are rebuilt at new numbers without a full page reload. A cache
    // keyed on `tile.key` alone would hand the second call the first call's
    // trace; a `WeakMap` keyed on the tile object itself must not.
    // On the **old** engine, where the registry still owns the figure outright:
    // an interpreted definition arrives in the registry past the override merge,
    // so `?chain=`-style tuning reaches a coded figure and nothing else (M4's
    // finding). M5 deleted the hey, which was the last figure the merge could
    // reach on the new engine, so this reads a coded one on the old one. What is
    // under test is the cache's **key**, not the override.
    const plain = tileByKey(figureTiles({}, "old"), "long-lines")!;
    // `forwardPx` is how far each dancer walks forward and back, so overriding
    // it moves the ink and nothing else — and no demo call of long lines writes
    // its own, which a call would otherwise win.
    const tighter = tileByKey(
      figureTiles({ "long-lines": { forwardPx: 4 } }, "old"),
      "long-lines",
    )!;
    expect(plain).not.toBe(tighter);
    expect(plain.key).toBe(tighter.key);

    const plainTrace = figureTrace(plain);
    const tighterTrace = figureTrace(tighter);
    expect(tighterTrace).not.toBe(plainTrace);
    expect(plainTrace.pens.length).toBeGreaterThan(0);
    expect(tighterTrace.pens.map((p) => p.samples)).not.toEqual(
      plainTrace.pens.map((p) => p.samples),
    );

    // Calling it again on the very same tile object still hits the cache: the
    // fix is about identity, not about turning caching off.
    expect(figureTrace(plain)).toBe(plainTrace);
  });
});
