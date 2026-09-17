import type { Dialect, DancerId, SetState } from "../Dialect.js";
import { unknownSelector } from "../Dialect.js";

/**
 * Two dancers, twenty pixels apart, facing each other across the x axis: the
 * whole floor engine 3 needs tonight (DA7).
 *
 * The lark stands at (−10, 0) facing 0 — toward +x, so toward the robin — and
 * the robin at (10, 0) facing 180. One selector word, `across`, which each of
 * them resolves to the other.
 *
 * This is the hard-coded stand-in for the layout language (roadmap bite C):
 * a real dialect will derive every dancer's place and relations from a
 * declared formation rather than from two literals.
 */
export const PAIR: Dialect = {
  id: "pair",
  dancers: ["lark", "robin"],
  roleOf: (dancer) => (dancer === "lark" ? "lark" : "robin"),
  roleNames: ["larks", "robins"],
  homeFacing: (dancer) => (dancer === "lark" ? 0 : 180),
  sideOf: (dancer) => (dancer === "lark" ? "left" : "right"),
  initial: (): SetState => ({
    dancers: {
      lark: { p: [-10, 0], facing: 0 },
      robin: { p: [10, 0], facing: 180 },
    },
  }),
  select: (selector, from) => {
    if (selector !== "across") throw unknownSelector(PAIR, selector);
    return from === "lark" ? "robin" : "lark";
  },
  selectors: ["across"],
};

/**
 * The lark, alone: the end-effect proof (DA14).
 *
 * `across` finds nobody, so every call in the fixture has a cast with no
 * partner and the dancer stands for the whole forty beats — the user's ruling,
 * *"if the select returns no-one, then you just stay put for those moves"* —
 * and an `if (partner)` takes its else branch. A waiting-out couple at the end
 * of a contra line is this, written in the language rather than cased in the
 * engine.
 */
export const PAIR_SOLO: Dialect = {
  id: "pair-solo",
  dancers: ["lark"],
  roleOf: () => "lark",
  initial: (): SetState => ({ dancers: { lark: { p: [-10, 0], facing: 0 } } }),
  select: (selector): DancerId | undefined => {
    if (selector !== "across") throw unknownSelector(PAIR_SOLO, selector);
    return undefined;
  },
  selectors: ["across"],
};
