import { describe, expect, it } from "vitest";
import { FONT } from "../font/Font.js";
import { LINE_ADVANCE_PX } from "../font/glyphs.js";
import type { World } from "../renderer/World.js";
import {
  BUBBLE_BORDER,
  BUBBLE_MARGIN_PX,
  BUBBLE_MAX_COLS,
  BUBBLE_PADDING_PX,
  BUBBLE_PAPER,
  drawBubble,
  layoutBubble,
  wrapText,
} from "./drawBubble.js";

const WORLD: World = { w: 268, h: 282, zoom: 1 };

describe("wrapText", () => {
  it("breaks at spaces and never exceeds the column count", () => {
    const lines = wrapText("NEIGHBORS BALANCE & SWING", BUBBLE_MAX_COLS);
    expect(lines).toEqual(["NEIGHBORS BALANCE &", "SWING"]);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(BUBBLE_MAX_COLS);
  });

  it("keeps a short call on one line", () => {
    expect(wrapText("ROBINS CHAIN", BUBBLE_MAX_COLS)).toEqual(["ROBINS CHAIN"]);
  });

  it("hard-breaks a word longer than the bubble rather than losing it", () => {
    expect(wrapText("SUPERCALIFRAGILISTIC", 8)).toEqual(["SUPERCAL", "IFRAGILI", "STIC"]);
  });

  it("collapses runs of whitespace and survives an empty call", () => {
    expect(wrapText("  LONG   LINES  ", BUBBLE_MAX_COLS)).toEqual(["LONG LINES"]);
    expect(wrapText("", BUBBLE_MAX_COLS)).toEqual([""]);
  });
});

describe("layoutBubble", () => {
  it("is as wide as its widest line plus padding and border", () => {
    const box = layoutBubble(FONT, "ROBINS CHAIN", [0, 0]);
    expect(box.lines).toEqual(["ROBINS CHAIN"]);
    // 12 glyphs at a 5 px advance, less the trailing gap, plus 2 px of padding
    // each side and 1 px of border each side.
    expect(box.w).toBe(12 * 5 - 1 + 2 * BUBBLE_PADDING_PX + 2);
    expect(box.h).toBe(LINE_ADVANCE_PX - 1 + 2 * BUBBLE_PADDING_PX + 2);
  });

  it("sits above the anchor and is centred on it", () => {
    const box = layoutBubble(FONT, "HANDS FOUR FROM THE TOP", [0, 40]);
    expect(box.y + box.h).toBeLessThan(40);
    expect(Math.abs(box.x + box.w / 2)).toBeLessThanOrEqual(0.5);
  });

  it("clamps inside the world when the caller stands near an edge", () => {
    const left = layoutBubble(FONT, "HANDS FOUR FROM THE TOP", [-130, -130], { world: WORLD });
    expect(left.x).toBeGreaterThanOrEqual(-WORLD.w / 2 + BUBBLE_MARGIN_PX);
    expect(left.y).toBeGreaterThanOrEqual(-WORLD.h / 2 + BUBBLE_MARGIN_PX);

    const right = layoutBubble(FONT, "HANDS FOUR FROM THE TOP", [130, 130], { world: WORLD });
    expect(right.x + right.w).toBeLessThanOrEqual(WORLD.w / 2 - BUBBLE_MARGIN_PX);
    expect(right.y + right.h).toBeLessThanOrEqual(WORLD.h / 2 - BUBBLE_MARGIN_PX);
  });

  it("puts a `left` tail's box to the right of the anchor, vertically centred", () => {
    const box = layoutBubble(FONT, "ROBINS CHAIN", [0, 0], { tail: "left" });
    expect(box.x).toBeGreaterThan(0);
    expect(Math.abs(box.y + box.h / 2)).toBeLessThanOrEqual(0.5);
  });

  it("grows a line at a time as the call gets longer", () => {
    const one = layoutBubble(FONT, "ROBINS CHAIN", [0, 0]);
    const two = layoutBubble(FONT, "NEIGHBORS BALANCE & SWING", [0, 0]);
    expect(two.lines).toHaveLength(2);
    expect(two.h - one.h).toBe(LINE_ADVANCE_PX);
  });
});

describe("drawBubble", () => {
  it("draws only inside the box it reports, plus the tail and the shadow", () => {
    const g = recorder();
    const box = drawBubble(g.ctx, FONT, "HANDS FOUR FROM THE TOP", [0, 40], { world: WORLD });
    expect(g.rects.length).toBeGreaterThan(10);
    for (const { x, y, w, h } of g.rects) {
      expect(x).toBeGreaterThanOrEqual(box.x - 3);
      expect(y).toBeGreaterThanOrEqual(box.y);
      expect(x + w).toBeLessThanOrEqual(box.x + box.w + 5);
      expect(y + h).toBeLessThanOrEqual(box.y + box.h + 5);
    }
  });

  it("leaves the four corners of the box unpainted, so it reads as rounded", () => {
    const g = recorder();
    const box = drawBubble(g.ctx, FONT, "ROBINS CHAIN", [0, 40]);
    const corners: Array<[number, number]> = [
      [box.x, box.y],
      [box.x + box.w - 1, box.y],
      [box.x, box.y + box.h - 1],
      [box.x + box.w - 1, box.y + box.h - 1],
    ];
    // The shadow is offset a px down and right, so it does reach under the
    // bottom corners; the bubble's own border and paper must not.
    const bubble = g.rects.filter((r) => r.style === BUBBLE_BORDER || r.style === BUBBLE_PAPER);
    for (const [cx, cy] of corners) {
      const covered = bubble.some(
        ({ x, y, w, h }) => cx >= x && cx < x + w && cy >= y && cy < y + h,
      );
      expect(covered, `corner ${cx},${cy} was painted`).toBe(false);
    }
  });

  it("says nothing in a bubble with no text, and still draws a box", () => {
    const g = recorder();
    const box = drawBubble(g.ctx, FONT, "", [0, 0]);
    expect(box.lines).toEqual([""]);
    expect(g.rects.length).toBeGreaterThan(0);
  });
});

interface Fill {
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
}

/** A context that records the fills a draw made, for tests with no canvas. */
function recorder(): { ctx: Parameters<typeof drawBubble>[0]; rects: Fill[] } {
  const rects: Fill[] = [];
  const ctx = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, style: ctx.fillStyle });
    },
  };
  return { ctx: ctx as unknown as Parameters<typeof drawBubble>[0], rects };
}
