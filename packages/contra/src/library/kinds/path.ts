import type { Angle, Beat, Vec2 } from "@caller/core";
import {
  addScaled,
  angleLerp,
  clamp01,
  dirOf,
  dist,
  lerp,
  mix,
  profileProgress,
  ramp,
  smooth,
  sub,
} from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  FigurePlan,
  HandJoin,
  LocalHand,
  PlanContext,
  Spot,
  Spots,
} from "../../figures/ContraFigure.js";
import {
  bearing,
  midpoint,
  orbitRadius,
  passRight,
  polar,
  takeAndRelease,
} from "../../figures/ContraFigure.js";
import { stepped } from "../../figures/slide-left.js";
import { placeHalf } from "../../figures/swing.js";
import { trapezoid } from "../../pair/trapezoid.js";
import type {
  CrossingTrack,
  FigureRole,
  HoldSpec,
  PathCurve,
  PathShape,
  PathSpin,
  PathTrack,
} from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalAngle, evalNumber, evalPoint, evalRole } from "../expr.js";
import type { ShapeInput } from "../interpret.js";
import {
  activeHolds,
  idleHandAt,
  joinsHeldAt,
  mateHandAt,
  mateJoinsAt,
  soloHandAt,
  soloJoinsAt,
} from "./holds.js";
import { pairUp } from "./pairing.js";

/**
 * **The path**: a dancer walks to a computed point along a named curve.
 *
 * Six figures are this kind — pass through, long lines, slide left, roll away,
 * the california twirl and the do-si-do — and the frame they share is the whole
 * of what a walking figure is: *who am I dancing this with*, *where does it
 * leave me*, *what curve do my feet describe getting there*, and *what is the
 * body doing on the way*. Three of the four pairings are read off where the
 * dancers are actually standing, which is what lets the same written figure
 * pass a becket line across the set and a duple improper line along it.
 *
 * The curve itself is a **small vocabulary rather than one rule**, and that is
 * deliberate: a bowed walk, a there-and-back, a stepped sidestep, an arc about
 * a point and an ellipse about one are genuinely different things feet do, and
 * flattening them into one general spline would have meant writing each
 * figure's own control points out by hand. Each is a few lines here and a few
 * numbers in a definition, and the definitions carry no geometry of their own.
 *
 * **A pairing is partial.** A roll away with `pairs: [["1L", "1R"]]` leaves two
 * dancers out of the figure, and what they do is {@link PathShape.idle}: stand
 * where they are. That is the coded figures' own answer kept exactly, rather
 * than resolution's hold-place — these carriers take the whole minor set in one
 * instance (`actors: "all"`), so nobody is left out of the *call*, only out of
 * the pairing.
 */
