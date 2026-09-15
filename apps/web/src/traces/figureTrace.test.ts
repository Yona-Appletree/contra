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
    const plain = tileByKey(figureTiles(), "hey")!;
    // `weavePx` is how far each dancer swings off the middle of the weave, so
    // overriding it moves the ink and nothing else. The hey is also the one
    // figure the registry still owns outright — the carriers and the gatherers
    // are interpreted definitions, which come in past the override merge.
    const tighter = tileByKey(figureTiles({ hey: { weavePx: 4 } }), "hey")!;
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
