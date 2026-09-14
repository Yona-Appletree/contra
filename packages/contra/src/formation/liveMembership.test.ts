import type { CoupleState, GroupPlan, SetState } from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  WALK_TO_STATION,
  assertPartition,
  closureReport,
  coverageProblems,
  createFigureRegistry,
  createGroup,
  createTimeline,
  groupStationPose,
  withDefaults,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER, SHADOW_PAIR_GROUP } from "./dupleImproper.js";

/**
 * The director's own ruling on Q1 (director-addenda.md, ~18:05 PDT): "it
 * might be worth writing or finding a dance that involves shadow work to
 * ensure they get a new hands-4 group, because that's valid. you can switch
 * places with a shadow in a dance and do moves in the other hands-4."
 *
 * `groupsFor` is a pure function of whatever `SetState` it is handed
 * (D6/D7) — there is no per-cycle cache anywhere in the contract — so once
 * something updates which dancer occupies which couple's role (a real dance
 * mechanism the plan leaves to whichever milestone first encodes a shadow
 * dance, M2 does not build one), the very next `groupsFor("hands-four", …)`
 * call reflects it with no further wiring. This fixture proves exactly that
 * boundary: a `"shadow-pair"` figure genuinely trades two dancers across a
 * seam (the geometry two contra dancers experience when they walk it), a
 * hand-built `SetState` records the trade the same way a real dance's own
 * mechanism eventually will, and the very next `"hands-four"` call — an
 * ordinary circle, danced immediately afterward on the very same timeline —
 * runs in the new minor set, closing seam to seam and covering every dancer
 * it touches.
 */