export function planPath(
  shape: PathShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  const { ctx, beats, roles } = input;
  const mates = pairUp(shape.pairing, ctx, input.params);
  const mateOf = (role: FigureRole): FigureRole | undefined => mates[role];
  const paired = (role: FigureRole): boolean =>
    shape.pairing.kind === "none" || mates[role] !== undefined;

  const envFor = (self: FigureRole, t: Beat, ends?: Spots): ExprEnv => ({
    ctx,
    params: input.params,
    beats,
    self,
    t,
    order: roles,
    anchor: input.anchor.centre,
    mate: mateOf,
    // **The set's own lattice, when there is one under the figure** (M9). M7
    // gave `{ point: "slot" }` to `kinds/waypoints.ts` alone, because M7's
    // slot-naming figures were all waypoint routes; the diamond's cast is a
    // sequence of paths whose ends are written in slots, and without this the
    // calculus refuses them by name — *"1L cannot name a slot: this figure was
    // not resolved against a set"* — even where resolution handed one in.
    ...(input.slots === undefined ? {} : { slots: input.slots }),
    ...(ends === undefined ? {} : { ends }),
  });

  // Pass one: where the figure leaves everybody. A dancer the pairing left out
  // stands where they are; an `ellipse` works its own ends out, because they
  // fall out of the clearance it has to solve for anyway.
  const ends: Spots = {};
  const ellipses =
    shape.track.curve.kind === "ellipse"
      ? ellipsesOf(shape.track.curve, shape, input, ends, envFor)
      : undefined;
  for (const role of ctx.ids) {
    if (ends[role]) continue;
    const written = shape.track.ends;
    if (!paired(role) || written === undefined) {
      ends[role] = ctx.spot(role);
      continue;
    }
    const env = envFor(role, 0);
    ends[role] = { p: evalPoint(written.p, env), facing: evalAngle(written.facing, env) };
  }

  const crossing = crossersOf(shape, ctx, ends);
  const stepAt = walker(shape, input, ends, envFor, crossing, ellipses);
  const placeAt = (role: FigureRole, t: Beat): Spot => stepAt(role, t);
  const active = activeHolds(holds, input, envFor(roles[0] ?? "", 0, ends));
  const track = shape.track;

  return {
    ends,
    joinsAt(t) {
      const out: HandJoin[] = [];
      out.push(...joinsHeldAt(active, t));
      out.push(...mateJoinsAt(active, input, t, mateOf, (role, at) => envFor(role, at, ends)));
      out.push(...soloJoinsAt(active, input, t, (role, at) => envFor(role, at, ends)));
      return out;
    },
    at(role, t) {
      const step = stepAt(role, t);
      const env = envFor(role, t, ends);
      const crossed = crossing?.has(role) === true;
      const mine = paired(role) && !crossed;
      const dressing = crossed ? shape.crossing : mine ? track : shape.idle;
      const idle = dressing?.idleHands ?? track.idleHands;
      const hands: { L: LocalHand; R: LocalHand } = {
        L: idleHandAt(idle, step, "L", t, env),
        R: idleHandAt(idle, step, "R", t, env),
      };
      const mate = mateOf(role);
      if (mine) {
        for (const hold of active) {
          if (hold.kind === "mate") {
            if (mate === undefined) continue;
            const placed = mateHandAt(hold, role, mate, env, envFor(mate, t, ends), (id) =>
              placeAt(id, t),
            );
            // `undefined` is two dancers with no inside hands to give each
            // other; the hand stays where it was hanging. See `holds.ts`.
            if (placed === undefined) continue;
            hands[placed.side] = takeAndRelease(step, placed.side, t, placed.hand, hold.window);
            continue;
          }
          if (hold.kind !== "solo") continue;
          const placed = soloHandAt(hold, role, env, (id) => placeAt(id, t));
          if (!placed) continue;
          hands[placed.side] = takeAndRelease(step, placed.side, t, placed.hand, hold.window);
        }
      }

      const stepRate = crossed ? shape.crossing?.stepRate : mine ? track.stepRate : undefined;
      const amp = crossed ? shape.crossing?.amp : mine ? track.amp : shape.idle?.amp;
      const look = crossed ? step.facing : lookAt(track, step, ctx, env, mateOf);
      return {
        p: step.p,
        facing: step.facing,
        hands,
        ...(look === undefined ? {} : { look }),
        ...(stepRate === undefined ? {} : { stepRate: sample(stepRate, env, step.moving) }),
        ...(amp === undefined ? {} : { amp: sample(amp, env, step.moving) }),
        ...(track.flare === undefined || !mine
          ? {}
          : { flare: evalNumber(track.flare, env) * Math.sin(Math.PI * (t / beats)) }),
      };
    },
  };
}

/** A pose on the way, and whether the walk counts this dancer as travelling. */
interface Step extends Spot {
  moving: boolean;
}

/** A `{ when: "moving" }` field, or a plain number. */
function sample(value: NonNullable<PathTrack["amp"]>, env: ExprEnv, isMoving: boolean): number {
  if (typeof value === "object" && "when" in value) return isMoving ? 1 : 0;
  return evalNumber(value, env);
}

/** Where the head looks: nowhere in particular, a glance, or the dancer opposite. */
function lookAt(
  track: PathTrack,
  step: Step,
  ctx: PlanContext,
  env: ExprEnv,
  mateOf: (role: FigureRole) => FigureRole | undefined,
): Angle | undefined {
  const rule = track.look;
  if (rule === undefined) return undefined;
  if (rule.look === "angle") return evalAngle(rule.angle, env);
  if (rule.look === "glance") {
    return (
      ctx.spot(env.self).facing +
      evalAngle(rule.amount, env) * Math.sin(Math.PI * clamp01(env.t / env.beats))
    );
  }
  const mate = mateOf(env.self);
  if (mate === undefined) return step.facing;
  // The point opposite through the pair's own centre, which is where the
  // partner is at every instant of a do-si-do's ellipse.
  const centre = midpoint(ctx.spot(env.self).p, ctx.spot(mate).p);
  return bearing(step.p, [2 * centre[0] - step.p[0], 2 * centre[1] - step.p[1]]);
}

