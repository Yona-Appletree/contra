import { describe, expect, it } from "vitest";
import type { Angle, Beat, Vec2 } from "@caller/core";
import { angleDiff, dist } from "@caller/core";
import type { Formation, RoleSet, Station } from "@caller/choreo";
import { createHall } from "@caller/choreo";
import type { LocalHand, LocalSample, PlanContext, Spots } from "../figures/ContraFigure.js";
import { planContext } from "../figures/ContraFigure.js";
import { PROBE_STEP } from "../figures/testing.js";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import type { FigureDefinition, ParamValue } from "./FigureDefinition.js";
import { DATA_DEFINITIONS, needsTheSet } from "./figures/index.js";
import { interpretDefinition, paramDefaults } from "./interpret.js";
import type { ParameterMirror } from "./symmetry.js";
import { mirror, mirrorParams, roleSwapParams } from "./symmetry.js";

/**
 * **The symmetry property**: every definition that claims a symmetry really has
 * it, for every dancer at every 1/8 beat.
 *
 * Two claims, and they are claims about the *library* rather than about any one
 * figure:
 *
 * 1. **Mirror.** Reflect the arrangement, mirror the call's own handed
 *    parameters, dance it — and every pose is the reflection of the pose the
 *    unreflected figure struck. A figure with a handedness baked into its
 *    geometry rather than declared as a parameter fails this, which is exactly
 *    what it is for. It is also how the bow was found: two dancers pass right
 *    shoulders by each bowing to their own **left**, so `bowPx` is a signed
 *    handedness and not a distance.
 * 2. **Role swap.** Rename the two contra roles throughout — the dancers', the
 *    role set's top, and every parameter that names one — and **nothing moves
 *    at all**. Same bodies, same places, different vocabulary. A figure with
 *    the word "robin" in its geometry rather than in a parameter fails it.
 *
 * Both are read on the **frame-local plan** (`ContraFigure.plan`) rather than
 * through a world frame, so what is compared is the figure's own geometry and
 * not a transform's arithmetic.
 *
 * ### What is in scope, and why the rest is not
 *
 * The harness plans a definition over **one whole minor set**, which is what an
 * instance anchored on `"hands-four"` or `"centroid"` is. Everything else is
 * instanced by resolution out of something this test does not have: a figure
 * anchored on `"meet"` gets one instance **per pair** (the balance, the swing,
 * the allemande, the balance and swing, the pull-by), and one anchored on
 * `"lane"` gets one **per line of the lattice**, cast on to slots whose names no
 * definition can write down (the grand right and left). Building either here
 * would be re-implementing `resolveCall` inside a test.
 *
 * Those are held to their own goldens in their own files instead, and the list
 * of what is out of scope is asserted below so that it cannot quietly grow.
 */

/** Both formations every demo dance is written in. */
const FORMATIONS: readonly Formation[] = [DUPLE_IMPROPER, BECKET];

/** How near two poses have to be to count as the same: floating-point noise. */
const TOLERANCE_PX = 1e-9;
const TOLERANCE_DEG = 1e-9;

/**
 * The figures this harness plans: the ones resolution gives a whole minor set.
 *
 * **`actors` is the test for it**, and since M7 it has to be: until then the
 * anchor was a good enough proxy — a figure anchored between two dancers is a
 * figure for two — but `actors: "each"` mints one instance **per dancer** while
 * anchoring on the group's own centroid, so a figure turning alone would have
 * been planned here over four stations it has one part for. What the harness
 * really needs is a definition resolution hands the whole minor set to, which is
 * `"all"` and `"ring"` and nothing else — and, since M8, one whose shape does
 * not read the lattice either. `needsTheSet` is the one predicate the template,
 * the Moves gallery and this harness all ask.
 */
const overTheSet = (def: FigureDefinition): boolean => !needsTheSet(def);

const OVER_THE_SET = DATA_DEFINITIONS.filter(overTheSet);

/** The ones this harness cannot plan; see the header. */
const RESOLVED_ELSEWHERE = DATA_DEFINITIONS.filter((def) => !overTheSet(def));

/**
 * The figures whose **hands** the mirror claim is not made about.
 *
 * A hand no figure placed is hung by the renderer, and a hanging arm swings in
 * opposition to the other one: `hangingHand`'s forward offset carries the same
 * `side === "L" ? -1 : 1` its lateral offset does, because that is what a
 * walking body does. A mirror swaps the two arms and so swaps the swing phase
 * with them, which is not the reflection of the original — it is the other
 * arm's swing. That is a fact about `drawnArms.ts` and not about the figure, so
 * the claim for a figure that swings its idle hands is made about its bodies
 * and not about those hands.
 *
 * The hey joined the list in M5 for exactly the same reason and nothing else:
 * it takes no hands at all, so both of a dancer's arms are hung and swung by
 * the renderer for the whole sixteen beats. Measured, so the exclusion is a
 * size and not a shrug — the worst mirror difference in a hand is **0.8485 px**
 * (`2 × √2 × 0.3` px, the hanging hand's forward swing twice over) and in a
 * *body* it is zero to 1e-9.
 */
