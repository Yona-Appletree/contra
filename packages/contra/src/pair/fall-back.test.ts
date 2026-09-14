import { HOLD_SPACING_PX, LINE_OFFSET_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAIR_FRAME, twoHandHold } from "./PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { fallBack } from "./fall-back.js";

const frame = DEFAULT_PAIR_FRAME;
const at = (t: number, release = true) => ({
  lark: fallBack.sample(frame, "lark", t, { release }),
  robin: fallBack.sample(frame, "robin", t, { release }),
});

describe("fallBack", () => {
  it("is eight beats and releases by default", () => {
    expect(fallBack.beats).toBe(8);
    expect(fallBack.defaults).toEqual({ release: true });
  });

  it("starts at the hold and ends in the lines", () => {
    const start = at(0);
    const end = at(8);
    expect(dist(start.lark.p, start.robin.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
    expect(dist(end.lark.p, end.robin.p)).toBeCloseTo(HOLD_SPACING_PX + LINE_OFFSET_PX, 9);
  });

  it("animates the release over the first beat", () => {
    const hold = twoHandHold(frame);
    expect(at(0).lark.hands.L).toEqual(hold.a);
    const midway = at(0.5).lark.hands.L;
    if (midway === "down") throw new Error("unreachable");
    expect(dist(midway.p, hold.a.p)).toBeGreaterThan(0.1);
    const gone = at(1).lark.hands.L;
    if (gone === "down") throw new Error("unreachable");
    expect(dist(gone.p, hold.a.p)).toBeGreaterThan(3);
  });

  it("keeps the hands down from the start when the figure before let them go", () => {
    const hold = twoHandHold(frame);
    const start = at(0, false).lark.hands.L;
    if (start === "down") throw new Error("unreachable");
    expect(dist(start.p, hold.a.p)).toBeGreaterThan(3);
  });

  it("stands still in the lines at the end, with no weight shift left over", () => {
    const end = at(8);
    const line = at(8, false);
    expect(end.lark.p).toEqual(line.lark.p);
  });

  it("never puts a hand out of reach (AC1)", () => {
    expect(worstShortfall(fallBack, frame).short).toBe(0);
    expect(worstShortfall(fallBack, frame, { release: false }).short).toBe(0);
  });
});
