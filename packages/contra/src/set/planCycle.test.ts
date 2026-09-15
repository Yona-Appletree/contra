import type { Carried, Spots } from "../figures/ContraFigure.js";
import type { Dance, FigureEvent, Timeline } from "@caller/choreo";
import { ORACLE_STEP, poseAt, validateDance } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES, danceBySlug } from "../dances/index.js";
import { danceAlone } from "../dances/oracle.js";
import { legacyCyclePlanner } from "./planCycle.js";

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

describe("the contra planner emits the same timeline shape", () => {
  it("emits the same figures, in the same order, over the same beats and dancers", () => {
    for (const dance of DEMO_DANCES) {
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
