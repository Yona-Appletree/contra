import type { Angle, Beat, BodyPath, Hand, Plant, Vec2 } from "@caller/core";
import {
  addScaled,
  angleDiff,
  angleLerp,
  bodyPoint,
  dirOf,
  dist,
  handDown,
  leftOf,
  lerp,
  lerpHand,
  memoPlants,
  mix,
  plantedGait,
  ramp,
  swingFeet,
  trapezoid,
  trapezoidSpeed,
} from "@caller/core";
import type { Side } from "@caller/choreo";
import type { FigurePlan, LocalHand, Spot, Spots } from "../../figures/ContraFigure.js";
import {
  bearing,
  joinPoint,
  joinedHands,
  orbitRadius,
  polar,
  takeAndRelease,
} from "../../figures/ContraFigure.js";
import { endFacingOf } from "../../figures/swing.js";
import type {
  BodyStage,
  FigureRole,
  HoldSpec,
  OrbitPairShape,
  SpeedWindow,
} from "../FigureDefinition.js";
import type { ExprEnv, Moment } from "../expr.js";
import { evalAngle, evalMoment, evalNumber } from "../expr.js";
import { type ShapeInput } from "../interpret.js";
import type { ActivePairHold } from "./holds.js";
import { activeHolds, endsOfHold, joinsHeldAt } from "./holds.js";
import { NOTHING_SPOKEN_FOR, placePairFor } from "./places.js";

/**
 * **The orbit for two**: the swing and the allemande, as one shape with
 * different dressing.
 *
 * Both are two dancers turning about a shared centre on a trapezoid speed
 * profile, stepping in to the turn from wherever they stood and opening out of
 * it on to the places the next figure starts from. What differs is data: how
 * the bodies sit on the turn (locked together on one axis, or each on their own
 * radius), how far round, how the facing is built stage by stage, which hands
 * are joined and which rest on the other dancer, and whether there is a buzz
 * step.
 *
 * Two things the kind owns rather than the definitions:
 *
 * - **The clearance.** Two pairs of a minor set turn at once, and a pair
 *   orbiting at full radius from centres one place pitch apart passes 7.86 px
 *   from the pair beside it — just inside AC6's 8 px. Which pairs are beside
 *   you is a fact about the resolution, so it arrives as `params.nearby`, and
 *   the squeeze is applied here.
 * - **The feet.** A swing's feet are sampled off the figure's own velocity, and
 *   the orbit knows its velocity analytically, so it differences its own
 *   `placeAt` rather than a figure carrying code to do it (the brief's "feet are
 *   an interpreter service").
 */

/** The step the velocity for the feet is differenced over; M5's number. */
const SAMPLE_DT: Beat = 0.05;

