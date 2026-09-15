import type { CoupleState, Formation, SetSpec, SetState } from "@caller/choreo";
import { HOLD_SPACING_PX, frame, framePoint } from "@caller/choreo";
import { BECKET, BECKET_TOP_OFFSET_PX, COUPLE_PITCH_PX, partitionBecket } from "./becket.js";

/**
 * A **right-progressing** becket, as a fixture.
 *
 * No dance in the demo programme is one, and the user says so themselves:
 *
 * > "_technically_ if its a right-progressing becket dance, you should move one
 * > place _to the right_. callers don't always do this... but it means you
 * > progress the 'wrong' way from the direction you were facing when you took
 * > hands four."
 *
 * The branch that says "RIGHT" therefore has nothing in the shipped programme
 * to exercise it, and an untested branch is a branch that is wrong. This is a
 * becket in every way but one: its lines slide the other way along the set, so
 * `lineUpShiftOf` measures `"right"` off its progression and the caller's words
 * come out right without anybody editing a string.
 *
 * It is exported as production code rather than hidden in a test file because
 * `@caller/choreo`'s decider has to be able to dance it — the becket-right test
 * runs a whole programme in it — and because a formation is data, not a mock.
 */
export const BECKET_RIGHT: Formation = {
  ...BECKET,
  id: "becket-right",

  progression: {
    /**
     * One time through: each line slides one place toward **+place**, if it is
     * a `+1` line, and toward `-place` if it is a `-1` one — the mirror of
     * {@link BECKET}'s own, where the signs are the other way round.
     *
     * A couple that has run out of line spends a time through beyond the end
     * and comes back in on the other line one place along, exactly as becket's
     * does; the sign of "beyond the end" is mirrored with the rest.
     */
    next(set: SetState): SetState {
      const couples: CoupleState[] = [];
      for (const part of partitionBecket(set)) {
        if (part.kind === "set") {
          for (const couple of part.couples) {
            couples.push({ ...couple, place: couple.place + couple.direction });
          }
        } else {
          const couple = part.couples[0]!;
          couples.push({
            ...couple,
            place: couple.place - couple.direction,
            direction: couple.direction === 1 ? -1 : 1,
          });
        }
      }
      return { ...set, couples: couples.sort((a, b) => a.place - b.place) };
    },
  },

  /**
   * The same line as becket's, with the two waiting places at the ends the
   * mirrored progression pushes couples off: the `-1` line runs out at the top
   * and the `+1` line at the bottom.
   */
  start(spec: SetSpec): SetState {
    if (spec.couples < 4) {
      throw new Error(`a becket set needs at least four couples, not ${String(spec.couples)}`);
    }
    const places = Math.floor((spec.couples - 2) / 2);
    const couples: CoupleState[] = [];
    let i = 0;
    const add = (place: number, direction: 1 | -1): void => {
      couples.push({
        id: `${spec.id}/c${String(i)}`,
        dancers: { lark: `${spec.id}/c${String(i)}/lark`, robin: `${spec.id}/c${String(i)}/robin` },
        place,
        direction,
      });
      i += 1;
    };
    add(-1, -1);
    for (let place = 0; place < places; place++) {
      add(place, 1);
      add(place, -1);
    }
    add(places, 1);
    if (spec.couples % 2 !== 0) add(places + 1, 1);
    return {
      id: spec.id,
      frame: frame(
        framePoint(frame(spec.centre, spec.axis, HOLD_SPACING_PX), [0, BECKET_TOP_OFFSET_PX]),
        spec.axis,
        HOLD_SPACING_PX,
      ),
      pitch: COUPLE_PITCH_PX,
      couples,
    };
  },
};
