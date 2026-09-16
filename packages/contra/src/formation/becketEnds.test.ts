import type { DancerId, GroupPlan, SetState, Vec2 } from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  WAIT_OUT,
  createGroup,
  dist,
  poseAt,
  stationPose,
  withDefaults,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { ALL_DANCES } from "../dances/index.js";
import { LAB_RUN } from "../dances/danceLab.js";
import { danceAlone } from "../dances/oracle.js";
import { waitOut } from "../figures/wait-out.js";
import { BECKET } from "./becket.js";
import { PLACE_PITCH_PX } from "./dupleImproper.js";

/**
 * **The becket end-of-set crossing never puts two dancers on one point** — M9c,
 * re-derived in FR-C2's unit (half a couple place, one dancer position).
 *
 * M9b measured the fault and it is a rule of the formation rather than a fault
 * in any dance: a becket cycle boundary moves the *slots* and leaves every
 * *body* where it stands, so a time through ends with everybody one couple
 * place behind the place the boundary has just named theirs and the next
 * figure walks them in. The waiting couple was the one body the boundary moved
 * — its mirror crossing was reckoned to finish **on** the progressed place —
 * so it landed on the couple that had just danced there and had not moved yet.
 * Are You 'Most Done? at four couples, beat 64, all eight dancers of the set on
 * four points.
 *
 * So the crossing is reckoned one couple place back
 * (`ContraWaitOutParams.crossShort`), and this file is the table that says so:
 * the landing, and then eight beats either side of the boundary with nobody
 * within AC6's 8 px of anybody.
 *
 * The line lengths are the oracles' own (`BECKET_LINES`), which is every even
 * line from four to twelve and the odd ones between: an even becket line stands
 * a couple out at both ends on the times through when its two grids are out of
 * step and an odd one stands one out at one end, and the two ends' frames are
 * turned end for end from each other, so all three cases have to be in the
 * table.
 */
const LINES = [4, 5, 6, 7, 8, 9, 10, 12] as const;

/** AC6's number: no two torso centres within 8 px. */
const COLLISION_PX = 8;

/**
 * A becket set **one time through in**, which is the shape that has couples
 * standing out at every length (FR-C2): the two lines' grids start in step and
 * fall out of it, so a hall that has just lined up has nobody out at all.
 */
const set = (couples: number): SetState =>
  BECKET.progression.next(BECKET.start({ id: "b", couples, centre: [0, 0], axis: 90 }));

/** Where every dancer of a set stands, as its own groups place them. */
function places(state: SetState): Map<DancerId, Vec2> {
  const out = new Map<DancerId, Vec2>();
  for (const plan of BECKET.groupsFor(HANDS_FOUR_GROUP, state)) {
    for (const station of plan.stations) {
      out.set(plan.members[station.id]!, stationPose(plan.frame, station).p);
    }
  }
  return out;
}

const waitPlans = (state: SetState): GroupPlan[] =>
  BECKET.groupsFor(HANDS_FOUR_GROUP, state).filter((plan) => plan.kind !== "set");

/** `wait-out`'s parameters for a whole time through, short landing or not. */
const paramsFor = (crossShort: boolean) => withDefaults(waitOut, { crossShort }, 64);

