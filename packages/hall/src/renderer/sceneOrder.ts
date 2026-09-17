import type { ArmPair, Arm3dSolution, Hand, Vec2 } from "@caller/core";
import { stackJoined } from "@caller/core";
import type { HandStack } from "../person/drawPerson.js";

/** Two hands this close on the floor are the same joined hand. */
export const JOIN_EPSILON_PX = 0.1;

/**
 * How near an arm a hand has to be to count as **resting on** it: 1.6 px, which
 * is half the drawn width of a forearm (1.9 px) plus its outline (3.2 px).
 *
 * A hand whose centre is inside that is drawn over the arm, so it has to draw
 * after it. See {@link restsOnArm} for the rest of the rule and for the star,
 * which is the figure that needs it.
 */
export const REST_ON_ARM_PX = 1.6;

/**
 * How far from the far end of an arm a resting hand has to be: 2 px, about a
 * hand's own radius.
 *
 * The last couple of px of an arm **are** the hand, and two hands meeting there
 * are a join, which has its own rule (the robin's on top). Without this margin
 * every take and every release would read as a rest for the frame or two while
 * the two hands are closing — measured over the whole figure library, it is the
 * difference between the star alone and every figure that takes a hand.
 */
export const REST_OFF_HAND_PX = 2;

/**
 * How far from the **shoulder** end of an arm a resting hand has to be: 2 px,
 * the same hand's radius at the other end of the same bone.
 *
 * The rule is "a hand drawn on the *length* of an arm", and an arm's length
 * starts at the shoulder — a hand *at* the shoulder is on the dancer's body,
 * not on their arm, and says nothing about which of two forearms is on top.
 * FR-C1 excluded the far end of the bone and not the near one, and **the swing
 * is what that costs**: the ballroom hold puts the robin's left hand on the
 * lark's shoulder point, 0.58 px from it — 0.58 px from his right arm's bone
 * too, because that bone begins there — so every swing reads as a wrist grip.
 * While the pair's other hands are joined the join rule owns them and nothing
 * shows; at the take and at the open-out, when the joined hand has been let go,
 * it flips the robin's arms over the lark's for the beat and a half the hold is
 * being taken or released, which is the one thing about the robin's left arm
 * that changed in the swing after the user passed it (FR-D2).
 *
 * The star it was written for is untouched: its hand sits at the **elbow** of
 * the arm it holds, half a bone — 3.7 px — from that arm's shoulder.
 */
export const REST_OFF_SHOULDER_PX = 2;

/** The little of a dancer {@link sceneOrder} needs. */
export interface OrderedDancer {
  id: string;
  role: string;
  p: Vec2;
  hands: { L: Hand; R: Hand };
  /**
   * Both arms as they will be drawn, when the caller has them.
   *
   * Only {@link restsOnArm} reads them, and a caller that leaves them out gets
   * the joined-hands rules and the screen sort alone — which is what every
   * `sceneOrder` did before FR-C1.
   */
  arms?: ArmPair;
}

/**
 * The drawing order for one frame, as indices into the dancer list.
 *
 * Bodies and heads are sorted up the screen, so a dancer nearer the bottom
 * covers one further up. Arms are sorted the same way *except* where two
 * dancers are holding on to each other:
 *
 * - wherever two dancers hold **hands**, the role set's `top` role draws after
 *   the other one: the robin's hand is on top of the lark's and the robin's
 *   arms therefore draw over the lark's, every time, whichever way round the
 *   pair is standing (plan AC2);
 * - wherever one dancer's hand rests on another's **arm** — a wrist star, where
 *   there is no shared hand point at all (M4) — the hand draws after the arm it
 *   is on, so a dancer's arm and their hand stay at one depth however the
 *   figure is turned (FR-C1).
 *
 * The second of those can be a **cycle**: four dancers in a star each have a
 * hand on the next one's wrist, which is the clover leaf the user described,
 * and no flat painter can put all four hands over the arm under them. One
 * overlap has to give, and {@link topologicalByScreen} chooses which by dancer
 * id rather than by where anybody is standing — so it is the same overlap for
 * the whole turn instead of a different one every time two dancers cross on the
 * screen, which is what "the order of the hands is jumping around" was.
 */
