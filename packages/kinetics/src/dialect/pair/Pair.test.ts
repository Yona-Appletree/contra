import { describe, expect, it } from "vitest";
import { PAIR, PAIR_SOLO } from "./Pair.js";

describe("PAIR", () => {
  it("stands the two of them 20 px apart on the x axis, facing each other", () => {
    const state = PAIR.initial();
    expect(state.dancers["lark"]).toEqual({ p: [-10, 0], facing: 0 });
    expect(state.dancers["robin"]).toEqual({ p: [10, 0], facing: 180 });
  });

  it("dances a lark and a robin", () => {
    expect(PAIR.dancers).toEqual(["lark", "robin"]);
    expect(PAIR.roleOf("lark")).toBe("lark");
    expect(PAIR.roleOf("robin")).toBe("robin");
  });

  it("selects across to the other one, from either side", () => {
    const state = PAIR.initial();
    expect(PAIR.select("across", "lark", state)).toBe("robin");
    expect(PAIR.select("across", "robin", state)).toBe("lark");
  });

  it("says what it knows when asked for a word it has not got", () => {
    expect(() => PAIR.select("left-diagonal", "lark", PAIR.initial())).toThrow(
      /left-diagonal.*across/,
    );
    expect(PAIR.selectors).toEqual(["across"]);
  });
});

describe("PAIR_SOLO", () => {
  it("leaves the lark alone, and across finds nobody", () => {
    expect(PAIR_SOLO.dancers).toEqual(["lark"]);
    expect(PAIR_SOLO.select("across", "lark", PAIR_SOLO.initial())).toBeUndefined();
  });

  it("stands the lark where the pair would", () => {
    expect(PAIR_SOLO.initial().dancers["lark"]).toEqual(PAIR.initial().dancers["lark"]);
    expect(PAIR_SOLO.initial().dancers["robin"]).toBeUndefined();
  });

  it("still knows a word it has not got", () => {
    expect(() => PAIR_SOLO.select("across-the-set", "lark", PAIR_SOLO.initial())).toThrow(
      /across-the-set/,
    );
  });

  it("is a dialect of its own, so a compiled sequence records which", () => {
    expect(PAIR.id).toBe("pair");
    expect(PAIR_SOLO.id).toBe("pair-solo");
  });
});