describe("the becket end-of-set crossing lands half a couple place short", () => {
  for (const couples of LINES) {
    it(`lands exactly half a couple place back from the place it comes in on, ${String(couples)} couples`, () => {
      const state = set(couples);
      // Where the next time through wants everybody — the engine's own landing,
      // and what `becket.test.ts` asserts the unshortened crossing reaches.
      const next = places(BECKET.progression.next(state));
      let checked = 0;
      for (const plan of waitPlans(state)) {
        const group = createGroup(plan, BECKET.roleSet);
        const long = WAIT_OUT.ends(group, withDefaults(WAIT_OUT, { crossTo: "mirror" }, 64));
        const short = waitOut.ends(group, paramsFor(true));
        for (const station of plan.stations) {
          const dancer = plan.members[station.id]!;
          const wanted = next.get(dancer)!;
          // The long landing is the progressed place itself.
          expect(dist(long[station.id]!.p, wanted), `${dancer} long`).toBeLessThan(1e-9);
          // The short one is that place, **half** a couple place back along the
          // line the couple is coming in on — which is the line it lands on, so
          // the step is measured against the two places that line runs between,
          // and it is exactly what a becket boundary leaves every other body
          // behind by (FR-C2).
          expect(dist(short[station.id]!.p, wanted), `${dancer} short`).toBeCloseTo(
            PLACE_PITCH_PX,
            9,
          );
          // Same facing either way: a crossing couple always turns round.
          expect(short[station.id]!.facing, `${dancer} facing`).toBeCloseTo(
            long[station.id]!.facing,
            9,
          );
          checked += 1;
        }
      }
      // An even line waits at both ends; an odd one waits at one end, which is
      // the other end each time through.
      expect(checked).toBe(couples % 2 === 0 ? 4 : 2);
    });

    it(`clears every dancer of the set by ${String(COLLISION_PX)} px, ${String(couples)} couples`, () => {
      const state = set(couples);
      const standing = places(state);
      const waits = waitPlans(state);
      const crossing = new Set<DancerId>();
      for (const plan of waits) {
        for (const station of plan.stations) crossing.add(plan.members[station.id]!);
      }
      const params = paramsFor(true);
      let worst = Infinity;
      let pairs = 0;
      let where = "";
      // The crossing is the last eight beats of the wait, and it is checked to
      // its last instant: the dancing couples are standing on their places
      // there, because the boundary has not moved them and the next time
      // through has not begun.
      for (let t = 48; t <= 64; t += 1 / 8) {
        const poses = new Map(standing);
        for (const plan of waits) {
          const group = createGroup(plan, BECKET.roleSet);
          for (const station of plan.stations) {
            poses.set(plan.members[station.id]!, waitOut.sample(group, station.id, t, params).p);
          }
        }
        const ids = [...poses.keys()];
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            // Only a pair with a crossing dancer in it is this rule's business:
            // two dancing couples standing on their own places are the
            // formation's geometry and `becket.test.ts` owns them.
            if (!crossing.has(ids[i]!) && !crossing.has(ids[j]!)) continue;
            pairs += 1;
            const d = dist(poses.get(ids[i]!)!, poses.get(ids[j]!)!);
            if (d < worst) {
              worst = d;
              where = `${ids[i]!} ~ ${ids[j]!} at beat ${String(t)}`;
            }
          }
        }
      }
      // Never vacuous: 129 samples times the pairs a crossing dancer is in.
      expect(pairs).toBeGreaterThan(129 * couples);
      expect(worst, where).toBeGreaterThanOrEqual(COLLISION_PX);
    });

    it(`is what the unshortened crossing fails, ${String(couples)} couples`, () => {
      // The same sweep with the engine's own landing, which is what made this
      // milestone: the crossing finishes exactly on a standing dancer.
      const state = set(couples);
      const standing = places(state);
      const params = paramsFor(false);
      let worst = Infinity;
      for (const plan of waitPlans(state)) {
        const group = createGroup(plan, BECKET.roleSet);
        for (const station of plan.stations) {
          const end = waitOut.sample(group, station.id, 64, params).p;
          for (const [dancer, p] of standing) {
            if (dancer === plan.members[station.id]) continue;
            worst = Math.min(worst, dist(end, p));
          }
        }
      }
      expect(worst).toBeLessThan(1e-9);
    });
  }
});

describe("the becket dances at the boundary", () => {
  // Are You 'Most Done? is the dance M9b measured the fault on and Butter is
  // the only becket dance that was ever green — it writes the short landing by
  // hand as `startPlaces`, so this rule has to leave it exactly where it was.
  for (const slug of ["are-you-most-done", "butter"] as const) {
    for (const couples of [4, 6] as const) {
      it(`${slug} has nobody on anybody at the boundary, ${String(couples)} couples`, () => {
        const dance = ALL_DANCES.find((d) => d.slug === slug)!;
        const timeline = danceAlone(dance, couples, 128, {}, LAB_RUN).timeline();
        const dancers = timeline.dancers();
        let worst = Infinity;
        let where = "";
        for (let t = 56; t <= 72; t += 1 / 8) {
          const poses = dancers.map((d) => poseAt(timeline, d, t).p);
          for (let i = 0; i < dancers.length; i++) {
            for (let j = i + 1; j < dancers.length; j++) {
              const d = dist(poses[i]!, poses[j]!);
              if (d < worst) {
                worst = d;
                where = `${dancers[i]!} ~ ${dancers[j]!} at beat ${String(t)}`;
              }
            }
          }
        }
        expect(worst, where).toBeGreaterThanOrEqual(COLLISION_PX);
      });
    }
  }
});
