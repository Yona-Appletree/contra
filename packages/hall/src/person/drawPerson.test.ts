import type { PoseSample } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { Ctx2D } from "../renderer/Ctx2D.js";
import { OUTLINE_COLOUR } from "../renderer/Ctx2D.js";
import { drawArms, forearmOverSleeve } from "./drawPerson.js";
import { layoutDancer } from "./layoutDancer.js";
import { createPerson } from "./Person.js";

const person = createPerson({ id: "a", role: "lark", seed: 1, skirt: false });

const pose = (extra: Partial<PoseSample> = {}): PoseSample => ({
  p: [0, 0],
  facing: 0,
  look: 0,
  lean: 0,
  hands: { L: "down", R: "down" },
  stepRate: 1,
  buzz: false,
  flare: 0,
  amp: 0,
  ...extra,
});

/** One stroked or filled shape, in the order it was drawn. */
interface Call {
  kind: "stroke" | "fill";
  colour: string;
  width: number;
}

/**
 * The smallest thing that satisfies {@link Ctx2D} and remembers what order it
 * was asked to paint in. `seg` strokes, `circ`/`ell` fill (and stroke first
 * when outlined), which is all the arm drawing does.
 */
function recorder(): { g: Ctx2D; calls: Call[] } {
  const calls: Call[] = [];
  const g = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "round" as CanvasLineCap,
    globalAlpha: 1,
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    fill() {
      calls.push({ kind: "fill", colour: String(g.fillStyle), width: 0 });
    },
    stroke() {
      calls.push({ kind: "stroke", colour: String(g.strokeStyle), width: g.lineWidth });
    },
    save() {},
    restore() {},
    clip() {},
    fillRect() {},
    clearRect() {},
    setTransform() {},
  };
  return { g, calls };
}

/** Just the two bone strokes of the left arm, in the order they were painted. */
function bones(calls: Call[]): string[] {
  const a = person.appearance;
  return calls
    .filter(
      (c) =>
        c.kind === "stroke" &&
        c.colour !== OUTLINE_COLOUR &&
        (c.colour === a.shirt || c.colour === a.skin),
    )
    .map((c) => (c.colour === a.shirt ? "sleeve" : "forearm"));
}

describe("drawArms", () => {
  it("draws the upper arm in the shirt colour and the forearm in skin", () => {
    const { g, calls } = recorder();
    drawArms(g, layoutDancer({ person, pose: pose() }, 0));
    const a = person.appearance;
    // Two arms, each one shirt-coloured bone and one skin-coloured bone.
    const strokes = calls.filter((c) => c.kind === "stroke");
    expect(strokes.filter((c) => c.colour === a.shirt)).toHaveLength(2);
    expect(strokes.filter((c) => c.colour === a.skin)).toHaveLength(2);
    expect(a.shirt).not.toBe(a.skin);
  });

  it("draws the sleeve over the forearm for a hand that hangs", () => {
    const layout = layoutDancer({ person, pose: pose() }, 0);
    for (const arm of layout.arms) {
      expect(arm.handZ).toBeLessThan(arm.elbowZ);
      expect(forearmOverSleeve(arm)).toBe(false);
    }
    const { g, calls } = recorder();
    drawArms(g, layout);
    expect(bones(calls)).toEqual(["forearm", "sleeve", "forearm", "sleeve"]);
  });

  it("draws the forearm over the sleeve for a hand raised above the elbow", () => {
    const high = { p: [6, 0] as const, drop: 0 };
    const layout = layoutDancer({ person, pose: pose({ hands: { L: high, R: high } }) }, 0);
    for (const arm of layout.arms) {
      expect(arm.handZ).toBeGreaterThan(arm.elbowZ);
      expect(forearmOverSleeve(arm)).toBe(true);
    }
    const { g, calls } = recorder();
    drawArms(g, layout);
    expect(bones(calls)).toEqual(["sleeve", "forearm", "sleeve", "forearm"]);
  });

  it("lays the outlines down first, so neither bone's outline cuts the other's fill", () => {
    const { g, calls } = recorder();
    drawArms(g, layoutDancer({ person, pose: pose() }, 0));
    const a = person.appearance;
    const firstBone = calls.findIndex((c) => c.colour === a.shirt || c.colour === a.skin);
    const outlinesBefore = calls
      .slice(0, firstBone)
      .filter((c) => c.colour === OUTLINE_COLOUR).length;
    // One arm's outlines: upper arm, forearm, hand ring.
    expect(outlinesBefore).toBe(3);
  });
});
