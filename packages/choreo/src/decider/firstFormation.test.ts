import { HOLD_SPACING_PX } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { Dance, Program } from "../dance/Dance.js";
import { createFigureRegistry } from "../figure/FigureDef.js";
import { WAIT_OUT } from "../figure/waitOut.js";
import { WALK_TO_STATION } from "../figure/walkToStation.js";
import type {
  CoupleState,
  Formation,
  GroupPlan,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "../formation/Formation.js";
import { createHall } from "../formation/Formation.js";
import { frame } from "../formation/Frame.js";
import { coverageProblems } from "../testing/oracles.js";
import { poseAt } from "../timeline/poseAt.js";
import { createLibrary } from "./Decider.js";
import { createScriptDecider } from "./createScriptDecider.js";

/**
 * The first dance of a programme is danced in its own formation, whatever
 * formation the hall was handed in.
 *
 * `emitLineUp` re-seats the hall whenever the next dance is in another
 * formation, so every switch *between* two dances is covered — but the first
 * dance of a programme has no line-up before it. Seating the hall one way and
 * partitioning it another does not throw: a formation that pairs couples up
 * finds none of the pairs it expects, calls every couple a waiting couple, and
 * the whole hall dances `wait-out` for the length of the dance while the
 * called figures are danced by nobody. On the page that reads as the hall
 * freezing: the clock, the music, the card and the caller all carry on.
 *
 * Form-neutral, as the layer is: two fixture formations that lay the same set
 * out differently, neither of them contra.
 */

/** A group of four: two couples facing, the way most longways sets pair up. */
const FOURS: readonly Station[] = [
  { id: "1L", role: "lark", facing: 90, p: [8, -10] },
  { id: "1R", role: "robin", facing: 90, p: [-8, -10] },
  { id: "2L", role: "lark", facing: 270, p: [-8, 10] },
  { id: "2R", role: "robin", facing: 270, p: [8, 10] },
];

/** A couple with nobody to dance with, waiting at the end of the line. */
const WAITING: readonly Station[] = [
  { id: "WL", role: "lark", facing: 0, p: [-8, 0] },
  { id: "WR", role: "robin", facing: 180, p: [8, 0] },
];

const ROLES = { roles: ["lark", "robin"], top: "robin" };

const dancerOn = (couple: CoupleState, role: string): string => couple.dancers[role]!;

const placeFrame = (set: SetState, place: number) =>
  frame(
    [set.frame.centre[0], set.frame.centre[1] + place * set.pitch],
    set.frame.axis,
    set.frame.spacing,
  );

/**
 * The shared half of both fixtures: scan down the line, pair each couple
 * travelling down with the couple travelling up below it, and let anyone left
 * over wait. It is what duple improper does, and what a square does not.
 */
function pairingGroups(set: SetState): GroupPlan[] {
  const ordered = [...set.couples].sort((a, b) => a.place - b.place);
  const plans: GroupPlan[] = [];
  let i = 0;
  while (i < ordered.length) {
    const down = ordered[i]!;
    const up = ordered[i + 1];
    if (down.direction === 1 && up !== undefined && up.direction === -1) {
      plans.push({
        id: `${set.id}/p${down.place}`,
        kind: "set",
        frame: placeFrame(set, (down.place + up.place) / 2),
        stations: FOURS.map((s) => ({ ...s })),
        members: {
          "1L": dancerOn(down, "lark"),
          "1R": dancerOn(down, "robin"),
          "2L": dancerOn(up, "lark"),
          "2R": dancerOn(up, "robin"),
        },
        couples: [down.id, up.id],
      });
      i += 2;
      continue;
    }
    plans.push({
      id: `${set.id}/w${down.place}`,
      kind: "wait",
      frame: placeFrame(set, down.place),
      stations: WAITING.map((s) => ({ ...s })),
      members: { WL: dancerOn(down, "lark"), WR: dancerOn(down, "robin") },
      couples: [down.id],
    });
    i += 1;
  }
  return plans;
}

const shared = {
  roleSet: ROLES,
  group(n: number): Station[] {
    if (n === 4) return FOURS.map((s) => ({ ...s }));
    if (n === 2) return WAITING.map((s) => ({ ...s }));
    throw new Error(`the fixture dances in fours, or waits in twos, not ${n}`);
  },
  groups: pairingGroups,
  progression: { next: (set: SetState): SetState => set },
  tags(n: number): Record<string, StationId[]> {
    if (n === 4) return { all: FOURS.map((s) => s.id), larks: ["1L", "2L"], robins: ["1R", "2R"] };
    return { all: WAITING.map((s) => s.id), larks: ["WL"], robins: ["WR"] };
  },
};

/** A set of `spec.couples` couples down one line, travelling as `directionOf` says. */
const startWith =
  (directionOf: (i: number) => 1 | -1) =>
  (spec: SetSpec): SetState => ({
    id: spec.id,
    frame: frame(spec.centre, spec.axis, HOLD_SPACING_PX),
    pitch: 20,
    couples: Array.from({ length: spec.couples }, (_, i): CoupleState => ({
      id: `${spec.id}/c${i}`,
      dancers: { lark: `${spec.id}/c${i}/lark`, robin: `${spec.id}/c${i}/robin` },
      place: i,
      direction: directionOf(i),
    })),
  });

/** Couples alternate down the line, so `pairingGroups` pairs every one of them. */
const ALTERNATING: Formation = {
  ...shared,
  id: "alternating",
  start: startWith((i) => (i % 2 === 0 ? 1 : -1)),
};

/** Everybody travels the same way, so `pairingGroups` pairs none of them. */
const ALL_ONE_WAY: Formation = {
  ...shared,
  id: "all-one-way",
  start: startWith(() => 1),
};

const SPECS: readonly SetSpec[] = [{ id: "set0", couples: 4, centre: [0, 0], axis: 90 }];

/** One dance, in `ALTERNATING`, whose four figures are all the same walk. */
const DANCE: Dance = {
  slug: "the-fixture",
  title: "The Fixture",
  author: "Nobody",
  formation: "alternating",
  phrases: (["A1", "A2", "B1", "B2"] as const).map((name) => ({
    name,
    figures: [{ figure: WALK_TO_STATION.id, beats: 16 }],
  })),
};

const PROGRAM: Program = {
  slug: "one-dance",
  items: [{ dance: DANCE.slug, medley: "none", timesThrough: 2 }],
};

const build = (seatedIn: Formation) =>
  createScriptDecider(
    PROGRAM,
    createFigureRegistry([WAIT_OUT, WALK_TO_STATION]),
    createHall(seatedIn, SPECS),
    createLibrary([DANCE], [ALTERNATING, ALL_ONE_WAY]),
  );

/** Which figures the hall dances over `[from, to)`, as a set of figure ids. */
function figuresDanced(decider: ReturnType<typeof build>, from: number, to: number): Set<string> {
  return new Set(
    decider
      .timeline()
      .figures()
      .filter((event) => event.start < to && event.end > from)
      .map((event) => event.figure),
  );
}

describe("the first dance's own formation", () => {
  it("dances the dance when the hall was already seated that way", () => {
    const decider = build(ALTERNATING);
    decider.advance(128);
    expect([...figuresDanced(decider, 0, 128)]).toEqual([WALK_TO_STATION.id]);
    expect(coverageProblems(decider.timeline(), 0, 128)).toEqual([]);
  });

  it("dances the dance when the hall was seated in another formation", () => {
    const decider = build(ALL_ONE_WAY);
    decider.advance(128);
    // Before the fix this was `["wait-out"]`: every couple of the hall was
    // read as a waiting couple, so the dance was danced by nobody.
    expect([...figuresDanced(decider, 0, 128)]).toEqual([WALK_TO_STATION.id]);
    expect(coverageProblems(decider.timeline(), 0, 128)).toEqual([]);
  });

  it("dances the same evening either way, dancer for dancer and pose for pose", () => {
    const seated = build(ALTERNATING);
    const wrong = build(ALL_ONE_WAY);
    seated.advance(128);
    wrong.advance(128);
    const dancers = seated.timeline().dancers().sort();
    expect(wrong.timeline().dancers().sort()).toEqual(dancers);
    for (const dancer of dancers) {
      for (let beat = 0; beat <= 128; beat += 8) {
        const a = poseAt(seated.timeline(), dancer, beat);
        const b = poseAt(wrong.timeline(), dancer, beat);
        expect(b.p, `${dancer} at ${String(beat)}`).toEqual(a.p);
        expect(b.facing, `${dancer} at ${String(beat)}`).toEqual(a.facing);
      }
    }
  });
});
