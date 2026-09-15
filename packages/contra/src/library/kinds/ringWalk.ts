import type { Beat, Vec2 } from "@caller/core";
import { addScaled, angleDiff, dirOf, lerp, smooth } from "@caller/core";
import type { Ring } from "@caller/choreo";
import type { FigurePlan, HandJoin, LocalHand, Spot, Spots } from "../../figures/ContraFigure.js";
import { bearing, isHeld, takeAndRelease } from "../../figures/ContraFigure.js";
import { ringFor, ringHands, ringShift, ringWalk } from "../../figures/ring.js";
import type { FigureRole, HoldSpec, RingWalkShape } from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalAngle, evalNumber } from "../expr.js";
import type { ShapeInput } from "../interpret.js";
import { activeHolds, idleHandAt, joinsHeldAt, soloHandAt, soloJoinsAt } from "./holds.js";

/**
 * **The ring walk**: the circle, the star and the petronella, as one shape.
 *
 * What the three share is the ring — and the ring is the whole point. Four
 * dancers standing on the corners of a rectangle who take hands round have to
 * stand the same distance from each neighbour or the arms cannot all reach, so
 * every one of these figures is danced on a **regular** ring whose radius is an
 * arm's own and whose phase is the circular mean of where everybody already
 * stands. That is `@caller/choreo`'s `ringOf`, and it means "one place round" is
 * a *place* and not an angle: the end is whoever's place you take, read off
 * where the dancers actually are, whether that is the formation's stations or a
 * ring they closed up on half a beat ago.
 *
 * What the three do not share is the travel. A circle and a star ride the ring
 * itself, stepping in to it and out of it with their hands joined; a petronella
 * lets go and walks the **chord** between the two places, spinning. Riding the
 * arc instead would bulge most of the way into the next minor set, which is
 * `petronella.ts`'s own note and is why the chord is a travel of its own rather
 * than a turn of zero radius.
 *
 * **Role shifts here run round the ring**, not through the cast order: "the
 * dancer ahead of me" in a star is the next one round, which is what
 * {@link ExprEnv.order} is set to. The instance's cast order is the order the
 * dancers stand in the group, which for a rectangle is not the order they stand
 * in round the circle.
 */
