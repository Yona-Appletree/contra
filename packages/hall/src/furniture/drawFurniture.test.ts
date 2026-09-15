import type { Vec2 } from "@caller/core";
import { SHOULDER_WIDTH_PX, dirOf, rightOf } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { DancerLayout } from "../person/layoutDancer.js";
import { layoutDancer } from "../person/layoutDancer.js";
import { createPerson } from "../person/Person.js";
import { DEMO_HALL } from "../testing/fixtures.js";
import type { HallPerson } from "../world/layoutHall.js";
import { posture } from "./drawFurniture.js";

const person = createPerson({ id: "s", role: "other", seed: 3, skirt: false });

const sitter = (taps: boolean): HallPerson => ({
  person,
  p: [3, -4],
  facing: 37,
  seated: true,
  taps,
});

function local(q: Vec2, layout: DancerLayout): Vec2 {
  const d = dirOf(layout.torsoAngle);
  const r = rightOf(layout.torsoAngle);
  const dx = q[0] - layout.p[0];
  const dy = q[1] - layout.p[1];
  return [dx * d[0] + dy * d[1], dx * r[0] + dy * r[1]];
}

/**
 * Gate G1's resting-arm ruling reaches M4's sitters too: somebody sitting out
 * a dance is not holding their arms away from their body either. Before this
 * milestone a sitter measured 17.5 px across the elbows against 11 px of
 * shoulder — wider than a dancer in a two-hand hold.
 */
describe("a sitter's arms", () => {
  it("tuck in rather than winging out", () => {
    for (const taps of [false, true]) {
      for (const beat of [0, 0.25, 0.5, 0.75]) {
        const who = sitter(taps);
        const layout = layoutDancer({ person, pose: posture(who, beat) }, beat);
        let half = SHOULDER_WIDTH_PX / 2;
        for (const arm of layout.arms) {
          for (const q of [arm.elbow, arm.hand]) {
            half = Math.max(half, Math.abs(local(q, layout)[1]));
          }
          expect(arm.short, `short, taps ${String(taps)}, beat ${beat}`).toBe(0);
        }
        // Shoulders, plus at most 1.5 px of arm each side.
        expect(half * 2, `sitter width, taps ${String(taps)}, beat ${beat}`).toBeLessThanOrEqual(
          SHOULDER_WIDTH_PX + 3,
        );
      }
    }
  });

  it("rests both hands forward, on the knees, at the same height", () => {
    const layout = layoutDancer({ person, pose: posture(sitter(false), 0) }, 0);
    const [lf, lr] = local(layout.hands.L.p, layout);
    const [rf, rr] = local(layout.hands.R.p, layout);
    expect(lf).toBeCloseTo(rf, 9);
    expect(lf).toBeGreaterThan(0);
    expect(lr).toBeCloseTo(-rr, 9);
    expect(layout.hands.L.drop).toBe(layout.hands.R.drop);
  });
});

/** Every eighth of a beat, so a sine that peaks off the quarter-beats is still sampled near its peak. */
const BEATS = Array.from({ length: 32 }, (_, i) => i / 32);

/**
 * H1's finding: the instruments used to sit outside the players' own arm
 * tuck, so a band member measured 18.6–19.9 px across the elbows against a
 * dancer's 12.1 and a sitter's 13.3 (F1's own finding, left alone as out of
 * that milestone's scope). Bringing the instruments in to the body — a
 * higher hand drop and a smaller reach for the standing three, a keyboard
 * moved closer to the bench for the pianist — brings the whole band back
 * inside a dancer's scale, without moving a single dancer.
 */
describe("the band's arms", () => {
  it("tuck in to about a dancer's width, and never reach past the arm's 15 px", () => {
    for (const who of DEMO_HALL.band) {
      for (const beat of BEATS) {
        const layout = layoutDancer({ person: who.person, pose: posture(who, beat) }, beat);
        let half = SHOULDER_WIDTH_PX / 2;
        for (const arm of layout.arms) {
          for (const q of [arm.elbow, arm.hand]) {
            half = Math.max(half, Math.abs(local(q, layout)[1]));
          }
          expect(arm.short, `short, ${who.instrument}, beat ${beat}`).toBe(0);
        }
        expect(half * 2, `${who.instrument} width, beat ${beat}`).toBeLessThanOrEqual(15);
      }
    }
  });
});

/**
 * The pianist's own ruling (the user's words: "the piano player isn't
 * touching the keyboard, looks silly"): both hands sit over the strip of
 * keys `drawFloor` paints into `hall.stage.piano`, at every point in their
 * along-the-keys motion — not floating in the gap in front of it.
 */
