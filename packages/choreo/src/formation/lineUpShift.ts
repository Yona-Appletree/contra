import type { Vec2 } from "@caller/core";
import { dirOf, leftOf } from "@caller/core";
import type { DancerId, Formation, SetState, StationId } from "./Formation.js";
import { HANDS_FOUR_GROUP, stationPose } from "./Formation.js";

/**
 * Which way a formation's hall shifts after it has taken hands four, if it
 * shifts at all.
 *
 * `null` is the ordinary case: the hall walks into its places, takes hands in a
 * ring and dances. `"left"` and `"right"` are the becket case, in the user's
 * words:
 *
 * > "if its becket, you still line up improper, but the caller will say 'move
 * > one place to the left. this is a becket dance. your partner should be on
 * > the side of the set with you.' … _technically_ if its a right-progressing
 * > becket dance, you should move one place _to the right_."
 */
export type LineUpShift = "left" | "right" | null;

/** The ring places a shift is worth: `+1` is one place to each dancer's left. */
export const shiftPlaces = (shift: LineUpShift): number =>
  shift === "left" ? 1 : shift === "right" ? -1 : 0;

/**
 * The shift {@link LineUpShift} names, **derived from the formation's own
 * progression** rather than declared.
 *
 * This is the user's own observation turned into arithmetic. What makes a dance
 * becket is not a label: it is that you progress **sideways** — "it means you
 * progress the 'wrong' way from the direction you were facing when you took
 * hands four". So ask the formation what one time through does to a set
 * (`Formation.progression.next`), measure where that leaves one dancer relative
 * to the way that dancer was facing, and read the answer off:
 *
 * - travel along the facing, forward or back — duple improper, where you face
 *   your neighbour up and down the set and progress that way — is **no shift**;
 * - travel across the facing — becket, where you face across the set and slide
 *   along your own line — is a shift, to whichever side the travel is on.
 *
 * Nothing here knows what becket is, and nothing hard-codes "left": a becket
 * whose progression runs the other way answers `"right"`, which is exactly the
 * case the user says callers get wrong.
 *
 * Every dancing station is measured and they must agree; a formation whose
 * dancers disagree, or whose progression moves nobody, has no single shift and
 * gets `null`. A dancer the progression puts in a waiting group is skipped —
 * a couple sliding off the end of a line travels somewhere the shift is not
 * about.
 */
export function lineUpShiftOf(formation: Formation, set: SetState): LineUpShift {
  const here = measure(formation, set);
  if (here.measured) return here.shift;
  // Nothing in this set survived a time through still dancing — a becket line
  // of four couples is two dancing couples and both of them go out — so there
  // was nothing to measure. The shift is a property of the *formation*, not of
  // one hall, so ask the formation for a line long enough to have an interior
  // and measure that instead. A formation that will not build one has no answer
  // to give, and says so.
  let probe: SetState;
  try {
    probe = formation.start({ id: PROBE_ID, couples: PROBE_COUPLES, centre: [0, 0], axis: 90 });
  } catch {
    return null;
  }
  return measure(formation, probe).shift;
}

/** A line long enough that some couple is still dancing a time through later. */
const PROBE_COUPLES = 8;
const PROBE_ID = "line-up-shift-probe";

/** The verdict, and whether any dancer could be measured at all. */
function measure(formation: Formation, set: SetState): { shift: LineUpShift; measured: boolean } {
  const before = poses(formation, set);
  const after = poses(formation, formation.progression.next(set));

  let verdict: LineUpShift = null;
  let measured = false;
  for (const [dancer, from] of before) {
    const to = after.get(dancer);
    if (to === undefined) continue;
    measured = true;
    const moved: Vec2 = [to.p[0] - from.p[0], to.p[1] - from.p[1]];
    const forward = dot(moved, dirOf(from.facing));
    const sideways = dot(moved, leftOf(from.facing));
    // A shift is a sideways progression, and only a decisively sideways one:
    // a hair of lateral drift on a dancer who is really travelling forward is
    // arithmetic, not choreography.
    if (Math.abs(sideways) <= Math.abs(forward) + EPSILON) return { shift: null, measured };
    const side: LineUpShift = sideways > 0 ? "left" : "right";
    if (verdict !== null && verdict !== side) return { shift: null, measured };
    verdict = side;
  }
  return { shift: verdict, measured };
}

/** Below this many px a displacement is rounding, not travel. */
const EPSILON = 1e-6;

/**
 * Where every **dancing** dancer of a set stands, in world px, by dancer id.
 *
 * Keyed by dancer rather than by station because that is the only thing that
 * survives a progression: a couple that progresses takes a different station of
 * a different group, which is the whole point of measuring this way.
 */
function poses(formation: Formation, set: SetState): Map<DancerId, { p: Vec2; facing: number }> {
  const out = new Map<DancerId, { p: Vec2; facing: number }>();
  for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
    if (plan.kind !== "set") continue;
    for (const station of plan.stations) {
      const dancer: DancerId | undefined = plan.members[station.id as StationId];
      if (dancer === undefined) continue;
      out.set(dancer, stationPose(plan.frame, station));
    }
  }
  return out;
}

const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
