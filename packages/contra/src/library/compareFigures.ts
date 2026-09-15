import type { Beat, Hand, PoseSample, Vec2 } from "@caller/core";
import { angleDiff, dist } from "@caller/core";
import type { DancerId, EndPose, Formation, Group, GroupPlan, StationId } from "@caller/choreo";
import { createGroup, createHall, frameAngle, framePoint, withDefaults } from "@caller/choreo";
import type { ContraFigure, ContraParams, Spot, Spots } from "../figures/ContraFigure.js";
import { PROBE_STEP } from "../figures/testing.js";
import { homeOf, modelFromSet } from "../set/SetModel.js";
import { resolveCall } from "../set/resolve.js";
import type { FigureDefinition } from "./FigureDefinition.js";
import { createLibrary } from "./Library.js";
import { figureFor } from "./interpret.js";

/**
 * **The per-figure golden**: a migrated definition against the coded figure it
 * replaces, danced side by side in a real set.
 *
 * This is `figures/specs/circleSpec.test.ts`'s method, lifted into a helper
 * every migration uses (`plan.md`: "the `circle-data` proof is the per-figure
 * golden template"). Its five equalities, in the same order:
 *
 * 1. the same pose for every dancer at every {@link PROBE_STEP} of the figure,
 * 2. the same place for every dancer when it is over,
 * 3. the same hands held at the same beats,
 * 4. the same answer for every parameter case the coded figure's own test runs,
 * 5. in every formation the figure is danced in.
 *
 * What it adds is a **tolerance and an allowed-difference list**, because a
 * migrated gatherer is *not* meant to match everywhere: its end is honest now.
 * DD21 (Q4) fixes the numbers for the swing — 0.01 px and 0.1° on every sample,
 * exact on the joins — and states the one allowed difference: the **end**, and
 * only when the pair did not start on the stations. From the stations a
 * gatherer's honest end and its coded end are the same places, so the whole
 * figure has to agree.
 *
 * It resolves the definition through the **real** `resolveCall` against a real
 * `SetModel` rather than through a parallel test harness, so what is compared is
 * what a dance actually dances: the same pairing, the same anchor, the same
 * homes, the same clearance between the two pairs of a minor set.
 */

/** How far the two are allowed to differ. */
export interface CompareTolerance {
  /** Position and hand points, px. */
  px: number;
  /** Facings and looks, degrees. */
  deg: number;
}

/** DD21's numbers, and this milestone's default. */
export const DD21_TOLERANCE: CompareTolerance = { px: 0.01, deg: 0.1 };

/** One thing a case is allowed to differ in. */
export type AllowedDifference = "ends" | "holdPlace" | "path";

/** One parameter case, and where the dancers start it from. */
export interface CompareCase {
  /** The call's own parameters. */
  params?: Record<string, unknown>;
  /**
   * Where the dancers stand when the figure starts.
   *
   * `"stations"` is the formation's own places, which is DD21's condition and
   * where the two must agree everywhere. `"displaced"` nudges every dancer off
   * their place by a fixed, deterministic wobble — which is what a real dance
   * does to a gatherer — and is where the honest end is allowed to differ.
   */
  from?: "stations" | "displaced";
  /** What this case is allowed to differ in, and why. Stated per case. */
  allowed?: readonly AllowedDifference[];
  /**
   * The formations this case is run in; the option's own list by default.
   *
   * Some parameter values only mean something in one formation. "Open out
   * facing down the hall" is a real thing to ask a duple improper pair, whose
   * own two places lie across the hall; asking it of a becket pair, whose
   * places lie along it, names no pair of places at all and the coded figure
   * answers with an end spacing no swing ever has.
   */
  formations?: readonly Formation[];
}

/** What `compareFigures` is run over. */
export interface CompareOptions {
  cases: readonly CompareCase[];
  formations: readonly Formation[];
  tolerance?: CompareTolerance;
  /** How long the figure runs; the coded figure's own count by default. */
  beats?: Beat;
  /** How many couples the comparison set has. */
  couples?: number;
}