/** Each crossing dancer's couple path; see {@link PathShape.crossing}. */
type CrossPaths = Map<StationId, { at0: Vec2; to: Vec2; offset: Vec2; home: Spot }>;

/** Who crosses the set instead of walking their own path, and where from. */
function crossersOf(shape: PathShape, ctx: PlanContext, ends: Spots): CrossPaths | undefined {
  if (!shape.crossing) return undefined;
  const crossers = ctx.stations.filter((s) => s.crossedOver === true);
  if (crossers.length === 0) return undefined;
  const to: Vec2 = [
    crossers.reduce((sum, s) => sum + s.p[0], 0) / crossers.length,
    crossers.reduce((sum, s) => sum + s.p[1], 0) / crossers.length,
  ];
  // Where the couple was for the whole of the last time through: the place
  // opposite, through the centre of the minor set.
  const at0: Vec2 = [-to[0], -to[1]];
  const paths: CrossPaths = new Map();
  for (const station of crossers) {
    const home: Spot = { p: [station.p[0], station.p[1]], facing: station.facing };
    paths.set(station.id, {
      at0,
      to,
      offset: [station.p[0] - to[0], station.p[1] - to[1]],
      home,
    });
    // A crossing dancer's shift ends on their own station — that is what
    // crossing the set *is* — where a sliding one's ends a couple place along
    // the line from wherever the dance left them.
    ends[station.id] = home;
  }
  return paths;
}

/** One dancer's pose `t` beats in, for whichever curve the track names. */
function walker(
  shape: PathShape,
  input: ShapeInput,
  ends: Spots,
  envFor: (self: FigureRole, t: Beat, ends?: Spots) => ExprEnv,
  crossing: CrossPaths | undefined,
  ellipses: Map<FigureRole, Ellipse> | undefined,
): (role: FigureRole, t: Beat) => Step {
  const { ctx, beats } = input;
  const curve = shape.track.curve;

  return (role, t) => {
    const crossed = crossing?.get(role);
    if (crossed && shape.crossing) {
      return crossOver(crossed, shape.crossing, envFor(role, t), t, beats);
    }
    const start = ctx.spot(role);
    const still: Step = { p: start.p, facing: start.facing, moving: false };
    const end = ends[role] ?? start;
    const env = envFor(role, t, ends);
    const body = (sweep: Angle): Angle => facingOf(shape.track, start, end, t, beats, env, sweep);
    // A dancer the pairing left out **still walks their own curve** — which for
    // them is a walk to the place they are already standing on. A roll away's
    // odd dancers rock forward with everybody else and the roller among them
    // still turns; only the hands and the step come off. A curve that genuinely
    // needs a partner (an arc about the point between you, an ellipse round it)
    // says so for itself, below.

    switch (curve.kind) {
      case "walkStep": {
        const step = passRight(start, end, t, beats, evalNumber(curve.bow, env), input.profile);
        return { p: step.p, facing: step.facing, moving: step.moving };
      }
      case "bowed": {
        const k = profileProgress(input.profile, t, beats);
        // One passes in front and one behind, so they never share a point.
        const bow =
          evalNumber(curve.sign, env) * evalNumber(curve.bow, env) * Math.sin(Math.PI * k);
        return {
          p: addScaled(lerp(start.p, end.p, k), dirOf(start.facing), bow),
          facing: body(0),
          moving: true,
        };
      }
      case "stepped": {
        const x = beats <= 0 ? 1 : t / beats;
        const k = stepped(x, stepsIn(beats, evalNumber(curve.stepBeats, env)));
        return {
          p: [start.p[0] + (end.p[0] - start.p[0]) * k, start.p[1] + (end.p[1] - start.p[1]) * k],
          facing: body(0),
          moving: true,
        };
      }
      case "oscillate": {
        // **Two legs, not one curve** (M10): out over the first half of the
        // figure and back over the second, each on the profile's own ramps.
        // Long lines' eight beats are two four-beat walks and a dancer walks
        // *on* the beat down and back; one cosine over the whole eight is a
        // single glide out and in, which is what the cruise replaces. The
        // smoothstep keeps the cosine it has always had, so a definition that
        // has not switched is byte-identical.
        const distance = evalNumber(curve.distance, env);
        const out =
          input.profile === "cruise"
            ? distance * legsOut(input.profile, t, beats)
            : (distance * (1 - Math.cos((2 * Math.PI * t) / beats))) / 2;
        return {
          p: addScaled(start.p, dirOf(evalAngle(curve.along, env)), out),
          facing: body(0),
          moving: true,
        };
      }
      case "arc": {
        const mate = env.mate?.(role);
        if (mate === undefined) return still;
        const centre = midpoint(start.p, ctx.spot(mate).p);
        // A `withArc` facing rides this sweep, which is how the california
        // twirl's spin comes to share its travel's profile (Q8).
        const sweep = evalAngle(curve.sweep, env) * profileProgress(input.profile, t, beats);
        return {
          p: polar(
            centre,
            bearing(centre, start.p) + sweep,
            arcRadius(curve, start, centre, t, env),
          ),
          facing: body(sweep),
          moving: true,
        };
      }
      case "ellipse": {
        const pair = ellipses?.get(role);
        if (!pair) return still;
        return { p: ellipseAt(pair, start.p, t, beats), facing: start.facing, moving: true };
      }
    }
  };
}

