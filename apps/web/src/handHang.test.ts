import {
  HAND_DOWN_DROP_PX,
  HAND_DOWN_FORWARD_PX,
  HAND_DOWN_LATERAL_PX,
  HAND_DOWN_SWING_PX,
  handDown,
} from "@caller/contra";
import {
  HAND_HANG_DROP_PX,
  HAND_HANG_FORWARD_PX,
  HAND_HANG_LATERAL_PX,
  HAND_HANG_SWING_PX,
  hangingHand,
} from "@caller/hall";
import { describe, expect, it } from "vitest";

/**
 * `@caller/contra` cannot import `@caller/hall` — a figure is not allowed to
 * know about the renderer — so M5 restated the renderer's four hanging-hand
 * numbers inside the figure package, and M8 left the copy where it was. A
 * figure that starts a take from one set while the renderer hangs the hand by
 * the other draws a jump at the seam.
 *
 * `apps/web` depends on both packages, so this is the one place in the repo
 * that can say the two sets agree. Gate G1 retuned all four; if a later change
 * moves one copy and not the other, this is what says so. The tidy fix is to
 * move the hanging hand into `@caller/core`, which M8 left to M10.
 */
describe("the hanging hand", () => {
  it("is the same four numbers in @caller/hall and @caller/contra", () => {
    expect(HAND_DOWN_DROP_PX).toBe(HAND_HANG_DROP_PX);
    expect(HAND_DOWN_LATERAL_PX).toBe(HAND_HANG_LATERAL_PX);
    expect(HAND_DOWN_FORWARD_PX).toBe(HAND_HANG_FORWARD_PX);
    expect(HAND_DOWN_SWING_PX).toBe(HAND_HANG_SWING_PX);
  });

  it("lands on the same point from either package", () => {
    for (const facing of [0, 37, 180, 299]) {
      for (const beat of [0, 0.25, 0.5, 0.75]) {
        for (const amp of [0, 1]) {
          for (const side of ["L", "R"] as const) {
            expect(handDown([3, -4], facing, side, beat, amp)).toEqual(
              hangingHand([3, -4], facing, side, beat, amp),
            );
          }
        }
      }
    }
  });
});
