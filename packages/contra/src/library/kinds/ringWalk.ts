import type { Beat, MotionProfile, Vec2 } from "@caller/core";
import {
  addScaled,
  angleDiff,
  angleLerp,
  dirOf,
  dist,
  lerp,
  profileProgress,
  smooth,
} from "@caller/core";
import type { Ring } from "@caller/choreo";
import type { FigurePlan, HandJoin, LocalHand, Spot, Spots } from "../../figures/ContraFigure.js";
import { bearing, isHeld, takeAndRelease } from "../../figures/ContraFigure.js";
import { ringEnd, ringFor, ringHands, ringHangDrop, ringWalk } from "../../figures/ring.js";
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

  // **The chain is a loop through the dancers' own places** (FR-A2), so it
  // answers which way a dancer is left looking off the path itself rather than
  // off a radius. Built before the ends, because the ends read it.
  const chain =
    shape.travel.kind === "chain"
      ? chainOf(ring, ctx, sign, places, evalNumber(shape.travel.corner, env))
      : undefined;

  const ends: Spots = {};
  for (const role of ctx.ids) {
    // **A ring walk ends where it leaves you**, whole place or not: `ringEnd`
    // is the station for the twenty-four calls that ask for a whole number of
    // places, and the point part way along the last run for a call like Are You
    // 'Most Done?'s star left seven eighths — which is asked for *because* it
    // leaves the set half a place short, on the diagonal the next call wants.
    const p = ringEnd(ring, ctx.start, role, sign * places);
    ends[role] = {
      p,
      facing:
        chain === undefined
          ? endFacingOf(shape, ring, p, envFor(role, 0))
          : chainEndFacing(shape, chain, role, envFor(role, 0)),
    };
  }

  const placeAt =
    chain !== undefined
      ? chainTravel(chain, beats, faceOffset, input.profile)
      : shape.travel.kind === "ring"
        ? ringTravel(ring, ctx, ends, beats, {
            inBeats,
            outBeats,
            turn: sign * places * step,
            faceOffset,
            // M10: the turn window rides the definition's profile; the step in
            // and the step out keep their own ramps (Q3).
            profile: input.profile,
          })
        : chordTravel(shape, ring, input, ends, envFor);

  const active = activeHolds(holds, input, env);
  const ringHold = active.find((hold) => hold.kind === "ring");
  const drop = ringHold === undefined ? 0 : evalNumber(ringHold.spec.drop, env);
  const stackPx =
    ringHold === undefined || ringHold.spec.stackPx === undefined
      ? 0
      : evalNumber(ringHold.spec.stackPx, env);
  const round = (t: Beat) => {
    const at = (id: FigureRole): Spot => placeAt(id, t);
    return ringHands(ctx, ring, at, ringHangDrop(ring, at, drop), stackPx);
  };

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
  walk: {
    inBeats: Beat;
    outBeats: Beat;
    turn: number;
    faceOffset: number;
    profile: MotionProfile;
  },
): (role: FigureRole, t: Beat) => Spot {
  return (role, t) =>
    ringWalk(ring, role, ctx.spot(role), ends[role] ?? ctx.spot(role), t, beats, walk);
}

/**
 * **The bike chain** (FR-A2): one dancer's whole path round the set, as the
 * places they walk through.
 *
 * The user, on the single file promenade: *"not at all right. you don't just
 * rotate about the center. you walk around the set single file like in a bike
 * chain."* A ring travel answers that by stepping every dancer **in** to a
 * regular circle about the set's middle and turning the circle; what a
 * promenade round the set really is, is the four of them walking the set's own
 * outline nose to tail, each one going to the place of the dancer in front.
 *
 * So the path is a polyline through the dancers' own places, in ring order, and
 * a dancer going `places` places walks through every place in between. Nothing
 * is stepped in to and nothing is stepped out of — every dancer is already
 * standing on the path — which is also why a quarter is a straight run rather
 * than an arc.
 */
interface Chain {
  /** The places this dancer walks through, their own first. */
  through: readonly Vec2[];
  /** The place after the last one: not walked to, but the way the loop goes on. */
  beyond: Vec2;
  /** How far either side of a place the body is turned over, px. */
  corner: number;
}

/** Every dancer's chain: their own place, then each place in front of them. */
function chainOf(
  ring: Ring,
  ctx: ShapeInput["ctx"],
  sign: number,
  places: number,
  corner: number,
): Record<FigureRole, Chain> {
  const n = ring.order.length;
  const out: Record<FigureRole, Chain> = {};
  // A fraction of a place is a fraction of the last run: the whole runs, then
  // part of one more. `ringShift` rounds, and this is what it rounds off.
  const whole = Math.floor(Math.abs(places) + 1e-9);
  const part = Math.abs(places) - whole;
  const way = sign >= 0 ? 1 : -1;
  const round = (k: number): Vec2 => ctx.spot(ring.order[((k % n) + n) % n]!).p;
  for (const role of ring.order) {
    const at = ring.order.indexOf(role);
    const through: Vec2[] = [];
    for (let k = 0; k <= whole; k++) through.push(round(at + way * k));
    if (part > 1e-9) {
      through.push(lerp(through[through.length - 1]!, round(at + way * (whole + 1)), part));
    }
    out[role] = { through, beyond: round(at + way * (whole + 1)), corner };
  }
  return out;
}

