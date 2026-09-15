import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { Station } from "../formation/Formation.js";
import { frame } from "../formation/Frame.js";
import type { Group } from "../group/Group.js";
import { withDefaults } from "./FigureDef.js";
import { TAKE_HANDS, lineUpPlaces } from "./takeHands.js";

/**
 * Hands four, measured.
 *
 * The user's ruling: "hands four is literal. they should take hands four in a
 * ring." So: everybody ends up on a ring of the right size, every pair of
 * joined hands is **one** floor point (AC2), the hold is taken and let go
 * rather than snapping, and the figure leaves everybody exactly where it said
 * it would.
 *
 * Form-neutral throughout — this is `@caller/choreo`, so there is no lark, no
 * robin and no becket here; the four stations are a rectangle and the shift is
 * a number.
 */
const ROLE_SET = { roles: ["a", "b"], top: "b" } as const;

/** A duple-improper-shaped foursome: two lines 32 px apart, 20 px along. */
const STATIONS: readonly Station[] = [
  { id: "1L", role: "a", facing: 90, p: [16, -10] },
  { id: "1R", role: "b", facing: 90, p: [-16, -10] },
  { id: "2L", role: "a", facing: 270, p: [-16, 10] },
  { id: "2R", role: "b", facing: 270, p: [16, 10] },
];

const group = (): Group => ({
  id: "g",
  frame: frame([0, 0], 90, HOLD_SPACING_PX),
  members: Object.fromEntries(STATIONS.map((s) => [s.id, `d/${s.id}`])),
  stations: STATIONS.map((s) => ({ ...s })),
  roleSet: ROLE_SET,
});

const params = (over: Partial<Parameters<typeof TAKE_HANDS.sample>[3]> = {}) =>
  withDefaults(TAKE_HANDS, over, 12);

const ids = STATIONS.map((s) => s.id);

describe("taking hands four in a ring", () => {
  it("brings everybody on to a regular ring, every neighbour a hold spacing apart", () => {
    const g = group();
    const p = params();
    // Half way through the hold, after the step in and before the step out.
    const at = (id: string) => TAKE_HANDS.sample(g, id, 6, p).p;
    const ring = ids.map(at);
    const centre: [number, number] = [
      ring.reduce((s, q) => s + q[0], 0) / 4,
      ring.reduce((s, q) => s + q[1], 0) / 4,
    ];
    for (const q of ring) {
      // radius = spacing / (2 sin(π/4)) = 14 / √2 = 9.899 px.
      expect(dist(centre, q)).toBeCloseTo(HOLD_SPACING_PX / Math.SQRT2, 6);
    }
  });

  it("joins every pair of hands at one shared floor point, not two that agree", () => {
    const g = group();
    const p = params();
    const hands = Object.fromEntries(ids.map((id) => [id, TAKE_HANDS.sample(g, id, 6, p).hands]));
    // Every dancer's left hand is somebody's right hand, at the same point.
    let matched = 0;
    for (const a of ids) {
      const left = hands[a]!.L;
      if (left === "down") continue;
      for (const b of ids) {
        if (a === b) continue;
        const right = hands[b]!.R;
        if (right === "down") continue;
        if (left.p[0] === right.p[0] && left.p[1] === right.p[1]) matched += 1;
      }
    }
    expect(matched).toBe(4);
  });

  it("takes the hold and lets it go rather than snapping into it", () => {
    const g = group();
    const p = params();
    const handAt = (t: number) => {
      const h = TAKE_HANDS.sample(g, "1L", t, p).hands.L;
      if (h === "down") throw new Error("the ring hand should be placed");
      return h.p;
    };
    const held = handAt(6);
    // At the very start and the very end the hand is by the dancer's side, so
    // it is nowhere near where the ring holds it.
    expect(dist(handAt(0), held)).toBeGreaterThan(2);
    expect(dist(handAt(12), held)).toBeGreaterThan(2);
    // And it gets there continuously: no jump bigger than a px an eighth beat.
    let last = handAt(0);
    for (let t = 0.125; t <= 12; t += 0.125) {
      const now = handAt(t);
      expect(dist(last, now), `beat ${String(t)}`).toBeLessThan(2);
      last = now;
    }
  });

  it("leaves everybody exactly where `ends` says, on their own stations", () => {
    const g = group();
    const p = params();
    const ends = TAKE_HANDS.ends(g, p);
    for (const s of STATIONS) {
      const last = TAKE_HANDS.sample(g, s.id, p.beats, p);
      expect(last.p[0]).toBeCloseTo(ends[s.id]!.p[0], 9);
      expect(last.p[1]).toBeCloseTo(ends[s.id]!.p[1], 9);
      // No shift, so a station ends on the place it started from.
      expect(last.p[0]).toBeCloseTo(s.p[0], 9);
      expect(last.p[1]).toBeCloseTo(s.p[1], 9);
    }
  });

  it("moves everybody one place round when the formation asks for a shift", () => {
    const g = group();
    const from = lineUpPlaces(STATIONS, 1, HOLD_SPACING_PX);
    const origins = Object.fromEntries(Object.entries(from).map(([id, q]) => [id, q]));
    const p = params({ origins, places: 1 });
    const ends = TAKE_HANDS.ends(g, p);
    // Starting one place back round the ring and travelling one place forward
    // lands every dancer exactly on their own station.
    for (const s of STATIONS) {
      expect(ends[s.id]!.p[0], s.id).toBeCloseTo(s.p[0], 6);
      expect(ends[s.id]!.p[1], s.id).toBeCloseTo(s.p[1], 6);
    }
  });

  it("is a two-hand hold when the group is a couple waiting out", () => {
    const pair: Station[] = [
      { id: "WL", role: "a", facing: 0, p: [-16, 0] },
      { id: "WR", role: "b", facing: 180, p: [16, 0] },
    ];
    const g: Group = {
      id: "w",
      frame: frame([0, 0], 90, HOLD_SPACING_PX),
      members: { WL: "d/WL", WR: "d/WR" },
      stations: pair,
      roleSet: ROLE_SET,
    };
    const p = params();
    const l = TAKE_HANDS.sample(g, "WL", 6, p);
    const r = TAKE_HANDS.sample(g, "WR", 6, p);
    if (l.hands.L === "down" || l.hands.R === "down") throw new Error("both hands are held");
    if (r.hands.L === "down" || r.hands.R === "down") throw new Error("both hands are held");
    expect(l.hands.L.p).toEqual(r.hands.R.p);
    expect(l.hands.R.p).toEqual(r.hands.L.p);
    // A ring of two is the two of them a hold spacing apart.
    expect(dist(l.p, r.p)).toBeCloseTo(HOLD_SPACING_PX, 6);
  });
});

describe("where the hall stands to take hands four", () => {
  it("is the stations themselves when nothing shifts", () => {
    const at = lineUpPlaces(STATIONS, 0, HOLD_SPACING_PX);
    for (const s of STATIONS) expect(at[s.id]).toEqual({ p: s.p, facing: s.facing });
  });

  it("is one place back round the ring when something does", () => {
    const at = lineUpPlaces(STATIONS, 1, HOLD_SPACING_PX);
    // Every line-up place is *some* station's place: the hall stands on the
    // same four spots, in a different order.
    const spots = new Set(STATIONS.map((s) => `${String(s.p[0])},${String(s.p[1])}`));
    for (const id of ids) {
      const q = at[id]!;
      expect(spots.has(`${String(q.p[0])},${String(q.p[1])}`), id).toBe(true);
      expect(q.p, id).not.toEqual(STATIONS.find((s) => s.id === id)!.p);
    }
  });
});
