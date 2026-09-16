import { describe, expect, it } from "vitest";
import { poseAt } from "@caller/choreo";
import { ALL_DANCES } from "../dances/index.js";
import { LAB_RUN } from "../dances/danceLab.js";
import { danceAlone, formationFor, linesFor, oraclesFor } from "../dances/oracle.js";

/**
 * **The hey that straightens as it proceeds, and the progression it carries**
 * (M9g; DD57, Q12 re-opened).
 *
 * The Caller's Box's note on Are You 'Most Done? — *"Hey can straighten out as
 * it proceeds. Dance begins with same neighbors as in the hey"* — is one
 * sentence about the lane and one about the progression, and under FR-C2's
 * half-width becket shift they are the same fact: straightening a right-diagonal
 * lane slides each line half a couple place along itself, which **is** the
 * becket progression. So the hey carries it (`progresses: true`), and the number
 * that says whether the bodies really arrive where the model reseats them is
 * `progressed`, which reads 20.0000 px at every line length without this and
 * 0.0000 px with it.
 *
 * Three mechanisms make the number, and each has its own case below:
 *
 * 1. the lane is a **trajectory** (`kinds/schedule.ts`);
 * 2. a dancer the call leaves on **hold place slides with their own line**
 *    rather than standing in the way of the ones it sweeps (`planCycle.ts`);
 * 3. a couple that goes out and is **not** going to cross **turns in its
 *    waiting hold**, so it steps back out on to its own stations
 *    (`@caller/choreo`'s `waitOut`), and a pass whose own figure carried the
 *    progression does not cross at its boundary at all, because the seating
 *    does not move there.
 */
describe("Are You 'Most Done?'s diagonal hey carries the becket half-shift", () => {
  const dance = ALL_DANCES.find((d) => d.slug === "are-you-most-done")!;

  it("is a dance whose hey straightens and carries the progression", () => {
    const hey = dance.phrases
      .flatMap((phrase) => phrase.figures)
      .find((figure) => figure.figure === "hey")!;
    expect(hey.params).toMatchObject({
      axis: "diagonal",
      straighten: true,
      progresses: true,
    });
  });

  for (const couples of linesFor(dance)) {
    it(`leaves every dancer on the progressed set's own station at ${String(couples)} couples`, () => {
      const o = oraclesFor(dance, couples, 128, {}, LAB_RUN);
      // The whole point: bodies where the model reseats them, to the last bit.
      expect(o.progressedPx).toBeLessThan(1e-9);
      expect(o.closurePx).toBeLessThan(1e-9);
      expect(o.maxShort).toBeLessThan(1e-9);
      // AC6's eight px, over the whole time through, everybody against everybody.
      expect(o.minDistancePx).toBeGreaterThan(8);
    });
  }

  it("straightens: the hey's four end square across the set, half a place along their own lines", () => {
    const couples = 6;
    const timeline = danceAlone(dance, couples, 128, {}, LAB_RUN).timeline();
    const at = (id: string, beat: number) => poseAt(timeline, `set0/${id}`, beat)!.p;
    // B1's hey runs from beat 32 to beat 48. At six couples its first foursome
    // is `c0` (line 0) and `c3` (line 1), standing on a right diagonal: two
    // couples across the set and one couple place apart along it.
    const before = {
      c0lark: at("c0/lark", 32),
      c0robin: at("c0/robin", 32),
      c3lark: at("c3/lark", 32),
      c3robin: at("c3/robin", 32),
    };
    expect(before.c0lark[1] - before.c3lark[1]).toBeCloseTo(-20, 9);
    // Each line has slid half a couple place along itself — line 0 down the set,
    // line 1 up it — and the two couples are level across the set.
    const after = {
      c0lark: at("c0/lark", 48),
      c0robin: at("c0/robin", 48),
      c3lark: at("c3/lark", 48),
      c3robin: at("c3/robin", 48),
    };
    expect(after.c0lark[0]).toBeCloseTo(before.c0lark[0], 9);
    expect(after.c0lark[1] - before.c0lark[1]).toBeCloseTo(20, 9);
    expect(after.c0robin[1] - before.c0robin[1]).toBeCloseTo(20, 9);
    expect(after.c3lark[1] - before.c3lark[1]).toBeCloseTo(-20, 9);
    expect(after.c3robin[1] - before.c3robin[1]).toBeCloseTo(-20, 9);
    // Square across: the two couples' middles are level along the set.
    expect((after.c0lark[1] + after.c0robin[1]) / 2).toBeCloseTo(
      (after.c3lark[1] + after.c3robin[1]) / 2,
      9,
    );
  });

  it("slides the couple the hey leaves out along with its own line", () => {
    const couples = 6;
    const timeline = danceAlone(dance, couples, 128, {}, LAB_RUN).timeline();
    // `c1` has no N2 at six couples and stands the hey out; it is also the
    // couple the progression puts out of the set. Standing still would leave
    // it on `(16, 40)`, which is where the hey's own `c3/lark` lands.
    for (const role of ["lark", "robin"] as const) {
      const from = poseAt(timeline, `set0/c1/${role}`, 32)!.p;
      const to = poseAt(timeline, `set0/c1/${role}`, 48)!.p;
      expect(to[0]).toBeCloseTo(from[0], 9);
      expect(to[1] - from[1]).toBeCloseTo(-20, 9);
    }
  });

  it("puts the couple that waits out on its own two stations", () => {
    const couples = 6;
    const formation = formationFor(dance);
    const timeline = danceAlone(dance, couples, 128, {}, LAB_RUN).timeline();
    // The wait group's two stations are the lark's and the robin's by role, and
    // the couple arrives at them the wrong way round: without the turn in the
    // hold the two finish on each other's, 20 px out, at every line length.
    expect(formation.id).toBe("becket-right");
    const lark = poseAt(timeline, "set0/c1/lark", 64)!.p;
    const robin = poseAt(timeline, "set0/c1/robin", 64)!.p;
    expect(lark[1]).toBeGreaterThan(robin[1]);
  });
});
