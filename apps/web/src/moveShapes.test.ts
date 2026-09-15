import { describe, expect, it } from "vitest";
import { moveShapes } from "./moveShapes.js";
import { moveEntries } from "./moveCatalogue.js";

/**
 * **The shapes are listed apart from the figures** (DD41, DD42's first step).
 *
 * The user struck the `diamond` figure out of the library — *"its not a move.
 * its a place setup"* — so the page's own list of moves must not hold a shape,
 * and its list of shapes must hold the diamond.
 */
describe("the shapes on the Moves page", () => {
  const shapes = moveShapes();

  it("lists the diamond as a shape and not as a figure", () => {
    expect(shapes.map((shape) => shape.kind)).toContain("diamond");
    expect(moveEntries().map((entry) => entry.id)).not.toContain("diamond");
  });

  it("says what each shape is, in a caller's words", () => {
    for (const shape of shapes) {
      expect(shape.title.length, shape.kind).toBeGreaterThan(0);
      expect(shape.blurb, shape.kind).toMatch(/^[A-Z].*\.$/s);
    }
  });

  it("reads which figures form a shape off their own ends", () => {
    const wave = shapes.find((shape) => shape.kind === "wave")!;
    expect(wave.formedBy).toContain("balance-wave");
    // Nothing forms a diamond: a figure dances *into* one, and the call says so.
    expect(shapes.find((shape) => shape.kind === "diamond")!.formedBy).toEqual([]);
  });

  it("reads which calls land in a shape off the record's own `form` clauses", () => {
    const diamond = shapes.find((shape) => shape.kind === "diamond")!;
    expect(diamond.landedIn.map((use) => use.slug)).toContain("jeremy-corners");
    expect(diamond.landedIn.every((use) => use.at === "point")).toBe(true);
  });
});
