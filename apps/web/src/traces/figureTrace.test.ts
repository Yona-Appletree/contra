import { describe, expect, it } from "vitest";
import { figureTiles, tileByKey } from "../galleryTiles.js";
import { figureTrace } from "./figureTrace.js";

describe("figureTrace's cache (F9: `?chain=` regression)", () => {
  it("does not serve one candidate's trace for another sharing the same tile key", () => {
    // Two builds of the same figure, same `key` ("robins-chain"), different
    // `Timeline`s — exactly what `?chain=` does to the Moves gallery when the
    // reader flips from one candidate to another without a full page reload.
    // A cache keyed on `tile.key` alone would hand the second call the first
    // call's trace; a `WeakMap` keyed on the tile object itself must not.
    const plain = tileByKey(figureTiles(), "robins-chain")!;
    const stepIn = tileByKey(figureTiles({ "robins-chain": { stepInPx: 8 } }), "robins-chain")!;
    expect(plain).not.toBe(stepIn);
    expect(plain.key).toBe(stepIn.key);

    const plainTrace = figureTrace(plain);
    const stepInTrace = figureTrace(stepIn);
    expect(stepInTrace).not.toBe(plainTrace);
    expect(plainTrace.pens.length).toBeGreaterThan(0);
    expect(stepInTrace.pens.map((p) => p.samples)).not.toEqual(
      plainTrace.pens.map((p) => p.samples),
    );

    // Calling it again on the very same tile object still hits the cache: the
    // fix is about identity, not about turning caching off.
    expect(figureTrace(plain)).toBe(plainTrace);
  });
});
