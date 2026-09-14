import type { Hand, PoseSample } from "@caller/core";
import { ARM_REACH_PX, angleDiff, dist, shoulders } from "@caller/core";
import { describe, expect, it } from "vitest";
import { createGroup } from "../group/Group.js";
import { SQUARE } from "../testing/square.js";
import { frame } from "../formation/Frame.js";
import type { ApplaudParams } from "./applaud.js";
import { APPLAUD, clapPhase, hashUnit } from "./applaud.js";
import { withDefaults } from "./FigureDef.js";

/**
 * The applause: eighteen people standing still and clapping at the band.
 *
 * What matters is that nobody travels (a dance ends with the hall in its
 * lines, and the next figure is a walk from exactly there), that both hands
 * are really placed and stay inside the contract's 15 px reach, that the
 * hands actually meet and part, and that two dancers do not clap in lockstep.
 */

const STATIONS = SQUARE.group(8);

/** A square of eight on a frame turned down the hall, which is the hall's own. */
const group = createGroup(
  {
    id: "g",
    kind: "set",
    frame: frame([0, 0], 90),
    stations: STATIONS,
    members: Object.fromEntries(STATIONS.map((s) => [s.id, `sq/${s.id}`])),
    couples: [],
  },
  SQUARE.roleSet,
);

const params = (over: Partial<ApplaudParams> = {}, beats = 8): ApplaudParams =>
  withDefaults(APPLAUD, over, beats);

const at = (t: number, p: ApplaudParams, station = STATIONS[0]!.id): PoseSample =>
  APPLAUD.sample(group, station, t, p);

const placed = (h: Hand | "down"): Hand => {
  expect(h).not.toBe("down");
  return h as Hand;
};

describe("applauding does not move anybody", () => {
  it("holds every dancer on the spot the last figure left them", () => {
    const origins = { [STATIONS[0]!.id]: { p: [12, -30] as [number, number], facing: 17 } };
    const p = params({ origins, face: 270 });
    for (let t = 0; t <= 8; t += 1 / 8) {
      expect(dist(at(t, p).p, [12, -30])).toBeLessThan(1e-9);
    }
  });

  it("ends where it started, so the walk after it starts from the same point", () => {
    const p = params({ face: 270 });
    const ends = APPLAUD.ends(group, p);
    for (const station of STATIONS) {
      expect(dist(ends[station.id]!.p, at(p.beats, p, station.id).p)).toBeLessThan(1e-9);
      expect(
        Math.abs(angleDiff(ends[station.id]!.facing, at(p.beats, p, station.id).facing)),
      ).toBeLessThan(1e-9);
    }
  });

  it("takes no step: stepRate and the quiet motion are both off", () => {
    const p = params({ face: 270 });
    const pose = at(4, p);
    expect(pose.stepRate).toBe(0);
    expect(pose.amp).toBe(0);
    expect(pose.buzz).toBe(false);
  });
});

describe("turning to the band", () => {
  it("is facing the band by the time the turn is over, and stays there", () => {
    const p = params({ face: 270, turnBeats: 2 });
    for (let t = 2; t <= 8; t += 1 / 4) {
      expect(Math.abs(angleDiff(at(t, p).facing, 270)), `beat ${String(t)}`).toBeLessThan(1e-9);
    }
  });

  it("gets there by the shortest way round, without spinning", () => {
    const p = params({ face: 30, turnBeats: 2 });
    const start = at(0, p).facing;
    const arc = Math.abs(angleDiff(start, 30));
    expect(arc).toBeCloseTo(60, 9);
    for (let t = 0; t <= 2; t += 1 / 32) {
      // Never past the target and never the long way round.
      expect(Math.abs(angleDiff(start, at(t, p).facing))).toBeLessThanOrEqual(arc + 1e-9);
    }
  });

  it("keeps the facing it came in with when there is no band to face", () => {
    const p = params({ face: null });
    const start = at(0, p).facing;
    for (let t = 0; t <= 8; t += 1 / 4) expect(at(t, p).facing).toBe(start);
  });

  it("looks where the body faces", () => {
    const p = params({ face: 270 });
    for (let t = 0; t <= 8; t += 1 / 2) expect(at(t, p).look).toBe(at(t, p).facing);
  });
});

