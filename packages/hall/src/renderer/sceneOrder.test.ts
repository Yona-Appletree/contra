import type { Hand, Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { OrderedDancer } from "./sceneOrder.js";
import { sceneOrder } from "./sceneOrder.js";

const ROLE_SET = { top: "robin" };

/** A hand nowhere near any other hand, so it never counts as joined. */
let loose = 0;
const down = (): Hand => ({ p: [1000 + loose++ * 50, 1000], drop: 14 });
const free = (): { L: Hand; R: Hand } => ({ L: down(), R: down() });

const dancer = (
  id: string,
  role: string,
  y: number,
  hands: { L: Hand; R: Hand } = free(),
): OrderedDancer => ({ id, role, p: [0, y], hands });

describe("sceneOrder", () => {
  it("sorts bodies up the screen", () => {
    const list = [dancer("a", "lark", 5), dancer("b", "robin", -3), dancer("c", "lark", 1)];
    expect(sceneOrder(list, ROLE_SET).bodies).toEqual([1, 2, 0]);
  });

  it("leaves unjoined arms in body order", () => {
    const list = [dancer("a", "lark", 5), dancer("b", "robin", -3)];
    const order = sceneOrder(list, ROLE_SET);
    expect(order.arms).toEqual(order.bodies);
    expect(order.stacks).toEqual([
      { L: "free", R: "free" },
      { L: "free", R: "free" },
    ]);
  });

  it("draws the top role's arms last however the pair is arranged", () => {
    const shared: Hand = { p: [0, 0], drop: 5 };
    for (const [robinY, larkY] of [
      [-4, 4],
      [4, -4],
    ] as const) {
      const lark = dancer("lark", "lark", larkY, { L: shared, R: down() });
      const robin = dancer("robin", "robin", robinY, { L: down(), R: shared });
      const order = sceneOrder([lark, robin], ROLE_SET);
      expect(order.arms.indexOf(1)).toBeGreaterThan(order.arms.indexOf(0));
      expect(order.stacks[0]).toEqual({ L: "bottom", R: "free" });
      expect(order.stacks[1]).toEqual({ L: "free", R: "top" });
    }
  });

  it("treats hands within the join epsilon as the same joined hand", () => {
    const lark = dancer("lark", "lark", 0, { L: { p: [0, 0], drop: 5 }, R: down() });
    const near = dancer("robin", "robin", 0, { L: down(), R: { p: [0.05, 0], drop: 5 } });
    const far = dancer("robin", "robin", 0, { L: down(), R: { p: [0.5, 0], drop: 5 } });
    expect(sceneOrder([lark, near], ROLE_SET).stacks[0]).toEqual({ L: "bottom", R: "free" });
    expect(sceneOrder([lark, far], ROLE_SET).stacks[0]).toEqual({ L: "free", R: "free" });
  });

  it("orders a chain of joined dancers without dropping anybody", () => {
    const h1: Hand = { p: [0, 0], drop: 5 };
    const h2: Hand = { p: [10, 0], drop: 5 };
    const lark1 = dancer("l1", "lark", 0, { L: h1, R: down() });
    const robin = dancer("r", "robin", 2, { L: h1, R: h2 });
    const lark2 = dancer("l2", "lark", 4, { L: h2, R: down() });
    const order = sceneOrder([lark1, robin, lark2], ROLE_SET);
    expect([...order.arms].sort()).toEqual([0, 1, 2]);
    expect(order.arms.indexOf(1)).toBe(2);
    expect(order.stacks[1]).toEqual({ L: "top", R: "top" });
  });

  it("is deterministic when two dancers share a y", () => {
    const list = [dancer("b", "lark", 0), dancer("a", "lark", 0)];
    expect(sceneOrder(list, ROLE_SET).bodies).toEqual(sceneOrder(list, ROLE_SET).bodies);
  });
});

/**
 * **The star, turned right round** (FR-C1).
 *
 * A wrist star has no shared hand point at all: everybody's hand is half way
 * down the giving arm of the dancer ahead of them, so the four grips make a
 * ring — the clover leaf the user described — and the joined-hands rule above
 * never sees any of it. Before FR-C1 the four arms were therefore drawn in
 * plain screen order, which changes four times a revolution, and with it which
 * hand was buried under whose forearm: *"the order of the hands is jumping
 * around as it turns … the arm and hand basically are at different z-indexes."*
 *
 * The star below is built the way the figure builds it rather than posed by
 * hand: four dancers on a 12 px ring, each with a straight giving arm from a
 * shoulder 6.5 px out to a hand that is the **midpoint of the next dancer's
 * shoulder and hand**, which is `@caller/contra`'s `wristPoint` written as the
 * fixed point it solves for. Then the whole thing is turned through a full
 * revolution and asked to keep still.
 */
describe("a wrist star's arms", () => {
  const RING_PX = 12;
  const SHOULDER_PX = 6.5;
  const IDS = ["c1/lark", "c1/robin", "c2/lark", "c2/robin"] as const;
  const ROLES = ["lark", "robin", "lark", "robin"] as const;

  /** The four dancers of a star turned `turn` degrees from where it started. */
  function star(turn: number): OrderedDancer[] {
    const at = (r: number, k: number): Vec2 => {
      const a = ((turn + k * 90) * Math.PI) / 180;
      return [r * Math.cos(a), r * Math.sin(a)];
    };
    const shoulders = IDS.map((_, k) => at(SHOULDER_PX, k));
    // `hand[k]` is half way from the next dancer's shoulder to their hand, all
    // the way round: a four-cycle with a factor of a half at each step, so
    // plain iteration converges to the exact fixed point long before 200 turns.
    let hands: Vec2[] = IDS.map((_, k) => at(3, k));
    for (let pass = 0; pass < 200; pass++) {
      hands = hands.map((_, k) => {
        const next = (k + 1) % IDS.length;
        const s = shoulders[next]!;
        const h = hands[next]!;
        return [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2];
      });
    }
    return IDS.map((id, k) => {
      const shoulder = shoulders[k]!;
      const hand = hands[k]!;
      const elbow: Vec2 = [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2];
      const arm = { shoulder, elbow, hand, short: 0, elbowZ: -3, handZ: -3, reach: 15 };
      return {
        id,
        role: ROLES[k]!,
        p: at(RING_PX, k),
        hands: { L: down(), R: { p: hand, drop: 3 } },
        arms: [{ ...arm, hand: shoulder, elbow: shoulder }, arm] as const,
      } as OrderedDancer;
    });
  }

  /** Who is holding whose arm, as indices: `grip[i]` is the arm `i`'s hand is on. */
  const GRIP = [1, 2, 3, 0];

  it("puts every hand over the arm it is holding but one", () => {
    const list = star(0);
    const order = sceneOrder(list, ROLE_SET).arms;
    const wrongWayUp = GRIP.filter((held, i) => order.indexOf(i) < order.indexOf(held));
    // A ring of four grips cannot be flattened: one of them has to be drawn the
    // wrong way up, and exactly one is.
    expect(wrongWayUp).toHaveLength(1);
  });

  it("keeps the same order through a whole turn", () => {
    const orders = new Set<string>();
    const wrong = new Set<string>();
    for (let turn = 0; turn < 360; turn += 5) {
      const list = star(turn);
      const order = sceneOrder(list, ROLE_SET).arms;
      orders.add(order.map((i) => list[i]!.id).join(" < "));
      for (const [i, held] of GRIP.entries()) {
        if (order.indexOf(i) < order.indexOf(held))
          wrong.add(`${list[i]!.id} under ${list[held]!.id}`);
      }
    }
    // One order, and one grip drawn the wrong way up, for the whole revolution.
    // The order is the grip chain read backwards from the dancer whose id comes
    // first, which is what makes it the same at every angle.
    expect([...orders]).toEqual(["c1/lark < c2/robin < c2/lark < c1/robin"]);
    expect([...wrong]).toEqual(["c1/lark under c1/robin"]);
  });

  it("never splits a dancer's arm from their hand", () => {
    // A dancer's arms are one entry in the order, so their forearm and the hand
    // on the end of it are always at the same depth. The star is the figure
    // that made the question worth asking: whichever way round the four go,
    // every dancer appears exactly once.
    for (let turn = 0; turn < 360; turn += 15) {
      const order = sceneOrder(star(turn), ROLE_SET).arms;
      expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    }
  });

  it("leaves a hand at the far end of an arm to the joined-hands rule", () => {
    // Two dancers taking hands are momentarily a hand's width apart, which is
    // also "on the end of each other's arm". That is a join in the making, not
    // a grip, and `REST_OFF_HAND_PX` is what keeps this rule out of it.
    const shared: Vec2 = [0, 0];
    const arm = (hand: Vec2) => ({
      shoulder: [hand[0], hand[1] + 10] as Vec2,
      elbow: [hand[0], hand[1] + 5] as Vec2,
      hand,
      short: 0,
      elbowZ: -3,
      handZ: -3,
      reach: 15,
    });
    const lark: OrderedDancer = {
      id: "lark",
      role: "lark",
      p: [0, 4],
      hands: { L: { p: shared, drop: 5 }, R: down() },
      arms: [arm(shared), arm([9, 4])],
    };
    const robin: OrderedDancer = {
      id: "robin",
      role: "robin",
      p: [0, -4],
      hands: { L: down(), R: { p: [0.3, 0], drop: 5 } },
      arms: [arm([-9, -4]), arm([0.3, 0])],
    };
    // 0.3 px apart is past the join epsilon, so nothing is "joined" — and the
    // hand-end margin keeps it from becoming a rest either, so the two are
    // ordered up the screen as they always were.
    const order = sceneOrder([lark, robin], ROLE_SET);
    expect(order.arms).toEqual(order.bodies);
  });

  it("leaves a hand on a shoulder to the screen, because a shoulder is not an arm", () => {
    // **The swing** (FR-D2). A ballroom hold puts the robin's left hand on the
    // lark's shoulder point — measured on the figure, 0.58 px from it — and his
    // right arm's bone *begins* there, so the wrist-star rule saw a grip. While
    // the pair's other hands are joined the join rule owns the pair and it never
    // showed; at the take and at the open-out the joined hand is let go, and the
    // rule flipped the robin's arms over the lark's for those beats. A hand at
    // the shoulder is on the body, so it says nothing about the arms and the two
    // are ordered up the screen, exactly as they were before FR-C1.
    const larkShoulder: Vec2 = [0, 0];
    const arm = (shoulder: Vec2, hand: Vec2) => ({
      shoulder,
      elbow: [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2] as Vec2,
      hand,
      short: 0,
      elbowZ: -4,
      handZ: -3,
      reach: 15,
    });
    // The robin is up the screen of the lark, so the screen sort puts her arms
    // first — which is the order the rule was overturning.
    const onShoulder: Hand = { p: [0.58, 0], drop: 0 };
    const lark: OrderedDancer = {
      id: "lark",
      role: "lark",
      p: [0, 4],
      hands: { L: down(), R: { p: [-6, -6], drop: 1 } },
      arms: [arm([-5.5, 4], [-14, 6]), arm(larkShoulder, [-6, -6])],
    };
    const robin: OrderedDancer = {
      id: "robin",
      role: "robin",
      p: [2, -4],
      hands: { L: onShoulder, R: { p: [12, -2], drop: 1 } },
      arms: [arm([-3, -4], onShoulder.p), arm([7, -4], [12, -2])],
    };
    const order = sceneOrder([lark, robin], ROLE_SET);
    expect(order.arms).toEqual(order.bodies);
    expect(order.arms.indexOf(1)).toBeLessThan(order.arms.indexOf(0));
  });
});
