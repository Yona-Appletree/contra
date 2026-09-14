import { DEMO_DANCES } from "@caller/contra";
import { layoutHall } from "@caller/hall";
import { medleys } from "@caller/music";
import { describe, expect, it } from "vitest";
import { createDemoProgram, shuffleMedleyAssignment } from "./program.js";

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