describe("the clap itself", () => {
  const p = params({ face: 270 });

  it("places both hands, never leaves one hanging", () => {
    for (let t = 0; t <= 8; t += 1 / 8) {
      const pose = at(t, p);
      expect(pose.hands.L).not.toBe("down");
      expect(pose.hands.R).not.toBe("down");
    }
  });

  it("brings the hands together and parts them again", () => {
    let closest = Infinity;
    let widest = 0;
    for (let t = 0; t <= 8; t += 1 / 64) {
      const pose = at(t, p);
      const gap = dist(placed(pose.hands.L).p, placed(pose.hands.R).p);
      closest = Math.min(closest, gap);
      widest = Math.max(widest, gap);
    }
    expect(closest).toBeLessThan(0.2);
    expect(widest).toBeGreaterThan(2 * p.spreadPx - 0.2);
  });

  it("keeps both hands inside the contract's arm reach at every instant", () => {
    for (const station of STATIONS) {
      for (let t = 0; t <= 8; t += 1 / 16) {
        const pose = at(t, p, station.id);
        const sh = shoulders(pose);
        for (const side of ["L", "R"] as const) {
          const hand = placed(pose.hands[side]);
          const reach = Math.hypot(dist(sh[side], hand.p), hand.drop);
          expect(reach, `${station.id} ${side} at beat ${String(t)}`).toBeLessThan(ARM_REACH_PX);
        }
      }
    }
  });

  it("never crosses the hands over each other", () => {
    for (let t = 0; t <= 8; t += 1 / 32) {
      const pose = at(t, p);
      const sh = shoulders(pose);
      // The left hand is never further round to the right than the right hand.
      const left = placed(pose.hands.L).p;
      const right = placed(pose.hands.R).p;
      const across = [sh.R[0] - sh.L[0], sh.R[1] - sh.L[1]];
      const along = (v: readonly number[]): number => v[0]! * across[0]! + v[1]! * across[1]!;
      expect(along(left)).toBeLessThanOrEqual(along(right) + 1e-9);
    }
  });
});

describe("a hall claps, not a drill team", () => {
  it("puts two dancers out of step with each other", () => {
    const p = params({ face: 270 });
    let apart = 0;
    for (let t = 0; t <= 8; t += 1 / 16) {
      apart = Math.max(
        apart,
        Math.abs(
          clapPhase(t, p, "sq/N") - clapPhase(t, p, "sq/S"), // two different dancers
        ),
      );
    }
    expect(apart).toBeGreaterThan(0.5);
  });

  it("starts everybody with their hands together, whoever they are", () => {
    const p = params({ face: 270 });
    for (const station of STATIONS) {
      const pose = at(0, p, station.id);
      expect(dist(placed(pose.hands.L).p, placed(pose.hands.R).p)).toBeLessThan(2 * p.spreadPx);
    }
  });

  it("is pure: the same dancer claps the same way every time it is sampled", () => {
    const p = params({ face: 270 });
    expect(at(3.25, p)).toEqual(at(3.25, p));
    expect(hashUnit("sq/N")).toBe(hashUnit("sq/N"));
    expect(hashUnit("sq/N")).not.toBe(hashUnit("sq/S"));
  });

  it("hashes every id into the unit interval", () => {
    for (const id of ["", "a", "set0/c3/robin", "sq/E", "🎻"]) {
      expect(hashUnit(id)).toBeGreaterThanOrEqual(0);
      expect(hashUnit(id)).toBeLessThan(1);
    }
  });
});
