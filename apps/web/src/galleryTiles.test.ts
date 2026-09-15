import { dist } from "@caller/core";
import { poseAt } from "@caller/choreo";
import { DEMO_DANCES, createContraRegistry } from "@caller/contra";
import { describe, expect, test } from "vitest";
import type { GalleryTile } from "./galleryTiles.js";
import {
  TILE_MARGIN_PX,
  figureTiles,
  galleryTiles,
  groupedTiles,
  maxTileWorld,
  seamTiles,
  tileByKey,
  tileMetrics,
} from "./galleryTiles.js";

/** Fine enough to catch a frame the renderer would have clipped. */
const STEP = 0.125;

const figures = figureTiles();
const seams = seamTiles();

describe("the figure tiles", () => {
  test("cover every figure the registry holds", () => {
    expect(figures.map((t) => t.key).sort()).toEqual(createContraRegistry().ids());
  });

  test.each(figures)(
    "show the middle of three instances, or the middle of a standing bracket: $key",
    (tile) => {
      // Whatever the bracket, the window is exactly one instance of the figure
      // and there is timeline on both sides of it unless the tile says why not.
      const events = tile.timeline.figures();
      const shown = events.find(
        (e) => e.start === tile.window.start && e.end === tile.window.start + tile.window.beats,
      );
      expect(shown, `${tile.key}: no event fills the window`).toBeDefined();
      if (tile.key !== "wait-out") {
        expect(tile.window.start, `${tile.key}: nothing runs before the window`).toBeGreaterThan(0);
      }
    },
  );
});

describe("the seam tiles", () => {
  test("are every distinct figure pair the ten dances dance", () => {
    const wanted = new Set<string>();
    for (const dance of DEMO_DANCES) {
      const flat = dance.phrases.flatMap((p) => p.figures);
      for (let i = 0; i < flat.length; i++) {
        wanted.add(`${flat[i]!.figure}--${flat[(i + 1) % flat.length]!.figure}`);
      }
    }
    expect(new Set(seams.map((t) => t.key))).toEqual(wanted);
  });

  test.each(seams)("put the seam where the first figure ends: $key", (tile) => {
    expect(tile.seamAt, tile.key).toBe(tile.calls[0]!.beats);
    expect(tile.window.beats, tile.key).toBe(tile.calls[0]!.beats + tile.calls[1]!.beats);
  });
});

describe("every tile", () => {
  const tiles = galleryTiles();

  test("has a unique deep-link key", () => {
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });

  test.each(tiles)("can be looked up by that key: $key", (tile) => {
    expect(tileByKey(tiles, tile.key)).toBe(tile);
  });

  // One case per tile rather than one loop over all of them: `poseAt` plans
  // its figure from scratch on every sample (a later milestone memoises it),
  // so all tiles in a single case shares one 5s vitest budget and that budget
  // is tight on a slower CI runner even though every individual tile is fast.
  // Splitting costs nothing in coverage — every dancer of every tile is still
  // checked at every sampled beat of its window — it just gives each tile its
  // own budget.
  test.each(tiles)("gives every dancer a pose across its whole window: $key", (tile) => {
    for (const dancer of tile.timeline.dancers()) {
      for (const t of window(tile)) {
        expect(() => poseAt(tile.timeline, dancer, t), `${tile.key} @ ${t}`).not.toThrow();
      }
    }
  });

  // Same reasoning as the pose-coverage case above: one case per tile so a
  // slow CI runner isn't budgeted against all ~52 tiles in a single 5s case.
  test.each(tiles)("is drawn on a world its dancers stay inside: $key", (tile) => {
    const limit = [tile.world.w / 2 - TILE_MARGIN_PX, tile.world.h / 2 - TILE_MARGIN_PX];
    for (const dancer of tile.timeline.dancers()) {
      for (const t of window(tile)) {
        const p = poseAt(tile.timeline, dancer, t).p;
        expect(Math.abs(p[0]), `${tile.key} x @ ${t}`).toBeLessThanOrEqual(limit[0]! + 1e-6);
        expect(Math.abs(p[1]), `${tile.key} y @ ${t}`).toBeLessThanOrEqual(limit[1]! + 1e-6);
      }
    }
  });
});

