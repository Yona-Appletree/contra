import { poseAt } from "@caller/choreo";
import { DEMO_DANCES, createContraRegistry } from "@caller/contra";
import { describe, expect, test } from "vitest";
import type { GalleryTile } from "./galleryTiles.js";
import { TILE_MARGIN_PX, figureTiles, galleryTiles, seamTiles, tileByKey } from "./galleryTiles.js";

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

/** Every beat of a tile's looping window, the last one included. */
function* window(tile: GalleryTile): Generator<number> {
  for (let t = 0; t < tile.window.beats; t += STEP) yield tile.window.start + t;
  yield tile.window.start + tile.window.beats;
}