describe("the pianist's hands", () => {
  const pianist = DEMO_HALL.band.find((who) => who.instrument === "piano");
  if (pianist === undefined) throw new Error("expected a pianist in the demo band");

  it("rest on the keys, sliding along them rather than bouncing off the canvas", () => {
    const { piano } = DEMO_HALL.stage;
    const keysY0 = piano.y + piano.h - 5;
    const keysY1 = piano.y + piano.h - 2;
    const keysX0 = piano.x + 2;
    const keysX1 = piano.x + piano.w - 2;

    let sawMotion = false;
    let lastLx: number | undefined;
    for (const beat of BEATS) {
      const pose = posture(pianist, beat);
      for (const side of ["L", "R"] as const) {
        const hand = pose.hands[side];
        if (hand === "down") throw new Error(`expected the pianist's ${side} hand to be placed`);
        const [x, y] = hand.p;
        expect(y, `${side} hand y, beat ${beat}`).toBeGreaterThanOrEqual(keysY0);
        expect(y, `${side} hand y, beat ${beat}`).toBeLessThanOrEqual(keysY1);
        expect(x, `${side} hand x, beat ${beat}`).toBeGreaterThanOrEqual(keysX0);
        expect(x, `${side} hand x, beat ${beat}`).toBeLessThanOrEqual(keysX1);
        if (side === "L") {
          if (lastLx !== undefined && lastLx !== x) sawMotion = true;
          lastLx = x;
        }
      }
    }
    // The hands actually move along the keys over the beat, not a fixed pose.
    expect(sawMotion).toBe(true);
  });

  it("each slide a couple of px along the keys over the beat", () => {
    const layout0 = layoutDancer({ person: pianist.person, pose: posture(pianist, 0) }, 0);
    for (const side of ["L", "R"] as const) {
      let min = Infinity;
      let max = -Infinity;
      for (const beat of BEATS) {
        const pose = posture(pianist, beat);
        const hand = pose.hands[side];
        if (hand === "down") throw new Error(`expected the pianist's ${side} hand to be placed`);
        const lateral = local(hand.p, layout0)[1];
        min = Math.min(min, lateral);
        max = Math.max(max, lateral);
      }
      // "Two or three px of motion is enough" (the brief): comfortably inside
      // that, and comfortably more than a rounding error.
      expect(max - min, `${side} hand's travel along the keys`).toBeGreaterThan(1);
      expect(max - min, `${side} hand's travel along the keys`).toBeLessThanOrEqual(3);
    }
  });

  it("alternate: the two hands do not peak at the same beat", () => {
    const layout0 = layoutDancer({ person: pianist.person, pose: posture(pianist, 0) }, 0);
    const peakBeat = (side: "L" | "R"): number => {
      let bestBeat = 0;
      let bestAbs = -Infinity;
      for (const beat of BEATS) {
        const hand = posture(pianist, beat).hands[side];
        if (hand === "down") throw new Error(`expected the pianist's ${side} hand to be placed`);
        const lateral = Math.abs(local(hand.p, layout0)[1]);
        if (lateral > bestAbs) {
          bestAbs = lateral;
          bestBeat = beat;
        }
      }
      return bestBeat;
    };
    expect(peakBeat("L")).not.toBe(peakBeat("R"));
  });
});

/**
 * B3's R1.2, in the user's words: "band shouldn't be playing when no dancing is
 * happening." Sound is `@caller/music`'s side of that; this is the drawn side —
 * a band that goes on bowing and nodding through a silent interval is a band
 * miming. Every beat-driven term in this layer holds at its rest value while
 * `playing` is false, and the people themselves do not otherwise move.
 */
describe("the band at rest, between two dances", () => {
  const everyone = [...DEMO_HALL.band, DEMO_HALL.callerPerson, ...DEMO_HALL.sideLines];

  it("puts every hand, foot and lean exactly where beat 0 puts it, at every beat", () => {
    for (const who of everyone) {
      const rest = posture(who, 0, false);
      for (const beat of BEATS) {
        const still = posture(who, beat, false);
        expect(still, `${String(who.instrument)} at beat ${String(beat)}`).toEqual(rest);
      }
    }
  });

  it("holds the pianist's hands on the keys and the fiddler's bow arm in one place", () => {
    const pianist = DEMO_HALL.band.find((who) => who.instrument === "piano");
    const fiddler = DEMO_HALL.band.find((who) => who.instrument === "fiddle");
    if (pianist === undefined || fiddler === undefined) {
      throw new Error("expected a pianist and a fiddler in the demo band");
    }
    for (const who of [pianist, fiddler]) {
      for (const side of ["L", "R"] as const) {
        const hand = posture(who, 0, false).hands[side];
        if (hand === "down") throw new Error(`expected ${String(who.instrument)} ${side} placed`);
        for (const beat of BEATS) {
          const later = posture(who, beat, false).hands[side];
          if (later === "down") throw new Error("a placed hand went down");
          expect(later.p, `${String(who.instrument)} ${side} at ${String(beat)}`).toEqual(hand.p);
        }
      }
    }
  });

  it("still moves when a tune is playing, which is what makes the stillness mean something", () => {
    const pianist = DEMO_HALL.band.find((who) => who.instrument === "piano");
    if (pianist === undefined) throw new Error("expected a pianist in the demo band");
    const moved = BEATS.some((beat) => {
      const a = posture(pianist, beat, true).hands.L;
      const b = posture(pianist, 0, false).hands.L;
      return a !== "down" && b !== "down" && (a.p[0] !== b.p[0] || a.p[1] !== b.p[1]);
    });
    expect(moved).toBe(true);
  });

  it("leaves a sitter's tapping foot still too", () => {
    const tapper = DEMO_HALL.sideLines.find((who) => who.taps === true);
    if (tapper === undefined) throw new Error("expected a sitter tapping the beat");
    const rest = posture(tapper, 0, false).feet;
    for (const beat of BEATS) expect(posture(tapper, beat, false).feet).toEqual(rest);
  });
});