/**
 * How far from the centre a dancer rides an `arc`, `t` beats in.
 *
 * The radius they are standing at, unless the curve says how close the two of
 * them come: then they close on to that over the first `closeBeats`, hold it
 * round the turn, and open out on to their own ends over the last. `bow` is
 * laid on top of it, out and back over the whole figure.
 */
function arcRadius(
  curve: Extract<PathCurve, { kind: "arc" }>,
  start: Spot,
  centre: Vec2,
  t: Beat,
  env: ExprEnv,
): number {
  const own = Math.hypot(...sub(start.p, centre));
  const beats = env.beats;
  let radius = own;
  if (curve.hold !== undefined) {
    const close = curve.closeBeats === undefined ? 1 : evalNumber(curve.closeBeats, env);
    const held = evalNumber(curve.hold, env);
    radius = mix(
      mix(own, held, smooth(ramp(t, 0, close))),
      own,
      smooth(ramp(t, beats - close, beats)),
    );
  }
  if (curve.bow === undefined) return radius;
  return radius + evalNumber(curve.bow, env) * Math.sin(Math.PI * clamp01(t / beats));
}

/**
 * A number a **call** is allowed to leave `null` to mean "read it off the
 * formation's own places instead".
 *
 * `evalNumber` would rightly refuse a null: a parameter that is meant to be a
 * number and is not is a mistake. This is the one place where `null` is a real
 * value rather than a missing one — a do-si-do's `endHalf` is "this far from
 * the centre, or wherever the dance's own places are" — so it is read here and
 * named, rather than the calculus growing a nullable number.
 */
function readMaybe(expr: Parameters<typeof evalNumber>[0], env: ExprEnv): number | null {
  if (typeof expr === "object" && "param" in expr && env.params[expr.param] === null) return null;
  return evalNumber(expr, env);
}

/**
 * An out-and-back as **two legs**: 0 at the start, 1 half way, 0 at the end,
 * each half its own profiled walk. The spike's `legs(t, ramp)`.
 */
function legsOut(profile: Parameters<typeof profileProgress>[0], t: Beat, beats: Beat): number {
  const half = beats / 2;
  if (t <= half) return profileProgress(profile, t, half);
  return 1 - profileProgress(profile, t - half, half);
}

/** How many equal steps a walk of `beats` covers its distance in. */
const stepsIn = (beats: Beat, stepBeats: Beat): number =>
  Math.max(1, Math.round(beats / stepBeats));