describe("live membership: a shadow swap, then hands-four in the new minor set", () => {
  const before: SetState = DUPLE_IMPROPER.start({
    id: "s",
    couples: 6,
    centre: [0, 0],
    axis: 90,
  });

  // The seam-scoped partition's one genuine interior seam at six couples:
  // couples 1 and 2 (0-indexed), a "twos" (near) and the next "ones" (far).
  const shadowPlans = DUPLE_IMPROPER.groupsFor(SHADOW_PAIR_GROUP, before);
  const seam = shadowPlans.find((p) => p.stations.length === 4)!;

  it("is a genuine four-station seam, spanning two different hands-four minor sets", () => {
    expect(seam.stations).toHaveLength(4);
    const handsFour = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, before);
    const nearFour = handsFour.find((p) => p.couples.includes(seam.couples[0]!))!;
    const farFour = handsFour.find((p) => p.couples.includes(seam.couples[1]!))!;
    expect(nearFour.id).not.toBe(farFour.id);
  });

  it("swaps NL and FL as a real figure, closing on its own", () => {
    const group = createGroup(seam, DUPLE_IMPROPER.roleSet);
    const params = withDefaults(WALK_TO_STATION, { to: { NL: "FL", FL: "NL" } }, 8);
    const registry = createFigureRegistry([WALK_TO_STATION]);
    const timeline = createTimeline(registry);
    timeline.addGroup(group);
    timeline.add({
      kind: "figure",
      group: group.id,
      figure: WALK_TO_STATION.id,
      params,
      bindings: group.members,
      start: 0,
      end: 8,
    });
    expect(coverageProblems(timeline, 0, 8)).toEqual([]);
    expect(closureReport(timeline).seams).toBe(0); // one event each: nothing to seam yet
  });

  it("the swapped set is still a partition, and the swap is what makes the difference", () => {
    // Build `after` by hand: NL's dancer (a lark) and FL's dancer (also a
    // lark) trade which couple they belong to — exactly what the WALK_TO
    // figure above just walked them to, on the floor. This is the one line a
    // real dance's own mechanism would someday compute; `groupsFor` needs
    // nothing else from it.
    const nlCouple = before.couples.find((c) => c.id === seam.couples[0])!;
    const flCouple = before.couples.find((c) => c.id === seam.couples[1])!;
    const nlDancer = seam.members["NL"]!;
    const flDancer = seam.members["FL"]!;
    expect(nlCouple.dancers["lark"]).toBe(nlDancer);
    expect(flCouple.dancers["lark"]).toBe(flDancer);

    const after: SetState = {
      ...before,
      couples: before.couples.map((c): CoupleState => {
        if (c.id === nlCouple.id) return { ...c, dancers: { ...c.dancers, lark: flDancer } };
        if (c.id === flCouple.id) return { ...c, dancers: { ...c.dancers, lark: nlDancer } };
        return c;
      }),
    };

    expect(partitionProblemsOf(after)).toEqual([]);

    const beforeHandsFour = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, before);
    const afterHandsFour = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, after);
    const groupOf = (plans: readonly GroupPlan[], dancer: string) =>
      plans.find((p) => Object.values(p.members).includes(dancer))!.id;

    // Before the swap, NL's dancer and FL's dancer are in different
    // hands-four groups (confirmed above). After it, `groupsFor` — reading
    // nothing but this one `SetState` — puts NL's *original* dancer in FL's
    // old hands-four group, and vice versa: live membership, not a stale
    // partition carried over from `before`.
    expect(groupOf(afterHandsFour, nlDancer)).toBe(groupOf(beforeHandsFour, flDancer));
    expect(groupOf(afterHandsFour, flDancer)).toBe(groupOf(beforeHandsFour, nlDancer));
    expect(groupOf(afterHandsFour, nlDancer)).not.toBe(groupOf(beforeHandsFour, nlDancer));
  });

  it("closes and covers across the seam: the shadow swap, then a circle in the new minor set", () => {
    const nlCouple = before.couples.find((c) => c.id === seam.couples[0])!;
    const flCouple = before.couples.find((c) => c.id === seam.couples[1])!;
    const nlDancer = seam.members["NL"]!;
    const flDancer = seam.members["FL"]!;
    const after: SetState = {
      ...before,
      couples: before.couples.map((c): CoupleState => {
        if (c.id === nlCouple.id) return { ...c, dancers: { ...c.dancers, lark: flDancer } };
        if (c.id === flCouple.id) return { ...c, dancers: { ...c.dancers, lark: nlDancer } };
        return c;
      }),
    };

    const registry = createFigureRegistry([WALK_TO_STATION]);
    const timeline = createTimeline(registry);

    // Event 1: the shadow swap, over the seam group built from `before`.
    const shadowGroup = createGroup(seam, DUPLE_IMPROPER.roleSet);
    timeline.addGroup(shadowGroup);
    const swapParams = withDefaults(WALK_TO_STATION, { to: { NL: "FL", FL: "NL" } }, 8);
    timeline.add({
      kind: "figure",
      group: shadowGroup.id,
      figure: WALK_TO_STATION.id,
      params: swapParams,
      bindings: shadowGroup.members,
      start: 0,
      end: 8,
    });
    // NL's dancer walked to FL's floor position (and vice versa) — that is
    // what the swap *is*.
    const swapEnds = WALK_TO_STATION.ends(shadowGroup, swapParams);
    expect(swapEnds["NL"]!.p).toEqual(groupStationPose(shadowGroup, "FL").p);
    expect(swapEnds["FL"]!.p).toEqual(groupStationPose(shadowGroup, "NL").p);

    // Events 2 and 3: the *new* hands-four groups nlDancer and flDancer now
    // belong to (`after`'s own live membership) — two different groups,
    // since the two dancers traded which minor set they are in, not places
    // within one. Each is seeded from wherever the swap actually left that
    // dancer — the same `standingAt`-style seeding `createScriptDecider`
    // already uses for every other figure-to-figure seam. Every other member
    // of either new group (never part of the shadow swap) simply starts at
    // its own ordinary station, `WALK_TO_STATION`'s own default.
    const afterHandsFour = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, after);
    const dancerToSeamStation = new Map(
      Object.entries(shadowGroup.members).map(([station, dancer]) => [dancer, station]),
    );
    const newPlans = new Map(
      [nlDancer, flDancer].map((d) => [
        afterHandsFour.find((p) => Object.values(p.members).includes(d))!.id,
        afterHandsFour.find((p) => Object.values(p.members).includes(d))!,
      ]),
    );
    for (const plan of newPlans.values()) {
      const group = createGroup(plan, DUPLE_IMPROPER.roleSet);
      timeline.addGroup(group);
      const origins: Record<string, { p: readonly [number, number]; facing: number }> = {};
      for (const [station, dancer] of Object.entries(group.members)) {
        const seamStation = dancerToSeamStation.get(dancer);
        if (seamStation) origins[station] = swapEnds[seamStation]!;
      }
      const circleParams = withDefaults(WALK_TO_STATION, { origins }, 8);
      timeline.add({
        kind: "figure",
        group: group.id,
        figure: WALK_TO_STATION.id,
        params: circleParams,
        bindings: group.members,
        start: 8,
        end: 16,
      });
    }

    // Closed and covered, for the two dancers who actually crossed the seam
    // (the other members of `newGroup` only enter at beat 8, on purpose —
    // they never danced the shadow swap, so `coverageProblems`'s own
    // whole-timeline check does not apply to them here).
    for (const dancer of [nlDancer, flDancer]) {
      const spans = timeline.figuresOf(dancer).map((f) => [f.start, f.end]);
      expect(spans).toEqual([
        [0, 8],
        [8, 16],
      ]);
    }
    const closure = closureReport(timeline, [nlDancer, flDancer]);
    expect(closure.seams).toBeGreaterThan(0);
    expect(closure.maxPositionError, JSON.stringify(closure.worst)).toBeLessThan(0.01);
  });
});

function partitionProblemsOf(set: SetState): string[] {
  const plans = DUPLE_IMPROPER.groupsFor(HANDS_FOUR_GROUP, set);
  try {
    assertPartition(plans, set);
    return [];
  } catch (e) {
    return [(e as Error).message];
  }
}
