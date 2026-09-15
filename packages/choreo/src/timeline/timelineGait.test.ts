import { describe, expect, it } from "vitest";
import type { EndPose } from "../figure/FigureDef.js";
import { FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX, FOOT_SWING_PX } from "@caller/core";
import type { Vec2 } from "@caller/core";
import { createFigureRegistry } from "../figure/FigureDef.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import { createGroup } from "../group/Group.js";
import { SQUARE, squareStations } from "../testing/square.js";
import { frame } from "../formation/Frame.js";
import type { FigureEvent, Timeline } from "./Timeline.js";
import { createTimeline } from "./Timeline.js";
import { poseAt } from "./poseAt.js";

/**
 * The timeline's gait (M10), on the square fixture: two figures back to back,
 * so the seam is a real one and the plants either side of it are on one path.
 */

const STEP = 1 / 32;
const REST_L: Vec2 = [FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX];
const REST_R: Vec2 = [FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX];
const offset = (foot: Vec2, rest: Vec2): number => Math.hypot(foot[0] - rest[0], foot[1] - rest[1]);

const group = () =>
  createGroup(
    {
      id: "g",
      kind: "set",
      frame: frame([0, 0], 90),
      stations: squareStations(),
      members: Object.fromEntries(squareStations().map((s) => [s.id, `d-${s.id}`])),
      couples: [],
    },
    SQUARE.roleSet,
  );

/** One walk-to-station leg, `to` a station's place, over `[start, end]`. */
const leg = (
  start: number,
  end: number,
  dancer: string,
  endPlaces: Record<string, EndPose>,
  startPlaces: Record<string, EndPose> = {},
): FigureEvent => ({
  kind: "figure",
  group: "g",
  figure: "walk-to-station",
  params: {
    beats: end - start,
    to: {},
    from: {},
    origins: {},
    startPlaces,
    endPlaces,
    turn: {},
    bowPx: 0,
  },
  bindings: { "1L": dancer },
  start,
  end,
});

/** One foot's world position: where a plant is actually a plant. */
function footAt(t: Timeline, beat: number, side: "L" | "R"): Vec2 {
  const pose = poseAt(t, "walker", beat);
  const feet = pose.feet ?? { L: REST_L, R: REST_R };
  const rad = (pose.facing * Math.PI) / 180;
  const d: Vec2 = [Math.cos(rad), Math.sin(rad)];
  const r: Vec2 = [-d[1], d[0]];
  const local = feet[side];
  return [
    pose.p[0] + d[0] * local[0] + r[0] * local[1],
    pose.p[1] + d[1] * local[0] + r[1] * local[1],
  ];
}

/** Two four-beat legs, the second carrying on from where the first stopped. */
function twoLegs(): Timeline {
  const t = createTimeline(createFigureRegistry([WALK_TO_STATION]));
  t.addGroup(group());
  t.add(leg(0, 4, "walker", { "1L": { p: [0, 24], facing: 90 } }));
  // The second leg starts where the first one stopped: a real seam, not a gap.
  t.add(
    leg(4, 8, "walker", { "1L": { p: [0, 48], facing: 90 } }, { "1L": { p: [0, 24], facing: 90 } }),
  );
  return t;
}

describe("the timeline's gait", () => {
  it("places feet on every moving sample of a walking dancer, inside the band", () => {
    const t = twoLegs();
    let placed = 0;
    for (let beat = 0; beat <= 8; beat += STEP) {
      const pose = poseAt(t, "walker", beat);
      // The exact ends of a `walkStep` report `moving: false`, which
      // `walk-to-station` samples as standing: amp 0, and the gait leaves them.
      if (pose.amp === 0) continue;
      expect(pose.feet, `beat ${beat}`).toBeDefined();
      const feet = pose.feet!;
      // The feet are body-local, so rest is the same two points at every beat.
      expect(offset(feet.L, REST_L), `L at ${beat}`).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
      expect(offset(feet.R, REST_R), `R at ${beat}`).toBeLessThanOrEqual(FOOT_SWING_PX + 1e-9);
      if (offset(feet.L, REST_L) > 1e-9 || offset(feet.R, REST_R) > 1e-9) placed += 1;
    }
    expect(placed).toBeGreaterThan(64);
  });

  it("carries the plants through the seam without a jump", () => {
    const t = twoLegs();
    // The swing is the fastest a foot moves: band to band over half a beat,
    // with the smoothstep's own peak on top. Nothing at the seam may exceed it.
    const bound = ((1.5 * (2 * FOOT_SWING_PX + 8 * 0.5)) / 0.5) * STEP;
    let before = footAt(t, 3, "L");
    let beforeR = footAt(t, 3, "R");
    for (let beat = 3 + STEP; beat <= 5; beat += STEP) {
      // A `walkStep`'s exact ends report `moving: false`, which this figure
      // samples as standing (amp 0) for that one instant; the feet go to rest
      // and back. That is `walk-to-station`'s own boundary, not the gait's.
      if (poseAt(t, "walker", beat).amp === 0) continue;
      const now = footAt(t, beat, "L");
      const nowR = footAt(t, beat, "R");
      expect(
        Math.hypot(now[0] - before[0], now[1] - before[1]),
        `L at ${beat}`,
      ).toBeLessThanOrEqual(bound);
      expect(
        Math.hypot(nowR[0] - beforeR[0], nowR[1] - beforeR[1]),
        `R at ${beat}`,
      ).toBeLessThanOrEqual(bound);
      before = now;
      beforeR = nowR;
    }
  });

  it("holds the parity through both figures: the feet alternate, the right landing on evens", () => {
    const t = twoLegs();
    // A foot that lands at `k` swings over `[k + 1.5, k + 2]`. The right lands
    // on even beats, so the right foot is the one in the air over the second
    // half of every odd beat and the left over the second half of every even
    // one — measured on the floor, which is where a plant is a plant.
    const swung = (from: number, side: "L" | "R"): number => {
      const a = footAt(t, from, side);
      const b = footAt(t, from + 0.4, side);
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    };
    for (const odd of [1, 3, 5]) {
      expect(swung(odd + 0.55, "R"), `beat ${odd}`).toBeGreaterThan(swung(odd + 0.55, "L"));
    }
    for (const even of [2, 4, 6]) {
      expect(swung(even + 0.55, "L"), `beat ${even}`).toBeGreaterThan(swung(even + 0.55, "R"));
    }
  });

  it("leaves a standing dancer's feet alone, for `quietMotion` to rest", () => {
    const t = createTimeline(createFigureRegistry([WALK_TO_STATION]));
    t.addGroup(group());
    // `to: {}` is "stay put", which `walk-to-station` samples as `standing`:
    // amp 0, and the gait does not run.
    t.add(leg(0, 8, "stander", {}));
    for (const beat of [0, 1, 2.5, 4, 7.75]) {
      const pose = poseAt(t, "stander", beat);
      expect(pose.amp).toBe(0);
      expect(pose.feet).toBeUndefined();
    }
  });

  it("is a cache and not state: two calls, the same feet", () => {
    const t = twoLegs();
    for (const beat of [0.5, 2.25, 4.0625, 6.5]) {
      expect(poseAt(t, "walker", beat).feet).toEqual(poseAt(t, "walker", beat).feet);
    }
    // And a second timeline built the same way agrees with the first.
    const again = twoLegs();
    for (const beat of [0.5, 2.25, 4.0625, 6.5]) {
      expect(poseAt(again, "walker", beat).feet).toEqual(poseAt(t, "walker", beat).feet);
    }
  });
});
