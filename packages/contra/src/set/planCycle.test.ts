import type { Carried, Spots } from "../figures/ContraFigure.js";
import type { Dance, FigureEvent, Timeline } from "@caller/choreo";
import { ORACLE_STEP, poseAt, validateDance } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES, danceBySlug } from "../dances/index.js";
import {
  CLOSURE_PX,
  danceAlone,
  linesFor,
  oraclesFor,
  threadsOnTheOldPath,
} from "../dances/oracle.js";
import { contraDance } from "../figures/chain.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraDataFigures } from "../library/figures/index.js";
import {
  PROGRESSES_PARAM,
  REBIND_PARAM,
  contraCyclePlanner,
  legacyCyclePlanner,
} from "./planCycle.js";

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

/**
 * **The progression carried by a figure in the middle of the dance** (M9b).
 *
 * `"params": { "progresses": true }` on a call says the set's slots shift at
 * *its* end rather than at the end of the time through. Fatal Attraction is the
 * dance that needed it — its A1 promenades round the major set and its A2 casts
 * back, so the calls after it name their neighbours from one place along — and
 * what is asserted here is the three things the clause claims: the relations
 * really do move at that call, the boundary does not move them a second time,
 * and a record that does not write the clause is untouched.
 */
describe("a call that carries the progression", () => {
  const FATAL = danceBySlug("fatal-attraction")!;
  const RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

  /** Who each dancer dances the call at `beat` with, as `a+b` pairs. */
  const pairsAt = (dance: Dance, couples: number, beat: number, figure: string): string[] =>
    figures(danceAlone(dance, couples, 128, {}, RUN).timeline())
      .filter((e) => e.start === beat && e.figure === figure)
      .map((e) => Object.values(e.bindings).join("+"))
      .sort();

  /** The same record with the clause taken out of every call that writes it. */
  const withoutTheClause = (dance: Dance): Dance =>
    validateDance({
      ...dance,
      phrases: dance.phrases.map((phrase) => ({
        ...phrase,
        figures: phrase.figures.map((call) => {
          const params = { ...(call.params as Record<string, unknown> | undefined) };
          delete params[PROGRESSES_PARAM];
          return { ...call, params };
        }),
      })),
    });

  it("moves the seating at the call, so a later call names a different dancer", () => {
    // A2's cast-back (beats 16-18) carries it, and A2's swing at beat 24 asks
    // for `neighbors`. With the clause the neighbour it finds is the couple the
    // promenade has just carried everybody round to; without it, the couple
    // they started beside. The same record, the same run, one field apart.
    const withIt = pairsAt(FATAL, 8, 24, "swing");
    const without = pairsAt(withoutTheClause(FATAL), 8, 24, "swing");
    expect(withIt.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
    expect(withIt).not.toEqual(without);
  });

  it("progresses once: the boundary does not shift a pass a call already shifted", () => {
    // Twice through. If the boundary shifted as well, the second time through
    // would start two places along and its own A1 would chain a different four
    // from the one the first time through's progression put together.
    const timeline = danceAlone(FATAL, 8, 256, {}, RUN).timeline();
    const chains = timeline
      .figures()
      .filter((e) => e.figure === "robins-chain")
      .map((e) => ({ start: e.start, four: Object.values(e.bindings).sort().join("+") }));
    const first = chains.filter((c) => c.start === 0).map((c) => c.four);
    const second = chains.filter((c) => c.start === 64).map((c) => c.four);
    const third = chains.filter((c) => c.start === 128).map((c) => c.four);
    expect(first.length).toBeGreaterThan(0);
    // One shift per time through, so the third chain is two shifts on from the
    // first and never the same as it, and no two consecutive ones agree.
    expect(second).not.toEqual(first);
    expect(third).not.toEqual(second);
  });

  /**
   * **At the call's start, which is DD43's rule and Fatal Attraction's own
   * answer** (M9e). The user's rule of 2026-09-15 — "progressing at the start
   * of any move in long (wavy) lines is valid" — is the same mechanism a beat
   * earlier, and which of the two a dance wants is a measurement. Fatal
   * Attraction's is decisive: its promenade round the major set has already put
   * the bodies on N2's places when the cast-back begins, and moving the shift
   * from the cast-back's end to its start closes the dance — **closure
   * 29.9228/39.1798 px became 0.0000 at every checked length**.
   */
  describe('"start" against "end"', () => {
    /** The same record with every `progresses` clause moved to the call's end. */
    const atTheEnd = (dance: Dance): Dance =>
      validateDance({
        ...dance,
        phrases: dance.phrases.map((phrase) => ({
          ...phrase,
          figures: phrase.figures.map((call) => {
            const params = { ...(call.params as Record<string, unknown> | undefined) };
            if (params[PROGRESSES_PARAM] === undefined) return call;
            return { ...call, params: { ...params, [PROGRESSES_PARAM]: true } };
          }),
        })),
      });

    it("is what Fatal Attraction writes, and it is what closes it", () => {
      for (const couples of linesFor(FATAL)) {
        const start = oraclesFor(FATAL, couples, 128, {}, RUN);
        const end = oraclesFor(atTheEnd(FATAL), couples, 128, {}, RUN);
        expect(start.closurePx, `${String(couples)} couples, at the start`).toBeLessThan(
          CLOSURE_PX,
        );
        // And the comparison is not vacuous: the end reading really is the one
        // that does not close, at every length but the shortest.
        if (couples > 4) {
          expect(end.closurePx, `${String(couples)} couples, at the end`).toBeGreaterThan(20);
        }
      }
    });

    it("shifts the seating before the call rather than after it", () => {
      // A2's cast-back is the call. Which couples are standing out changes at
      // the shift, so the cast-back itself is danced by a different set of
      // dancers under the two readings — which is the whole difference between
      // them, said without an oracle.
      const start = pairsAt(FATAL, 8, 16, "cast-back");
      const end = pairsAt(atTheEnd(FATAL), 8, 16, "cast-back");
      expect(start.length).toBeGreaterThan(0);
      expect(start).not.toEqual(end);
    });

    it("refuses a word that is neither", () => {
      const bad = validateDance({
        ...FATAL,
        phrases: FATAL.phrases.map((phrase) => ({
          ...phrase,
          figures: phrase.figures.map((call) => {
            const params = { ...(call.params as Record<string, unknown> | undefined) };
            if (params[PROGRESSES_PARAM] === undefined) return call;
            return { ...call, params: { ...params, [PROGRESSES_PARAM]: "middle" } };
          }),
        })),
      });
      expect(() => danceAlone(bad, 8, 64, {}, RUN)).toThrow(/"start" or at "end"/);
    });
  });

  it("leaves a record that does not write the clause exactly as it was", () => {
    // Butter progresses at the boundary like every other programme dance, and
    // its timeline is identical to the one the old path threads (AC1's claim,
    // re-asserted here because the fill is now cut one run per seating).
    const old = figures(danceAlone(BUTTER, 7, 128).timeline());
    const now = figures(danceAlone(BUTTER, 7, 128, {}, { cycle: legacyCyclePlanner }).timeline());
    expect(now.map((e) => [e.figure, e.start, e.end])).toEqual(
      old.map((e) => [e.figure, e.start, e.end]),
    );
  });
});