const SWINGS_ITS_HANDS = ["do-si-do", "hey"];

/** Reflect a point across the set's own midline: local `x` is across the set. */
const flipPoint = (p: Vec2): Vec2 => [-p[0], p[1]];

/** Reflect a facing across the same line. */
const flipAngle = (a: Angle): Angle => 180 - a;

/** Reflect one hand, keeping its height: a mirror does not raise or lower one. */
const flipHand = (hand: LocalHand): LocalHand =>
  hand === "down" ? "down" : { p: flipPoint(hand.p), drop: hand.drop };

/**
 * One pose, seen in the mirror.
 *
 * The **hands swap sides**, because that is what a mirror does to a body, and
 * so do the feet. Everything that is not handed — the drop, the lean, the step
 * rate, the flare, the amplitude, the buzz — is carried over unchanged.
 */
function flipPose(pose: LocalSample): LocalSample {
  const out: LocalSample = {
    ...pose,
    p: flipPoint(pose.p),
    facing: flipAngle(pose.facing),
    hands: { L: flipHand(pose.hands.R), R: flipHand(pose.hands.L) },
  };
  if (pose.look !== undefined) out.look = flipAngle(pose.look);
  if (pose.feet !== undefined) {
    out.feet = { L: flipPoint(pose.feet.R), R: flipPoint(pose.feet.L) };
  }
  return out;
}

