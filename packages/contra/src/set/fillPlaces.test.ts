import type { Vec2 } from "@caller/core";
import { WAIT_OUT, danceBeats, dist, groupStationPose, poseAt } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { COLLISION_PX, LAB_RUN, danceAlone, danceBySlug, linesFor } from "../dances/index.js";

/**
 * **M9e — where the fill puts a waiting couple down.**
 *
 * M9d de-conflicted the places two instances of one *call* settle on, and then
 * measured the same sentence one level out: the waiting couples' `wait-out`,
 * which the fill plans after every call of every pass, was landing a dancer on
 * a place a call of the time through had settled somebody else on. Three of the
 * six lab dances collided on it, all of them at a cycle or pass boundary, all
 * of them `collision 0.000 px`.
 *
 * The cause is not a search that needed de-conflicting. It is that a duple
 * improper crossing — a **swap**, the two dancers trading the two stations of
 * their own wait group — was reckoning its *landing* from `WaitOutParams.
 * startPlaces`, and `planCycle`'s `waitingFrom` fills that field with **where
 * the couple's bodies really are** (M8b, so the step together starts from the
 * truth). So the landing followed the bodies: whatever place the dance had left
 * the other dancer on became the place this one crossed to, and if a call had
 * settled somebody there, two dancers stood on one point.
 *
 * `@caller/choreo`'s `waitOut` now lands a swap on the other **station** — a
 * place of the formation, which is what the next time through wants — and reads
 * `startPlaces` only for the entry. The fill thereby lands on its own places
 * and on nobody else's: a wait group's two stations are the end places of the
 * line that no hands-four of this time through holds, so respecting them is
 * respecting the pool.
 *
 * The fixtures are M9d's own report, at the beat and the lengths it measured:
 *
 * | dance | beat | lengths | what M9d measured |
 * | --- | --- | --- | --- |
 * | Contrablend | 128 | 3, 4, 5, 6 | `wait-out@64` lands on a place `hold-place` has been on since beat 118 |
 * | Jeremy Corners | 128 | 2, 3, 4, 5, 6 | `wait-out@64` and a `swing@120` finish on one point |
 */

/** The last beat of the second time through, which is where M9d measured. */
const BOUNDARY = 128;

/** The whole set, posed at one instant. */
function posesAt(slug: string, couples: number, beat: number): Map<string, Vec2> {
  const dance = danceBySlug(slug)!;
  const timeline = danceAlone(dance, couples, danceBeats(dance) * 2, {}, LAB_RUN).timeline();
  const out = new Map<string, Vec2>();
  for (const dancer of timeline.dancers()) out.set(dancer, poseAt(timeline, dancer, beat).p);
  return out;
}

/**
 * **Two dancers on one floor point** — the fault itself, with no threshold in
 * it: every case M9d reported measured `0.000 px`, because a place taken twice
 * is the same number twice.
 */
function onOnePoint(poses: Map<string, Vec2>): string[] {
  const ids = [...poses.keys()];
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const gap = dist(poses.get(ids[i]!)!, poses.get(ids[j]!)!);
      if (gap < 1e-6) out.push(`${ids[i]!} ~ ${ids[j]!} (${gap.toFixed(4)} px)`);
    }
  }
  return out;
}

/** The pair whose collision M9d's report named, at each length. */
const CASES = [
  { slug: "contrablend", couples: 3, pair: ["c1/lark", "c2/lark"] as const },
  { slug: "contrablend", couples: 4, pair: ["c1/robin", "c1/lark"] as const },
  { slug: "contrablend", couples: 5, pair: ["c1/lark", "c4/lark"] as const },
  { slug: "contrablend", couples: 6, pair: ["c1/robin", "c2/robin"] as const },
  { slug: "jeremy-corners", couples: 2, pair: ["c0/lark", "c1/lark"] as const },
  { slug: "jeremy-corners", couples: 3, pair: ["c0/robin", "c1/lark"] as const },
  { slug: "jeremy-corners", couples: 4, pair: ["c0/lark", "c2/lark"] as const },
  { slug: "jeremy-corners", couples: 5, pair: ["c0/robin", "c1/lark"] as const },
  { slug: "jeremy-corners", couples: 6, pair: ["c4/lark", "c5/robin"] as const },
];

describe("the fill lands on its own places, at the boundary M9d measured", () => {
  for (const { slug, couples, pair } of CASES) {
    it(`puts nobody on one point in ${slug} at beat 128, ${String(couples)} couples`, () => {
      const poses = posesAt(slug, couples, BOUNDARY);
      expect(poses.size).toBe(couples * 2);
      expect(onOnePoint(poses)).toEqual([]);
    });

    it(`keeps ${pair[0]} clear of ${pair[1]} in ${slug} at beat 128, ${String(couples)} couples`, () => {
      const poses = posesAt(slug, couples, BOUNDARY);
      expect(dist(poses.get(`set0/${pair[0]}`)!, poses.get(`set0/${pair[1]}`)!)).toBeGreaterThan(
        COLLISION_PX,
      );
    });
  }
});

/**
 * **The mechanism itself, said about every `wait-out` of both dances at every
 * length**: a couple that crosses finishes on the two stations of its own wait
 * group, one dancer each — not on wherever the dance left the other dancer.
 *
 * This is what makes the boundary cases above hold rather than a coincidence of
 * those particular dances: a wait group's stations are the places of the line
 * that no hands-four of this time through holds, so a couple that lands on them
 * cannot land on a place a call has given out.
 */
describe("every crossing wait-out ends on its own wait group's two stations", () => {
  for (const slug of ["contrablend", "jeremy-corners", "annas-reel"]) {
    it(`holds for ${slug} at every checked length`, () => {
      const dance = danceBySlug(slug)!;
      let crossings = 0;
      for (const couples of linesFor(dance)) {
        const timeline = danceAlone(dance, couples, danceBeats(dance) * 2, {}, LAB_RUN).timeline();
        for (const event of timeline.figures()) {
          if (event.figure !== WAIT_OUT.id) continue;
          // Only an instance that actually crosses: one a `"line"` call still
          // has to sweep the couple out of ends at its own station instead.
          if ((event.params as { cross?: boolean }).cross !== true) continue;
          const group = timeline.group(event.group);
          const stations = group.stations.map((s) => groupStationPose(group, s.id).p);
          const landed: number[] = [];
          for (const dancer of Object.values(event.bindings)) {
            const p = poseAt(timeline, dancer, event.end).p;
            const on = stations.findIndex((place) => dist(place, p) < 1e-9);
            expect(on, `${dancer} at beat ${String(event.end)} of ${slug}`).toBeGreaterThanOrEqual(
              0,
            );
            landed.push(on);
          }
          // One each, never both on the same station.
          expect(new Set(landed).size).toBe(landed.length);
          crossings += 1;
        }
      }
      // The sweep is not allowed to go vacuous.
      expect(crossings).toBeGreaterThan(0);
    });
  }
});
