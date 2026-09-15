import type { Beat, Hand, Side, Vec2 } from "@caller/core";
import { addScaled, angleLerp, dirOf, lerp, ramp } from "@caller/core";
import type {
  FigurePlan,
  LocalHand,
  PlanContext,
  Spot,
  Spots,
} from "../../figures/ContraFigure.js";
import {
  bearing,
  isHeld,
  joinPoint,
  joinedHands,
  midpoint,
  takeAndRelease,
} from "../../figures/ContraFigure.js";
import { ringFor, ringHands } from "../../figures/ring.js";
import { BALANCE_BACK_RATIO, BALANCE_LEAN_CAP, balanceRock } from "../../pair/balance.js";
import type { FigureRole, HoldSpec, RockShape } from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalBool, evalNumber } from "../expr.js";
import { type ShapeInput } from "../interpret.js";
import type { ActivePairHold } from "./holds.js";
import { activeHolds, endsOfHold, joinsHeldAt } from "./holds.js";
import { settleOnPlaces } from "./places.js";

/**
 * **The rock**: a pair or a ring closes up, rocks forward and rocks back.
 *
 * The rock itself — its beat-for-beat shape, its slightly longer back rock and
 * its lean cap — is M5's, from the two-dancers spike and gate 3, and is read
 * from `balanceRock` rather than restated. What the kind adds is the closing: a
 * pair standing in the lines is 32 px apart and no 15 px arm reaches half way,
 * so a balance steps in to the frame's hold spacing as it rocks forward, which
 * is what dancers do.
 *
 * `close: "ring"` balances the ring of four instead, hands joined all the way
 * round and the rock along the radius. A ring usually opens back out — "balance
 * the ring and petronella" puts a dancer on the next *place of the set*, not on
 * the next place of the closed-up ring — and a pair usually does not, because
 * the swing that almost always follows wants it closed up.
 */

/** A balance's hands are up and down with the rock, so they never dip out and back. */
export function planRock(
  shape: RockShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  return shape.close === "ring" ? ringRock(shape, holds, input) : pairRock(shape, holds, input);
}

/** How far the body is off its place at `t`, in px, forward positive. */
const rockAt = (t: Beat, rock: number): number => {
  const f = balanceRock(t);
  return rock * f * (f > 0 ? 1 : BALANCE_BACK_RATIO);
};

/** The lean the rock puts in the torso, capped. */
const leanAt = (t: Beat): number =>
  Math.max(-BALANCE_LEAN_CAP, Math.min(BALANCE_LEAN_CAP, balanceRock(t)));

/** The environment a rock's expressions are read in; nothing here needs a live pass. */
const envFor = (input: ShapeInput, self: FigureRole, t: Beat): ExprEnv => ({
  ctx: input.ctx,
  params: input.params,
  beats: input.beats,
  self,
  t,
  order: input.roles,
  anchor: input.anchor.centre,
});

/** A rock for two: close to the hold spacing, take hands, rock. */
function pairRock(shape: RockShape, holds: readonly HoldSpec[], input: ShapeInput): FigurePlan {
  const { ctx, roles } = input;
  if (roles.length !== 2) {
    throw new Error(`a rock for a pair wants two roles, not [${roles.join(", ")}]`);
  }
  const [a, b] = roles as [FigureRole, FigureRole];
  const env = envFor(input, a, 0);
  const rock = evalNumber(shape.rock, env);
  const closeBeats = evalNumber(shape.closeBeats, env);
  const active = activeHolds(holds, input, env);
  const pairs = active.filter((h): h is ActivePairHold => h.kind === "pair");

  // Where the pair stands once it has closed up: square on the line between
  // them, the frame's hold spacing apart, each facing the other.
  const centre = input.anchor.centre;
  const toA = bearing(centre, ctx.spot(a).p);
  const closed: Spots = {
    [a]: { p: addScaled(centre, dirOf(toA), ctx.spacing / 2), facing: toA + 180 },
    [b]: { p: addScaled(centre, dirOf(toA), -ctx.spacing / 2), facing: toA },
  };
  const natural: Spots = { ...closed };
  const ends = endsOf(input, natural);

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const to = closed[role] ?? start;
    const k = ramp(t, 0, closeBeats);
    return { p: lerp(start.p, to.p, k), facing: angleLerp(start.facing, to.facing, k) };
  };

  /** The body, rocked off its place along the way it faces. */
  const bodyAt = (role: FigureRole, t: Beat): Spot => {
    const place = placeAt(role, t);
    return { p: addScaled(place.p, dirOf(place.facing), rockAt(t, rock)), facing: place.facing };
  };

  return {
    ends,
    joinsAt: (t) => joinsHeldAt(active, t),
    at(role, t) {
      const self = bodyAt(role, t);
      const hands: { L: LocalHand; R: LocalHand } = { L: "down", R: "down" };
      const f = balanceRock(t);
      const ahead = Math.max(f, 0);
      const behind = Math.max(-f, 0);
      for (const hold of pairs) {
        const ends2 = endsOfHold(hold, role);
        if (!ends2) continue;
        const other = bodyAt(ends2.other, t);
        const at = envFor(input, role, t);
        hands[ends2.mine] = takeAndRelease(
          self,
          ends2.mine,
          t,
          joinedHand(ctx, hold, role, ends2, self, other, ahead, behind, at),
          hold.window,
        );
      }
      return { p: self.p, facing: self.facing, lean: leanAt(t), hands, amp: 0 };
    },
  };
}