/** A point turned `deg` about the minor set's own centre, which is its origin. */
function turnAbout(p: Vec2, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

/** One pose, turned about the same point. */
function turnPose(pose: LocalSample, deg: number): LocalSample {
  const hand = (h: LocalHand): LocalHand =>
    h === "down" ? "down" : { p: turnAbout(h.p, deg), drop: h.drop };
  const out: LocalSample = {
    ...pose,
    p: turnAbout(pose.p, deg),
    facing: pose.facing + deg,
    hands: { L: hand(pose.hands.L), R: hand(pose.hands.R) },
  };
  if (pose.look !== undefined) out.look = pose.look + deg;
  if (pose.feet !== undefined) {
    out.feet = { L: turnAbout(pose.feet.L, deg), R: turnAbout(pose.feet.R, deg) };
  }
  return out;
}

/** The hands-four stations of a formation's first minor set, frame-local. */
function stationsOf(formation: Formation): Station[] {
  const hall = createHall(formation, [{ id: "sym", couples: 4, centre: [0, 0], axis: 90 }]);
  const plan = formation.groupsFor("hands-four", hall.sets[0]!).find((g) => g.kind === "set");
  if (!plan) throw new Error(`${formation.id} has no dancing group`);
  return [...plan.stations];
}

/**
 * The instance's own stations: the minor set's, under whichever ids the figure
 * casts.
 *
 * `actors: "all"` keeps the formation's, which is what a whole-minor-set
 * carrier is written against; `actors: "ring"` is resolution minting figure-role
 * stations in the order the dancers stand, which is what `dataInstance` does.
 * Either way the **places and the roles are the same bodies**, so a pose can be
 * read back by the station the dancer really stands on.
 */
function castOver(def: FigureDefinition, stations: readonly Station[]): [Station, string][] {
  if (def.actors === "all") return stations.map((s) => [s, s.id]);
  return stations.map((s, i) => {
    const role = def.roles[i];
    if (role === undefined) throw new Error(`"${def.id}" has no role ${String(i)}`);
    return [{ ...s, id: role }, s.id];
  });
}

/** Where everybody starts, from their own stations. */
const spotsOf = (stations: readonly Station[]): Spots =>
  Object.fromEntries(stations.map((s) => [s.id, { p: s.p, facing: s.facing }]));

/** A plan context over a minor set. */
const contextOf = (stations: readonly Station[], roleSet: RoleSet): PlanContext =>
  planContext(stations, roleSet, 14, spotsOf(stations));

/** The library's own role set. */
const ROLES: RoleSet = { roles: ["lark", "robin"], top: "robin" };

/**
 * The same role set with the two words exchanged: same bodies, same hand on
 * top, different vocabulary.
 */
const RENAMED: RoleSet = { roles: ["robin", "lark"], top: "lark" };

/** The same stations with each dancer's role word exchanged. */
const rename = (stations: readonly Station[]): Station[] =>
  stations.map((s) => ({ ...s, role: s.role === "lark" ? "robin" : "lark" }));

/** How far apart two poses are, in px and degrees, and in which field. */
function poseGap(
  a: LocalSample,
  b: LocalSample,
  hands: boolean,
): { px: number; deg: number; what: string } {
  let px = dist(a.p, b.p);
  let what = "position";
  let deg = Math.abs(angleDiff(a.facing, b.facing));
  deg = Math.max(deg, Math.abs(angleDiff(a.look ?? a.facing, b.look ?? b.facing)));
  if (hands) {
    for (const side of ["L", "R"] as const) {
      const ha = a.hands[side];
      const hb = b.hands[side];
      if ((ha === "down") !== (hb === "down")) return { px: Infinity, deg, what: `${side} hand` };
      if (ha === "down" || hb === "down") continue;
      const off = Math.max(dist(ha.p, hb.p), Math.abs(ha.drop - hb.drop));
      if (off > px) {
        px = off;
        what = `${side} hand`;
      }
    }
  }
  for (const [name, x, y] of [
    ["lean", a.lean ?? 0, b.lean ?? 0],
    ["stepRate", a.stepRate ?? 1, b.stepRate ?? 1],
    ["flare", a.flare ?? 0, b.flare ?? 0],
    ["amp", a.amp ?? 1, b.amp ?? 1],
  ] as const) {
    if (Math.abs(x - y) > px) {
      px = Math.abs(x - y);
      what = name;
    }
  }
  return { px, deg, what };
}

/** One definition planned over a minor set, sampled at every 1/8 beat. */
function poses(
  def: FigureDefinition,
  stations: readonly Station[],
  roleSet: RoleSet,
  params: Readonly<Record<string, ParamValue>>,
): Map<string, LocalSample> {
  const cast = castOver(def, stations);
  const fig = interpretDefinition(def);
  const beats: Beat = def.nominalBeats;
  const plan = fig.plan(
    contextOf(
      cast.map(([station]) => station),
      roleSet,
    ),
    { ...params, beats, from: {}, homes: [], nearby: [] } as never,
  );
  const out = new Map<string, LocalSample>();
  const steps = Math.round(beats / PROBE_STEP);
  for (const [station, where] of cast) {
    for (let i = 0; i <= steps; i++) {
      const t = i * PROBE_STEP;
      // Keyed by the station the dancer really stands on, not by the part they
      // play, so a transform that moves the parts about is still compared
      // dancer for dancer.
      out.set(`${where}@${String(t)}`, plan.at(station.id, t));
    }
  }
  return out;
}

const MIRRORS = OVER_THE_SET.filter((def) => def.symmetry?.mirror.kind === "parameters");
const HANDED = DATA_DEFINITIONS.filter((def) => def.symmetry?.mirror.kind === "handed");
const ROTATES = OVER_THE_SET.filter((def) => def.symmetry?.rotates !== undefined);

/** Every pose this file compared, so the test can say how big a claim it is. */
let SAMPLES = 0;

describe("symmetry as a transform", () => {
  it("gives every definition this harness can plan a declared symmetry", () => {
    // A symmetry it cannot read is a symmetry nobody has checked, so the claim
    // is made about exactly the figures the property below is run on. M6's two
    // are resolved out of a pair or a lane and have none yet; the assertion
    // below names them, so that stays deliberate rather than drifting.
    const silent = OVER_THE_SET.filter((def) => def.symmetry === undefined).map((d) => d.id);
    expect(silent).toEqual([]);
  });

  it("names exactly the figures whose handedness is the dance's and not a parameter", () => {
    expect(HANDED.map((def) => def.id).sort()).toEqual([
      "balance-and-swing",
      // M7's four. A line of four's **order** is read across the hall from one
      // fixed side, so the mirror of "down the hall in the order M1-W2-M2-W1" is
      // the same four dancers in the reverse order — a different call, which is
      // exactly why The Nice Combination writes both of its orders out. Contra
      // corners' right and left hands are the figure rather than a parameter of
      // it, in the same way a courtesy turn's are.
      "bend-the-line",
      "down-the-hall",
      "right-and-left-through",
      "robins-chain",
      "swing",
      "turn-contra-corners",
      "up-the-hall",
    ]);
    for (const def of HANDED) {
      expect(() => mirror(def), def.id).toThrow(/has no mirror image/);
    }
  });

  it("names exactly the figures resolution instances elsewhere, which this harness cannot plan", () => {
    expect(RESOLVED_ELSEWHERE.map((def) => def.id).sort()).toEqual([
      "allemande",
      "balance",
      "balance-and-swing",
      // M7's, and each for one of the three reasons: a figure for two (a unit,
      // a lead, a cast), a figure for **one** (`actors: "each"`), or a figure
      // for a whole line of the lattice.
      "balance-wave",
      // M8's three. `cast-back` and the dance-local "go forward" are figures for
      // **one** (`actors: "each"`); `promenade` is a unit, two dancers as one;
      // and the wave of four across the set takes the whole minor set but reads
      // the lattice, which a bare four-station harness does not carry.
      "balance-wave-of-four",
      "cast-back",
      "cast-off",
      "circulate",
      "fatal-attraction/go-forward",
      "go-down-outside",
      "go-up-outside",
      "grand-right-and-left",
      "lead-down",
      "lead-up",
      "loop",
      "promenade",
      "pull-by",
      "shoulder-round",
      "swing",
      "turn-alone",
      "turn-as-couples",
    ]);
  });

  it("mirrors a definition by mirroring its own defaults", () => {
    const circle = DATA_DEFINITIONS.find((def) => def.id === "circle")!;
    expect(paramDefaults(circle)["direction"]).toBe("left");
    expect(paramDefaults(mirror(circle))["direction"]).toBe("right");
    // And it is still data: a transform that produced a closure would not
    // survive the round trip every definition is held to.
    expect(JSON.parse(JSON.stringify(mirror(circle)))).toEqual(mirror(circle));
  });

  for (const def of MIRRORS) {
    for (const formation of FORMATIONS) {
      it(`${def.id} commutes with the mirror in ${formation.id}`, () => {
        const stations = stationsOf(formation);
        const rule = def.symmetry!.mirror as ParameterMirror;
        const params = paramDefaults(def);
        const hands = !SWINGS_ITS_HANDS.includes(def.id);
        const plain = poses(def, stations, ROLES, params);
        const flipped = stations.map((s) => ({
          ...s,
          p: flipPoint(s.p),
          facing: flipAngle(s.facing),
        }));
        const mirrored = poses(def, flipped, ROLES, mirrorParams(rule, params));
        expect(mirrored.size).toBe(plain.size);
        for (const [where, pose] of plain) {
          const got = mirrored.get(where);
          expect(got, where).toBeDefined();
          const gap = poseGap(flipPose(pose), got!, hands);
          expect(gap.px, `${where} ${gap.what}`).toBeLessThan(TOLERANCE_PX);
          expect(gap.deg, `${where} facing`).toBeLessThan(TOLERANCE_DEG);
          SAMPLES++;
        }
      });
    }
  }

  for (const def of OVER_THE_SET) {
    for (const formation of FORMATIONS) {
      it(`${def.id} dances the same in ${formation.id} with the two roles renamed`, () => {
        const stations = stationsOf(formation);
        const params = paramDefaults(def);
        const named = def.symmetry?.roles ?? [];
        const plain = poses(def, stations, ROLES, params);
        const swapped = poses(
          def,
          rename(stations),
          RENAMED,
          roleSwapParams(named, ["lark", "robin"], params),
        );
        for (const [where, pose] of plain) {
          const gap = poseGap(pose, swapped.get(where)!, true);
          expect(gap.px, `${where} ${gap.what}`).toBeLessThan(TOLERANCE_PX);
          expect(gap.deg, `${where} facing`).toBeLessThan(TOLERANCE_DEG);
          SAMPLES++;
        }
      });
    }
  }

  for (const def of ROTATES) {
    for (const formation of FORMATIONS) {
      it(`${def.id} dances the same turned a quarter round in ${formation.id}`, () => {
        // A figure whose four dancers all do the same thing a quarter turn
        // apart cannot care which way up the set is standing: turn the whole
        // arrangement and the dance turns with it, pose for pose. Nothing else
        // in the library claims it — long lines reads the set's own across-axis
        // and would fail this on purpose.
        const stations = stationsOf(formation);
        const params = paramDefaults(def);
        const turned = stations.map((s) => ({
          ...s,
          p: turnAbout(s.p, 90),
          facing: s.facing + 90,
        }));
        const plain = poses(def, stations, ROLES, params);
        const round = poses(def, turned, ROLES, params);
        for (const [where, pose] of plain) {
          const gap = poseGap(turnPose(pose, 90), round.get(where)!, true);
          expect(gap.px, `${where} ${gap.what}`).toBeLessThan(1e-9);
          expect(gap.deg, `${where} facing`).toBeLessThan(1e-9);
          SAMPLES++;
        }
      });
    }
  }

  it("is a big enough claim to be worth making", () => {
    // Every case above has already run by the time this does, so the count is
    // the whole property's size rather than a guess at it.
    expect(SAMPLES).toBeGreaterThan(5_000);
    expect(MIRRORS.length + HANDED.length + RESOLVED_ELSEWHERE.length).toBeGreaterThanOrEqual(
      DATA_DEFINITIONS.length,
    );
  });
});
