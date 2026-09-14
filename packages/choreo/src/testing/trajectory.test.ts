import type { Hand, PoseSample, Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { HandJoinAt } from "./trajectory.js";
import {
  endsOn,
  handsJoined,
  handsStill,
  joinWindow,
  passes,
  sampleTrack,
  shoulderOf,
  staysOnPlace,
  velocity,
  walksBackward,
} from "./trajectory.js";

/**
 * The assertion library, on synthetic motion whose right answer is obvious.
 *
 * Nothing here is a contra. Two dancers walking straight past each other, a
 * dancer backing up, a hand held at a fixed point: the library has to say the
 * right thing about each, and has to say the right thing about the cases that
 * *look* like them and are not.
 */

const pose = (p: Vec2, facing: number, hands: PoseSample["hands"] = { L: "down", R: "down" }) => ({
  p,
  facing,
  look: facing,
  lean: 0,
  hands,
  stepRate: 1,
  buzz: false,
  flare: 0,
  amp: 1,
});

describe("shoulderOf", () => {
  it("agrees with the engine's own left and right", () => {
    // Facing 0 is +x; with y down, the dancer's left is −y.
    expect(shoulderOf(pose([0, 0], 0), [0, -5])).toBe("L");
    expect(shoulderOf(pose([0, 0], 0), [0, 5])).toBe("R");
    expect(shoulderOf(pose([0, 0], 90), [5, 0])).toBe("L");
    expect(shoulderOf(pose([0, 0], 90), [-5, 0])).toBe("R");
  });
});

describe("passes", () => {
  /** `a` walks +x and `b` walks −x, 6 px apart, meeting at the origin. */
  const crossing = sampleTrack(["a", "b"], 4, (id, t) =>
    id === "a" ? pose([-10 + 5 * t, -3], 0) : pose([10 - 5 * t, 3], 180),
  );

  it("sees a pass, and says which shoulder and where", () => {
    const result = passes(crossing, "a", "b", {
      within: 8,
      near: [0, 0],
      nearPx: 1,
      shoulder: "R",
    });
    expect(result.pass).toBe(true);
    expect(result.worst?.value).toBeCloseTo(6, 6);
    expect(result.worst?.beat).toBeCloseTo(2, 6);
  });

  it("fails on the wrong shoulder rather than on the distance", () => {
    const result = passes(crossing, "a", "b", { within: 8, shoulder: "L" });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("on a's R");
  });

  it("fails when they never come close enough", () => {
    expect(passes(crossing, "a", "b", { within: 4 }).pass).toBe(false);
  });

  it("fails when the pass happens somewhere else", () => {
    const result = passes(crossing, "a", "b", { within: 8, near: [40, 0], nearPx: 2 });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("away from where they should");
  });

  it("fails two dancers travelling the same way, however close they get", () => {
    const convoy = sampleTrack(["a", "b"], 4, (id, t) =>
      pose([(id === "a" ? -6 : 0) + 5 * t, 0], 0),
    );
    const result = passes(convoy, "a", "b", { within: 8 });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("velocities agree");
  });
});

describe("walksBackward", () => {
  it("passes a dancer who travels behind themselves", () => {
    const track = sampleTrack(["a"], 2, (_id, t) => pose([-4 * t, 0], 0));
    const result = walksBackward(track, "a", { from: 0, to: 2 });
    expect(result.pass).toBe(true);
    expect(result.worst?.value).toBeCloseTo(-8, 6);
  });

  it("fails a dancer who walks forward", () => {
    const track = sampleTrack(["a"], 2, (_id, t) => pose([4 * t, 0], 0));
    expect(walksBackward(track, "a", { from: 0, to: 2 }).pass).toBe(false);
  });

  it("fails a dancer who slides sideways", () => {
    const track = sampleTrack(["a"], 2, (_id, t) => pose([0, 4 * t], 0));
    const result = walksBackward(track, "a", { from: 0, to: 2 });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("is behind them");
  });

  it("fails a dancer who stands still", () => {
    const track = sampleTrack(["a"], 2, () => pose([0, 0], 0));
    expect(walksBackward(track, "a", { from: 0, to: 2 }).note).toContain("do not walk anywhere");
  });
});

describe("handsJoined and joinWindow", () => {
  const point: Hand = { p: [0, 0], drop: 5 };
  const joins: HandJoinAt[] = [{ a: "a", aSide: "R", b: "b", bSide: "L" }];
  const held = sampleTrack(
    ["a", "b"],
    4,
    (id, t) =>
      pose(
        id === "a" ? [-7, 0] : [7, 0],
        id === "a" ? 0 : 180,
        id === "a" ? { L: "down", R: point } : { L: point, R: "down" },
      ) as PoseSample & { hands: PoseSample["hands"] },
    (t) => (t >= 1 && t <= 3 ? joins : []),
  );

  it("passes one shared floor point", () => {
    expect(handsJoined(held, "a", "R", "b", "L", { from: 1, to: 3 }).pass).toBe(true);
  });

  it("reads the window off the figure's own declared joins, either way round", () => {
    expect(joinWindow(held, "a", "R", "b", "L")).toEqual({ from: 1, to: 3 });
    expect(joinWindow(held, "b", "L", "a", "R")).toEqual({ from: 1, to: 3 });
    expect(joinWindow(held, "a", "L", "b", "R")).toBeUndefined();
  });

  it("fails a hand that is let go", () => {
    const released = sampleTrack(["a", "b"], 4, (id, t) =>
      pose(
        id === "a" ? [-7, 0] : [7, 0],
        id === "a" ? 0 : 180,
        id === "a" ? { L: "down", R: t < 2 ? point : "down" } : { L: point, R: "down" },
      ),
    );
    expect(handsJoined(released, "a", "R", "b", "L", { from: 0, to: 4 }).note).toContain(
      "let go at beat 2",
    );
  });

  it("fails a hand that is not a number, which no maximum would catch", () => {
    const broken = sampleTrack(["a", "b"], 4, (id, t) =>
      pose(
        id === "a" ? [-7, 0] : [7, 0],
        id === "a" ? 0 : 180,
        id === "a"
          ? { L: "down", R: t === 2 ? { p: [NaN, NaN], drop: NaN } : point }
          : { L: point, R: "down" },
      ),
    );
    expect(handsJoined(broken, "a", "R", "b", "L", { from: 0, to: 4 }).note).toContain(
      "not a number",
    );
  });
});

describe("handsStill, staysOnPlace and endsOn", () => {
  it("passes a hand carried along at a fixed place on the body", () => {
    const track = sampleTrack(["a"], 4, (_id, t) =>
      pose([3 * t, 0], 0, { L: "down", R: { p: [3 * t + 2, 4], drop: 6 } }),
    );
    expect(handsStill(track, "a", { from: 0, to: 4 }, 0.01, "R").pass).toBe(true);
  });

  it("fails a hand that drifts on the body even while the dancer stands still", () => {
    const track = sampleTrack(["a"], 4, (_id, t) =>
      pose([0, 0], 0, { L: "down", R: { p: [2, 4 + t], drop: 6 } }),
    );
    const result = handsStill(track, "a", { from: 0, to: 4 }, 0.5, "R");
    expect(result.pass).toBe(false);
    expect(result.worst?.value).toBeCloseTo(4, 6);
  });

  it("measures travel and where the figure leaves somebody", () => {
    const track = sampleTrack(["a"], 4, (_id, t) => pose([2 * t, 0], 0));
    expect(staysOnPlace(track, "a", { from: 0, to: 4 }, 1).pass).toBe(false);
    expect(endsOn(track, "a", { id: "home", p: [8, 0] }, 0.01).pass).toBe(true);
    expect(endsOn(track, "a", { id: "home", p: [0, 0] }, 0.01).pass).toBe(false);
  });

  it("differences velocity centrally, so the ends are not special", () => {
    const track = sampleTrack(["a"], 4, (_id, t) => pose([2 * t, 0], 0));
    expect(velocity(track, "a", track.indexAt(2))[0]).toBeCloseTo(2, 6);
  });
});
