import type { Beat, Vec2 } from "@caller/core";
import { addScaled, angleLerp, dirOf, lerp, ramp } from "@caller/core";
import type { FigurePlan, HandJoin, LocalHand, Spot, Spots } from "../../figures/ContraFigure.js";
import { joinedHands, midpoint, takeAndRelease } from "../../figures/ContraFigure.js";
import type { FigureRole, HoldSpec, LineWalkShape } from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalAngle, evalNumber } from "../expr.js";
import { joinKey, type ShapeInput } from "../interpret.js";
import { idleHandAt } from "./holds.js";
import { settleEnds } from "./places.js";

/**
 * **A line with an order, travelling**: down the hall and back up it (M7).
 *
 * The figure The Nice Combination's A2 is made of, and the reason `SetModel`
 * needed a shape at all. Four dancers who have just swung their neighbour are
 * standing in two pairs on two lines; a line of four is those same four side by
 * side in a stated **order**, and the order is a parameter because the
 * transcript gives one (`M1-W2-M2-W1`) and then gives a different one for the
 * way back (`W2-M1-W1-M2`) after the couples have turned.
 *
 * ## What it draws
 *
 * Everybody walks from where they stand to their own place in the line —
 * already travelled — turning on to the line's facing over
 * {@link LineWalkShape.settleBeats}. The line forms **as it goes**, which is
 * what dancers do and what keeps the walk one smooth path rather than a
 * shuffle-then-march. Inside hands are joined all the way along.
 *
 * ## Where it stops
 *
 * The line's centre is the dancers' own centroid pushed
 * {@link LineWalkShape.travel} px along its facing. Nothing here decides how far
 * a line "should" go down a hall — that is the definition's number, and the one
 * it ships with is read off long lines' own walking pace so that six beats down
 * the hall covers the ground six beats of any other contra walk would.
 */
export function planLineWalk(
  shape: LineWalkShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  if (holds.length > 0) {
    throw new Error(`lineWalk: a line's hands are the shape's own, not a hold list (M7)`);
  }
  const { ctx, beats } = input;
  const env = envFor(input, input.roles[0]!, 0);
  const facing = evalAngle(shape.facing, env);
  const axis = evalAngle(shape.axis, env);
  const travel = evalNumber(shape.travel, env);
  const spacing = evalNumber(shape.spacing, env);
  const settleBeats = evalNumber(shape.settleBeats, env);
  const drop = shape.handDrop === null ? null : evalNumber(shape.handDrop, env);
  const release = evalNumber(shape.handRelease, env);
  const letGo = beats - release;
  const order = orderOf(shape, input, axis);

  // **The line forms, and then it travels.** Two stages, and they have to be
  // two: a line of four is a hold, and the dancers come to it from wherever the
  // figure before left them — in The Nice Combination that is the two lines of
  // the set, 32 px apart, which no arm reaches across. Walking and closing up at
  // the same time leaves the hands out at 21 px for the first third of the
  // figure, which the reach oracle refused at 6.63 px short. So the first
  // `settleBeats` close the line up where it stands, and the rest of the figure
  // carries it down the hall.
  const home = centroidOf(order.map((role) => ctx.spot(role).p));
  const n = order.length;
  const across = (centre: Vec2): Spots => {
    const out: Spots = {};
    order.forEach((role, i) => {
      out[role] = { p: addScaled(centre, dirOf(axis), (i - (n - 1) / 2) * spacing), facing };
    });
    return out;
  };
  const formed = across(home);
  const natural = across(addScaled(home, dirOf(facing), travel));
  const ends = settleEnds(input, natural, order);

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const made = formed[role] ?? start;
    const end = ends[role] ?? start;
    const closing = t <= settleBeats || settleBeats >= beats;
    const from = closing ? start : made;
    const to = closing ? made : end;
    const k = closing ? ramp(t, 0, settleBeats) : ramp(t, settleBeats, beats);
    return {
      p: lerp(from.p, to.p, k),
      facing: angleLerp(start.facing, end.facing, ramp(t, 0, settleBeats)),
    };
  };

  /**
   * Which of a dancer's hands reaches toward the dancer at `other`.
   *
   * Read off the line's own two directions rather than off a rule about roles:
   * everybody in the line faces the same way, so the dancer earlier in the order
   * is on one hand and the later one is on the other, and which hand that is
   * falls out of whether the axis runs to the facing's left or its right.
   */
  const axisIsLeft = Math.cos(((axis - (facing - 90)) * Math.PI) / 180) > 0;
  const handToward = (me: number, them: number): "L" | "R" =>
    them < me === axisIsLeft ? "L" : "R";

  const joins = (): HandJoin[] => {
    if (drop === null) return [];
    const out: HandJoin[] = [];
    for (let i = 0; i + 1 < n; i++) {
      const a = order[i]!;
      const b = order[i + 1]!;
      out.push({ a, aSide: handToward(i, i + 1), b, bSide: handToward(i + 1, i) });
    }
    return out;
  };
  const held = joins();

  return {
    ends,
    // Hands go up over the settle and stay up until the figure lets go: a line
    // of four does not drop hands half way down the hall, and the figure that
    // follows takes the hold over or does not.
    joinsAt: (t) => (t >= settleBeats && t <= letGo ? held : []),
    at(role, t) {
      const self = placeAt(role, t);
      const at = envFor(input, role, t);
      const hands: { L: LocalHand; R: LocalHand } = {
        L: idleHandAt(shape.idleHands, self, "L", t, at),
        R: idleHandAt(shape.idleHands, self, "R", t, at),
      };
      if (drop !== null) {
        for (const join of held) {
          const mine = join.a === role ? join.aSide : join.b === role ? join.bSide : undefined;
          if (mine === undefined) continue;
          const other = join.a === role ? join.b : join.a;
          const point: Vec2 = midpoint(self.p, placeAt(other, t).p);
          const both = joinedHands(ctx, role, other, point, drop, 0);
          const hand = both[role];
          if (hand) {
            const key = joinKey(join.a, join.aSide, join.b, join.bSide);
            hands[mine] = takeAndRelease(self, mine, t, hand, {
              takeFrom: input.joinedIn.has(key) ? 0 : 0,
              takeTo: input.joinedIn.has(key) ? 0 : settleBeats,
              releaseFrom: input.joinedOut.has(key) ? 0 : letGo,
              releaseTo: input.joinedOut.has(key) ? 0 : beats,
            });
          }
        }
      }
      const moving = t > 0 && t < beats;
      return {
        p: self.p,
        facing: self.facing,
        hands,
        stepRate: moving ? 1 : 0,
        amp: moving ? 1 : 0,
      };
    },
  };
}