/** What one case measured. */
export interface CompareResult {
  formation: string;
  params: Record<string, unknown>;
  from: "stations" | "displaced";
  samples: number;
  /** The worst position difference over every dancer and every sample, px. */
  maxPosition: number;
  /** The worst facing (and look) difference, degrees. */
  maxFacing: number;
  /** The worst joined-hand point difference, px. */
  maxHand: number;
  /** The worst difference between the two figures' `ends`, px and degrees. */
  endPx: number;
  endDeg: number;
  /**
   * How far the definition leaves each cast dancer from their own home place,
   * in world px — the **honest-end contract, positively stated**.
   *
   * Only measured for a definition whose `ends` is `"home"`. It is the number
   * that matters when the pair did not start on the stations: the point of a
   * gatherer is not that it agrees with the figure it replaced, but that it
   * puts people on the set's own places.
   */
  homePx: number;
  /** Dancers the data figure did not cast, who danced hold-place instead. */
  holdPlace: DancerId[];
  /** Everything outside the tolerance and not allowed, in words. */
  problems: string[];
}

/** Every case of every formation, measured. */
export function compareFigures(
  coded: ContraFigure,
  definition: FigureDefinition,
  options: CompareOptions,
): CompareResult[] {
  const tolerance = options.tolerance ?? DD21_TOLERANCE;
  const out: CompareResult[] = [];
  for (const formation of options.formations) {
    for (const test of options.cases) {
      if (test.formations && !test.formations.includes(formation)) continue;
      out.push(compareOne(coded, definition, formation, test, tolerance, options));
    }
  }
  return out;
}

/** A comparison set: four couples, on a frame that is deliberately not the identity. */
const COMPARE_CENTRE: Vec2 = [17, -23];
const COMPARE_AXIS = 37;

