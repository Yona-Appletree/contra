import type { Vec2 } from "@caller/core";
import {
  HANDS_FOUR_GROUP,
  createHall,
  danceBeats,
  dist,
  poseAt,
  stationPose,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { nearestPlaces, placePairFor } from "../library/kinds/places.js";
import { contraDataEngine } from "../library/engine.js";
import {
  COLLISION_PX,
  CLOSURE_PX,
  LAB_RUN,
  danceAlone,
  danceBySlug,
  linesFor,
  oraclesFor,
} from "../dances/index.js";
import { formationById } from "../dances/formations.js";
import { modelFromSet } from "./SetModel.js";
import { resolveConcurrent } from "./resolve.js";

/**
 * **M9d — the places two instances of one call settle on.**
 *
 * M8b, M9b and M9c each measured one fault and named the same cause: two
 * instances of one call choose their end places out of one shared pool with no
 * knowledge of each other. The three cases they measured are the fixtures here,
 * at the lengths and beats they were measured at:
 *
 * | dance | beat | lengths | what was measured |
 * | --- | --- | --- | --- |
 * | Are You 'Most Done? | 80 | 5, 7, 9 | `c0/lark ~ c2/lark`, `collision 0.000 px` |
 * | Contrablend | 80 | 3, 4, 5, 6 | `c0/lark ~ c1/robin` on `(16, 20)`, `(16, 0)` empty |
 * | Jeremy Corners | 48 | 2–6 | the ones' gathering swing settles on the twos' places |
 *
 * The unit fixtures below are the two searches on their own, so that what the
 * ranking does is readable without running a dance; the dance fixtures are the
 * three cases themselves.
 */

/** A minor set's four places, as a duple improper hands-four holds them. */
const FOUR: readonly Vec2[] = [
  [16, -10],
  [-16, -10],
  [-16, 10],
  [16, 10],
];

describe("nearestPlaces ranks a place somebody else has taken last", () => {
  it("is unchanged when nothing is spoken for", () => {
    const natural: Vec2[] = [
      [15, -9],
      [-15, -9],
    ];
    expect(nearestPlaces(natural, FOUR)).toEqual([FOUR[0], FOUR[1]]);
  });

  it("gives up the nearer place when a peer instance is already on it", () => {
    const natural: Vec2[] = [
      [15, -9],
      [-15, -9],
    ];
    const spoken = [FOUR[0]!, FOUR[1]!];
    expect(nearestPlaces(natural, FOUR, spoken)).toEqual([FOUR[3], FOUR[2]]);
  });

  it("still takes a spoken-for place when there is no other", () => {
    const natural: Vec2[] = [
      [15, -9],
      [-15, -9],
    ];
    const pair = [FOUR[0]!, FOUR[1]!];
    // Only two places in the pool and both of them claimed: ranked, not
    // filtered, so the answer is still the formation's own places.
    expect(nearestPlaces(natural, pair, pair)).toEqual(pair);
  });
});

describe("placePairFor ranks a pair somebody else has taken last", () => {
  it("is unchanged when nothing is spoken for", () => {
    // Facing 90 is up the hall, so a square pair is one **across** the set:
    // `(±16, −10)` and `(±16, 10)`. A pair meeting on the first of them takes
    // it.
    const pair = placePairFor(FOUR, [0, -10], 90, 16);
    expect(pair.centre).toEqual([0, -10]);
  });

  it("takes the other square pair when a peer instance is on this one", () => {
    const spoken = [FOUR[0]!, FOUR[1]!];
    const pair = placePairFor(FOUR, [0, -10], 90, 16, spoken);
    expect(pair.centre).toEqual([0, 10]);
  });

  it("takes the free pair off square when every square pair is spoken for", () => {
    // **Contrablend's beat 80.** The pair ends *diagonally* — 58° — and a
    // hands-four holds exactly one diagonal square to that, so ranking alone
    // cannot move the second instance off the first's two places. The second
    // tier takes the other diagonal, which is a pair of the formation's own
    // places and not square to this facing.
    const spoken = [FOUR[0]!, FOUR[2]!];
    const first = placePairFor(FOUR, [0, 0], 58, 18.87);
    expect(new Set(first.ends)).toEqual(new Set(spoken));
    const second = placePairFor(FOUR, [0, 0], 58, 18.87, spoken);
    expect(new Set(second.ends)).toEqual(new Set([FOUR[1]!, FOUR[3]!]));
  });
});

describe("the ledger is one per frame, in resolution order", () => {
  /** One call resolved against a fresh duple improper set of `couples`. */
  const resolve = (
    couples: number,
    figure: string,
    params: Record<string, unknown>,
    who?: string,
  ) => {
    const formation = formationById("duple-improper");
    const hall = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
    const set = hall.sets[0]!;
    const groups = formation.groupsFor(HANDS_FOUR_GROUP, set);
    const world = new Map(
      groups.flatMap((plan) =>
        plan.stations.flatMap((station) => {
          const dancer = plan.members[station.id];
          return dancer === undefined
            ? []
            : ([[dancer, stationPose(plan.frame, station)]] as const);
        }),
      ),
    );
    const model = modelFromSet(formation, set, world);
    return resolveConcurrent(
      { figure, beats: 16, params, ...(who === undefined ? {} : { who }) },
      { model, formation, library: contraDataEngine().library, groups },
      0,
    );
  };

  it("seats the two instances of one hands-four's call as 0 and 1", () => {
    const instances = resolve(4, "balance-and-swing", { pairs: "neighbors" });
    const seats = instances
      .filter((i) => !i.holdPlace)
      .map((i) => i.params["claims"] as { me: number } | undefined);
    expect(seats.every((seat) => seat !== undefined)).toBe(true);
    // Four couples is two hands-fours of two pairs each, and each hands-four
    // has its own ledger: the seats read 0, 1, 0, 1 rather than 0, 1, 2, 3.
    expect(seats.map((seat) => seat!.me)).toEqual([0, 1, 0, 1]);
  });

  it("gives the two hands-fours two different ledgers", () => {
    const instances = resolve(4, "balance-and-swing", { pairs: "neighbors" });
    const ledgers = instances
      .filter((i) => !i.holdPlace)
      .map((i) => (i.params["claims"] as { ledger: object }).ledger);
    expect(new Set(ledgers).size).toBe(2);
  });

  it("holds the place a dancer standing through the call is on", () => {
    // "Ones balance and swing": the twos stand, and the two places they are
    // standing on are held for the whole call. Jeremy Corners' beat 48.
    const instances = resolve(4, "balance-and-swing", { pairs: "partners" }, "ones");
    const dancing = instances.find((i) => !i.holdPlace)!;
    const held = (dancing.params["claims"] as { ledger: { held: Vec2[] } }).ledger.held;
    expect(held.length).toBeGreaterThan(0);
    const homes = dancing.params["homes"] as Vec2[];
    for (const place of held) {
      expect(homes.some((home) => dist(home, place) < 1e-9)).toBe(true);
    }
  });

  it("hands a call nobody stands through an empty hold list", () => {
    const instances = resolve(4, "balance-and-swing", { pairs: "neighbors" });
    const dancing = instances.find((i) => !i.holdPlace)!;
    expect((dancing.params["claims"] as { ledger: { held: Vec2[] } }).ledger.held).toEqual([]);
  });

  /**
   * **The ledger is written during planning, so the dance has to come out the
   * same however many times a plan is built.**
   *
   * A plan is built at least three times per instance — `joins` for the carried
   * holds, `moves` to advance the set, then `ends` and every `sample` — and
   * `settleEnds` runs on every one of them. The ledger is keyed by the
   * instance's index and an instance reads only the claims of instances before
   * it, so re-planning writes the same answer back; this is the whole dance
   * measured twice, which would catch any leak between runs as well.
   */
  it("plans the same dance twice to the same pose, at every eighth of a beat", () => {
    const dance = danceBySlug("jeremy-corners")!;
    const until = danceBeats(dance) * 2;
    const dump = (): string => {
      const timeline = danceAlone(dance, 4, until, {}, LAB_RUN).timeline();
      const out: string[] = [];
      for (let beat = 0; beat <= until; beat += 0.125) {
        for (const dancer of timeline.dancers()) {
          const p = poseAt(timeline, dancer, beat).p;
          out.push(`${dancer}@${beat.toFixed(3)}=${p[0].toFixed(12)},${p[1].toFixed(12)}`);
        }
      }
      return out.join("\n");
    };
    expect(dump()).toBe(dump());
  });
});

describe("the three cases M8b, M9b and M9c measured", () => {
  /** The set, posed at one instant. */
  const posesAt = (slug: string, couples: number, beat: number): Map<string, Vec2> => {
    const dance = danceBySlug(slug)!;
    const timeline = danceAlone(dance, couples, danceBeats(dance) * 2, {}, LAB_RUN).timeline();
    const out = new Map<string, Vec2>();
    for (const dancer of timeline.dancers()) out.set(dancer, poseAt(timeline, dancer, beat).p);
    return out;
  };

  /**
   * **Two dancers on one floor point**, which is the fault itself and has no
   * threshold in it: the three cases were all measured as `0.000 px`, because a
   * place taken twice is the *same* number twice.
   */
  const onOnePoint = (poses: Map<string, Vec2>): string[] => {
    const ids = [...poses.keys()];
    const out: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const gap = dist(poses.get(ids[i]!)!, poses.get(ids[j]!)!);
        if (gap < 1e-6) out.push(`${ids[i]!} ~ ${ids[j]!} (${gap.toFixed(4)} px)`);
      }
    }
    return out;
  };

  /** How far apart the two dancers a milestone named actually are. */
  const between = (poses: Map<string, Vec2>, a: string, b: string): number =>
    dist(poses.get(`set0/${a}`)!, poses.get(`set0/${b}`)!);

  /**
   * The case, the lengths it was measured at, the beat, and the pair the
   * milestone's report named. `pair` is checked against AC6's own 8 px;
   * everybody else is checked only against standing on one point, because a
   * figure's ordinary near-passes are the figure's business and each dance's
   * own oracle row is where they are reported.
   */
  const CASES = [
    {
      slug: "are-you-most-done",
      lengths: [5, 7, 9],
      beat: 80,
      pair: ["c0/lark", "c2/lark"] as const,
    },
    {
      slug: "contrablend",
      lengths: [3, 4, 5, 6],
      beat: 80,
      pair: ["c0/lark", "c1/robin"] as const,
    },
    {
      slug: "jeremy-corners",
      lengths: [2, 3, 4, 5, 6],
      beat: 48,
      pair: ["c0/lark", "c1/robin"] as const,
    },
  ];

  for (const { slug, lengths, beat, pair } of CASES) {
    for (const couples of lengths) {
      it(`puts nobody on one point in ${slug} at beat ${String(beat)}, ${String(couples)} couples`, () => {
        const poses = posesAt(slug, couples, beat);
        expect(poses.size).toBe(couples * 2);
        expect(onOnePoint(poses)).toEqual([]);
      });

      it(`keeps ${pair[0]} clear of ${pair[1]} in ${slug} at beat ${String(beat)}, ${String(couples)} couples`, () => {
        const poses = posesAt(slug, couples, beat);
        expect(between(poses, pair[0], pair[1])).toBeGreaterThan(COLLISION_PX);
      });
    }
  }

  it("leaves Are You 'Most Done?'s closure at 0.0000 px at every checked length", () => {
    // M9b's own objection to the ledger, and the reason M9c said it no longer
    // applies: the closure it damaged was the becket boundary, which M9c fixed.
    const dance = danceBySlug("are-you-most-done")!;
    for (const couples of linesFor(dance)) {
      const o = oraclesFor(dance, couples, danceBeats(dance) * 2, {}, LAB_RUN);
      expect(o.closurePx, `${String(couples)} couples`).toBeLessThan(CLOSURE_PX);
    }
  });
});