/** One joined hand of a pair rock: where the shared point is, and whose hand it is. */
function joinedHand(
  ctx: PlanContext,
  hold: ActivePairHold,
  role: FigureRole,
  ends: { mine: Side; other: FigureRole; theirs: Side },
  self: Spot,
  other: Spot,
  ahead: number,
  behind: number,
  env: ExprEnv,
): Hand {
  const spec = hold.spec;
  let point: Vec2;
  let drop = evalNumber(spec.drop, env);
  if (spec.point.kind === "midpoint") {
    point = midpoint(self.p, other.p);
  } else if (spec.point.kind === "reach") {
    const spread = evalNumber(spec.point.spread, env) * ahead;
    drop +=
      evalNumber(spec.point.dropGain, env) * ahead - evalNumber(spec.point.riseGain, env) * behind;
    point = spreadPoint(
      joinPoint(self, ends.mine, other, ends.theirs),
      self.p,
      other.p,
      spread,
      ends.mine,
    );
  } else {
    throw new Error(`a rock holds hands where the arms meet, not at ${JSON.stringify(spec.point)}`);
  }
  const both = joinedHands(
    ctx,
    role,
    ends.other,
    point,
    drop,
    spec.stackPx === undefined ? 0 : evalNumber(spec.stackPx, env),
  );
  const mine = both[role];
  if (!mine) throw new Error(`rock: no joined hand for role "${role}"`);
  return mine;
}

/** A joined point pushed `spread` px further out to the side as the pair comes together. */
function spreadPoint(p: Vec2, self: Vec2, other: Vec2, spread: number, side: Side): Vec2 {
  if (spread === 0) return p;
  const along = bearing(self, other);
  const out = dirOf(along + (side === "L" ? -90 : 90));
  return addScaled(p, out, spread);
}

/** A rock of the ring: everybody in, everybody out, hands joined round. */
function ringRock(shape: RockShape, holds: readonly HoldSpec[], input: ShapeInput): FigurePlan {
  const { ctx, beats, roles } = input;
  const env = envFor(input, roles[0]!, 0);
  const rock = evalNumber(shape.rock, env);
  const closeBeats = evalNumber(shape.closeBeats, env);
  const openBeats = evalNumber(shape.openBeats, env);
  const openOut = evalBool(shape.openOut, env);
  const ring = ringFor(ctx);
  const active = activeHolds(holds, input, env);
  const hold = active.find((h) => h.kind === "ring");
  if (!hold) throw new Error(`a ring rock needs a ring hold`);

  /** Where each dancer stands while the ring is closed up. */
  const onRing: Spots = {};
  for (const role of roles) {
    const at = ring.angle[role];
    if (at === undefined) throw new Error(`rock: "${role}" is not on the ring`);
    onRing[role] = { p: addScaled(ring.centre, dirOf(at), ring.radius), facing: at + 180 };
  }

  // Opening out means ending on the place you started from, turned to face the
  // middle — which is where the next figure's ring, star or petronella expects
  // to find you. `ends: "home"` then replaces that place with the formation's.
  const natural: Spots = {};
  for (const role of roles) {
    natural[role] = openOut ? { p: ctx.spot(role).p, facing: onRing[role]!.facing } : onRing[role]!;
  }
  // A ring that stays closed up has not gathered anybody: it ends on the ring,
  // where the figure that follows takes it over. Only the opening out settles.
  const ends = openOut ? endsOf(input, natural) : natural;

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const closed = onRing[role] ?? start;
    const end = ends[role] ?? start;
    const inK = ramp(t, 0, closeBeats);
    const outK = openOut ? ramp(t, beats - openBeats, beats) : 0;
    const from = outK > 0 ? closed : start;
    const to = outK > 0 ? end : closed;
    const k = outK > 0 ? outK : inK;
    const facing = angleLerp(from.facing, to.facing, k);
    const p = lerp(from.p, to.p, k);
    // The rock runs along the radius: in toward the middle and back out.
    return { p: addScaled(p, dirOf(facing), rockAt(t, rock)), facing };
  };

  const drop = evalNumber(hold.spec.drop, env);
  const riseGain = evalNumber(
    (hold.spec as { riseGain: number | { param: string } }).riseGain,
    env,
  );
  const stackPx = hold.spec.stackPx === undefined ? 0 : evalNumber(hold.spec.stackPx, env);

  return {
    ends,
    joinsAt: (t) =>
      isHeld(hold.reported, t) ? ringHands(ctx, ring, (id) => placeAt(id, t), drop).joins : [],
    at(role, t) {
      const self = placeAt(role, t);
      const { hands } = ringHands(
        ctx,
        ring,
        (id) => placeAt(id, t),
        drop - riseGain * Math.max(-balanceRock(t), 0),
        stackPx,
      );
      const mine = hands[role];
      if (!mine) throw new Error(`rock: no hands for "${role}"`);
      return {
        p: self.p,
        facing: self.facing,
        lean: leanAt(t),
        hands: {
          L: takeAndRelease(self, "L", t, mine.L, hold.window),
          R: takeAndRelease(self, "R", t, mine.R, hold.window),
        },
        amp: 0,
      };
    },
  };
}

/**
 * The shape's own ends, settled on to the formation's places when the figure
 * gathers.
 *
 * The **facings are the shape's own**, kept exactly: a ring that opens out ends
 * facing the middle, which is not the facing its dancers' home slots carry.
 */
function endsOf(input: ShapeInput, natural: Spots): Spots {
  if (!input.gathers || !input.places) return natural;
  const points: Record<string, Vec2> = {};
  for (const role of input.roles) {
    const spot = natural[role];
    if (spot) points[role] = spot.p;
  }
  const settled = settleOnPlaces(input.roles, points, input.places);
  const out: Spots = { ...natural };
  for (const role of input.roles) {
    const spot = natural[role];
    const place = settled[role];
    if (spot && place) out[role] = { p: place, facing: spot.facing };
  }
  return out;
}