function compareOne(
  coded: ContraFigure,
  definition: FigureDefinition,
  formation: Formation,
  test: CompareCase,
  tolerance: CompareTolerance,
  options: CompareOptions,
): CompareResult {
  const params = { ...test.params };
  const from = test.from ?? "stations";
  const allowed = new Set(test.allowed ?? []);
  const beats = options.beats ?? coded.beats;
  const hall = createHall(formation, [
    { id: "cmp", couples: options.couples ?? 4, centre: COMPARE_CENTRE, axis: COMPARE_AXIS },
  ]);
  const set = hall.sets[0]!;
  const plan = formation.groupsFor("hands-four", set).find((g) => g.kind === "set");
  if (!plan) throw new Error(`${formation.id} has no dancing group to compare in`);

  // Where everybody starts, frame-local, and the same places in world px for
  // the set model — so the two paths genuinely begin from one arrangement.
  const places: Spots = {};
  for (const station of plan.stations) {
    places[station.id] =
      from === "stations"
        ? { p: station.p, facing: station.facing }
        : displace(station.id, station.p, station.facing);
  }
  const standing = new Map<DancerId, EndPose>();
  for (const station of plan.stations) {
    const dancer = plan.members[station.id];
    if (dancer === undefined) continue;
    const place = places[station.id]!;
    standing.set(dancer, {
      p: framePoint(plan.frame, place.p),
      facing: frameAngle(plan.frame, place.facing),
    });
  }

  // The coded figure, on the formation's own group.
  const codedGroup = createGroup(plan, formation.roleSet);
  const codedParams = withDefaults(coded, { ...params, from: places }, beats);
  const codedEnds = coded.ends(codedGroup, codedParams);

  // The definition, resolved the way a dance resolves it.
  const model = modelFromSet(formation, set, standing);
  const library = createLibrary([definition]);
  const instances = resolveCall(
    { figure: definition.id, beats, params },
    {
      model,
      formation,
      library,
      groups: [plan],
      localOf: (dancer) => localOf(places, plan, dancer),
    },
    0,
  );

  const result: CompareResult = {
    formation: formation.id,
    params,
    from,
    samples: 0,
    maxPosition: 0,
    maxFacing: 0,
    maxHand: 0,
    endPx: 0,
    endDeg: 0,
    homePx: 0,
    holdPlace: [],
    problems: [],
  };

  /** Which instance and role each dancer is in, and that instance's figure. */
  const dancing = new Map<
    DancerId,
    {
      group: Group;
      role: StationId;
      fig: ContraFigure;
      params: ContraParams;
      cast: Record<string, DancerId>;
    }
  >();
  for (const instance of instances) {
    if (instance.holdPlace) {
      result.holdPlace.push(...Object.values(instance.cast));
      continue;
    }
    const fig = figureFor(definition, dummyRegistry());
    const group = createGroup(instance.group, formation.roleSet);
    const resolved = withDefaults(fig, { ...instance.params, from: {} }, beats);
    for (const [role, dancer] of Object.entries(instance.cast)) {
      dancing.set(dancer, { group, role, fig, params: resolved, cast: instance.cast });
    }
  }

  const steps = Math.round(beats / PROBE_STEP);
  for (const station of plan.stations) {
    const dancer = plan.members[station.id];
    if (dancer === undefined) continue;
    const here = dancing.get(dancer);
    if (!here) continue;

    for (let i = 0; i <= steps; i++) {
      const t = i * PROBE_STEP;
      const want = coded.sample(codedGroup, station.id, t, codedParams);
      const got = here.fig.sample(here.group, here.role, t, here.params);
      compareSample(
        result,
        `${station.id} @ ${String(t)}`,
        want,
        got,
        tolerance,
        allowed.has("path"),
      );
      result.samples++;
    }

    const wantEnd = codedEnds[station.id];
    const gotEnd = here.fig.ends(here.group, here.params)[here.role];
    if (wantEnd && gotEnd) {
      result.endPx = Math.max(result.endPx, dist(wantEnd.p, gotEnd.p));
      result.endDeg = Math.max(result.endDeg, Math.abs(angleDiff(wantEnd.facing, gotEnd.facing)));
    }
    if (definition.ends === "home" && gotEnd) {
      // The *nearest* home of the dancers this instance cast, not the dancer's
      // own: a once-and-a-half allemande and a neighbour swing both leave a
      // pair on each other's places, which is the progression, not a miss.
      const homes = Object.values(here.cast).map((who) => homeOf(model, who).p);
      const nearest = Math.min(...homes.map((home) => dist(home, gotEnd.p)));
      result.homePx = Math.max(result.homePx, nearest);
    }
  }

  if (!allowed.has("ends")) {
    if (result.endPx > tolerance.px) {
      result.problems.push(`ends differ by ${result.endPx.toFixed(4)} px`);
    }
    if (result.endDeg > tolerance.deg) {
      result.problems.push(`end facings differ by ${result.endDeg.toFixed(4)}°`);
    }
  }
  if (!allowed.has("holdPlace") && result.holdPlace.length > 0) {
    result.problems.push(`${String(result.holdPlace.length)} dancers dance hold-place instead`);
  }
  return result;
}

