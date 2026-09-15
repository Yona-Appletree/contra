import type { Angle, Beat, Hand, Vec2 } from "@caller/core";
import type { FigureRegistry, Side } from "@caller/choreo";
import type {
  ContraFigure,
  ContraParams,
  FigurePlan,
  PlanContext,
  Spot,
} from "../figures/ContraFigure.js";
import { bearing, centreOf, contraFigure, midpoint } from "../figures/ContraFigure.js";
import type { SlotView, TargetShape } from "../set/shape.js";
import type { AnchorRule, FigureDefinition, FigureRole, ParamValue } from "./FigureDefinition.js";
import { legacyFigureOf } from "./legacy.js";
import { planShape } from "./kinds/index.js";
import { recordClaim, takenIn } from "./kinds/places.js";

/**
 * **The interpreter**: a {@link FigureDefinition} as the `ContraFigure` a coded
 * one already is.
 *
 * It sits exactly where `contraFigure` sits — it *calls* `contraFigure` — so an
 * interpreted figure slots into the registry, the timeline, the decider, the
 * probes and every oracle with no adapter at all. That is deliberate: M2 has to
 * swap five figures over without the app, the strips, the motion report or the
 * goldens noticing anything but the geometry.
 *
 * The plan it builds is the three-pass one the calculus needs (`expr.ts`): the
 * ends first, then every role's place at `t`, then the hands against those
 * places. Each shape kind in `kinds/` answers those three questions for itself;
 * this file is the dispatch, the parameter defaults, the anchor rule and the
 * honest-ends substitution that every kind shares.
 */

/** Where a shape's origin sits inside the instance's frame, and which way it points. */
export interface ResolvedAnchor {
  /** Frame-local px. */
  centre: Vec2;
  /** Frame-local degrees, from the first role toward the second. */
  axis: Angle;
}

/**
 * What an interpreted figure's parameters carry beyond the call's own.
 *
 * `homes` and `nearby` are the two things a figure cannot work out for itself
 * and must be handed, and both are plain data:
 *
 * - **`homes`** — where the formation's own home places are, in frame-local px,
 *   for every dancer of the group this call resolved in. A gatherer
 *   (`ends: "home"`) reads its end places off them; with none it falls back to
 *   its own geometry, which is what a figure danced alone in `pnpm figure`
 *   gets. Not the *cast's* own slots — see `kinds/places.ts` for why Butter
 *   disproves that reading.
 * - **`nearby`** — the centres of the *other* instances of the same call. Two
 *   pairs of a minor set swing at once and their orbits have to clear each
 *   other; one instance per pair means the clearance is a fact about the
 *   resolution rather than about the figure, so resolution supplies it.
 * - **`claims`** (M9d) — the same fact one step further on: which of `homes`
 *   the other instances have already *settled on*, and which of them somebody
 *   is standing through the call on. `nearby` keeps two orbits from fouling
 *   each other on the way round; `claims` keeps them from finishing on one
 *   floor point. See `kinds/places.ts`'s `PlaceLedger` — no figure reads it
 *   directly and none should.
 */
export interface InterpretedParams extends ContraParams {
  /**
   * The formation's own home places, frame-local, or `[]`.
   *
   * Named `homes` and not `places`, which is what M2 called it and what the
   * prose above still calls it: a **figure** may have a parameter of its own
   * called `places` — a circle's is how many quarters of the ring it walks —
   * and the two would share one name in one object. Nothing caught it until
   * `symmetry.test.ts` planned a petronella without going through resolution
   * and got `places: []` where the figure wanted `1`.
   */
  homes: readonly Vec2[];
  /** Frame-local centres of the sibling instances of this call. */
  nearby: readonly Vec2[];
  /**
   * This instance's seat at the call's per-frame place ledger (M9d), when the
   * call was resolved against a set and handed the formation's places.
   *
   * Typed as `unknown` here on purpose: a figure must not read it. `takenIn`
   * and `recordClaim` in `kinds/places.ts` are the only two that do, and
   * `ShapeInput.spokenFor` is what a shape kind sees.
   */
  claims?: unknown;
  /**
   * The set's own lattice in this instance's frame, when the call was resolved
   * against a set (M7).
   *
   * The third thing a figure cannot work out for itself and must be handed, and
   * the one M6 needed and did not have: which slot each of my dancers is
   * standing on, and where any other slot is. See `set/shape.ts`'s `SlotView`.
   */
  slots?: SlotView;
  [key: string]: unknown;
}