/**
 * The crossing couple's own path: the pair turns half way round about its own
 * centre while that centre walks straight across the set.
 *
 * `turn × (eased − 1)` runs from a half turn back to none, which sweeps a
 * becket dancer's facing through "down the set": a couple crossing over at the
 * end of a line looks *into* the set it is crossing rather than out of the
 * hall. The turn runs on its own single ease rather than on the steps — a
 * dancer turns *through* a step, not between steps — so the turn is fastest
 * exactly where the feet are slowest and the two never add their peaks
 * together. The head goes with the body; the turn is already showing them
 * everything a glance would.
 */
function crossOver(
  path: NonNullable<ReturnType<CrossPaths["get"]>>,
  spec: CrossingTrack,
  env: ExprEnv,
  t: Beat,
  beats: Beat,
): Step {
  const x = beats <= 0 ? 1 : t / beats;
  const k = stepped(x, stepsIn(beats, evalNumber(spec.stepBeats, env)));
  const turn = evalAngle(spec.turn, env) * (smooth(clamp01(x)) - 1);
  const c = Math.cos((turn * Math.PI) / 180);
  const s = Math.sin((turn * Math.PI) / 180);
  return {
    p: [
      path.at0[0] + (path.to[0] - path.at0[0]) * k + path.offset[0] * c - path.offset[1] * s,
      path.at0[1] + (path.to[1] - path.at0[1]) * k + path.offset[0] * s + path.offset[1] * c,
    ],
    facing: path.home.facing + turn,
    moving: true,
  };
}

/** The body, for whichever facing rule the track names. */
function facingOf(
  track: PathTrack,
  start: Spot,
  end: Spot,
  t: Beat,
  beats: Beat,
  env: ExprEnv,
  sweep: Angle,
): Angle {
  const rule = track.facing;
  if (rule.kind === "curve") return start.facing;
  if (rule.kind === "withArc") return start.facing + sweep;
  if (rule.kind === "settle") {
    return angleLerp(start.facing, end.facing, ramp(t, 0, evalNumber(rule.beats, env)));
  }
  const spin = rule.spin;
  if (!spin) return start.facing;
  if (spin.who !== undefined && env.ctx.role(env.self) !== env.params[spin.who.role]) {
    return start.facing;
  }
  const from = spin.from === undefined ? 0 : evalNumber(spin.from, env);
  const k = beats <= from ? 1 : clamp01((t - from) / (beats - from));
  const turns = Math.abs(evalNumber(spin.turns, env)) * inwardSign(spin, start, env);
  return start.facing + 360 * turns * smooth(k);
}

/**
 * Which way a {@link PathSpin} goes when it names a dancer to turn **toward**:
 * `+1` when they are on the spinner's right, `−1` when they are on the left, so
 * the first quarter of the turn brings the nose round on to them.
 *
 * A spin that names nobody keeps the sign its `turns` carries, which is what
 * every other spin in the library is written with — and so does a dancer the
 * pairing left out, who has nobody to turn toward and still turns, because
 * {@link walker} dances a partial pairing's odd dancers rather than freezing
 * them.
 */
function inwardSign(spin: PathSpin, start: Spot, env: ExprEnv): number {
  const toward = spin.toward;
  const written = Math.sign(evalNumber(spin.turns, env) || 1);
  if (toward === undefined) return written;
  if (typeof toward === "object" && "role" in toward && toward.role === "mate") {
    if (env.mate?.(env.self) === undefined) return written;
  }
  const other = env.ctx.spot(evalRole(toward, env)).p;
  const toOther = sub(other, start.p);
  const right = dirOf(start.facing + 90);
  return right[0] * toOther[0] + right[1] * toOther[1] >= 0 ? 1 : -1;
}

/** What one do-si-do pair needs to know about itself. */
interface Ellipse {
  centre: Vec2;
  /** How far from the centre each dancer ends, px. */
  half: number;
  /** The long radius: how far out along the line between them they walk, px. */
  radius: number;
  /** The short radius: how close they come as they pass, px. */
  pass: number;
  /** How far round, signed degrees. */
  turn: Angle;
}