export interface SceneOrder {
  /** Indices, sorted up the screen. */
  bodies: number[];
  /** Indices, sorted up the screen subject to the joined-pair constraints. */
  arms: number[];
  /** Per dancer, how each hand stacks. Parallel to the dancer list. */
  stacks: Array<{ L: HandStack; R: HandStack }>;
}

export function sceneOrder(
  dancers: readonly OrderedDancer[],
  roleSet: { top: string },
): SceneOrder {
  const stacks: Array<{ L: HandStack; R: HandStack }> = dancers.map(() => ({
    L: "free",
    R: "free",
  }));
  /** `after[i]` is the set of dancers that must draw their arms after `i`. */
  const after: Array<Set<number>> = dancers.map(() => new Set<number>());
  const inDegree = dancers.map(() => 0);
  /** `i` draws after `j`, once. */
  const draw = (i: number, j: number): void => {
    if (i === j || after[j]?.has(i) === true) return;
    after[j]?.add(i);
    inDegree[i] = (inDegree[i] ?? 0) + 1;
  };
  /** Whether these two share a hand point anywhere — a join, not a rest. */
  const joinedPair: boolean[][] = dancers.map(() => dancers.map(() => false));

  for (let i = 0; i < dancers.length; i++) {
    for (let j = i + 1; j < dancers.length; j++) {
      for (const si of SIDES) {
        for (const sj of SIDES) {
          const a = dancers[i];
          const b = dancers[j];
          if (a === undefined || b === undefined) continue;
          const ha = a.hands[si];
          const hb = b.hands[sj];
          if (Math.hypot(ha.p[0] - hb.p[0], ha.p[1] - hb.p[1]) > JOIN_EPSILON_PX) continue;

          // `stackJoined` is the invariant; ask it which of the two is on top.
          const claimA = { role: a.role, hand: ha };
          const claimB = { role: b.role, hand: hb };
          const topIsA = stackJoined(claimA, claimB, roleSet)[0] === claimA;
          const topIndex = topIsA ? i : j;
          const bottomIndex = topIsA ? j : i;
          const topSide = topIsA ? si : sj;
          const bottomSide = topIsA ? sj : si;

          setStack(stacks, topIndex, topSide, "top");
          setStack(stacks, bottomIndex, bottomSide, "bottom");
          const rowI = joinedPair[i];
          const rowJ = joinedPair[j];
          if (rowI !== undefined) rowI[j] = true;
          if (rowJ !== undefined) rowJ[i] = true;
          draw(topIndex, bottomIndex);
        }
      }
    }
  }

  // A hand on somebody's arm draws over that arm. Asked after the joins, and
  // never between two dancers who are already holding hands: the role rule owns
  // that pair and this one must not argue with it.
  for (let i = 0; i < dancers.length; i++) {
    for (let j = 0; j < dancers.length; j++) {
      if (i === j || joinedPair[i]?.[j] === true) continue;
      const me = dancers[i];
      const them = dancers[j];
      if (me === undefined || them === undefined || them.arms === undefined) continue;
      for (const side of SIDES) {
        for (const arm of them.arms) {
          if (restsOnArm(me.hands[side].p, arm)) draw(i, j);
        }
      }
    }
  }

  const bodies = dancers.map((_, i) => i).sort(byScreenThen(dancers));
  return { bodies, arms: topologicalByScreen(dancers, after, inDegree), stacks };
}