/** Everything a shape kind is planned with. */
export interface ShapeInput {
  /** The instance's plan context; its stations are the figure-roles. */
  ctx: PlanContext;
  params: InterpretedParams;
  /** How long *this shape* lasts — a part of a sequence gets its own share. */
  beats: Beat;
  /** The roles this shape actually dances, in cast order. */
  roles: readonly FigureRole[];
  /** Where the shape is anchored, frame-local. */
  anchor: ResolvedAnchor;
  /** The formation's own places, or `undefined` when none were handed in. */
  places?: readonly Vec2[];
  /** The centres of the sibling instances, frame-local. */
  nearby: readonly Vec2[];
  /**
   * Which of `places` are spoken for (M9d): the places a peer instance of this
   * very call has already settled on, and the places somebody is standing
   * through the call on.
   *
   * Frame-local px, and a **ranking** rather than a prohibition: a search that
   * cannot avoid one still takes it. See `kinds/places.ts`'s `PlaceLedger`.
   * Left out, nothing is spoken for — a figure planned outside a resolution.
   */
  spokenFor?: readonly Vec2[];
  /** Whether the figure gathers on to `homes`. */
  gathers: boolean;
  /** The shape the figure forms, when its `ends` names one (Q6, M7). */
  target?: TargetShape;
  /** The set's own lattice in this frame, when there is a set under the figure. */
  slots?: SlotView;
  /**
   * The anchor rule, applied to a context.
   *
   * What a sequence's later parts need: each part is anchored where *it*
   * starts, not where the figure did, which is what makes the turn half of a
   * balance and swing turn about the closed-up pair.
   */
  anchorOf: (ctx: PlanContext) => ResolvedAnchor;
  /** Where a hand starts, when the part before this one left it somewhere. */
  handsIn?: (role: FigureRole, side: Side) => Hand | undefined;
  /** Joins already held at beat 0, so nothing is taken. */
  joinedIn: ReadonlySet<string>;
  /** Joins still held at the last beat, so nothing is let go. */
  joinedOut: ReadonlySet<string>;
}

/** One join, written so two lists of them can be compared as sets. */
export const joinKey = (a: FigureRole, aSide: Side, b: FigureRole, bSide: Side): string =>
  [`${a}.${aSide}`, `${b}.${bSide}`].sort().join("/");

/** The interpreted figures, one per definition, built once. */
const interpreted = new WeakMap<FigureDefinition, ContraFigure<InterpretedParams>>();

/**
 * A definition as a figure the engine can sample.
 *
 * Memoised on the definition object, because `contraFigure`'s own plan cache
 * keys on the figure's identity and a fresh figure per call would never hit it.
 */
export function interpretDefinition(def: FigureDefinition): ContraFigure<InterpretedParams> {
  const found = interpreted.get(def);
  if (found) return found;
  const made = buildFigure(def);
  interpreted.set(def, made);
  return made;
}

/**
 * The figure behind a definition: the coded one for a legacy shape, the
 * interpreted one otherwise.
 *
 * The one place `planCycle` asks "what do I actually sample", so that the
 * bridge going empty is a change to this function and to nothing else.
 */
export function figureFor(def: FigureDefinition, registry: FigureRegistry): ContraFigure {
  if (def.shape.kind === "legacy") return legacyFigureOf(registry, def.shape.figure);
  return interpretDefinition(def) as unknown as ContraFigure;
}

/** The parameter defaults a definition declares. */
export function paramDefaults(def: FigureDefinition): Readonly<Record<string, ParamValue>> {
  return def.params.kind === "canonical" ? def.params.defaults : {};
}