/**
 * The ellipse each pair walks, and the ends it leaves them on.
 *
 * The long radius is the pair's own half separation, so each dancer still walks
 * through the other's place; the short one is a single bow, so half way out
 * they are shoulder to shoulder and moving opposite ways. It is as big as the
 * pair's own places allow and no bigger: the pair beside them, **and anybody
 * the pairing left standing inside it**, has to have room. That second clause
 * is why a do-si-do takes the whole minor set in one instance — the two larks
 * standing at the corners while the robins go round are 18.87 px from the
 * robins' own centre, and a circle through both robins passes 2.9 px inside
 * them, which AC6's 8 px does not allow.
 */
function ellipsesOf(
  curve: Extract<PathCurve, { kind: "ellipse" }>,
  shape: PathShape,
  input: ShapeInput,
  ends: Spots,
  envFor: (self: FigureRole, t: Beat, ends?: Spots) => ExprEnv,
): Map<FigureRole, Ellipse> {
  const { ctx } = input;
  const out = new Map<FigureRole, Ellipse>();
  const mates = pairUp(shape.pairing, ctx, input.params);
  const pairs: [FigureRole, FigureRole][] = [];
  const done = new Set<FigureRole>();
  for (const role of ctx.ids) {
    const mate = mates[role];
    if (mate === undefined || done.has(role)) continue;
    done.add(role);
    done.add(mate);
    pairs.push([role, mate]);
  }
  const centres = pairs.map(([a, b]) => midpoint(ctx.spot(a).p, ctx.spot(b).p));
  // Whoever this pairing leaves out stands still while the circle goes round
  // them, and the circle has to clear them.
  const idle = ctx.ids.filter((id) => mates[id] === undefined).map((id) => ctx.spot(id).p);

  pairs.forEach(([a, b], index) => {
    const centre = centres[index]!;
    const env = envFor(a, 0);
    const separation = dist(ctx.spot(a).p, ctx.spot(b).p) / 2;
    const written = curve.endHalf === null ? null : readMaybe(curve.endHalf, env);
    const half =
      written ??
      placeHalf(ctx.stations, centre, bearing(ctx.spot(a).p, ctx.spot(b).p) + 90, separation);
    const clearance = evalNumber(curve.clearance, env);
    // As big a circle as the pair's own places allow, tightened — swell first,
    // then the radius — until the pair beside them, and anybody standing still,
    // has room.
    const allowed = Math.min(
      orbitRadius(Number.POSITIVE_INFINITY, centre, centres),
      ...idle.map((p) => dist(centre, p) - clearance),
    );
    const radius = Math.min(dist(ctx.spot(a).p, ctx.spot(b).p) / 2, allowed);
    const turn = evalAngle(curve.turn, env);
    const pair: Ellipse = {
      centre,
      half,
      radius,
      // The short radius never reaches further from the centre than the long
      // one, so the ellipse sits inside the circle the clearance allowed.
      pass: Math.min(evalNumber(curve.pass, env), radius),
      turn,
    };
    out.set(a, pair);
    out.set(b, pair);
    for (const id of [a, b]) {
      ends[id] = {
        p: polar(centre, bearing(centre, ctx.spot(id).p) + turn, half),
        facing: ctx.spot(id).facing,
      };
    }
  });
  return out;
}

/**
 * One dancer's place on their pair's ellipse, `t` beats in.
 *
 * Walked from the dancer's own place: the long radius along the line between
 * the two of them, the short one across it. The two of them are always opposite
 * each other on it, so the short radius is what decides how close they come —
 * and which shoulder, since each of them leans to their own left to get there.
 */
function ellipseAt(pair: Ellipse, start: Vec2, t: Beat, beats: Beat): Vec2 {
  const f = trapezoid(t, 0, 0.9, beats - 0.9, beats);
  const from = dist(pair.centre, start);
  // The long radius: out to the pair's own separation, and in to wherever the
  // dance leaves them.
  const along = mix(mix(from, pair.radius, ramp(t, 0, 1)), pair.half, ramp(t, beats - 1, beats));
  const turned = ((bearing(pair.centre, start) + pair.turn * f) * Math.PI) / 180;
  const home = (bearing(pair.centre, start) * Math.PI) / 180;
  const u: Vec2 = [Math.cos(home), Math.sin(home)];
  const swung = turned - home;
  const c = Math.cos(swung) * along;
  const s = Math.sin(swung) * pair.pass;
  return [pair.centre[0] + u[0] * c - u[1] * s, pair.centre[1] + u[1] * c + u[0] * s];
}
