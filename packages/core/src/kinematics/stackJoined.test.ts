import { describe, expect, it } from "vitest";
import type { Hand } from "./PoseSample.js";
import type { JoinedHand } from "./stackJoined.js";
import { stackJoined } from "./stackJoined.js";

const hand: Hand = { p: [1, 2], drop: 5 };
// The contra role set's stacking rule, supplied from outside: `core` never
// names a role itself.
const CONTRA = { top: "robin" };

const lark: JoinedHand = { role: "lark", hand };
const robin: JoinedHand = { role: "robin", hand };

describe("stackJoined", () => {
  it("puts the role set's top role first, whichever order it is given", () => {
    expect(stackJoined(lark, robin, CONTRA)).toEqual([robin, lark]);
    expect(stackJoined(robin, lark, CONTRA)).toEqual([robin, lark]);
  });

  it("is form-neutral: another role set stacks its own top role", () => {
    const square = { top: "gent" };
    const gent: JoinedHand = { role: "gent", hand };
    const lady: JoinedHand = { role: "lady", hand };
    expect(stackJoined(lady, gent, square)).toEqual([gent, lady]);
  });

  it("keeps the given order when neither hand is the top role", () => {
    const a: JoinedHand = { role: "lark", hand };
    const b: JoinedHand = { role: "lark", hand };
    const [top, bottom] = stackJoined(a, b, CONTRA);
    expect(top).toBe(a);
    expect(bottom).toBe(b);
  });

  it("keeps the given order when both hands are the top role", () => {
    const a: JoinedHand = { role: "robin", hand };
    const b: JoinedHand = { role: "robin", hand };
    expect(stackJoined(a, b, CONTRA)[0]).toBe(a);
  });

  it("does not copy the hands, so the shared floor point stays shared", () => {
    const [top, bottom] = stackJoined(lark, robin, CONTRA);
    expect(top.hand).toBe(hand);
    expect(bottom.hand).toBe(hand);
  });
});
