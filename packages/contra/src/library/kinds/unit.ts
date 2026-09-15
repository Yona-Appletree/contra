import type { Beat, Vec2 } from "@caller/core";
import { addScaled, dirOf, dist, lerp, ramp } from "@caller/core";
import type { FigurePlan, HandJoin, LocalHand, Spot, Spots } from "../../figures/ContraFigure.js";
import { bearing, joinPoint, joinedHands, midpoint } from "../../figures/ContraFigure.js";
import type { FigureRole, HoldSpec, UnitShape } from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalAngle, evalNumber } from "../expr.js";
import type { ShapeInput } from "../interpret.js";
import { idleHandAt } from "./holds.js";
import { settleEnds } from "./places.js";

/**
 * **Two dancers as one actor** (M7): a unit with its own centre and its own
 * orientation, which turns and travels as a body.
 *
 * `vision.md` §"Resolution" lists this frame kind beside the pair and the ring —
 * *"couple (or any two dancers, per Hey for Thee) as a unit with its own
 * orientation"* — and The Nice Combination's "neighbour turn as couples" is what
 * it is for. The distinction from every orbit in the library is exactly the one
 * a dancer feels: in an allemande the two of you turn **about each other**, and
 * your positions swap; turning **as** a couple you stay side by side, a hold
 * apart, and the pair of you ends pointing the other way.
 *
 * ## Why a unit is not a courtesy turn
 *
 * A courtesy turn's geometry is a couple's own — the robin on the lark's right,
 * her right hand behind her back, the pivot near the lark, the whole thing
 * solved backwards from where it leaves the couple. A unit is **any two
 * dancers** and has no opinion about which of them is which: it turns about the
 * midpoint between them, which is what makes it the right shape for "turn as
 * couples" in a line of four (where the pairs are neighbours, not couples) and
 * for M8's promenade around the major set.
 *
 * ## What it draws
 *
 * The unit's centre and its axis are read off where the two are standing. The
 * centre travels {@link UnitShape.travel} px along {@link UnitShape.along} while
 * the axis turns {@link UnitShape.turn} degrees, both eased over the figure, and
 * each dancer rides their own end of the axis. Their facings turn with it, so
 * the body and the formation turn together and nobody walks backwards.
 */
export function planUnit(
  shape: UnitShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  if (holds.length > 0) {
    throw new Error(`unit: a unit's hands are the shape's own, not a hold list (M7)`);
  }
  const { ctx, beats, roles } = input;
  if (roles.length !== 2) {
    throw new Error(`a unit is two dancers as one, not [${roles.join(", ")}]`);
  }
  const [a, b] = roles as [FigureRole, FigureRole];
  const env = envFor(input, a, 0);
  const turn = evalAngle(shape.turn, env);
  const travel = evalNumber(shape.travel, env);
  const along = evalAngle(shape.along, env);
  const drop = shape.handDrop === null ? null : evalNumber(shape.handDrop, env);

  const startA = ctx.spot(a);
  const startB = ctx.spot(b);
  const centre0 = midpoint(startA.p, startB.p);
  const axis0 = bearing(startA.p, startB.p);
  const half =
    shape.spacing === null ? dist(startA.p, startB.p) / 2 : evalNumber(shape.spacing, env) / 2;
  const centre1 = addScaled(centre0, dirOf(along), travel);

  /** Where the unit's centre is, and which way its axis points, at `t`. */
  const unitAt = (t: Beat): { centre: Vec2; axis: number; k: number } => {
    const k = ramp(t, 0, beats);
    return { centre: lerp(centre0, centre1, k), axis: axis0 + turn * k, k };
  };

  /**
   * Where a dancer rides on the unit: `half` px along the axis toward their own
   * end of it, their body turned by as much as the unit has turned.
   *
   * The half separation is eased from where they really were on to the unit's
   * own, so a pair that was standing wide closes up as it turns rather than
   * jumping on to the hold.
   */
  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const { centre, axis, k } = unitAt(t);
    // The axis runs **from `a` to `b`**, so `a` is on its negative end. Getting
    // this the other way round is not a mirror image, it is a unit that never
    // moves: both dancers are carried to where the other one already was, and a
    // half turn of the axis puts each of them back on their own place. The lab
    // caught it as a turn as couples that turned the bodies and left the feet.
    const mine = role === a ? -1 : 1;
    const was = dist(startA.p, startB.p) / 2;
    const r = lerp([was, 0], [half, 0], k)[0];
    const start = role === a ? startA : startB;
    return {
      p: addScaled(centre, dirOf(axis), mine * r),
      facing: start.facing + turn * k,
    };
  };

  const natural: Spots = { [a]: placeAt(a, beats), [b]: placeAt(b, beats) };
  const ends = settleEnds(input, natural);
  /**
   * **The promenade hold, as the user describes it** (FR-A2): *"in a promenade
   * you stand beside each other, left in left, right in right, walking the same
   * direction."*
   *
   * Two joins rather than one, and neither of them between the two bodies: left
   * hand to left hand and right hand to right hand puts both pairs of arms
   * across the front of the couple, each pair meeting where the two arms
   * actually reach — which is what `joinPoint` answers and what the inside
   * hold's body midpoint cannot. The right pair rides {@link UnitShape.topRise}
   * px above the left so the two crossed arms are not drawn through each other;
   * inside each join the role set's top role is still on top, which is the
   * rendering contract's and not this figure's to decide.
   */
  const promenade = shape.hold === "promenade";
  const rise = promenade ? evalNumber(shape.topRise ?? 0, env) : 0;
  const stackPx = promenade ? evalNumber(shape.stackPx ?? 0, env) : 0;
  const held: HandJoin[] =
    drop === null
      ? []
      : promenade
        ? [
            { a, aSide: "L", b, bSide: "L" },
            { a, aSide: "R", b, bSide: "R" },
          ]
        : [{ a, aSide: handSide(startA, startB), b, bSide: handSide(startB, startA) }];

  return {
    ends,
    joinsAt: () => held,
    at(role, t) {
      // The last instant is the settled end, so a figure that gathers hands the
      // next one a place rather than the unit's own arithmetic.
      const self = t >= beats ? (ends[role] ?? placeAt(role, t)) : placeAt(role, t);
      const at = envFor(input, role, t);
      const hands: { L: LocalHand; R: LocalHand } = {
        L: idleHandAt(shape.idleHands, self, "L", t, at),
        R: idleHandAt(shape.idleHands, self, "R", t, at),
      };
      for (const join of held) {
        if (drop === null) break;
        const mine = join.a === role ? join.aSide : join.bSide;
        const yours = join.a === role ? join.bSide : join.aSide;
        const other = join.a === role ? join.b : join.a;
        const theirs = t >= beats ? (ends[other] ?? placeAt(other, t)) : placeAt(other, t);
        const point = promenade ? joinPoint(self, mine, theirs, yours) : midpoint(self.p, theirs.p);
        const both = joinedHands(
          ctx,
          role,
          other,
          point,
          drop - (mine === "R" ? rise : 0),
          stackPx,
        );
        const hand = both[role];
        if (hand) hands[mine] = hand;
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
 * Which hand a dancer of the unit gives the other: the one on their side.
 *
 * Read off where they are standing rather than from a role rule, because a unit
 * is any two dancers: whoever has the other one on their left gives their left.
 */
function handSide(self: Spot, other: Spot): "L" | "R" {
  const toward = bearing(self.p, other.p);
  const off = ((toward - self.facing + 540) % 360) - 180;
  return off < 0 ? "L" : "R";
}

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
