import type { Carried, Spots } from "../figures/ContraFigure.js";
import type { Dance, FigureEvent, Timeline } from "@caller/choreo";
import { ORACLE_STEP, poseAt, validateDance } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES, danceBySlug } from "../dances/index.js";
import { danceAlone, threadsOnTheOldPath } from "../dances/oracle.js";
import { contraDance } from "../figures/chain.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDataFigures } from "../library/figures/index.js";
import { REBIND_PARAM, contraCyclePlanner, legacyCyclePlanner } from "./planCycle.js";

/**
 * What the contra planner claims beyond AC1's poses: that the **chain is off
 * the path**, that it emits the same shape of timeline as the decider's own
 * planner, and that it is a pure function of its input.
 */

const BUTTER = danceBySlug("butter")!;

/** The same dance with `chainCalls`' two derived parameters taken back out. */
function unthreaded(dance: Dance): Dance {
  return validateDance({
    ...dance,
    phrases: dance.phrases.map((phrase) => ({
      ...phrase,
      figures: phrase.figures.map((call) => {
        const params = { ...(call.params as Record<string, unknown> | undefined) };
        delete params["from"];
        delete params["carried"];
        return { ...call, params };
      }),
    })),
  });
}

const figures = (timeline: Timeline): readonly FigureEvent[] => timeline.figures();

describe("the contra planner does not read the chain", () => {
  it("dances a record with no threaded `from` or `carried` identically", () => {
    // The strongest form of the claim: strip everything `chainCalls` writes
    // into a dance at load time and the new path dances it the same, because
    // it derives both from set state instead of reading them.
    const stripped = unthreaded(BUTTER);
    for (const call of stripped.phrases.flatMap((p) => p.figures)) {
      expect(call.params).not.toHaveProperty("from");
      expect(call.params).not.toHaveProperty("carried");
    }
    const threaded = danceAlone(BUTTER, 6, 128, {}, { cycle: legacyCyclePlanner }).timeline();
    const raw = danceAlone(stripped, 6, 128, {}, { cycle: legacyCyclePlanner }).timeline();
    for (const dancer of threaded.dancers()) {
      for (let beat = 0; beat <= 128; beat += ORACLE_STEP) {
        expect(poseAt(raw, dancer, beat)).toEqual(poseAt(threaded, dancer, beat));
      }
    }
  });

  it("works out the carried holds itself, from the set's own state", () => {
    // Butter's B2 is one `balance-and-swing`, so the carry inside it is the
    // figure's own; the chain's carry shows up between `long-lines` and
    // `robins-chain`, and between the hey and the balance. Whatever it is, the
    // planner's answer and the chain's answer are the same object shape.
    const now = danceAlone(unthreaded(BUTTER), 6, 64, {}, { cycle: legacyCyclePlanner }).timeline();
    const old = danceAlone(BUTTER, 6, 64).timeline();
    const carriedOf = (t: Timeline, figure: string): Carried | undefined =>
      (figures(t).find((e) => e.figure === figure)!.params as { carried?: Carried }).carried;
    for (const id of ["slide-left", "circle", "swing", "long-lines", "robins-chain", "hey"]) {
      expect(carriedOf(now, id), id).toEqual(carriedOf(old, id));
    }
  });

  it("works out `from` itself, to the bit", () => {
    const now = danceAlone(unthreaded(BUTTER), 6, 64, {}, { cycle: legacyCyclePlanner }).timeline();
    const old = danceAlone(BUTTER, 6, 64).timeline();
    const fromOf = (t: Timeline, figure: string): Spots =>
      (figures(t).find((e) => e.figure === figure)!.params as { from: Spots }).from;
    for (const id of ["circle", "swing", "long-lines", "robins-chain", "hey"]) {
      expect(fromOf(now, id), id).toEqual(fromOf(old, id));
    }
  });
});

const DATA_RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