/**
 * Whether this hand is drawn on the length of that arm: within
 * {@link REST_ON_ARM_PX} of either bone, and clear of **both** ends of it —
 * more than {@link REST_OFF_HAND_PX} from the arm's own hand and more than
 * {@link REST_OFF_SHOULDER_PX} from its shoulder.
 *
 * **The wrist star is what this is for.** Its hold has no shared hand point —
 * everybody's hand is half way down the giving arm of the dancer ahead of them
 * (`@caller/contra`'s `wristPoint`, M4/FR-A1) — so the joined-hands rule above
 * never fires and, before FR-C1, nothing ordered the four arms at all.
 * Measured on the figure itself: a star dancer's hand is **0.78 px** from the
 * arm it is holding and **3.26 px** from the next nearest arm, steady through
 * the whole turn, so 1.6 px names the grip and nothing else.
 *
 * Both ends are excluded because neither is the arm's *length*: a hand at the
 * far end is a join in the making (FR-C1), and a hand at the shoulder is on the
 * dancer's body — which is what a ballroom hold is, and what FR-D2 found this
 * rule mistaking for a wrist grip in every swing.
 */
export function restsOnArm(hand: Vec2, arm: Arm3dSolution): boolean {
  if (Math.hypot(hand[0] - arm.hand[0], hand[1] - arm.hand[1]) <= REST_OFF_HAND_PX) return false;
  if (Math.hypot(hand[0] - arm.shoulder[0], hand[1] - arm.shoulder[1]) <= REST_OFF_SHOULDER_PX)
    return false;
  const upper = distanceToSegment(hand, arm.shoulder, arm.elbow);
  const fore = distanceToSegment(hand, arm.elbow, arm.hand);
  return Math.min(upper, fore) <= REST_ON_ARM_PX;
}

/** How far `p` is from the segment `a`–`b`. */
function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/**
 * Kahn's algorithm, always taking the eligible dancer furthest up the screen.
 * The result is the body order wherever nobody is holding on to anybody, and
 * respects every "this dancer's arms draw over that one's" constraint where
 * somebody is.
 *
 * **When every remaining dancer is waiting for another one, the cycle is broken
 * by dancer id** — not by the screen. A star is a cycle by construction (each
 * hand on the next wrist, all the way round), so exactly one of its four grips
 * has to be drawn the wrong way up; picking the dancer to start from by id
 * keeps it the *same* grip for the whole figure, where picking the one furthest
 * up the screen moved it every time two dancers crossed. The ordinary case —
 * no cycle — is untouched, and the ready list is still sorted up the screen.
 */
function topologicalByScreen(
  dancers: readonly OrderedDancer[],
  after: ReadonlyArray<ReadonlySet<number>>,
  inDegree: number[],
): number[] {
  const remaining = new Set(dancers.map((_, i) => i));
  const compare = byScreenThen(dancers);
  const order: number[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining].filter((i) => (inDegree[i] ?? 0) === 0).sort(compare);
    const next = ready[0] ?? [...remaining].sort(byId(dancers))[0];
    if (next === undefined) break;
    order.push(next);
    remaining.delete(next);
    for (const j of after[next] ?? []) inDegree[j] = (inDegree[j] ?? 0) - 1;
  }
  return order;
}

const byScreenThen =
  (dancers: readonly OrderedDancer[]) =>
  (a: number, b: number): number => {
    const pa = dancers[a];
    const pb = dancers[b];
    if (pa === undefined || pb === undefined) return a - b;
    return pa.p[1] - pb.p[1] || pa.p[0] - pb.p[0] || (pa.id < pb.id ? -1 : pa.id > pb.id ? 1 : 0);
  };

/** By id alone: the tie-break that does not move when the dancers do. */
const byId =
  (dancers: readonly OrderedDancer[]) =>
  (a: number, b: number): number => {
    const ia = dancers[a]?.id ?? "";
    const ib = dancers[b]?.id ?? "";
    return ia < ib ? -1 : ia > ib ? 1 : a - b;
  };

function setStack(
  stacks: Array<{ L: HandStack; R: HandStack }>,
  index: number,
  side: "L" | "R",
  value: HandStack,
): void {
  const s = stacks[index];
  if (s !== undefined) s[side] = value;
}

const SIDES = ["L", "R"] as const;
