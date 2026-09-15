import { createHall, dist, poseAt } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { danceBySlug } from "../dances/index.js";
import { danceAlone } from "../dances/oracle.js";
import { contraDataFigures } from "../library/figures/index.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraCyclePlanner } from "./planCycle.js";
import { relate } from "./relations.js";
import { modelFromSet } from "./SetModel.js";
import { setRulesFor } from "./SetRules.js";

/**
 * **A circle of four that is not a minor set** (M7b, Contrablend's B2).
 *
 * *"Circle right 3/4 [with shadow]"*. Nothing in the library could say that: a
 * figure for four had always taken the four of a hands-four, and this one takes
 * two dancers out of one and two out of the next. `set/resolve.ts` cuts the lane
 * into rings the call's own relation names — *you, your partner, the dancer the
 * relation names, and their partner* — and the test of it is geometric: the four
 * it picks are standing on the corners of a rectangle, and the four the
 * hands-four would have picked are a different four.
 *
 * The relation the record names is `N1`, and the reason is the **rebinding**.
 * B1's second roll-away carries `rebind: { partner: "shadow" }`, so by B2 your
 * partner *is* your shadow — which is what the transcript's bracket says — and
 * "you, your partner, your neighbour and their partner" is four dancers out of
 * two minor sets even though N1 never leaves the four on its own.
 */

const RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

/** The beat Contrablend's B2 circle starts on. */
const B2 = 48;

const modelAt = (couples: number) =>
  modelFromSet(
    DUPLE_IMPROPER,
    createHall(DUPLE_IMPROPER, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!,
    new Map(),
  );

/** The instances of one figure at one beat, as their casts. */
const castsOf = (slug: string, couples: number, beat: number, figure: string) => {
  const timeline = danceAlone(danceBySlug(slug)!, couples, 128, {}, RUN).timeline();
  return {
    timeline,
    casts: timeline
      .figures()
      .filter((e) => e.start === beat && e.figure === figure)
      .map((e) => Object.values(e.bindings)),
  };
};

describe("a ring the relation names", () => {
  it("spans two minor sets, and stands on the corners of a rectangle", () => {
    const { timeline, casts } = castsOf("contrablend", 6, B2, "circle");
    expect(casts.length).toBe(2);
    for (const four of casts) {
      expect(four.length).toBe(4);
      const points = four.map((d) => poseAt(timeline, d, B2).p);
      // Two dancers on each line, one dancing place apart along the set: the
      // 32 x 20 rectangle a circle of four is danced on. Sorted, the four gaps
      // are 20, 20 (along the set) and 32, 32 (across it).
      const gaps = points
        .flatMap((a, i) => points.slice(i + 1).map((b) => Math.round(dist(a, b))))
        .sort((a, b) => a - b);
      // 20 along the set twice, 32 across it twice, and the two diagonals.
      expect(gaps).toEqual([20, 20, 32, 32, 38, 38]);
    }
    // And they are not the hands-four partition. A minor set is two whole
    // couples of the set's own seating; each of these rings is one dancer from
    // each of four different couples.
    expect(casts.map((four) => [...new Set(four.map((d) => d.split("/")[1]))].sort())).toEqual([
      ["c0", "c1", "c2", "c3"],
      ["c2", "c3", "c4", "c5"],
    ]);
  });

  it("puts each dancer in a ring with their own shadow", () => {
    const { casts } = castsOf("contrablend", 6, B2, "circle");
    const model = modelAt(6);
    const table = setRulesFor(DUPLE_IMPROPER).relations;
    for (const four of casts) {
      for (const me of four) {
        const shadow = relate(model, table, me, { kind: "shadow", k: 1 });
        if (shadow === undefined) continue;
        expect(four, `${me}'s shadow`).toContain(shadow);
      }
    }
  });

  it("leaves the dancers at the ends of the line out, which is M6's rule", () => {
    const { casts } = castsOf("contrablend", 6, B2, "circle");
    const model = modelAt(6);
    const table = setRulesFor(DUPLE_IMPROPER).relations;
    const inARing = new Set(casts.flat());
    for (const me of Object.keys(model.dancers)) {
      const shadow = relate(model, table, me, { kind: "shadow", k: 1 });
      // Exactly the four with no shadow are out: c0/lark and c1/robin at the
      // top, c4/robin and c5/lark at the bottom.
      expect(inARing.has(me), me).toBe(shadow !== undefined);
    }
  });

  it("is not used where every ring stays inside the four", () => {
    // Two couples: nobody has a shadow, so nothing is rebound and the ring the
    // relation names is the minor set itself. The lane is then not used at all
    // and the call resolves exactly as it always did — one instance, the
    // formation's own group id.
    const { casts } = castsOf("contrablend", 2, B2, "circle");
    expect(casts.length).toBe(1);
    expect(casts[0]!.length).toBe(4);
  });
});
