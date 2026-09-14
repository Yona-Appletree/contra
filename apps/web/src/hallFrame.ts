import type { Beat, Vec2 } from "@caller/core";
import type { DancerId, HallState, Timeline } from "@caller/choreo";
import { hallDancers, poseAt } from "@caller/choreo";
import { CONTRA_ROLES } from "@caller/contra";
import type { Frame, FrameDancer, Person } from "@caller/hall";
import { createPerson } from "@caller/hall";

/**
 * Turning the timeline into a frame the renderer can draw: who these people
 * are, where each of them is on this beat, and how fast they are moving.
 */

/** How the hall names a dancer: `set0/c3/lark`. */
const DANCER_RE = /^(.*)\/c(\d+)\/(lark|robin)$/;

/**
 * The people of the hall, one per dancer, with a seed fixed by where they
 * stand at the start.
 *
 * A dancer id never changes — `set0/c3/lark` is the same person all evening,
 * whatever place the progression has moved them to — so hashing it gives a
 * stable face, a stable shirt and a stable trail colour for the whole demo,
 * and the same hall every time the page is opened. The spike's own two seeds
 * (63 and 91) are not used here: a hall of thirty-six wants the whole palette
 * rather than two of it, and the pair page is where the spike's pair lives.
 */
export function createHallPeople(hall: HallState): Map<DancerId, Person> {
  const people = new Map<DancerId, Person>();
  for (const id of hallDancers(hall)) {
    const parts = DANCER_RE.exec(id);
    const couple = parts ? Number(parts[2]) : 0;
    const role = parts ? parts[3]! : "lark";
    people.set(
      id,
      createPerson({
        id,
        role,
        seed: seedOf(id),
        // The ones travel down and get the darker trail; in a duple improper
        // line the even-numbered couples start as the ones.
        ones: couple % 2 === 0,
        roleShirts: true,
      }),
    );
  }
  return people;
}

/** A stable 32-bit hash of a dancer id, so the same hall comes back every time. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** What a frame needs beyond the timeline. */
export interface HallFrameOptions {
  /** Leave the trails out: the toggle in the control bar. */
  trails: boolean;
  /**
   * The previous frame's positions and beat, so the renderer's quiet motion
   * knows how fast each dancer is moving. Differencing the timeline instead
   * would cost two more `poseAt` calls per dancer per frame.
   */
  previous?: { beat: Beat; at: Map<DancerId, Vec2> } | undefined;
}

/** One frame of the hall: every dancer's pose on this beat. */
export function hallFrame(
  timeline: Timeline,
  people: Map<DancerId, Person>,
  beat: Beat,
  options: HallFrameOptions,
): { frame: Frame; at: Map<DancerId, Vec2> } {
  const at = new Map<DancerId, Vec2>();
  const dancers: FrameDancer[] = [];
  const prev = options.previous;
  const dt = prev === undefined ? 0 : beat - prev.beat;

  for (const [id, person] of people) {
    const pose = poseAt(timeline, id, beat);
    at.set(id, pose.p);
    const was = prev?.at.get(id);
    const velocity: Vec2 =
      was === undefined || dt <= 0
        ? [0, 0]
        : [(pose.p[0] - was[0]) / dt, (pose.p[1] - was[1]) / dt];
    dancers.push({
      person,
      pose,
      velocity,
      // An omitted `trail` means "add where this dancer is now"; an empty one
      // means "add nothing", which is the toggle off.
      ...(options.trails ? {} : { trail: [] }),
    });
  }

  return { frame: { beat, people: dancers, roleSet: CONTRA_ROLES }, at };
}