function buildFigure(def: FigureDefinition): ContraFigure<InterpretedParams> {
  if (def.shape.kind === "legacy") {
    throw new Error(`figure "${def.id}" has a legacy shape; use \`figureFor\` with a registry`);
  }
  return contraFigure<InterpretedParams>({
    id: def.id,
    call: def.call ?? def.id.toUpperCase(),
    ...(def.describe === undefined ? {} : { describe: def.describe }),
    lead: def.lead ?? 4,
    beats: def.nominalBeats,
    // `from` last, and `homes`/`nearby` beside it: a definition's own defaults
    // are tuning numbers and must never supply the places, which resolution
    // threads in.
    defaults: {
      ...paramDefaults(def),
      from: {},
      homes: [],
      nearby: [],
    } as unknown as Omit<InterpretedParams, "beats" | "carried">,
    plan: (ctx, params) => planDefinition(def, ctx, params),
  });
}

/** One definition, planned for one instance. */
export function planDefinition(
  def: FigureDefinition,
  ctx: PlanContext,
  params: InterpretedParams,
): FigurePlan {
  const roles = ctx.ids;
  const places = params.homes.length > 0 ? params.homes : undefined;
  const spokenFor = takenIn(params);
  // **The anchor is read over the dancers in scope**, not over the whole cast:
  // a sequence part planned for two of a hands-four anchors on those two. For
  // the figure itself `inner` is `ctx` and `inner.ids` is `roles`, so nothing a
  // figure without parts does changes.
  const anchorIn = (inner: PlanContext): ResolvedAnchor =>
    anchorOf(def.anchor, inner, inner.ids, params);
  const target =
    typeof def.ends === "object" && "target" in def.ends ? targetOf(def, params) : undefined;
  const input: ShapeInput = {
    ctx,
    params,
    beats: params.beats,
    roles,
    anchor: anchorIn(ctx),
    anchorOf: anchorIn,
    ...(places === undefined ? {} : { places }),
    nearby: params.nearby,
    spokenFor,
    // A figure that forms a shape may also settle it on to the formation's own
    // places, and says so in the target: `"home"` is not the only way to be a
    // gatherer since M7, but forming a shape does not make you one.
    gathers: def.ends === "home" || target?.settle === true,
    ...(target === undefined ? {} : { target }),
    ...(params.slots === undefined ? {} : { slots: params.slots }),
    joinedIn: carriedJoins(params, "in"),
    joinedOut: carriedJoins(params, "out"),
  };
  const plan = planShape(def.shape, def.holds, input);
  // **The one place an instance's claim is written** (M9d), and it is written
  // from the plan's own ends rather than from the search inside it: what an
  // instance takes off the pool is where its dancers really finish, which keeps
  // every shape kind honest without any of them knowing the ledger exists. It
  // is a no-op for a figure planned outside a resolution, and idempotent — the
  // plan is a pure function of the earlier instances' claims, so re-planning
  // this one writes the same answer back.
  recordClaim(params, input.gathers ? (places ?? []) : [], plan.ends);
  return plan;
}

/**
 * The shape a figure forms: the definition's own, with whatever the **call**
 * said laid over it.
 *
 * Q6's constraint is written by the caller as much as by the figure — *"form a
 * wave of four (men in center)"* is a clause on the call, not on the word
 * "allemande" — so a call may carry a `form` parameter and it wins field by
 * field over the definition's. A definition with a target and a call with none
 * is the ordinary case and costs nothing.
 */
function targetOf(def: FigureDefinition, params: InterpretedParams): TargetShape {
  const own = (def.ends as { target: TargetShape }).target;
  const said = params["form"];
  if (said === null || said === undefined) return own;
  if (typeof said !== "object") {
    throw new Error(`"form" is the shape a call forms, not ${JSON.stringify(said)}`);
  }
  return { ...own, ...(said as Partial<TargetShape>) };
}

/**
 * Where the shape's origin sits, from the anchor rule and where the dancers
 * actually stand when the call starts.
 *
 * Derived rather than handed in, because it *is* derivable: "the pair's
 * midpoint and axis where they stand when the call starts" is a function of
 * `ctx.start`, and computing it here means a figure danced alone in the figure
 * lab anchors itself exactly as one resolved against a live set does.
 */
