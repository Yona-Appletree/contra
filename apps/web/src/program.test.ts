import type { Dance } from "@caller/choreo";
import { poseAt } from "@caller/choreo";
import { ALL_DANCES, DEMO_DANCES, DUPLE_IMPROPER, danceOwes } from "@caller/contra";
import { layoutHall } from "@caller/hall";
import { medleys } from "@caller/music";
import { describe, expect, it } from "vitest";
import {
  CYCLE_BEATS,
  LINEUP_BEATS,
  createDemoProgram,
  danceOrder,
  isLabDance,
  lineUpStartBeat,
  positionAt,
  shuffleMedleyAssignment,
} from "./program.js";

/**
 * The seeded medley shuffle (T1: "ensure we have more tunes to randomize (I
 * am so sick of soldier's joy)").
 *
 * Two properties, over the *circular* order of the dances — the programme
 * loops back to its first dance after its last, and that loop-back is a
 * real dance switch too, not a special case:
 *
 *  - no two circularly-adjacent dances share a medley;
 *  - every medley is danced once before any medley repeats.
 */

const DANCE_SLUGS = DEMO_DANCES.map((d) => d.slug);
const MEDLEY_SLUGS = medleys.map((m) => m.slug);
const SEEDS = [0, 1, 7, 42, 20260914, -3, 1000000];

/** No two circularly-adjacent entries of `order` are equal. */
function noAdjacentRepeats(order: readonly string[]): boolean {
  return order.every((slug, i) => slug !== order[(i + 1) % order.length]);
}

