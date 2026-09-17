import { poseAt } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { danceBySlug } from "../dances/index.js";
import { danceAlone } from "../dances/oracle.js";
import { contraDataFigures } from "../library/figures/index.js";
import { contraCyclePlanner } from "./planCycle.js";

/**
 * **A `pairs` word an `actors: "all"` figure can act on** (DD73).
 *
 * A figure for the whole minor set still pairs its dancers up: a twirl, a
 * do-si-do, a roll away and a mad robin all declare
 * `pairing: { kind: "param", param: "pairs" }`. Resolution never read that
 * parameter for them — `laneFor` only looked at it under `actors: "pairs"` — so
 * the **word** reached the figure, where `pairsOf` understands exactly two of
 * them (`"partners"` and `"neighbors"`) and silently returns nothing for every
 * other one. Three dances in the record were standing through a call because of
 * it, every dancer measured at 0.00 px: The Set Monster's `jersey-twirl` with
 * `"N4"`, Whoosh's `do-si-do` with `"N2"` and Contrablend's `roll-away` with
 * `"shadow"`.
 *
 * The two tests below are the two halves of the ruling: a reaching word now
 * names somebody, and a word that was already understood names exactly who it
 * always did.
 */

const RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

/** The furthest any dancer of this figure's instances gets from where they started. */
function travelOf(slug: string, couples: number, figure: string, beats = 128): number {
  const dance = danceBySlug(slug);
  if (!dance) throw new Error(`no dance "${slug}"`);
  const timeline = danceAlone(dance, couples, beats, {}, RUN).timeline();
  let worst = 0;
  for (const event of timeline.figures()) {
    if (event.figure !== figure) continue;
    for (const dancer of Object.values(event.bindings)) {
      const from = poseAt(timeline, dancer, event.start).p;
      for (let i = 0; i <= 16; i++) {
        const at = poseAt(timeline, dancer, event.start + ((event.end - event.start) * i) / 16).p;
        worst = Math.max(worst, Math.hypot(at[0] - from[0], at[1] - from[1]));
      }
    }
  }
  return worst;
}

/** Every instance of one figure, as `[group id, cast dancers]`. */
function instancesOf(slug: string, couples: number, figure: string, beat: number) {
  const dance = danceBySlug(slug);
  if (!dance) throw new Error(`no dance "${slug}"`);
  const timeline = danceAlone(dance, couples, 128, {}, RUN).timeline();
  return timeline
    .figures()
    .filter((e) => e.figure === figure && e.start === beat)
    .map((e) => ({ group: e.group, cast: Object.values(e.bindings) }));
}

describe("a `pairs` relation word on a figure for the whole four", () => {
  /**
   * The Set Monster's B1 — *"(4) N4 neighbor Jersey twirl"* — at a line long
   * enough for an N4 to exist. Before DD73 every dancer of every instance moved
   * **0.00 px** and the dance stood through the call.
   */
  it("names somebody when the relation reaches past the four", () => {
    expect(travelOf("the-set-monster", 8, "jersey-twirl")).toBeGreaterThan(20);
    const pairs = instancesOf("the-set-monster", 8, "jersey-twirl", 44);
    expect(pairs.length).toBeGreaterThan(0);
    // One instance per pair, in the lane: both dancers of a pair four couple
    // places apart cannot be in one hands-four.
    for (const instance of pairs) {
      expect(instance.group).toContain("/lane/");
      expect(instance.cast.length).toBe(2);
    }
  });

  /**
   * Whoosh's B2 *"(8) N2 neighbor do-si-do"*, the second dance the same defect
   * was standing through.
   *
   * Contrablend's B1 *"roll away your shadow"* was the third, and it is **no
   * longer on this path**: the record now calls
   * `contrablend/long-lines-roll-away` there, which is a figure for two
   * (`actors: "pairs"`), so its `"shadow"` reaches the lane through `laneFor`'s
   * own `pairs` branch rather than through `reachingPairsOf`. The travel is
   * asserted below in its own words, because it is a different sentence about a
   * different mechanism and reading it here would claim coverage DD73 no longer
   * has from this dance.
   */
  it("names somebody for the other call the record writes one on", () => {
    expect(travelOf("whoosh", 6, "do-si-do")).toBeGreaterThan(10);
  });

  /**
   * Contrablend's B1, where the record's own figure for two takes the shadow
   * half into the lane: the robin walks into the line and out again a whole
   * dancing place along it, which is more than the 9 px of the walk alone.
   */
  it("carries Contrablend's shadow half, as a figure for two", () => {
    expect(travelOf("contrablend", 6, "contrablend/long-lines-roll-away")).toBeGreaterThan(10);
    const pairs = instancesOf("contrablend", 6, "contrablend/long-lines-roll-away", 40);
    expect(pairs.length).toBeGreaterThan(0);
    for (const instance of pairs) {
      expect(instance.group).toContain("/lane/");
      expect(instance.cast.length).toBe(2);
    }
  });

  /**
   * And the other half: a word `pairsOf` already read resolves to exactly the
   * pairing it always did, in the minor set, with the minor set's own group id.
   * Every dance in the programme is written with one of those two words, which
   * is why none of their numbers move.
   */
  it("leaves a `partners` or `neighbors` call in its own four, unchanged", () => {
    const here = instancesOf("on-the-prowl", 6, "mad-robin", 0);
    expect(here.length).toBeGreaterThan(0);
    for (const instance of here) {
      expect(instance.group).not.toContain("/lane/");
      expect(instance.cast.length).toBe(4);
    }
  });

  /**
   * A figure with no `pairs` parameter at all is not touched: nothing to read,
   * nothing to rewrite, and the four is still the unit.
   */
  it("leaves a figure with no `pairs` word alone", () => {
    const here = instancesOf("on-the-prowl", 6, "long-lines", 32);
    for (const instance of here) {
      expect(instance.group).not.toContain("/lane/");
    }
  });
});