export function anchorOf(
  rule: AnchorRule,
  ctx: PlanContext,
  roles: readonly FigureRole[],
  params?: InterpretedParams,
): ResolvedAnchor {
  if (typeof rule === "object" && "pivot" in rule) {
    // **A named pivot dancer** (M7): the anchor is somebody, standing still.
    //
    // A cast off pivots on the inactive and a gate pivots on the dancer who
    // stays put; what the figure turns about is not the middle of anything but a
    // person, and the person is one of its own parts. So the anchor is their
    // spot when the call starts, and the axis runs from them toward whoever is
    // casting — which is the radius the caster rides round.
    const pivot = ctx.spot(rule.pivot);
    const rest = roles.filter((role) => role !== rule.pivot);
    const toward = rest[0] === undefined ? pivot : ctx.spot(rest[0]);
    return {
      centre: pivot.p,
      axis: rest[0] === undefined ? pivot.facing : bearing(pivot.p, toward.p),
    };
  }
  if (typeof rule === "object" && "other" in rule) {
    // The centre of everybody **but** the named role: an orbit about the other
    // pair, which is what "cast around the twos as a couple" and M9's gate are.
    const rest = roles.filter((role) => role !== rule.other);
    if (rest.length === 0) throw new Error(`anchor "other" leaves nobody to centre on`);
    const spots: Spot[] = rest.map((role) => ctx.spot(role));
    const centre = centreOf(spots);
    return { centre, axis: bearing(ctx.spot(rule.other).p, centre) };
  }
  if (rule === "home") {
    // The formation's own places for this instance's dancers, which resolution
    // hands in as `homes`: "the taker's home" in a give and take, and the only
    // anchor that is a fact about the *set* rather than about the dancers.
    const homes = params?.homes ?? [];
    if (homes.length === 0) {
      throw new Error(`anchor "home" needs the formation's places, and this call has none`);
    }
    const centre = centreOf(homes.map((p) => ({ p, facing: 0 })));
    return { centre, axis: homes.length < 2 ? 0 : bearing(homes[0]!, centre) };
  }
  if (rule === "meet") {
    if (roles.length !== 2) {
      throw new Error(
        `anchor "meet" wants two roles, not [${roles.join(", ")}] — a ring anchors on its centroid`,
      );
    }
    const a = ctx.spot(roles[0]!);
    const b = ctx.spot(roles[1]!);
    return { centre: midpoint(a.p, b.p), axis: bearing(a.p, b.p) };
  }
  if (rule === "centroid" || rule === "hands-four") {
    const spots: Spot[] = roles.map((role) => ctx.spot(role));
    const centre = centreOf(spots);
    return { centre, axis: spots.length < 2 ? 0 : bearing(spots[0]!.p, centre) };
  }
  if (rule === "lane") {
    // **The lane frame** (M6, Q16): the whole line at once, its axis running
    // along the set from the first of the cast to the last. Resolution has
    // already put the cast in lattice order, so "first to last" is "up the set
    // to down it" and a figure written along the lane reads the same whichever
    // line it is dancing on.
    const spots: Spot[] = roles.map((role) => ctx.spot(role));
    const centre = centreOf(spots);
    const axis = spots.length < 2 ? 0 : bearing(spots[0]!.p, spots[spots.length - 1]!.p);
    return { centre, axis };
  }
  throw new Error(`unsupported: anchor ${JSON.stringify(rule)} (M7)`);
}

/** The joins carried in or out across this figure's boundary, as keys. */
function carriedJoins(params: InterpretedParams, way: "in" | "out"): ReadonlySet<string> {
  const out = new Set<string>();
  const side = params.carried?.[way];
  if (!side) return out;
  for (const [role, hands] of Object.entries(side)) {
    for (const [mine, held] of Object.entries(hands)) {
      if (!held) continue;
      out.add(joinKey(role, mine as Side, held.with, held.side));
    }
  }
  return out;
}
