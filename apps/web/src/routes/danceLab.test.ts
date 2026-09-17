import { describe, expect, it } from "vitest";
import { drawnArms } from "@caller/core";
import { danceCandidateTiles, danceLabSection, SHOWN_COUPLES } from "../danceCandidates.js";
import { hallFrame } from "../hallFrame.js";
import { shifted } from "./danceLab.js";

/**
 * `shifted` (M9h's dance lab) takes the tile's own origin off every dancer's
 * `pose.p` so a whole line, which is not centred on anything, draws in the
 * middle of its canvas. A **placed** hand — a figure's joined hold, not
 * `'down'` — is a floor point in that same absolute frame (`PoseSample`'s own
 * contract: two dancers joining hands compute the same `Hand` from the same
 * figure frame), so it has to move by the same amount or the shoulder, hung
 * off the shifted `p`, and the hand it is reaching for land in two different
 * frames.
 *
 * `drawnArms`/`solveArm3d` clamp the shoulder-to-hand vector to the 15 px
 * contract reach no matter what is fed in, so a clamped *length* never proves
 * this: what a shoulder/hand frame mismatch does is inflate the *shortfall*
 * every placed hand is measured against, which pushes far more arms against
 * that clamp — pointed at the wrong place — than the dance actually asks for.
 * On `contrablend~circle-with-shadow` at beat 64 this was 22 of 24 arms
 * maxed out instead of the true 2, which is what read on screen as "arms
 * three body-heights long" on a failing candidate column.
 */
describe("shifted", () => {
  it("moves a placed hand by the tile's own origin, the same as the body", () => {
    const section = danceLabSection("contrablend", SHOWN_COUPLES);
    if (section === undefined) throw new Error("no section");
    const tile = danceCandidateTiles(section).find(
      (t) => t.id === "contrablend~circle-with-shadow",
    );
    if (tile === undefined || tile.error !== undefined) throw new Error("no tile to test against");

    // Not a useful test if the origin this dance measures happens to be zero.
    const [ox, oy] = tile.origin;
    expect(Math.hypot(ox, oy)).toBeGreaterThan(10);

    const beat = 64;
    const raw = hallFrame(tile.timeline, tile.people, beat, { trails: false });
    const fixed = shifted(tile, beat, false, undefined);
    expect(fixed.frame.people.length).toBe(raw.frame.people.length);

    let placedHandsChecked = 0;
    for (let i = 0; i < raw.frame.people.length; i++) {
      const rawDancer = raw.frame.people[i]!;
      const fixedDancer = fixed.frame.people[i]!;
      for (const side of ["L", "R"] as const) {
        const rawHand = rawDancer.pose.hands[side];
        const fixedHand = fixedDancer.pose.hands[side];
        if (rawHand === "down") {
          expect(fixedHand).toBe("down");
          continue;
        }
        expect(fixedHand).not.toBe("down");
        if (fixedHand === "down") continue;
        placedHandsChecked++;
        expect(fixedHand.p[0]).toBeCloseTo(rawHand.p[0] - ox, 9);
        expect(fixedHand.p[1]).toBeCloseTo(rawHand.p[1] - oy, 9);
        expect(fixedHand.drop).toBe(rawHand.drop);
      }
    }
    // Every dancer in this figure is holding on to somebody at this beat.
    expect(placedHandsChecked).toBeGreaterThan(0);
  });

  it("draws no more arms at their maximum reach than the true, unshifted pose does", () => {
    // The clamp itself (drawnArms/solveArm3d) never lets an arm exceed the
    // contract's 15 px reach, shifted or not — so the regression this defect
    // needs is not "how long is the drawn arm" but "how many arms end up
    // pinned at that clamp, reaching for the wrong point": a shoulder/hand
    // frame mismatch inflates the shortfall for nearly every placed hand,
    // which is what actually reads as the picture being unclamped.
    const section = danceLabSection("contrablend", SHOWN_COUPLES);
    if (section === undefined) throw new Error("no section");
    const tile = danceCandidateTiles(section).find(
      (t) => t.id === "contrablend~circle-with-shadow",
    );
    if (tile === undefined || tile.error !== undefined) throw new Error("no tile to test against");

    const beat = 64;
    const drawn = shifted(tile, beat, false, undefined);
    const reaching = drawn.frame.people
      .flatMap((dancer) => drawnArms(dancer.pose, beat).arms)
      .filter((arm) => arm.short > 5).length;

    // Measured on the true (unshifted, Stage-equivalent) pose at this beat:
    // only 2 of the line's 24 arms are actually out of reach here. Before the
    // fix, the shift/hand mismatch pinned 22 of 24 at the clamp.
    expect(reaching).toBe(2);
  });
});