/** One orbit for two, planned. */
export function planOrbitPair(
  shape: OrbitPairShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  const { ctx, beats, roles } = input;
  if (roles.length !== 2) {
    throw new Error(`an orbit for a pair wants two roles, not [${roles.join(", ")}]`);
  }
  const [a, b] = roles as [FigureRole, FigureRole];
  const env = envFor(input, a, 0);

  const centre = input.anchor.centre;
  const sign = evalNumber(shape.turn.sign, env);
  const whole = sign * 360 * evalNumber(shape.turn.amount, env);
  const inBeats = evalNumber(shape.inBeats, env);
  const outBeats = evalNumber(shape.outBeats, env);
  const profile = speedWindow(shape.profile, env, beats);
  const active = activeHolds(holds, input, env, { inBeats, outBeats });
  const pairHolds = active.filter((h): h is ActivePairHold => h.kind === "pair");

  // Where the pair stands when this is over, and — for a swing — which way it
  // opens out. Both are read off the formation's own places when resolution
  // handed them in, which is the honest end: "the pair balances where the hey
  // left them, swings there, and drifts home while opening out".
  const settled = settle(shape, input, a, b, centre, whole);
  const ends = settled.ends;

  /** How far round the turn actually goes. */
  const turn =
    shape.turn.round === "open" && settled.facing !== undefined
      ? whole + angleDiff(settled.psi0 + whole, settled.facing + 90)
      : whole;

  const tight = squeezeOf(shape, input, env, centre);

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const end = ends[role] ?? start;
    const turned = trapezoid(t, profile.a0, profile.a1, profile.b0, profile.b1);
    const into = ramp(t, 0, inBeats);
    const open = ramp(t, beats - outBeats, beats);
    if (shape.radial === "pair") {
      const psi = settled.psi0 + turn * turned;
      const away = role === shape.axisRole ? 1 : -1;
      const turning = addScaled(
        addScaled(centre, dirOf(psi), away * tight.radius),
        leftOf(psi),
        -away * tight.lateral,
      );
      return {
        p: lerp(lerp(start.p, turning, into), end.p, open),
        facing: bodyFacing(shape, input, role, t, psi + (away === 1 ? 180 : 0), settled),
      };
    }
    const angle = bearing(centre, start.p) + turn * turned;
    const radius = mix(
      mix(dist(centre, start.p), tight.radius, into),
      settled.half[role] ?? 0,
      open,
    );
    return {
      p: polar(centre, angle, radius),
      facing: bodyFacing(shape, input, role, t, angle, settled),
    };
  };

  const velocityAt = (role: FigureRole, t: Beat): Vec2 => {
    const dt = Math.min(t + SAMPLE_DT, beats) - t;
    if (dt <= 0) return [0, 0];
    const here = placeAt(role, t);
    const next = placeAt(role, t + dt);
    return [(next.p[0] - here.p[0]) / dt, (next.p[1] - here.p[1]) / dt];
  };

  /**
   * **The walking half of the swing's feet, planted** (M10).
   *
   * An orbit is the one kind that places its own `feet`, so `poseAt`'s gait
   * never reaches it; and it is the one kind that can answer for its own body
   * at any beat analytically. So it runs `plantedGait` over its own `placeAt`
   * and hands the result to `swingFeet`, which fades it into the buzz step
   * exactly as before. The parity is even-at-zero: the figure's own beats, not
   * absolute ones, because the interpreter has no absolute start — and by the
   * time it would matter the buzz has taken the feet over anyway.
   */
  const gaitBody = (role: FigureRole): BodyPath => {
    const clamp = (t: Beat): Beat => Math.min(Math.max(t, 0), beats);
    return (t) => {
      const spot = placeAt(role, clamp(t));
      return { p: spot.p, facing: spot.facing };
    };
  };
  const gaits = new Map<FigureRole, { body: BodyPath; plants: (k: number) => Plant }>();
  const gaitFeet = (role: FigureRole, t: Beat): { L: Vec2; R: Vec2 } => {
    let gait = gaits.get(role);
    if (!gait) {
      const body = gaitBody(role);
      gait = { body, plants: memoPlants(body) };
      gaits.set(role, gait);
    }
    return plantedGait(gait.body, t, { plants: gait.plants });
  };

  return {
    ends,
    joinsAt: (t) => joinsHeldAt(active, t),
    at(role, t) {
      const self = placeAt(role, t);
      const other = placeAt(role === a ? b : a, t);
      const into = ramp(t, 0, inBeats);
      const open = ramp(t, beats - outBeats, beats);
      const at = envFor(input, role, t);
      const down = (side: Side): Hand => handDown(self.p, self.facing, side, t, 0);
      const hands: { L: LocalHand; R: LocalHand } = { L: "down", R: "down" };

      for (const hold of pairHolds) {
        const both = endsOfHold(hold, role);
        if (!both) continue;
        const target = joinedHand(shape, hold, role, both, input, placeAt, t, at);
        hands[both.mine] =
          hold.spec.window.kind === "orbit"
            ? orbitHand(target, down(both.mine), input.handsIn?.(role, both.mine), into, open)
            : takeAndRelease(self, both.mine, t, target, hold.window);
      }
      for (const contact of shape.contact) {
        if (contact.role !== role) continue;
        const on = placeAt(contact.on, t);
        const target: Hand = {
          p: bodyPoint(
            on.p,
            on.facing,
            evalNumber(contact.forward, at),
            evalNumber(contact.right, at),
          ),
          drop: evalNumber(contact.drop, at),
        };
        hands[contact.side] = orbitHand(
          target,
          down(contact.side),
          input.handsIn?.(role, contact.side),
          into,
          open,
        );
      }

      const look =
        shape.look === "other"
          ? bearing(self.p, other.p)
          : shape.look === "anchor"
            ? bearing(self.p, centre)
            : self.facing;
      if (!shape.motion) {
        return { p: self.p, facing: self.facing, look, hands };
      }
      const motion = shape.motion;
      const buzz = into * (1 - open);
      return {
        p: self.p,
        facing: self.facing,
        look,
        lean: -evalNumber(motion.lean, at) * buzz,
        stepRate: evalNumber(motion.stepRate, at),
        flare:
          evalNumber(motion.flare, at) *
          trapezoidSpeed(t, profile.a0, profile.a1, profile.b0, profile.b1),
        amp: 1 - buzz,
        ...(motion.feet
          ? { feet: swingFeet(t, self.facing, velocityAt(role, t), buzz, gaitFeet(role, t)) }
          : {}),
        hands,
      };
    },
  };
}