describe("what a row reads off a tile (U2)", () => {
  const tiles = galleryTiles();

  test("files every seam under a figure that has a row of its own", () => {
    const groups = groupedTiles(tiles);
    // Every group is headed by a figure — no seam is orphaned into one — and
    // between them the groups hold every tile exactly once.
    expect(groups.every((g) => g.figure.kind === "figure")).toBe(true);
    expect(groups.flatMap((g) => [g.figure, ...g.seams]).length).toBe(tiles.length);
    expect(new Set(groups.flatMap((g) => [g.figure, ...g.seams]))).toEqual(new Set(tiles));
  });

  test("gives the tile column one width, wide enough for the widest world", () => {
    const widest = maxTileWorld(tiles);
    expect(widest.w).toBe(Math.max(...tiles.map((t) => t.world.w)));
    expect(tiles.every((t) => t.world.w <= widest.w)).toBe(true);
  });

  // One case per tile, as above: `tileMetrics` is a 1/32-beat sweep of every
  // dancer's arms and all ~54 of them in one case share one vitest budget.
  test.each(tiles)("has the figure's own prose and six measured numbers: $key", (tile) => {
    for (const call of tile.calls) {
      expect(call.describe, `${tile.key}: ${call.figure} has no describe`).toBeTruthy();
    }
    const metrics = tileMetrics(tile);
    expect(metrics.map((m) => m.label)).toEqual([
      "hand",
      "elbow/hand",
      "height",
      "dip",
      "flips",
      "NaN",
    ]);
    // Every one of them is a number that was actually measured, and every one
    // says what its bound is — a chip with an empty tooltip is a chip nobody
    // can act on.
    for (const m of metrics) {
      expect(m.value, `${tile.key}/${m.label}`).not.toMatch(/NaN|undefined/);
      expect(m.detail.length, `${tile.key}/${m.label}`).toBeGreaterThan(0);
    }
  });
});

describe("`?chain=`'s registry override (F9)", () => {
  const overrides = { "robins-chain": { stepInPx: 8 } };

  test("changes nothing when no figure is named", () => {
    expect(figureTiles({}).map((t) => t.key)).toEqual(figureTiles().map((t) => t.key));
  });

  test("reaches the figure's own tile", () => {
    const plain = tileByKey(figureTiles(), "robins-chain")!;
    const overridden = tileByKey(figureTiles(overrides), "robins-chain")!;
    expect(moved(plain, overridden)).toBe(true);
  });

  test("reaches every seam the figure is under, and leaves the others alone", () => {
    const plainSeams = seamTiles();
    const overriddenSeams = seamTiles(overrides);
    for (const plain of plainSeams) {
      const overridden = tileByKey(overriddenSeams, plain.key)!;
      const involvesChain = plain.calls.some((c) => c.figure === "robins-chain");
      expect(moved(plain, overridden), plain.key).toBe(involvesChain);
    }
  });
});

/** Whether any dancer of `a` samples to a different point than in `b`, at any beat of `a`'s window. */
function moved(a: GalleryTile, b: GalleryTile): boolean {
  for (const dancer of a.timeline.dancers()) {
    for (const t of window(a)) {
      if (dist(poseAt(a.timeline, dancer, t).p, poseAt(b.timeline, dancer, t).p) > 1e-9)
        return true;
    }
  }
  return false;
}

/** Every beat of a tile's looping window, the last one included. */
function* window(tile: GalleryTile): Generator<number> {
  for (let t = 0; t < tile.window.beats; t += STEP) yield tile.window.start + t;
  yield tile.window.start + tile.window.beats;
}