export function planRingWalk(
  shape: RingWalkShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  const { ctx, beats, roles } = input;
  const ring = ringFor(ctx);
  const envFor = (self: FigureRole, t: Beat): ExprEnv => ({
    ctx,
    params: input.params,
    beats,
    self,
    t,
    // Round the ring, not through the cast: see the header.
    order: ring.order,
    anchor: ring.centre,
  });
  const env = envFor(roles[0] ?? ring.order[0] ?? "", 0);

  const places = evalNumber(shape.places, env);
  const sign = evalNumber(shape.sign, env);
  const faceOffset = evalAngle(shape.faceOffset, env);
  const inBeats = evalNumber(shape.inBeats, env);
  const outBeats = evalNumber(shape.outBeats, env);
  const step = 360 / ring.order.length;

  const ends: Spots = {};
  for (const role of ctx.ids) {
    const p = ctx.spot(ringShift(ring, role, sign * places)).p;
    ends[role] = { p, facing: endFacingOf(shape, ring, p, envFor(role, 0)) };
  }

  const placeAt =
    shape.travel.kind === "ring"
      ? ringTravel(ring, ctx, ends, beats, {
          inBeats,
          outBeats,
          turn: sign * places * step,
          faceOffset,
        })
      : chordTravel(shape, ring, input, ends, envFor);

  const active = activeHolds(holds, input, env);
  const ringHold = active.find((hold) => hold.kind === "ring");
  const drop = ringHold === undefined ? 0 : evalNumber(ringHold.spec.drop, env);
  const stackPx =
    ringHold === undefined || ringHold.spec.stackPx === undefined
      ? 0
      : evalNumber(ringHold.spec.stackPx, env);
  const round = (t: Beat) => ringHands(ctx, ring, (id) => placeAt(id, t), drop, stackPx);

  const flare = shape.travel.kind === "chord" ? evalNumber(shape.travel.flare, env) : 0;

  return {
    ends,
    joinsAt(t) {
      const out: HandJoin[] = [];
      if (ringHold && isHeld(ringHold.reported, t)) out.push(...round(t).joins);
      out.push(...joinsHeldAt(active, t));
      out.push(...soloJoinsAt(active, input, t, envFor));
      return out;
    },
    at(role, t) {
      const self = placeAt(role, t);
      const hands: { L: LocalHand; R: LocalHand } = {
        L: idleHandAt(shape.idleHands, self, "L", t, envFor(role, t)),
        R: idleHandAt(shape.idleHands, self, "R", t, envFor(role, t)),
      };
      if (ringHold) {
        const mine = round(t).hands[role];
        if (!mine) throw new Error(`ringWalk: no ring hands for "${role}"`);
        hands.L = takeAndRelease(self, "L", t, mine.L, ringHold.window);
        hands.R = takeAndRelease(self, "R", t, mine.R, ringHold.window);
      }
      for (const hold of active) {
        if (hold.kind !== "solo") continue;
        const at = envFor(role, t);
        const placed = soloHandAt(hold, role, at, (id) => placeAt(id, t));
        if (!placed) continue;
        hands[placed.side] = takeAndRelease(self, placed.side, t, placed.hand, hold.window);
      }
      return {
        p: self.p,
        facing: self.facing,
        hands,
        ...(flare === 0 ? {} : { flare: flare * Math.sin(Math.PI * (t / beats)) }),
      };
    },
  };
}

/** Which way the figure leaves a dancer standing on `p` pointing. */
function endFacingOf(shape: RingWalkShape, ring: Ring, p: Vec2, env: ExprEnv): number {
  if (shape.endFacing.kind === "inward") return bearing(p, ring.centre);
  return bearing(ring.centre, p) + evalAngle(shape.endFacing.offset, env);
}

/** Riding the ring: step in to it, turn it, step out. A circle's and a star's. */
function ringTravel(
  ring: Ring,
  ctx: ShapeInput["ctx"],
  ends: Spots,
  beats: Beat,
  walk: { inBeats: Beat; outBeats: Beat; turn: number; faceOffset: number },
): (role: FigureRole, t: Beat) => Spot {
  return (role, t) =>
    ringWalk(ring, role, ctx.spot(role), ends[role] ?? ctx.spot(role), t, beats, walk);
}

/**
 * Walking the chord: the straight line between the two places, bowed a little
 * away from the middle, with the body spinning as it goes. A petronella's.
 */
function chordTravel(
  shape: RingWalkShape,
  ring: Ring,
  input: ShapeInput,
  ends: Spots,
  envFor: (self: FigureRole, t: Beat) => ExprEnv,
): (role: FigureRole, t: Beat) => Spot {
  if (shape.travel.kind !== "chord") throw new Error(`not a chord travel`);
  const { ctx, beats } = input;
  const env = envFor(ctx.ids[0] ?? "", 0);
  const bow = evalNumber(shape.travel.bow, env);
  // Signed whole turns: the definition says which way with `{ number: "sign" }`,
  // because a petronella spins the way it travels.
  const spins = evalNumber(shape.travel.spins, env);
  return (role, t) => {
    const start = ctx.spot(role);
    const end = ends[role] ?? start;
    const k = smooth(t / beats);
    const straight = lerp(start.p, end.p, k);
    const out = bow * Math.sin(Math.PI * k);
    const p: Vec2 =
      out === 0 ? straight : addScaled(straight, dirOf(bearing(ring.centre, straight)), out);
    const spin = 360 * spins + angleDiff(start.facing, end.facing);
    return { p, facing: start.facing + spin * k };
  };
}