/** What an orbit works out about its pair once, before anybody moves. */
interface Settled {
  ends: Spots;
  /** The line the turn starts on, from the centre toward the axis role. */
  psi0: Angle;
  /** The facing the pair opens out on to, when the shape has one. */
  facing?: Angle;
  /** How far from the centre each dancer ends, px. */
  half: Record<FigureRole, number>;
}

/**
 * Where the turn leaves the pair.
 *
 * With `homes` — which is every call in a real dance — the pair settles on to
 * the formation's own places: the centre they open out about is the midpoint of
 * their two home places, the half-spacing is half the distance between them,
 * and (for a swing) the way they face is read off the line those two places
 * make rather than off the diagonal the figure before left them on. That is
 * what makes a swing's end *honest*, and what makes Butter's `endHalf: 10`
 * unnecessary.
 *
 * Without them — a figure danced alone in `pnpm figure`, or a probe — it falls
 * back to the coded figures' own rule: `placeHalf` over whatever stations the
 * context has, about the pair's own meeting centre.
 */
function settle(
  shape: OrbitPairShape,
  input: ShapeInput,
  a: FigureRole,
  b: FigureRole,
  centre: Vec2,
  whole: Angle,
): Settled {
  const { ctx, roles } = input;
  const places = input.gathers ? (input.places ?? stationPoints(input)) : stationPoints(input);
  // The ledger ranks the **formation's** places, so it says nothing about the
  // fallback: a figure planned from its own stations has no pool to share.
  const spoken =
    input.gathers && input.places ? (input.spokenFor ?? NOTHING_SPOKEN_FOR) : NOTHING_SPOKEN_FOR;
  const psi0 = bearing(centre, ctx.spot(shape.axisRole ?? b).p);
  const separation = dist(ctx.spot(a).p, ctx.spot(b).p) / 2;

  if (shape.ends.kind === "square") {
    const word = input.params[shape.ends.facing.param] as Parameters<typeof endFacingOf>[0];
    // Two passes, because the two answers depend on each other: which way "out"
    // is decides which pair of places suits, and the pair of places decides
    // which way "out" is. The first pass asks the question of the dancers where
    // they stand — which is what the coded swing does and all it ever did — and
    // the second asks it again of the places that answer found. From the
    // stations the two passes agree, because the places *are* where the pair is
    // standing; from anywhere else the second is the honest one.
    const rough = endFacingOf(word, ctx.spot(a).p, ctx.spot(b).p, centre, ctx.spot(a).facing);
    const pair = placePairFor(places, centre, rough, separation, spoken);
    // The two ends of that pair of places, **in the order the call named the
    // dancers** — nearest to the first of them first. `endFacingOf` breaks the
    // tie a pair standing square across the set leaves ("both ways square to
    // your line point up or down the hall") with the way the *first* dancer is
    // already looking, so handing it the two points the other way round turns
    // the answer through half a turn.
    const [one, two] = pair.ends;
    const mine = dist(one, ctx.spot(a).p) <= dist(two, ctx.spot(a).p);
    const facing = endFacingOf(
      word,
      mine ? one : two,
      mine ? two : one,
      pair.centre,
      ctx.spot(a).facing,
    );
    // A swing opens out with the lark on the left of the way it faces and the
    // robin on its right; which of the pair is which is the dancers' own roles,
    // not the order the call named them in. The two ends are the **places
    // themselves**, so the pair really does finish standing on them.
    const lark = ctx.role(a) === ctx.roleSet.top ? b : a;
    const robin = lark === a ? b : a;
    const left = dirOf(facing - 90);
    const onLeft = (one[0] - pair.centre[0]) * left[0] + (one[1] - pair.centre[1]) * left[1] > 0;
    return {
      ends: {
        [lark]: { p: onLeft ? one : two, facing },
        [robin]: { p: onLeft ? two : one, facing },
      },
      psi0,
      facing,
      half: { [lark]: pair.half, [robin]: pair.half },
    };
  }

  // `"turned"`: each dancer ends on their own orbit angle, facing the centre,
  // as far out as the formation's own places are — which is the whole of what
  // `endHalf` was ever written by hand to say.
  //
  // **And it takes no place, so nothing is spoken for** (M9d). This branch only
  // ever borrows the *distance between* two places; the dancers end on their own
  // orbit angles, which are nobody's home. Ranking the search here moves an
  // allemande's ends without de-conflicting anything: measured on Fatal
  // Attraction's `robins-chain`, it widened the pair's half from 9.512 to
  // 12.627 px, which cost the `robins-chain -> promenade` seam 8.0 px of closure
  // (39.1798 → 47.2230) and 7.6 px of reach (26.7595 → 34.3920) at every checked
  // length, and changed no collision anywhere.
  const pair = placePairFor(
    places,
    centre,
    bearing(ctx.spot(a).p, ctx.spot(b).p) + 90,
    separation,
    NOTHING_SPOKEN_FOR,
  );
  const ends: Spots = {};
  const half: Record<FigureRole, number> = {};
  for (const role of roles) {
    const angle = bearing(centre, ctx.spot(role).p) + whole;
    half[role] = pair.half;
    ends[role] = { p: polar(centre, angle, pair.half), facing: angle + 180 };
  }
  return { ends, psi0, half };
}

