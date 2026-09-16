import type { CoupleState, Formation, SetState } from "@caller/choreo";
import { HANDS_FOUR_GROUP } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "./becket.js";
import { DUPLE_IMPROPER } from "./dupleImproper.js";

/**
 * **Who meets whom, over a whole evening's worth of times through** — FR-C2's
 * own test, and the user's two sentences about a contra set turned into a table.
 *
 * On a **single** progression:
 *
 * > "everyone shifts one place to the left and then the people who were on your
 * > left diagonal are your new neighbors... but... wait. its really shift
 * > half-way, isn't it?"
 *
 * On a **double** one:
 *
 * > "in double progression dances, even numbered sets have this parity thing
 * > where there's actually two independent sets that are interwoven but never
 * > interact. callers usually point this out and suggest odd numbered lines."
 *
 * So the trace is a function of how many places a dance progresses, and not a
 * blanket invariant. A single progression mixes a hall of any length; a double
 * one splits an even hall into two interwoven halves and mixes an odd one; and
 * the measurement below says what a triple does, which is the one The Set
 * Monster dances.
 *
 * **This is also the test that caught the old model.** Until FR-C2 each becket
 * line slid a whole couple place, so the two lines passed each other two couple
 * widths a time through — which is a *double* progression's arithmetic — and a
 * six- or eight-couple becket hall partitioned permanently (A-meas, 2026-09-15).
 * Duple improper is the control throughout: it has always done the right thing,
 * and a becket set with a half-width slide now does exactly what it does.
 */

/** Every couple a couple dances with, in the order it meets them. */
interface Trace {
  /** By couple id: the couples it dances with, in order, one entry per time through it dances. */
  met: Map<string, string[]>;
  /** How many couples there are. */
  couples: number;
}

const startOf = (formation: Formation, couples: number): SetState =>
  formation.start({ id: "s", couples, centre: [0, 0], axis: 90 });

/** The minor sets of one time through, as pairs of couple ids. */
function foursOf(formation: Formation, state: SetState): Array<[string, string]> {
  return formation
    .groupsFor(HANDS_FOUR_GROUP, state)
    .filter((plan) => plan.kind === "set")
    .map((plan) => [plan.couples[0]!, plan.couples[1]!] as [string, string]);
}

/**
 * `rounds` times through, with `places` progressions at each boundary — which is
 * exactly what `progressSet`'s uniform path does to the seating, one
 * `Progression.next` per place.
 */
function trace(formation: Formation, couples: number, places: number, rounds: number): Trace {
  const met = new Map<string, string[]>();
  let state = startOf(formation, couples);
  for (const couple of state.couples) met.set(couple.id, []);
  for (let round = 0; round < rounds; round++) {
    for (const [a, b] of foursOf(formation, state)) {
      met.get(a)!.push(b);
      met.get(b)!.push(a);
    }
    for (let i = 0; i < places; i++) state = formation.progression.next(state);
  }
  return { met, couples };
}

/** How many of the other couples each couple ever dances with, as `met/possible`. */
function coverage(t: Trace): string {
  const counts = [...t.met.values()].map((list) => new Set(list).size);
  const worst = Math.min(...counts);
  const best = Math.max(...counts);
  return worst === best
    ? `${String(worst)}/${String(t.couples - 1)}`
    : `${String(worst)}-${String(best)}/${String(t.couples - 1)}`;
}

/** Where each couple stands, by id. */
const seatOf = (state: SetState): Map<string, CoupleState> =>
  new Map(state.couples.map((c) => [c.id, c]));

