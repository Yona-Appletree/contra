import { HOLD_SPACING_PX } from "@caller/core";
import { describe, expect, it } from "vitest";
import { HEIGHTS } from "../body/Body.js";
import { dist, vec3 } from "../motion/Vec3.js";
import { ALLEMANDE_RISE_PX, allemandeL, allemandeR } from "./allemande.js";
import { hangPoint } from "./free.js";
import type { BodyFrame } from "./HoldPosture.js";

/** Two dancers `HOLD_SPACING_PX` apart on the x axis, each facing the other. */
const pair = (): [BodyFrame, BodyFrame] => {
  const half = HOLD_SPACING_PX / 2;
  return [
    { hip: vec3(-half, 0, HEIGHTS.hipPx), yawDeg: 0, leanDeg: 0, role: "lark" },
    { hip: vec3(half, 0, HEIGHTS.hipPx), yawDeg: 180, leanDeg: 0, role: "robin" },
  ];
};

describe("allemande", () => {
  it("puts both dancers' hands at one shared point", () => {
    const [lark, robin] = pair();
    const a = allemandeR.target(lark, robin, "right");
    const b = allemandeR.target(robin, lark, "right");
    expect(dist(a, b)).toBeCloseTo(0, 12);
    expect(a).toEqual(vec3(0, 0, HEIGHTS.hipPx + ALLEMANDE_RISE_PX));
  });

  it("presses palm to palm: the two normals are opposite", () => {
    const [lark, robin] = pair();
    const a = allemandeR.palmNormal(lark, robin, "right");
    const b = allemandeR.palmNormal(robin, lark, "right");
    expect(a.x * b.x + a.y * b.y + a.z * b.z).toBeCloseTo(-1, 12);
  });

  it("stands the plate up, so the thumbs point up without being told to", () => {
    const [lark, robin] = pair();
    expect(allemandeR.palmNormal(lark, robin, "right").z).toBe(0);
  });

  it("takes the other hand on the left, and is otherwise the same posture", () => {
    const [lark, robin] = pair();
    expect(allemandeL.hand).toBe("left");
    expect(allemandeR.hand).toBe("right");
    expect(allemandeL.swivelDeg).toBe(allemandeR.swivelDeg);
    expect(allemandeL.target(lark, robin, "left")).toEqual(allemandeR.target(lark, robin, "right"));
  });

  it("keeps the elbow down and a tiny bit out, and the bodies a hold apart", () => {
    expect(allemandeR.swivelDeg).toBe(10);
    expect(allemandeR.swivelDeg).toBeGreaterThan(0);
    expect(allemandeR.spacingPx).toBe(HOLD_SPACING_PX);
    expect(allemandeR.contact).toBe("palm");
  });

  it("falls back to the hang when there is nobody on the far end", () => {
    const [lark] = pair();
    expect(allemandeR.target(lark, undefined, "right")).toEqual(hangPoint(lark, "right"));
  });
});