/**
 * The places a figure falls back on when resolution handed it none: the
 * instance's own stations.
 *
 * What `pnpm figure` and a bare probe get. For a pair instance that is the two
 * dancers themselves, so `placePairFor` finds their own separation and the
 * figure behaves exactly as the coded one did with `endHalf: null` on a group
 * of two.
 */
const stationPoints = (input: ShapeInput): Vec2[] => input.ctx.stations.map((s) => s.p);

/** How much of the orbit fits beside the pair turning next to you. */
function squeezeOf(
  shape: OrbitPairShape,
  input: ShapeInput,
  env: ExprEnv,
  centre: Vec2,
): { radius: number; lateral: number } {
  const radius = evalNumber(shape.radius, env);
  const lateral = evalNumber(shape.lateral, env);
  if (shape.clearance === null) return { radius, lateral };
  const clearance = evalNumber(shape.clearance, env);
  if (shape.squeeze === "radius") {
    return { radius: orbitRadius(radius, centre, input.nearby, clearance), lateral };
  }
  let nearest = Infinity;
  for (const other of input.nearby) {
    const gap = dist(centre, other);
    if (gap > 1e-9) nearest = Math.min(nearest, gap);
  }
  if (!Number.isFinite(nearest)) return { radius, lateral };
  const orbit = Math.hypot(radius, lateral);
  const k = Math.max(0, Math.min(1, (nearest - clearance) / (2 * orbit)));
  return { radius: radius * k, lateral: lateral * k };
}

/** The body, turned stage by stage over the figure. */
function bodyFacing(
  shape: OrbitPairShape,
  input: ShapeInput,
  role: FigureRole,
  t: Beat,
  base: Angle,
  settled: Settled,
): Angle {
  const at = envFor(input, role, t);
  let facing = input.ctx.spot(role).facing;
  for (const stage of shape.body) {
    const from = evalMoment(stage.from, at, input.beats);
    const until = evalMoment(stage.until, at, input.beats);
    const k = ramp(t, from, until);
    const target = targetOf(stage, base, settled, at) + turnOutOf(stage, at) * k;
    facing = angleLerp(facing, target, k);
  }
  return facing;
}