/**
 * The order the line stands in, as figure-roles.
 *
 * A call writes the roles outright (`["1L", "2R", "2L", "1R"]`) or names contra
 * roles for a line whose order is by role; anybody the order leaves out is
 * appended, so a line that names only some of its dancers still has a place for
 * everybody rather than dropping them.
 *
 * **A call that says nothing gets the order they are already standing in**, read
 * along the axis. That is the honest default and it is the one "bend the line"
 * needs: bending a line is a shape change and not a re-ordering, so a figure
 * that fell back to the *cast* order would quietly shuffle the line before
 * folding it — which it did, and which the lab caught as a dance that put both
 * dancers of a couple on the same side of the set.
 */
function orderOf(shape: LineWalkShape, input: ShapeInput, axis: number): FigureRole[] {
  const said = input.params[shape.order];
  if (said === undefined || said === null) {
    const along = dirOf(axis);
    return [...input.roles].sort((a, b) => {
      const pa = input.ctx.spot(a).p;
      const pb = input.ctx.spot(b).p;
      return pa[0] * along[0] + pa[1] * along[1] - (pb[0] * along[0] + pb[1] * along[1]);
    });
  }
  if (!Array.isArray(said)) {
    throw new Error(`"${shape.order}" is the order across the line, not ${JSON.stringify(said)}`);
  }
  const out: FigureRole[] = [];
  for (const entry of said as readonly unknown[]) {
    const name = String(entry);
    const role = input.roles.includes(name)
      ? name
      : input.roles.find((r) => input.ctx.role(r) === name);
    if (role === undefined) {
      throw new Error(
        `"${shape.order}" names "${name}", who is not in this line ` +
          `(cast: ${input.roles.join(", ")})`,
      );
    }
    if (!out.includes(role)) out.push(role);
  }
  for (const role of input.roles) if (!out.includes(role)) out.push(role);
  return out;
}

const centroidOf = (points: readonly Vec2[]): Vec2 => [
  points.reduce((n, p) => n + p[0], 0) / Math.max(1, points.length),
  points.reduce((n, p) => n + p[1], 0) / Math.max(1, points.length),
];

const envFor = (input: ShapeInput, self: FigureRole, t: Beat): ExprEnv => ({
  ctx: input.ctx,
  params: input.params,
  beats: input.beats,
  self,
  t,
  order: input.roles,
  anchor: input.anchor.centre,
  ...(input.slots === undefined ? {} : { slots: input.slots }),
});
