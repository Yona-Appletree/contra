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
import type { AnchorRule, FigureDefinition, FigureRole, ParamValue } from "./FigureDefinition.js";
import { legacyFigureOf } from "./legacy.js";
import { planShape } from "./kinds/index.js";

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
  /** Whether the figure gathers on to `homes`. */
  gathers: boolean;
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
  const anchorIn = (inner: PlanContext): ResolvedAnchor => anchorOf(def.anchor, inner, roles);
  const input: ShapeInput = {
    ctx,
    params,
    beats: params.beats,
    roles,
    anchor: anchorIn(ctx),
    anchorOf: anchorIn,
    ...(places === undefined ? {} : { places }),
    nearby: params.nearby,
    gathers: def.ends === "home",
    joinedIn: carriedJoins(params, "in"),
    joinedOut: carriedJoins(params, "out"),
  };
  return planShape(def.shape, def.holds, input);
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
): ResolvedAnchor {
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