describe("a single progression: everybody meets everybody, in order", () => {
  // Long enough for every couple to travel the whole ring twice over: a becket
  // couple moves one couple place along its own line every **two** times
  // through since FR-C2, so the ring takes `2 x couples` of them.
  const rounds = (couples: number): number => 4 * couples;

  for (const couples of [4, 5, 6, 7, 8]) {
    it(`becket at ${String(couples)} couples`, () => {
      const t = trace(BECKET, couples, 1, rounds(couples));
      expect(coverage(t)).toBe(`${String(couples - 1)}/${String(couples - 1)}`);
    });

    it(`duple improper at ${String(couples)} couples (the control)`, () => {
      const t = trace(DUPLE_IMPROPER, couples, 1, rounds(couples));
      expect(coverage(t)).toBe(`${String(couples - 1)}/${String(couples - 1)}`);
    });
  }

  it("meets them in order: your next neighbours are the couple on your diagonal", () => {
    // The user's own sentence, measured. A becket couple slides half a place to
    // its own left and the couple across slides half a place the other way, so
    // the couple you face next time through is the one that was one couple place
    // along the other line **in the direction you are going** — `place -
    // direction`, which is exactly what the `N2` row names. No skips: never two
    // places, which is what the whole-place model did.
    for (const couples of [4, 5, 6, 7, 8]) {
      let state = startOf(BECKET, couples);
      let partners = new Map(
        foursOf(BECKET, state).flatMap(([a, b]) => [
          [a, b],
          [b, a],
        ]),
      );
      let checked = 0;
      for (let round = 0; round < 2 * couples; round++) {
        const seats = seatOf(state);
        const next = BECKET.progression.next(state);
        const after = new Map(
          foursOf(BECKET, next).flatMap(([a, b]) => [
            [a, b],
            [b, a],
          ]),
        );
        const nextSeats = seatOf(next);
        for (const [me, wasWith] of partners) {
          const nowWith = after.get(me);
          if (nowWith === undefined) continue; // standing out this time through
          const mine = seats.get(me)!;
          const old = seats.get(wasWith)!;
          const fresh = seats.get(nowWith)!;
          // A couple that has just crossed the set — mine, or the one I am
          // about to face — is starting the other half of its own loop rather
          // than sliding along a line; the ends are `becket.test.ts`'s business.
          if (nextSeats.get(me)!.direction !== mine.direction) continue;
          if (nextSeats.get(nowWith)!.direction !== fresh.direction) continue;
          expect(fresh.direction, `${me} at ${String(couples)}c: a new line`).toBe(old.direction);
          expect(
            fresh.place,
            `${me} at ${String(couples)}c round ${String(round)}: ${wasWith} -> ${nowWith}`,
          ).toBe(old.place - mine.direction);
          checked += 1;
        }
        partners = after;
        state = next;
      }
      expect(checked, `${String(couples)} couples`).toBeGreaterThan(couples);
    }
  });
});

describe("a double progression: an even hall is two interwoven sets", () => {
  /**
   * The user, verbatim: *"in double progression dances, even numbered sets have
   * this parity thing where there's actually two independent sets that are
   * interwoven but never interact. callers usually point this out and suggest
   * odd numbered lines."*
   *
   * Measured, and asserted as the expected behaviour rather than as a fault:
   * two places a time through means the two lines pass each other **two** couple
   * widths, and an even ring closes on half of itself.
   */
  for (const couples of [4, 5, 6, 7, 8]) {
    it(`becket at ${String(couples)} couples`, () => {
      const t = trace(BECKET, couples, 2, 4 * couples);
      // An even hall: each couple meets half the others (its own interwoven
      // set). An odd hall mixes completely, which is why callers ask for one.
      expect(coverage(t)).toBe(
        couples % 2 === 0
          ? `${String(couples / 2)}/${String(couples - 1)}`
          : `${String(couples - 1)}/${String(couples - 1)}`,
      );
    });
  }
});

describe("a triple progression: The Set Monster's own", () => {
  /**
   * Three places a time through — the shift The Set Monster's record writes.
   * The measurement is the point: an odd shift is not automatically a full mix,
   * because what matters is the common factor between the shift and the ring.
   */
  for (const couples of [4, 5, 6, 7, 8]) {
    it(`becket at ${String(couples)} couples`, () => {
      const t = trace(BECKET, couples, 3, 4 * couples);
      // **Measured, and it is not "an odd shift always mixes".** What matters
      // is the common factor between the shift and the ring: a becket ring is
      // `2 x couples` half-places long and a progression of `s` places turns it
      // `s` steps, so a hall whose couple count shares a factor with the shift
      // closes on part of itself. Six couples and a triple progression is the
      // worst case in this table — each couple meets one or two of the other
      // five, and never the rest.
      expect(coverage(t)).toBe(
        couples === 6 ? "1-2/5" : `${String(couples - 1)}/${String(couples - 1)}`,
      );
    });
  }
});