describe("shuffleMedleyAssignment", () => {
  it("assigns every dance a medley that is actually one of the offered medleys", () => {
    for (const seed of SEEDS) {
      const assignment = shuffleMedleyAssignment(seed, DANCE_SLUGS, MEDLEY_SLUGS);
      expect(assignment.size).toBe(DANCE_SLUGS.length);
      for (const slug of DANCE_SLUGS) {
        expect(MEDLEY_SLUGS, `seed ${String(seed)}, dance ${slug}`).toContain(assignment.get(slug));
      }
    }
  });

  it("never gives two consecutive dances the same medley, including the loop-back", () => {
    for (const seed of SEEDS) {
      const assignment = shuffleMedleyAssignment(seed, DANCE_SLUGS, MEDLEY_SLUGS);
      const order = DANCE_SLUGS.map((slug) => assignment.get(slug)!);
      expect(noAdjacentRepeats(order), `seed ${String(seed)}: ${order.join(",")}`).toBe(true);
    }
  });

  it("uses every medley once before any medley repeats", () => {
    // With ten dances and six medleys, the first six dances are one full
    // "bag": a permutation of all six medleys, no repeats among them.
    for (const seed of SEEDS) {
      const assignment = shuffleMedleyAssignment(seed, DANCE_SLUGS, MEDLEY_SLUGS);
      const firstRound = DANCE_SLUGS.slice(0, MEDLEY_SLUGS.length).map((slug) =>
        assignment.get(slug)!,
      );
      expect(new Set(firstRound).size, `seed ${String(seed)}`).toBe(MEDLEY_SLUGS.length);
    }
  });

  it("is deterministic: the same seed always gives the same assignment", () => {
    const a = shuffleMedleyAssignment(42, DANCE_SLUGS, MEDLEY_SLUGS);
    const b = shuffleMedleyAssignment(42, DANCE_SLUGS, MEDLEY_SLUGS);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("gives different seeds different evenings, at least some of the time", () => {
    const orders = SEEDS.map((seed) =>
      DANCE_SLUGS.map((slug) =>
        shuffleMedleyAssignment(seed, DANCE_SLUGS, MEDLEY_SLUGS).get(slug),
      ).join(","),
    );
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("still holds both properties when there are fewer dances than medleys", () => {
    const fewDances = DANCE_SLUGS.slice(0, 2);
    for (const seed of SEEDS) {
      const assignment = shuffleMedleyAssignment(seed, fewDances, MEDLEY_SLUGS);
      const order = fewDances.map((slug) => assignment.get(slug)!);
      expect(noAdjacentRepeats(order)).toBe(true);
      expect(new Set(order).size).toBe(order.length);
    }
  });

  it("holds up over many small (dances, medleys) combinations, not just this demo's", () => {
    for (const n of [2, 3, 4, 5, 7]) {
      for (const m of [3, 4, 5]) {
        const dances = Array.from({ length: n }, (_, i) => `d${String(i)}`);
        const ms = Array.from({ length: m }, (_, i) => `m${String(i)}`);
        for (const seed of [0, 1, 5]) {
          const assignment = shuffleMedleyAssignment(seed, dances, ms);
          const order = dances.map((slug) => assignment.get(slug)!);
          expect(
            noAdjacentRepeats(order),
            `n=${String(n)} m=${String(m)} seed=${String(seed)}: ${order.join(",")}`,
          ).toBe(true);
        }
      }
    }
  });

  it("is a no-op assignment (everyone gets the one medley) when there is only one", () => {
    const assignment = shuffleMedleyAssignment(5, DANCE_SLUGS, ["only-one"]);
    for (const slug of DANCE_SLUGS) expect(assignment.get(slug)).toBe("only-one");
  });
});

describe("createDemoProgram's medley shuffle", () => {
  const world = layoutHall({ lines: 2, couplesPerLine: [5, 4] });

  it("gives `program.medleys` one entry per dance, matching the shuffle", () => {
    const program = createDemoProgram(world, undefined, 42);
    expect(program.medleys).toHaveLength(program.dances.length);
    const assignment = shuffleMedleyAssignment(42, DANCE_SLUGS, MEDLEY_SLUGS);
    program.dances.forEach((dance, i) => {
      expect(program.medleys[i]).toBe(assignment.get(dance.slug));
    });
  });

  it("gives `program.tunes` one concrete tune per dance, each belonging to that dance's medley", () => {
    const program = createDemoProgram(world, undefined, 42);
    expect(program.tunes).toHaveLength(program.dances.length);
    program.dances.forEach((dance, i) => {
      const medleySlug = program.medleys[i]!;
      const medley = medleys.find((m) => m.slug === medleySlug)!;
      expect(medley.tunes, `dance ${dance.slug}`).toContain(program.tunes[i]);
    });
  });

  it("gives a multi-tune medley more than one tune across the evening, not just its first", () => {
    // Ten dances and six medleys means at least one medley is shuffled onto
    // more than one dance over a lap; when that happens, it should be heard
    // giving up a *different* tune the second time, not always tune 0.
    const program = createDemoProgram(world, undefined, 3);
    const byMedley = new Map<string, Set<string>>();
    program.dances.forEach((dance, i) => {
      const medleySlug = program.medleys[i]!;
      const set = byMedley.get(medleySlug) ?? new Set<string>();
      set.add(program.tunes[i]!.slug);
      byMedley.set(medleySlug, set);
    });
    const multiTuneMedleysUsedTwice = [...byMedley.entries()].filter(([slug, tuneSlugs]) => {
      const medley = medleys.find((m) => m.slug === slug)!;
      return medley.tunes.length > 1 && tuneSlugs.size > 1;
    });
    expect(multiTuneMedleysUsedTwice.length).toBeGreaterThan(0);
  });

  it("keeps every dance's medley the same whichever dance the programme starts from", () => {
    // Rotating which dance leads must not change which medley a given dance
    // is shuffled onto — the shuffle is built over the dances' own fixed
    // order, precisely so that starting from the middle of the evening
    // does not change the tune of the dance the user picked.
    const plain = createDemoProgram(world, undefined, 7);
    const rotated = createDemoProgram(world, DEMO_DANCES[3]!.slug, 7);
    const plainBySlug = new Map(plain.dances.map((d, i) => [d.slug, plain.medleys[i]]));
    const rotatedBySlug = new Map(rotated.dances.map((d, i) => [d.slug, rotated.medleys[i]]));
    for (const slug of DANCE_SLUGS) expect(rotatedBySlug.get(slug)).toBe(plainBySlug.get(slug));
  });

  it("reproduces the same shuffle for the same seed", () => {
    const a = createDemoProgram(world, undefined, 99);
    const b = createDemoProgram(world, undefined, 99);
    expect(a.medleys).toEqual(b.medleys);
  });
});

/**
 * U4 requirement 6: "when you select a new dance it starts immediately...
 * it should start with the normal line up." Picking a dance (a Dances-tab
 * tap, `#/dance/<slug>`, or the reset control) starts the programme at the
 * beginning of that dance's own line-up — the announcement, skipping the
 * thanks stretch, since there was no previous dance — rather than at its
 * dancing beat 0.
 */
describe("lineUpStartBeat: a freshly chosen dance starts at its own line-up", () => {
  const world = layoutHall({ lines: 2, couplesPerLine: [5, 4] });

  it("starts at the beginning of the announcement, skipping the thanks stretch", () => {
    const program = createDemoProgram(world, "butter", 7);
    const at = lineUpStartBeat(program.dances.length);
    const position = positionAt(program, at);
    expect(position.between).toBe("announcement");
    expect(position.next.slug).toBe("butter");
  });

  it("reaches the chosen dance's own dancing beat 0 exactly LINEUP_BEATS later", () => {
    const program = createDemoProgram(world, "butter", 7);
    const at = lineUpStartBeat(program.dances.length);
    const position = positionAt(program, at + LINEUP_BEATS);
    expect(position.dance.slug).toBe("butter");
    expect(position.danceBeat).toBe(0);
    expect(position.liningUp).toBe(false);
  });

  it("a beat one short of the interval is still lining up, not yet dancing", () => {
    const program = createDemoProgram(world, "butter", 7);
    const at = lineUpStartBeat(program.dances.length);
    const position = positionAt(program, at + LINEUP_BEATS - 1);
    expect(position.liningUp).toBe(true);
    expect(position.next.slug).toBe("butter");
  });

  it("with an explicit danceIndex, points at the item that announces dances[danceIndex] — the reset control's own arithmetic", () => {
    const program = createDemoProgram(world, undefined, 3);
    const n = program.dances.length;
    for (let idx = 0; idx < n; idx++) {
      const at = lineUpStartBeat(n, idx);
      const position = positionAt(program, at);
      expect(position.between, `idx ${String(idx)}`).toBe("announcement");
      expect(position.next.slug, `idx ${String(idx)}`).toBe(program.dances[idx]!.slug);
    }
  });

  it("holds for every demo dance, not just Butter", () => {
    for (const dance of DEMO_DANCES) {
      const program = createDemoProgram(world, dance.slug, 11);
      const at = lineUpStartBeat(program.dances.length);
      expect(positionAt(program, at).next.slug, dance.slug).toBe(dance.slug);
      expect(positionAt(program, at + LINEUP_BEATS).dance.slug, dance.slug).toBe(dance.slug);
    }
  });
});

describe("danceOrder and the two engines (M3)", () => {
  const world = layoutHall({ lines: 2, couplesPerLine: [8, 7] });

  it("rotates the programme to the dance that was chosen", () => {
    expect(danceOrder(DEMO_DANCES[3]!.slug)[0]!.slug).toBe(DEMO_DANCES[3]!.slug);
    expect(danceOrder(DEMO_DANCES[3]!.slug)).toHaveLength(DEMO_DANCES.length);
    expect(danceOrder()).toEqual([...DEMO_DANCES]);
    expect(danceOrder("no-such-dance")).toEqual([...DEMO_DANCES]);
  });

  /*
   * A dance the programme does not hold but the package does leads the evening,
   * one item longer than the programme — tested against a fixture so the rule
   * is about the rule rather than about whichever lab dance exists this week.
   */
  const labDance = (slug: string, figure: string): Dance => ({
    slug,
    title: slug,
    author: "fixture",
    formation: DUPLE_IMPROPER.id,
    phrases: (["A1", "A2", "B1", "B2"] as const).map((name) => ({
      name,
      figures: [{ figure, beats: 16, params: {} }],
    })),
  });

  it("puts a lab dance in front of the programme rather than rotating within it", () => {
    const lab = labDance("lab-one", "long-lines");
    const all = [...DEMO_DANCES, lab];
    const order = danceOrder("lab-one", DEMO_DANCES, all);
    expect(order[0]).toBe(lab);
    expect(order).toHaveLength(DEMO_DANCES.length + 1);
    expect(order.slice(1)).toEqual([...DEMO_DANCES]);
    expect(isLabDance("lab-one", DEMO_DANCES, all)).toBe(true);
  });

  /*
   * M6 brings the first lab dances that name a figure a later milestone owns.
   * Such a dance cannot be planned at all — resolution throws on the first call
   * it reaches — so the evening leaves it out rather than taking the Stage down
   * with it. Its own page still holds the record and says what it owes.
   */
  it("owes nothing since M9, so every lab dance can be planned", () => {
    // **The list this test used to read is empty.** `square-through` was M8's
    // and then M9's, `shoulder-round` was M5's and `circulate` M6's-then-M7's,
    // and all of them are written now — which is exactly what the list is
    // supposed to notice, and M9 emptied it
    // (`acceptance.test.ts`: `UNSUPPORTED_FIGURES` is `[]`). So there is no
    // figure id left that a dance can owe, `danceOwes` answers nothing for
    // every dance, and the evening leaves nobody out for that reason.
    //
    // The guard it exercised is still in `danceOrder` and is **untested until a
    // later milestone puts a name back on the list**; there is no way to make a
    // dance owe a figure while the list is empty, and inventing one would test
    // the fixture rather than the rule.
    const lab = labDance("lab-owed", "square-through");
    const all = [...DEMO_DANCES, lab];
    expect(danceOwes(lab)).toEqual([]);
    for (const dance of all) expect(danceOwes(dance), dance.slug).toEqual([]);
    expect(danceOrder("lab-owed", DEMO_DANCES, all)[0]).toBe(lab);
    // It is still a lab dance, and the Dances tab still lists it.
    expect(isLabDance("lab-owed", DEMO_DANCES, all)).toBe(true);
  });

  it("holds the three dances M6 encoded, two of them on the Stage now", () => {
    // M7b: Whoosh and A Rare Bird are green at every checked line length and
    // are in the programme; Contrablend stays in the lab, on its own ends — the
    // dancers at either end of a five- or six-couple line have no shadow and no
    // N2, so they stand through the last thirteen beats of B2 and end 32 to
    // 37.7 px from where the next time through's `wait-out` starts them.
    for (const slug of ["whoosh", "a-rare-bird"]) {
      const dance = ALL_DANCES.find((d) => d.slug === slug);
      expect(dance, slug).toBeDefined();
      expect(isLabDance(slug), slug).toBe(false);
    }
    expect(ALL_DANCES.find((d) => d.slug === "contrablend")).toBeDefined();
    expect(isLabDance("contrablend")).toBe(true);
  });

  it("builds a programme that dances on either engine", () => {
    for (const engine of ["new", "old"] as const) {
      const program = createDemoProgram(world, "butter", 7, {}, engine);
      expect(program.dances[0]!.slug, engine).toBe("butter");
      expect(program.decider.covered(), engine).toBeGreaterThanOrEqual(CYCLE_BEATS);
    }
  });

  /*
   * The point of `?engine=`: the two paths are different dancing, not two
   * spellings of one. Jubilation's hey into the swing is the one seam in the
   * demo corpus where they differ — every other dance is identical to 1e-14 px
   * — so it is the case that would catch the toggle silently doing nothing.
   */
  it("really dances Jubilation's hey into the swing differently on the new engine", () => {
    const [neu, old] = (["new", "old"] as const).map((engine) =>
      createDemoProgram(world, "jubilation", 7, {}, engine),
    );
    let worst = 0;
    for (let beat = 0; beat <= CYCLE_BEATS; beat += 0.25) {
      for (const who of neu!.timeline.dancers()) {
        const a = poseAt(neu!.timeline, who, beat);
        const b = poseAt(old!.timeline, who, beat);
        worst = Math.max(worst, Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]));
      }
    }
    // Measured, not asserted at a round number: the swing's honest end is
    // 12.2 px from the station the coded swing walks back to.
    expect(worst).toBeGreaterThan(10);
  });
});