/** Where one stage takes the body. */
function targetOf(stage: BodyStage, base: Angle, settled: Settled, env: ExprEnv): Angle {
  if ("end" in stage.to) {
    if (settled.facing === undefined) {
      throw new Error(`a body stage asks for the end facing, which this orbit does not have`);
    }
    return settled.facing;
  }
  return base + evalAngle(stage.to.orbit, env);
}

/** A stage's continuous extra offset, in degrees. */
const turnOutOf = (stage: BodyStage, env: ExprEnv): Angle =>
  stage.turnOut === undefined ? 0 : evalAngle(stage.turnOut, env);

/** One joined hand of an orbit: where the shared floor point is. */
function joinedHand(
  shape: OrbitPairShape,
  hold: ActivePairHold,
  role: FigureRole,
  both: { mine: Side; other: FigureRole; theirs: Side },
  input: ShapeInput,
  placeAt: (role: FigureRole, t: Beat) => Spot,
  t: Beat,
  env: ExprEnv,
): Hand {
  const point = holdPointOf(shape, hold, input, placeAt, t, env);
  const drop = evalNumber(hold.spec.drop, env);
  const stackPx = hold.spec.stackPx === undefined ? 0 : evalNumber(hold.spec.stackPx, env);
  const joined = joinedHands(input.ctx, role, both.other, point, drop, stackPx);
  const mine = joined[role];
  if (!mine) throw new Error(`orbitPair: no joined hand for role "${role}"`);
  return mine;
}

/** The shared floor point of one of an orbit's holds. */
function holdPointOf(
  shape: OrbitPairShape,
  hold: ActivePairHold,
  input: ShapeInput,
  placeAt: (role: FigureRole, t: Beat) => Spot,
  t: Beat,
  env: ExprEnv,
): Vec2 {
  const spec = hold.spec.point;
  if (spec.kind === "anchor") return input.anchor.centre;
  if (spec.kind === "shoulders") {
    // The outstretched pair of hands, `inset` px in from the midpoint of the
    // two joined shoulders, to the left of the line from the hold's first role
    // to its second.
    const first = placeAt(hold.join.a, t);
    const second = placeAt(hold.join.b, t);
    const outward = leftOf(bearing(first.p, second.p));
    return addScaled(
      joinPoint(first, hold.join.aSide, second, hold.join.bSide),
      outward,
      evalNumber(spec.inset, env),
    );
  }
  throw new Error(`an orbit does not hold hands at ${JSON.stringify(spec)}`);
}

/**
 * A hand on the orbit's own ramps: up from wherever it started as the pair
 * closes in, and down to the hip as it opens out.
 *
 * A hand handed in from the part before — the balance half of one
 * `balance-and-swing` — starts from where that part left it, rather than
 * dropping to the hip and coming back up. A hand that was already *joined*
 * does not move at all until the release, because it is already the point the
 * turn holds it at.
 */
function orbitHand(
  target: Hand,
  down: Hand,
  from: Hand | undefined,
  into: number,
  open: number,
): Hand {
  return lerpHand(lerpHand(from ?? down, target, into), down, open);
}

/** The four corners of the speed profile, as absolute beats. */
function speedWindow(
  window: SpeedWindow,
  env: ExprEnv,
  beats: Beat,
): { a0: Beat; a1: Beat; b0: Beat; b1: Beat } {
  const at = (m: Moment): Beat => evalMoment(m, env, beats);
  return { a0: at(window.a0), a1: at(window.a1), b0: at(window.b0), b1: at(window.b1) };
}

/** The environment an orbit's expressions are read in. */
const envFor = (input: ShapeInput, self: FigureRole, t: Beat): ExprEnv => ({
  ctx: input.ctx,
  params: input.params,
  beats: input.beats,
  self,
  t,
  order: input.roles,
  anchor: input.anchor.centre,
});

/** Kept so a later kind can read a dancer's velocity without re-deriving it. */
export const orbitSampleStep = SAMPLE_DT;