/**
 * Where a dancer is on their chain `k` of the way along it, and which way they
 * are looking.
 *
 * Every place on the path is walked **through** — it is somebody's place, and
 * taking it is the whole of what the figure does — and the corner itself is
 * where the body turns: over `corner` px either side of a place the dancer eases
 * from carrying straight on to setting off down the next run, so the turn is a
 * turn and not a hinge. A dancer who never reaches a corner (a quarter of a ring
 * of four is one straight run) never sees it.
 */
function chainAt(chain: Chain, k: number): Spot {
  const pts = chain.through;
  const first = pts[0];
  if (first === undefined) throw new Error(`a chain with no places`);
  if (pts.length < 2) return { p: first, facing: 0 };
  const legs = pts.slice(1).map((p, i) => dist(pts[i]!, p));
  const total = legs.reduce((a, b) => a + b, 0);
  if (total < 1e-9) return { p: first, facing: 0 };
  let s = Math.max(0, Math.min(1, k)) * total;
  let leg = 0;
  while (leg < legs.length - 1 && s > legs[leg]!) {
    s -= legs[leg]!;
    leg += 1;
  }
  const from = pts[leg]!;
  const to = pts[leg + 1]!;
  const len = legs[leg]!;
  const way = bearing(from, to);
  const straight: Vec2 = addScaled(from, dirOf(way), s);

  // The turn, at the place this run starts on and at the one it ends on: blend
  // with carrying straight on from the run before, and with setting off along
  // the run after. The place itself is still walked over exactly.
  const w = Math.min(chain.corner, len / 2);
  const before = leg > 0 ? bearing(pts[leg - 1]!, from) : undefined;
  // The last place is a corner too: the loop carries on round the set past it,
  // and a dancer who stops there has already started to turn it. So the same
  // blend runs at the end, which leaves the body half way into the turn —
  // exactly where the ring travel's tangent used to leave it, and what
  // `chainEndFacing` reads.
  const next = leg + 2 < pts.length ? pts[leg + 2]! : chain.beyond;
  const after = dist(to, next) < 1e-9 ? undefined : bearing(to, next);
  if (w > 0 && before !== undefined && s < w) {
    const u = smooth((s + w) / (2 * w));
    return {
      p: lerp(addScaled(from, dirOf(before), s), straight, u),
      facing: angleLerp(before, way, u),
    };
  }
  if (w > 0 && after !== undefined && s > len - w) {
    const u = smooth((s - (len - w)) / (2 * w));
    return {
      p: lerp(straight, addScaled(to, dirOf(after), s - len), u),
      facing: angleLerp(way, after, u),
    };
  }
  return { p: straight, facing: way };
}

/** Riding the chain: the whole path, eased over the figure's own beats. */
function chainTravel(
  chains: Record<FigureRole, Chain>,
  beats: Beat,
  faceOffset: number,
  profile: MotionProfile,
): (role: FigureRole, t: Beat) => Spot {
  return (role, t) => {
    const chain = chains[role];
    if (chain === undefined) throw new Error(`ringWalk: "${role}" is not on the chain`);
    const at = chainAt(chain, profileProgress(profile, t, beats));
    return { p: at.p, facing: at.facing + faceOffset };
  };
}

/**
 * Which way a chain leaves a dancer looking: **the way the loop is going where
 * they stopped**, which is half way between the run they came in on and the run
 * that carries on round the set.
 *
 * A dancer who stops on a corner of the set has already started to turn it —
 * that is what going round something means, and it is the same answer the ring
 * travel gave (a circle's tangent at the place) for a path that is a circle. The
 * incoming run alone reads as stopping dead facing the wall: measured, it costs
 * the swing after Jeremy Corners' promenade thirty degrees more turning than it
 * has beats for, and the arm solver reported 2.94 px of hand out of reach at
 * beat 56.625.
 */
function chainEndFacing(
  shape: RingWalkShape,
  chains: Record<FigureRole, Chain>,
  role: FigureRole,
  env: ExprEnv,
): number {
  const chain = chains[role];
  if (chain === undefined) throw new Error(`ringWalk: "${role}" is not on the chain`);
  const end = chainAt(chain, 1);
  if (shape.endFacing.kind === "inward") return bearing(end.p, chain.through[0] ?? end.p);
  return end.facing + evalAngle(shape.endFacing.offset, env);
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
    // The petronella's spin rides the travel's own `k`, which is how it comes
    // to share the travel's profile (Q8).
    const k = profileProgress(input.profile, t, beats);
    const straight = lerp(start.p, end.p, k);
    const out = bow * Math.sin(Math.PI * k);
    const p: Vec2 =
      out === 0 ? straight : addScaled(straight, dirOf(bearing(ring.centre, straight)), out);
    const spin = 360 * spins + angleDiff(start.facing, end.facing);
    return { p, facing: start.facing + spin * k };
  };
}