describe("a figure's ends can rebind who your partner is (Q14)", () => {
  /**
   * Contrablend's shadow roll-away, on its own: a call that says
   * `rebind: { partner: "shadow" }` leaves everybody bound to their shadow, and
   * the **next** call that says "partners" pairs the new ones.
   *
   * Written as a synthetic two-call dance rather than read off Contrablend
   * because Contrablend's B2 needs a shoulder round, which is M5's — see this
   * milestone's report.
   */
  const ROLL_AND_SWING = contraDance({
    slug: "rebind-probe",
    title: "Rebind probe",
    author: "M6",
    formation: DUPLE_IMPROPER,
    phrases: [
      {
        name: "A1",
        figures: [
          {
            figure: "roll-away",
            beats: 8,
            params: { [REBIND_PARAM]: { partner: "shadow" } },
          },
          { figure: "swing", beats: 8, params: { pairs: "partners" } },
        ],
      },
    ],
  });

  it("pairs the shadow when the call before it rebound the partner", () => {
    const timeline = danceAlone(ROLL_AND_SWING, 6, 16, {}, DATA_RUN).timeline();
    const pairs = new Set(
      figures(timeline)
        .filter((e) => e.figure === "swing")
        .map((e) => Object.values(e.bindings).sort().join(" + ")),
    );
    // The shadow rows `relations.test.ts` derives by hand: `c1/lark`'s shadow is
    // `c3/robin` and `c4/lark`'s is `c2/robin`. Both of them are two places
    // along the set, so the swing is resolved in the **lane**: it pairs dancers
    // who are not in the same minor set at all.
    expect(pairs).toContain("set0/c1/lark + set0/c3/robin");
    expect(pairs).toContain("set0/c2/robin + set0/c4/lark");
    // And the end of the set: `c0/lark` has no shadow (the slot is off the top
    // of the line), so his binding is left alone and he keeps his own partner.
    expect(pairs).toContain("set0/c0/lark + set0/c0/robin");
  });

  it("leaves the partner alone when nothing rebinds it", () => {
    const plain = contraDance({
      ...ROLL_AND_SWING,
      slug: "rebind-probe-off",
      formation: DUPLE_IMPROPER,
      phrases: [
        {
          name: "A1",
          figures: [
            { figure: "roll-away", beats: 8 },
            { figure: "swing", beats: 8, params: { pairs: "partners" } },
          ],
        },
      ],
    });
    const timeline = danceAlone(plain, 6, 16, {}, DATA_RUN).timeline();
    const pairs = figures(timeline)
      .filter((e) => e.figure === "swing")
      .map((e) => Object.values(e.bindings).sort().join(" + "))
      .sort();
    expect(pairs).toContain("set0/c2/lark + set0/c2/robin");
  });
});

describe("the contra planner emits the same timeline shape", () => {
  it("emits the same figures, in the same order, over the same beats and dancers", () => {
    // Only the dances the old path can dance at all; see `threadsOnTheOldPath`.
    for (const dance of DEMO_DANCES.filter(threadsOnTheOldPath)) {
      const couples = dance.formation === "becket" ? 7 : 5;
      const old = figures(danceAlone(dance, couples, 128).timeline());
      const now = figures(
        danceAlone(dance, couples, 128, {}, { cycle: legacyCyclePlanner }).timeline(),
      );
      expect(now.map((e) => [e.figure, e.start, e.end])).toEqual(
        old.map((e) => [e.figure, e.start, e.end]),
      );
      expect(now.map((e) => e.bindings)).toEqual(old.map((e) => e.bindings));
    }
  });

  it("is a pure function: two runs give the same timeline", () => {
    const a = danceAlone(BUTTER, 6, 128, {}, { cycle: legacyCyclePlanner }).timeline();
    const b = danceAlone(BUTTER, 6, 128, {}, { cycle: legacyCyclePlanner }).timeline();
    for (const dancer of a.dancers()) {
      for (let beat = 0; beat <= 128; beat += 1) {
        expect(poseAt(b, dancer, beat)).toEqual(poseAt(a, dancer, beat));
      }
    }
  });
});
