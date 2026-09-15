import type { FigureDefinition, HoldSpec, RockShape } from "../FigureDefinition.js";

/**
 * **Balance**, as data: take hands, rock forward and rock back.
 *
 * The rock is M5's, beat for beat, including its slightly longer back rock and
 * its lean cap. What the `rock` kind adds is the closing: a pair standing in
 * the lines is 32 px apart and no 15 px arm reaches half way, so the balance
 * steps in to the frame's hold spacing as it rocks forward — which is what
 * dancers do — and leaves them there for the swing that usually follows.
 *
 * Its ends are therefore **`"relative"`**, not `"home"`: a balance ends where it
 * balanced, facing its partner. That is the honest end. It is followed by a
 * swing in every dance in the corpus, and the swing is the gatherer; a balance
 * called on its own still ends honestly, closed up where the figure before left
 * the pair.
 *
 * Three holds are declared and the call's own `hold` picks: both hands, one
 * named hand, or neither. A balance *of the ring* is its own definition
 * (`balance-ring`), because a ring is a different shape and not a parameter of
 * this one.
 */

/** Beats spent closing to the hold, and the beat the hands are up by. */
export const CLOSE_BEATS = 1.2;
export const TAKE_TO = 1.4;
/** Beats spent letting go and stepping back out, when `openOut` is set. */
export const OPEN_BEATS = 1.2;

/** At full forward rock the joined hands spread this much wider and drop this much lower. */
const HAND_SPREAD_PX = 2;
const HAND_DROP_PX = 3;
/** At full back rock they rise this much. */
export const HAND_RISE_PX = 1;

/** The rock `balance` and the balance half of `balance-and-swing` both dance. */
export const PAIR_ROCK: RockShape = {
  kind: "rock",
  close: "pair",
  rock: { param: "rock" },
  closeBeats: CLOSE_BEATS,
  openBeats: OPEN_BEATS,
  openOut: false,
};

/**
 * A two-hand hold, in the balance's own terms: the hands meet where the two
 * outstretched arms do, spread wider and lower as the pair rocks together, and
 * are never let go — the swing that almost always follows wants the pair
 * already holding.
 */
export function twoHandRock(a: string, b: string): readonly HoldSpec[] {
  return (
    [
      ["L", "R"],
      ["R", "L"],
    ] as const
  ).map(([aSide, bSide]) => ({
    kind: "pair" as const,
    a,
    aSide,
    b,
    bSide,
    point: {
      kind: "reach" as const,
      spread: HAND_SPREAD_PX,
      dropGain: HAND_DROP_PX,
      riseGain: HAND_RISE_PX,
    },
    drop: { param: "holdDrop" },
    stackPx: { param: "stackPx" },
    window: { kind: "holdWindow" as const, take: TAKE_TO, release: 0 },
  }));
}

/** Balance, as a figure definition. */
export const balanceDefinition: FigureDefinition = {
  id: "balance",
  call: "BALANCE",
  describe:
    "Take both hands with the dancer you are facing, step in toward them onto one foot and touch the other beside it, then step back and touch again. Four beats, two steps in and two out; nobody travels anywhere, it is a rock and not a walk. The hands stay joined at the end, because the swing that almost always follows wants the pair already closed up.",
  lead: 4,
  nominalBeats: 4,
  roles: ["a", "b"],
  actors: "pairs",
  anchor: "meet",
  params: {
    kind: "canonical",
    defaults: {
      rock: 1.0,
      hold: "two",
      hand: "R",
      pairs: "neighbors",
      holdDrop: 5,
      stackPx: 1,
      openOut: false,
    },
  },
  shape: PAIR_ROCK,
  holds: [
    ...twoHandRock("a", "b").map((hold) => ({
      ...hold,
      when: { param: "hold", is: ["two"] as const },
    })),
    {
      kind: "pair",
      a: "a",
      aSide: { param: "hand" },
      b: "b",
      bSide: { param: "hand" },
      point: { kind: "midpoint" },
      drop: 2,
      stackPx: { param: "stackPx" },
      window: { kind: "holdWindow", take: TAKE_TO, release: 0 },
      when: { param: "hold", is: ["one"] },
    },
  ],
  ends: "relative",
  timing: { stretch: "pace", profile: "smooth" },
  // A balance is a rock along the line between two dancers: nothing in it is
  // handed except which hand a one-hand balance takes.
  symmetry: { mirror: { kind: "parameters", hands: ["hand"] } },
};
