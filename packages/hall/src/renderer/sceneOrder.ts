import type { Hand, Vec2 } from "@caller/core";
import { stackJoined } from "@caller/core";
import type { HandStack } from "../person/drawPerson.js";

/** Two hands this close on the floor are the same joined hand. */
export const JOIN_EPSILON_PX = 0.1;

/** The little of a dancer {@link sceneOrder} needs. */
export interface OrderedDancer {
  id: string;
  role: string;
  p: Vec2;
  hands: { L: Hand; R: Hand };
}

/**
 * The drawing order for one frame, as indices into the dancer list.
 *
 * Bodies and heads are sorted up the screen, so a dancer nearer the bottom
 * covers one further up. Arms are sorted the same way *except* that wherever
 * two dancers hold hands, the role set's `top` role draws after the other one:
 * the robin's hand is on top of the lark's and the robin's arms therefore draw
 * over the lark's, every time, whichever way round the pair is standing (plan
 * AC2).
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
          if (!after[bottomIndex]?.has(topIndex)) {
            after[bottomIndex]?.add(topIndex);
            inDegree[topIndex] = (inDegree[topIndex] ?? 0) + 1;
          }
        }
      }
    }
  }

  const bodies = dancers.map((_, i) => i).sort(byScreenThen(dancers));
  return { bodies, arms: topologicalByScreen(dancers, after, inDegree), stacks };
}

/**
 * Kahn's algorithm, always taking the eligible dancer furthest up the screen.
 * The result is the body order wherever no hands are joined, and respects every
 * "this dancer's arms draw over that one's" constraint where they are.
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
    // A cycle cannot arise from a single `top` role, but never hang if one does.
    const next = ready[0] ?? [...remaining].sort(compare)[0];
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
