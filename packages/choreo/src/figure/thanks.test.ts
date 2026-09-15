import type { PoseSample } from "@caller/core";
import { angleDiff, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { createGroup } from "../group/Group.js";
import { SQUARE } from "../testing/square.js";
import { frame } from "../formation/Frame.js";
import type { ThanksParams } from "./thanks.js";
import { THANKS } from "./thanks.js";
import { withDefaults } from "./FigureDef.js";

/**
 * The thanks: eighteen people standing still, turning to their partner and
 * their neighbour and nodding, instead of clapping (B4 — the user: "no one
 * claps in contra").
 *
 * What matters is that nobody travels or steps, that no hand is ever placed
 * (arms relaxed at the sides), that the body turns to the target each half
 * hands it and holds there, that the nod is a `look`-only wobble that leaves
 * `facing`, `lean` and `p` untouched (the motion oracle flags a torso dip; a
 * nod is a head motion, not a bow), and that a station with nobody to face
 * just keeps the facing it came in with.
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

const params = (over: Partial<ThanksParams> = {}, beats = 8): ThanksParams =>
  withDefaults(THANKS, over, beats);

const at = (t: number, p: ThanksParams, station = STATIONS[0]!.id): PoseSample =>
  THANKS.sample(group, station, t, p);

describe("thanking does not move anybody", () => {
  it("holds every dancer on the spot the last figure left them", () => {
    const origins = { [STATIONS[0]!.id]: { p: [12, -30] as [number, number], facing: 17 } };
    const p = params({ origins, partnerFace: { [STATIONS[0]!.id]: 270 } });
    for (let t = 0; t <= 8; t += 1 / 8) {
      expect(dist(at(t, p).p, [12, -30])).toBeLessThan(1e-9);
    }
  });

  it("takes no step: stepRate and the quiet motion are both off", () => {
    const p = params({ partnerFace: { [STATIONS[0]!.id]: 270 } });
    for (let t = 0; t <= 8; t += 1) {
      const pose = at(t, p);
      expect(pose.stepRate).toBe(0);
      expect(pose.amp).toBe(0);
      expect(pose.buzz).toBe(false);
    }
  });

  it("never places a hand: arms relaxed at the sides throughout", () => {
    const p = params({
      partnerFace: { [STATIONS[0]!.id]: 270 },
      neighbourFace: { [STATIONS[0]!.id]: 30 },
    });
    for (let t = 0; t <= 8; t += 1 / 4) {
      const pose = at(t, p);
      expect(pose.hands.L).toBe("down");
      expect(pose.hands.R).toBe("down");
    }
  });

  it("never dips the torso: lean stays zero the whole figure", () => {
    const p = params({
      partnerFace: { [STATIONS[0]!.id]: 270 },
      neighbourFace: { [STATIONS[0]!.id]: 30 },
    });
    for (let t = 0; t <= 8; t += 1 / 8) {
      expect(at(t, p).lean).toBe(0);
    }
  });

  it("is pure: the same beat samples the same pose every time", () => {
    const p = params({
      partnerFace: { [STATIONS[0]!.id]: 270 },
      neighbourFace: { [STATIONS[0]!.id]: 30 },
    });
    expect(at(3.25, p)).toEqual(at(3.25, p));
  });
});

describe("the first half: turning to the partner", () => {
  it("is facing the partner by the time the turn is over, and stays there through the half", () => {
    const id = STATIONS[0]!.id;
    const p = params({ partnerFace: { [id]: 270 }, turnBeats: 1.5 });
    for (let t = 1.5; t <= 4; t += 1 / 4) {
      expect(Math.abs(angleDiff(at(t, p, id).facing, 270)), `beat ${String(t)}`).toBeLessThan(1e-9);
    }
  });

  it("gets there by the shortest way round, without spinning", () => {
    const id = STATIONS[0]!.id;
    const p = params({ partnerFace: { [id]: 30 }, turnBeats: 1.5 });
    const start = at(0, p, id).facing;
    const arc = Math.abs(angleDiff(start, 30));
    for (let t = 0; t <= 1.5; t += 1 / 32) {
      expect(Math.abs(angleDiff(start, at(t, p, id).facing))).toBeLessThanOrEqual(arc + 1e-9);
    }
  });

  it("keeps the facing it came in with when there is no partner to face", () => {
    const id = STATIONS[0]!.id;
    const p = params({ partnerFace: { [id]: null } });
    const start = at(0, p, id).facing;
    for (let t = 0; t <= 4; t += 1 / 4) expect(at(t, p, id).facing).toBe(start);
  });
});

describe("the second half: turning to the neighbour", () => {
  it("turns from the partner's facing to the neighbour's, and holds it to the end", () => {
    const id = STATIONS[0]!.id;
    const p = params({ partnerFace: { [id]: 270 }, neighbourFace: { [id]: 30 }, turnBeats: 1.5 });
    // At the seam it is still facing the partner...
    expect(Math.abs(angleDiff(at(4, p, id).facing, 270))).toBeLessThan(1e-9);
    // ...and by the end of the second turn it faces the neighbour, held there.
    for (let t = 5.5; t <= 8; t += 1 / 4) {
      expect(Math.abs(angleDiff(at(t, p, id).facing, 30)), `beat ${String(t)}`).toBeLessThan(1e-9);
    }
  });

  it("ends() agrees with sample() at the figure's own last beat", () => {
    const id = STATIONS[0]!.id;
    const p = params({ partnerFace: { [id]: 270 }, neighbourFace: { [id]: 30 } });
    const ends = THANKS.ends(group, p);
    expect(dist(ends[id]!.p, at(p.beats, p, id).p)).toBeLessThan(1e-9);
    expect(Math.abs(angleDiff(ends[id]!.facing, at(p.beats, p, id).facing))).toBeLessThan(1e-9);
  });

  it("keeps facing the partner when there is nobody left to be a neighbour", () => {
    // A lone waiting couple: partners face each other and there is nobody
    // else in the group, so the second half has no target either.
    const id = STATIONS[0]!.id;
    const p = params({ partnerFace: { [id]: 270 }, neighbourFace: { [id]: null }, turnBeats: 1.5 });
    for (let t = 4; t <= 8; t += 1 / 4) {
      expect(Math.abs(angleDiff(at(t, p, id).facing, 270)), `beat ${String(t)}`).toBeLessThan(1e-9);
    }
  });
});

describe("the nod", () => {
  it("is a head motion: look leaves facing briefly, and comes back to it", () => {
    const id = STATIONS[0]!.id;
    const p = params({
      partnerFace: { [id]: 270 },
      turnBeats: 1.5,
      nodBeats: 1,
      nodDeg: 10,
    });
    // Before the nod window and after it, look is exactly facing.
    expect(at(1.5, p, id).look).toBe(at(1.5, p, id).facing);
    expect(at(2.5, p, id).look).toBe(at(2.5, p, id).facing);
    // Inside it, the head is off the body's own facing.
    const mid = at(2.0, p, id);
    expect(Math.abs(angleDiff(mid.look, mid.facing))).toBeGreaterThan(1);
    expect(Math.abs(angleDiff(mid.look, mid.facing))).toBeLessThanOrEqual(10 + 1e-9);
  });

  it("never moves the body when it nods: facing, lean and p are unaffected", () => {
    const id = STATIONS[0]!.id;
    const withNod = params({ partnerFace: { [id]: 270 }, turnBeats: 1.5, nodBeats: 1, nodDeg: 10 });
    const withoutNod = params({ partnerFace: { [id]: 270 }, turnBeats: 1.5, nodDeg: 0 });
    for (let t = 0; t <= 4; t += 1 / 8) {
      const a = at(t, withNod, id);
      const b = at(t, withoutNod, id);
      expect(a.facing).toBe(b.facing);
      expect(a.lean).toBe(b.lean);
      expect(dist(a.p, b.p)).toBeLessThan(1e-9);
    }
  });
});
