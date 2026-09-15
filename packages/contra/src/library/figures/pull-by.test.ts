import { createHall, dist, poseAt } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { danceAlone } from "../../dances/oracle.js";
import { contraDance } from "../../figures/chain.js";
import { DUPLE_IMPROPER, PLACE_PITCH_PX } from "../../formation/dupleImproper.js";
import { contraCyclePlanner } from "../../set/planCycle.js";
import { relate } from "../../set/relations.js";
import { setRulesFor } from "../../set/SetRules.js";
import { modelFromSet } from "../../set/SetModel.js";
import { contraDataFigures } from "./index.js";

/**
 * **Pull by and grand right and left**, the two travellers M6 writes — and the
 * claim that matters about them: the people they put you with are the people
 * the relation table names, and the places they leave you on are the lattice's.
 *
 * There is no coded twin to compare against (`compareFigures` is for a
 * migration), so what is asserted instead is the positive form: who danced with
 * whom, how far along the set everybody ended up, and that nobody walked through
 * anybody.
 */

const RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

const TABLE = setRulesFor(DUPLE_IMPROPER).relations;

/** A dance of one call, repeated to fill four phrases. */
const only = (figure: string, beats: number, params: Record<string, unknown>) =>
  contraDance({
    slug: `only-${figure}`,
    title: `Only ${figure}`,
    author: "M6",
    formation: DUPLE_IMPROPER,
    phrases: (["A1", "A2", "B1", "B2"] as const).map((name) => ({
      name,
      figures: [
        { figure, beats, params },
        { figure: "long-lines", beats: 16 - beats },
      ],
    })),
  });

const modelAt = (couples: number) =>
  modelFromSet(
    DUPLE_IMPROPER,
    createHall(DUPLE_IMPROPER, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!,
    new Map(),
  );

describe("pull by", () => {
  it("puts the dancers the relation names on each other's places", () => {
    const dance = only("pull-by", 2, { pairs: "neighbors", hand: "R" });
    const timeline = danceAlone(dance, 6, 2, {}, RUN).timeline();
    const model = modelAt(6);
    const home = (id: string) => model.dancers[id]!;
    for (const [a, b] of [
      ["set0/c0/lark", "set0/c1/robin"],
      ["set0/c2/lark", "set0/c3/robin"],
    ] as const) {
      // `relations.test.ts` derives these two neighbour pairs by hand.
      expect(home(a).slot.line).toBe(home(b).slot.line);
      const startA = poseAt(timeline, a, 0).p;
      const startB = poseAt(timeline, b, 0).p;
      // Two beats later each is standing where the other was, to a pixel.
      expect(dist(poseAt(timeline, a, 2).p, startB)).toBeLessThan(1e-6);
      expect(dist(poseAt(timeline, b, 2).p, startA)).toBeLessThan(1e-6);
    }
  });

  it("passes the named shoulder rather than walking through", () => {
    const dance = only("pull-by", 2, { pairs: "neighbors", hand: "R" });
    const timeline = danceAlone(dance, 6, 2, {}, RUN).timeline();
    let closest = Infinity;
    for (let t = 0; t <= 2; t += 0.05) {
      closest = Math.min(
        closest,
        dist(poseAt(timeline, "set0/c0/lark", t).p, poseAt(timeline, "set0/c1/robin", t).p),
      );
    }
    // Two 5 px bows to opposite sides is 10 px of clearance at the crossing.
    expect(closest).toBeGreaterThan(9);
  });

  it("joins the hand the call names, and only that one", () => {
    const dance = only("pull-by", 2, { pairs: "neighbors", hand: "L" });
    const timeline = danceAlone(dance, 6, 2, {}, RUN).timeline();
    const pose = poseAt(timeline, "set0/c0/lark", 1);
    expect(pose.hands.L).not.toBe("down");
    expect(pose.hands.R).toBe("down");
  });
});

describe("grand right and left", () => {
  /** Three passes, six beats, along the line: N1, then N2, then N3. */
  const dance = only("grand-right-and-left", 6, {});

  it("takes a dancer three places along the set, one a pass", () => {
    const timeline = danceAlone(dance, 6, 6, {}, RUN).timeline();
    const me = "set0/c2/lark";
    const start = poseAt(timeline, me, 0).p;
    for (const [beat, places] of [
      [2, 1],
      [4, 2],
      [6, 3],
    ] as const) {
      expect(dist(poseAt(timeline, me, beat).p, start), `beat ${String(beat)}`).toBeCloseTo(
        places * PLACE_PITCH_PX,
        6,
      );
    }
  });

  it("meets N1, then N2, then N3 — by the table, not by assumption", () => {
    const timeline = danceAlone(dance, 6, 6, {}, RUN).timeline();
    const model = modelAt(6);
    const me = "set0/c2/lark";
    // The three the table names for `c2/lark` in a six-couple line.
    const meets = ["set0/c3/robin", "set0/c5/robin", undefined] as const;
    expect(meets[0]).toBe(relateWord(model, me, 1));
    expect(meets[1]).toBe(relateWord(model, me, 2));
    // Each pass ends with the two of them having traded places, which is what
    // makes them a pair: measured, at the beat the pass finishes.
    for (const [beat, other] of [
      [2, meets[0]],
      [4, meets[1]],
    ] as const) {
      const before = poseAt(timeline, other, beat - 2).p;
      expect(dist(poseAt(timeline, me, beat).p, before)).toBeLessThan(1e-6);
    }
    // And N3 is off the end of a six-couple line, so the third pass has nobody
    // in it — M6's end-of-set rule, seen from inside a figure.
    expect(relateWord(model, me, 3)).toBeUndefined();
  });

  it("leaves nobody standing in the middle of the set, and nobody colliding", () => {
    const timeline = danceAlone(dance, 6, 6, {}, RUN).timeline();
    let closest = Infinity;
    const dancers = timeline.dancers();
    for (let t = 0; t <= 6; t += 0.1) {
      for (let i = 0; i < dancers.length; i++) {
        for (let j = i + 1; j < dancers.length; j++) {
          closest = Math.min(
            closest,
            dist(poseAt(timeline, dancers[i]!, t).p, poseAt(timeline, dancers[j]!, t).p),
          );
        }
      }
    }
    expect(closest).toBeGreaterThan(8);
  });
});

/** Who `N<k>` names, read through the real table. */
function relateWord(model: ReturnType<typeof modelAt>, me: string, k: number): string | undefined {
  return relate(model, TABLE, me, { kind: "neighbor", k });
}