/** Two poses, compared field by field. */
function compareSample(
  result: CompareResult,
  where: string,
  want: PoseSample,
  got: PoseSample,
  tolerance: CompareTolerance,
  allowPath: boolean,
): void {
  /**
   * A difference in the trajectory, which an `allowed: ["path"]` case expects.
   *
   * A gatherer aiming at a different place does not only end somewhere else: a
   * swing rounds its turn so that it opens straight out on to where it is
   * going, so an honest end moves the *whole* figure. The magnitudes are still
   * measured and reported; what `"path"` says is that they are not a failure.
   */
  const say = (problem: string): void => {
    if (!allowPath) result.problems.push(problem);
  };
  const pos = dist(want.p, got.p);
  result.maxPosition = Math.max(result.maxPosition, pos);
  if (pos > tolerance.px) say(`${where}: position off by ${pos.toFixed(4)} px`);

  for (const [what, a, b] of [
    ["facing", want.facing, got.facing],
    ["look", want.look, got.look],
  ] as const) {
    const off = Math.abs(angleDiff(a, b));
    result.maxFacing = Math.max(result.maxFacing, off);
    if (off > tolerance.deg) say(`${where}: ${what} off by ${off.toFixed(4)}°`);
  }

  for (const [what, a, b] of [
    ["lean", want.lean, got.lean],
    ["stepRate", want.stepRate, got.stepRate],
    ["flare", want.flare, got.flare],
    ["amp", want.amp, got.amp],
  ] as const) {
    if (Math.abs(a - b) > tolerance.px) say(`${where}: ${what} ${String(a)} vs ${String(b)}`);
  }
  if ((want.buzz ?? false) !== (got.buzz ?? false)) {
    result.problems.push(`${where}: buzz ${String(want.buzz)} vs ${String(got.buzz)}`);
  }
  if ((want.feet === undefined) !== (got.feet === undefined)) {
    result.problems.push(`${where}: one has feet and the other does not`);
  } else if (want.feet && got.feet) {
    for (const side of ["L", "R"] as const) {
      const off = dist(want.feet[side], got.feet[side]);
      result.maxPosition = Math.max(result.maxPosition, off);
      if (off > tolerance.px) say(`${where}: ${side} foot off by ${off.toFixed(4)} px`);
    }
  }

  for (const side of ["L", "R"] as const) {
    const a = want.hands[side];
    const b = got.hands[side];
    if ((a === "down") !== (b === "down")) {
      result.problems.push(`${where}: ${side} hand ${handWord(a)} vs ${handWord(b)}`);
      continue;
    }
    if (a === "down" || b === "down") continue;
    const off = dist(a.p, b.p);
    const drop = Math.abs(a.drop - b.drop);
    result.maxHand = Math.max(result.maxHand, off, drop);
    if (off > tolerance.px) say(`${where}: ${side} hand off by ${off.toFixed(4)} px`);
    if (drop > tolerance.px) say(`${where}: ${side} hand drop off by ${drop.toFixed(4)} px`);
  }
}

const handWord = (hand: Hand | "down"): string => (hand === "down" ? "down" : "placed");

/**
 * The wobble a `"displaced"` case starts from: a few px off the place and a few
 * degrees off the facing, different for each station and the same every run.
 *
 * Not random, because a golden that moves is not a golden; and not symmetric,
 * because a gatherer that only works from a symmetric arrangement has not been
 * tested at all.
 */
function displace(id: StationId, p: Vec2, facing: number): Spot {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 97;
  const dx = ((hash % 7) - 3) * 0.9;
  const dy = ((hash % 5) - 2) * 1.1;
  return { p: [p[0] + dx, p[1] + dy], facing: facing + ((hash % 11) - 5) * 2 };
}

/** Where a dancer stands, frame-local: exactly the places the comparison set up. */
function localOf(places: Spots, plan: GroupPlan, dancer: DancerId): Spot | undefined {
  for (const [id, who] of Object.entries(plan.members)) {
    if (who === dancer) return places[id];
  }
  return undefined;
}

/**
 * A registry the interpreter never reaches.
 *
 * `figureFor` only consults one for a `{ kind: "legacy" }` shape, and a
 * comparison is only ever run on a definition that has a real shape — a legacy
 * definition *is* the coded figure and comparing it to itself proves nothing.
 */
function dummyRegistry(): Parameters<typeof figureFor>[1] {
  return {
    get(id) {
      throw new Error(`compareFigures does not compare the legacy bridge (asked for "${id}")`);
    },
    has: () => false,
    ids: () => [],
    register: () => undefined,
  };
}
