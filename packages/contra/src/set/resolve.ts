import type { Beat, Vec2 } from "@caller/core";
import type {
  DancerId,
  FigureCall,
  Formation,
  Frame,
  GroupPlan,
  GroupSelector,
  Selector,
  Station,
  StationId,
} from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  excludedByEnds,
  frameAngle,
  framePoint,
  localAngle,
  localPoint,
  resolveSelector,
} from "@caller/choreo";
import type { Spot } from "../figures/ContraFigure.js";
import { midpoint } from "../figures/ContraFigure.js";
import type { FigureDefinition, FigureRole } from "../library/FigureDefinition.js";
import type { Library } from "../library/Library.js";
import { paramDefaults } from "../library/interpret.js";
import { homeOf, type SetModel } from "./SetModel.js";
import type { SlotView } from "./shape.js";
import { lanePlaces, relatedPairs, relationLeavesTheFour } from "./lattice.js";
import { isRelationWord, isSymmetricRelation, parseRelation, relate } from "./relations.js";
import { setRulesOf } from "./SetRules.js";

/**
 * **Resolution**: one call, against the live set, becomes concurrent figure
 * instances over disjoint actors, plus a hold-place instance for everybody the
 * call did not select (`vision.md` §"Resolution").
 *
 * M1 resolved what the legacy bridge needed: `actors: "all"` and `anchor:
 * "hands-four"`, one instance per minor set over everybody the call selected,
 * in the formation's own group frame. M2 opens the two rules the data figures
 * need.
 *
 * - **`actors: "pairs"`** — one instance per pair, the pairs named by
 *   `params.pairs`. That is a relation word (`"partners"`, `"neighbors"`,
 *   `"N2"`) resolved against the live set, or the station pairs a dance record
 *   writes today (`[["1L","2L"]]`, "larks allemande left"). The dancers the
 *   pairing leaves out are **not** in the figure: they dance hold-place, which
 *   is what the two robins really do while the larks allemande.
 * - **`actors: "ring"`** — one instance over the ring everybody selected makes.
 *
 * ### An instance is a Group whose stations are figure-roles
 *
 * For a data figure the minted group's station ids are the definition's own
 * roles — `lark`, `robin`, `a`, `b` — and each station's place is the cast
 * dancer's own spot. A bridged coded figure keeps the formation's hands-four
 * plan verbatim, which is what makes the legacy path reproduce today's geometry
 * exactly.
 *
 * ### The anchor is inside the frame, not a frame of its own
 *
 * `anchor: "meet"` says where the *shape's* origin sits, and the interpreter
 * derives it from where the dancers stand when the call starts (`interpret.ts`'s
 * `anchorOf`). The instance's **frame stays the set's**. A frame per pair would
 * have meant converting every spot out of the set frame and back, and
 * `planCycle.ts`'s `LocalSpot` records what that costs: `localPoint(f,
 * framePoint(f, x))` is `x` plus 2 × 10⁻¹⁵ px, which is harmless as a position
 * and flips a facing of exactly 180° to −180°. The transform is rigid, so
 * anchoring inside the frame is the same geometry with one lossy conversion not
 * performed.
 */

/** The figure this instance is, who plays which part, and where it sits. */
export interface FigureInstance {
  /** A library id, or `"walk-to-station"` for a hold-place instance. */
  figure: string;
  /** The call's own parameters, canonical, plus whatever resolution supplies. */
  params: Record<string, unknown>;
  /**
   * The figure-roles this instance actually dances, and by whom. Disjoint
   * across instances, and **in the order the pairing named them**, which is
   * what a figure reads when it asks "which of us did the call mention first".
   */
  cast: Record<FigureRole, DancerId>;
  /**
   * The group the instance runs in — "a `Group` whose stations are
   * figure-roles", as plain data.
   */
  group: GroupPlan;
  /** The frame the instance runs in: the set's own. */
  frame: Frame;
  start: Beat;
  beats: Beat;
  /** True for the instance given to the dancers this call left out. */
  holdPlace: boolean;
}

/** What a call is resolved against. */
export interface ResolveContext {
  model: SetModel;
  formation: Formation;
  library: Library;
  /** The partition of this set the call runs in: `formation.groupsFor(selector, set)`. */
  groups: readonly GroupPlan[];
  /**
   * Where a dancer stands in the frame that put them there, when the planner
   * has memoised it.
   *
   * The same reason `planCycle.ts` keeps the memo: converting a world spot back
   * into the frame it was computed in is not free, and a facing of exactly 180°
   * comes back as −180°. Left out, spots are converted honestly from world px.
   */
  localOf?: (dancer: DancerId, frame: Frame) => Spot | undefined;
}

/** The figure id a dancer nobody selected dances: stand where you are, honestly. */
export const HOLD_PLACE_FIGURE = "walk-to-station";

/**
 * Whether this figure wants the formation's own places handed to it.
 *
 * `ends: "home"` is the obvious one and was the only one until M7. A figure
 * whose `ends` name a **target shape** with `settle` is the other: "bend the
 * line" puts four dancers into a ring *and* puts that ring on the four places
 * the set already had, and without the places it forms a ring in mid air a few
 * pixels off them — which is a pixel of drift every time through, and was
 * measured as one at 7 px before this said so.
 */
export function gathersOnPlaces(def: FigureDefinition): boolean {
  if (def.ends === "home") return true;
  return typeof def.ends === "object" && "target" in def.ends && def.ends.target.settle === true;
}

/**
 * A definition whose `roles` is exactly this has **one part per dancer**, named
 * by the slot they stand on.
 *
 * What a figure danced by a whole line needs: how many parts a long wave has is
 * how long the hall is, so a definition cannot name them. Its shape reads the
 * wildcard track instead (`kinds/waypoints.ts`).
 */
export const LANE_ROLES = "*";

/**
 * One call, resolved: the instances it dances, in partition order, each
 * followed by the hold-place instance for whoever that group left out.
 *
 * "One hold-place instance **per group**, not per dancer" is deliberate and is
 * the one place M1 read the brief's two phrasings as one: the brief asks for
 * hold-place "exactly as the decider does now", and what the decider does now
 * is one `walk-to-station` event per group over all of its resting stations. A
 * per-dancer event would sample identically (the figure is per station) but
 * would change the timeline's event count and `timeline.dancers()`' insertion
 * order, which the oracle reports AC1 compares are sensitive to.
 */
export function resolveCall(call: FigureCall, ctx: ResolveContext, at: Beat): FigureInstance[] {
  const def = ctx.library.get(call.figure);
  // Since M7 every `ActorRule` and every `AnchorRule` the design names is built,
  // so there is nothing left here to refuse: `"each"` is one instance per
  // dancer (turn alone, a loop, the ones going down the outside), and the
  // `{ pivot }` and `{ other }` anchors are `interpret.ts`'s.

  const selector: GroupSelector = call.group ?? HANDS_FOUR_GROUP;
  // **The definition's own declared defaults, under whatever the call wrote.**
  //
  // Resolution reads parameters before anything applies a figure's defaults —
  // `pairs` decides who dances at all, so it has to be read here rather than in
  // `withDefaults` further down — and a call is entitled to leave out a
  // parameter that has a default: `checkCall` asks that a dance name only
  // parameters the figure declares, never that it name all of them. Without
  // this, "balance" with no `pairs` at all threw
  // `"pairs" must be a relation word …, not undefined` on the new path while
  // the old one danced it with the figure's own `"neighbors"`. Tuning numbers
  // only: `paramDefaults` is the `canonical` block, which never holds `from`,
  // `carried`, `homes` or `nearby` — the four resolution supplies itself.
  const params = {
    ...paramDefaults(def),
    ...(call.params as Record<string, unknown> | undefined),
  };
  const lane = laneFor(call, def, ctx, selector, params);
  if (lane !== undefined) return resolveInLane(call, def, ctx, at, params, lane);
  const out: FigureInstance[] = [];
  for (const plan of ctx.groups) {
    // A group this call's partition left standing out dances nothing here: its
    // beats go to the cycle's own `wait-out` fill.
    if (plan.kind !== "set") continue;

    // A station `ends` denies is not in this call at all — not selected and not
    // standing through it either; see `createScriptDecider`'s own note.
    const denied = excludedByEnds(ctx.formation, selector, call.ends, plan.stations);
    const active = plan.stations.filter((s) => !denied.has(s.id));
    const named = resolveActors(call.who, ctx, selector, plan);
    const selected = named.filter((id) => !denied.has(id));

    const dancing =
      def.actors === "all" || def.actors === "ring"
        ? [selected]
        : def.actors === "each"
          ? // **One instance per dancer** (M7): a figure nobody dances *with*.
            // Turning alone, looping, going down the outside — everybody the
            // call selected does their own, and there is no pairing to leave
            // anybody out of.
            selected.map((id) => [id])
          : tradeOrder(params, pairStations(params["pairs"], selected, plan, ctx));
    const taken = new Set(dancing.flat());
    const resting = active.map((s) => s.id).filter((id) => !taken.has(id));

    const instances: FigureInstance[] = [];
    for (const stations of dancing) {
      if (stations.length === 0) continue;
      if (def.actors !== "all") {
        instances.push(dataInstance(call, def, stations, plan, ctx, at, params));
        continue;
      }
      // **A figure for the whole minor set keeps the formation's own group**,
      // which is what makes the legacy path reproduce today's geometry exactly.
      // What it is handed on top is the two things a figure cannot work out for
      // itself, and only where they are wanted:
      //
      // - a figure that **gathers** gets the formation's places. M5 opened this
      //   for a hey that ends short and has to settle on the two places it
      //   stopped between; M7 asks the wider question (`gathersOnPlaces`), which
      //   is that one plus a figure whose target shape settles — "bend the line"
      //   puts its ring on the four places the set already had.
      // - a figure that is **data** gets the lattice, because a definition may
      //   name a slot (M7).
      //
      // A bridged coded figure gets neither and is byte-identical to M1's.
      const cast = castOf(plan, stations);
      const extra: Record<string, unknown> = { ...params };
      if (gathersOnPlaces(def)) extra["homes"] = homesOf(ctx, plan);
      if (def.shape.kind !== "legacy") extra["slots"] = slotViewFor(ctx, plan.frame, cast);
      instances.push({
        figure: call.figure,
        params: gathersOnPlaces(def) || def.shape.kind !== "legacy" ? extra : params,
        cast,
        group: plan,
        frame: plan.frame,
        start: at,
        beats: call.beats,
        holdPlace: false,
      });
    }
    // The centres of the *other* instances of this call, which is what a pair
    // turning beside another pair has to clear. A fact about the resolution,
    // not about the figure, so the figure is handed it.
    const centres = instances.map((instance) => instanceCentre(instance));
    for (const instance of instances) {
      if (instance.group !== plan) instance.params["nearby"] = centres;
      out.push(instance);
    }

    if (resting.length > 0) {
      out.push({
        figure: HOLD_PLACE_FIGURE,
        params: {},
        cast: castOf(plan, resting),
        group: plan,
        frame: plan.frame,
        start: at,
        beats: call.beats,
        holdPlace: true,
      });
    }
  }
  return out;
}

/**
 * **The lane**: the whole set as one pool, when a call reaches past the four
 * (Q15, Q16).
 *
 * Every cross-set call the corpus writes — Whoosh's grand right and left out to
 * N3 and back, its long wave down the whole set, A Rare Bird's hey along the
 * sides, a balance of the ring with the shadow — names its actors by a
 * **relation** rather than by a group. So resolution stops asking the formation
 * to cut the set up and asks the lattice who is who: `groupsFor` is left doing
 * the two things it is actually the authority on, the hall's **seating** and
 * **the outs**, and everything else is an offset.
 *
 * The pool is every dancer in a `kind: "set"` group — that is, everybody the
 * hands-four partition has dancing this time through. The couples standing out
 * at the two ends are not in it and still get their own `wait-out`, which is the
 * cross-set plan's own ruling kept: the outs are the formation's business.
 *
 * ### The frame is the set's, built once for the call
 *
 * Q16: "one frame per call for the whole set, in which slots are points". A
 * lane instance's frame is `model.frame`, so a pull-by that runs between two
 * minor sets has one frame rather than two, and a long wave has one for the
 * whole line. A call that *doesn't* leave the four keeps the minor-set frame it
 * has always had — see {@link laneFor} for why that distinction is drawn by
 * measurement rather than by taste.
 */
export interface LanePool {
  /** Everybody dancing this call, by dancer id. */
  among: ReadonlySet<DancerId>;
  /** The stations of the whole lane, one per dancer, in lattice order. */
  plan: GroupPlan;
  /** How the actors are cut up: pairs by a relation, or the whole line at once. */
  pairs?: Array<[DancerId, DancerId]>;
}

/**
 * Whether this call has to be resolved in the lane, and the pool if it does.
 *
 * **Measured, not declared.** A call whose `actors` is `"line"` always is — a
 * long wave is the whole set by definition. Otherwise the pairing is worked out
 * over the whole set first, and the lane is used only if some pair it produces
 * spans two minor sets. Every call written before this milestone pairs partners
 * or neighbours, which are inside the four by construction, so every one of them
 * takes the old path with the old frame and the old group ids, and the ten demo
 * dances are untouched. `undefined` means "the four is enough".
 */
function laneFor(
  call: FigureCall,
  def: FigureDefinition,
  ctx: ResolveContext,
  selector: GroupSelector,
  params: Record<string, unknown>,
): LanePool | undefined {
  const among = new Set<DancerId>();
  const order: DancerId[] = [];
  for (const plan of ctx.groups) {
    if (plan.kind !== "set") continue;
    const denied = excludedByEnds(ctx.formation, selector, call.ends, plan.stations);
    for (const station of plan.stations) {
      const dancer = plan.members[station.id];
      if (dancer === undefined || denied.has(station.id)) continue;
      if (ctx.model.dancers[dancer] === undefined || among.has(dancer)) continue;
      among.add(dancer);
      order.push(dancer);
    }
  }
  if (among.size === 0) return undefined;
  const plan = (): GroupPlan => lanePlan(ctx, order);

  if (def.actors === "line") return { among, plan: plan() };

  const reaches =
    typeof call.who === "string" &&
    !ctx.formation.tags(selector)[call.who] &&
    isRelationWord(call.who) &&
    relationLeavesTheFour(parseRelation(call.who));
  if (def.actors !== "pairs") return reaches ? { among, plan: plan() } : undefined;

  const word = params["pairs"];
  if (typeof word !== "string" || !isRelationWord(word))
    return reaches ? { among, plan: plan() } : undefined;
  const rel = parseRelation(word);
  if (!isSymmetricRelation(rel)) {
    throw new Error(`"${word}" is directional and cannot pair a set up; it selects actors`);
  }
  const pairs = relatedPairs(ctx.model, rel, among);
  const inFours = pairs.every(([a, b]) => sameFour(ctx, a, b));
  if (inFours && !reaches) return undefined;
  return { among, plan: plan(), pairs };
}

/** Whether these two dancers are in the same `kind: "set"` group of this partition. */
function sameFour(ctx: ResolveContext, a: DancerId, b: DancerId): boolean {
  for (const plan of ctx.groups) {
    if (plan.kind !== "set") continue;
    const here = Object.values(plan.members);
    if (here.includes(a)) return here.includes(b);
  }
  return false;
}

/**
 * The whole lane as one `GroupPlan`: a station per dancer, in the set's own
 * frame, named by the slot they are standing on.
 *
 * A station id is `L<line>@<position>` rather than a hands-four station name,
 * because a lane has no `1L`: the whole point is that the four has stopped being
 * the unit. It is stable within a time through and readable in a resolution
 * table, which is what `pnpm dance`'s end-effects rows print.
 */
function lanePlan(ctx: ResolveContext, order: readonly DancerId[]): GroupPlan {
  const stations: Station[] = [];
  const members: Record<StationId, DancerId> = {};
  const along = [...order].sort((a, b) => {
    const x = ctx.model.dancers[a]!.slot;
    const y = ctx.model.dancers[b]!.slot;
    return x.position - y.position || x.line - y.line;
  });
  for (const dancer of along) {
    const state = ctx.model.dancers[dancer]!;
    const id = slotStation(state.slot);
    const spot = localSpot(ctx, dancer, ctx.model.frame);
    stations.push({ id, role: state.role, p: spot.p, facing: spot.facing });
    members[id] = dancer;
  }
  return {
    id: `${ctx.model.id}/lane`,
    kind: "set",
    frame: ctx.model.frame,
    stations,
    members,
    couples: [...new Set(ctx.groups.flatMap((p) => p.couples))],
  };
}

/** A slot, as a station id of the lane: `L1@3` is line 1, position 3. */
export const slotStation = (slot: { line: number; position: number }): StationId =>
  `L${String(slot.line)}@${String(slot.position)}`;

/**
 * One call, resolved in the lane.
 *
 * The same three answers the four gives — the instances, the sibling centres
 * each one has to clear, and a hold-place instance for whoever is left — read
 * off the whole set instead of off one minor set. **Whoever a relation leaves
 * out is left out**, which is M6's whole end-of-set rule: a dancer at the end of
 * the line whose N3 is off the end dances hold-place for that call, and
 * `pnpm dance` prints an end-effects table saying who and where.
 */
function resolveInLane(
  call: FigureCall,
  def: FigureDefinition,
  ctx: ResolveContext,
  at: Beat,
  params: Record<string, unknown>,
  lane: LanePool,
): FigureInstance[] {
  const plan = lane.plan;
  // **`actors: "line"` is one instance per line of the lattice**, not one for
  // the whole set. That is what a long wave is — the dancers of one line, joined
  // along it — and what a grand right and left is: two of them, one down each
  // line, passing nobody across the set. `"ring"` in the lane is the whole pool.
  const dancing: StationId[][] =
    def.actors === "line"
      ? byLine(ctx, plan)
      : def.actors === "ring"
        ? [plan.stations.map((s) => s.id)]
        : def.actors === "each"
          ? plan.stations.map((s) => [s.id])
          : tradeOrder(
              params,
              (lane.pairs ?? []).map(([a, b]) => [slotOfDancer(ctx, a), slotOfDancer(ctx, b)]),
            );

  // `homes`, not `places`: see `dataInstance`. A figure may have a parameter of
  // its own called `places`.
  const homes = gathersOnPlaces(def) ? lanePlaces(ctx.model, plan.frame) : [];
  const instances: FigureInstance[] = [];
  for (const stations of dancing) {
    if (stations.length === 0) continue;
    const made = dataInstance(call, def, stations, plan, ctx, at, params);
    instances.push({ ...made, params: { ...made.params, homes, nearby: [] } });
  }
  const centres = instances.map((instance) => instanceCentre(instance));
  const out: FigureInstance[] = [];
  for (const instance of instances) {
    instance.params["nearby"] = centres;
    out.push(instance);
  }

  const taken = new Set(dancing.flat());
  const resting = plan.stations.map((s) => s.id).filter((id) => !taken.has(id));
  if (resting.length > 0) {
    out.push({
      figure: HOLD_PLACE_FIGURE,
      params: {},
      cast: castOf(plan, resting),
      group: plan,
      frame: plan.frame,
      start: at,
      beats: call.beats,
      holdPlace: true,
    });
  }
  return out;
}

/** The lane's stations, cut into its two lines, each in order along the set. */
function byLine(ctx: ResolveContext, plan: GroupPlan): StationId[][] {
  const lines = new Map<number, StationId[]>();
  for (const station of plan.stations) {
    const dancer = plan.members[station.id];
    if (dancer === undefined) continue;
    const { line } = ctx.model.dancers[dancer]!.slot;
    const seen = lines.get(line);
    if (seen) seen.push(station.id);
    else lines.set(line, [station.id]);
  }
  return [...lines.keys()].sort((a, b) => a - b).map((line) => lines.get(line)!);
}

/** The lane station one dancer is standing on. */
const slotOfDancer = (ctx: ResolveContext, dancer: DancerId): StationId =>
  slotStation(ctx.model.dancers[dancer]!.slot);

/** One instance of a data figure: a group whose stations are its figure-roles. */
function dataInstance(
  call: FigureCall,
  def: FigureDefinition,
  stations: readonly StationId[],
  plan: GroupPlan,
  ctx: ResolveContext,
  at: Beat,
  params: Record<string, unknown>,
): FigureInstance {
  const cast = castRoles(def, stations, plan, ctx);
  const roles = Object.keys(cast);
  const instanceStations: Station[] = roles.map((role) => {
    const dancer = cast[role]!;
    const spot = localSpot(ctx, dancer, plan.frame);
    return { id: role, role: ctx.model.dancers[dancer]!.role, p: spot.p, facing: spot.facing };
  });
  const members: Record<StationId, DancerId> = {};
  for (const role of roles) members[role] = cast[role]!;

  // The formation's own places, for **every** dancer of the group this call
  // resolved in — not just the ones this instance cast. A swing settles on to
  // the nearest two places that suit it, whoever's they are, which is what
  // makes "balance and swing your neighbour" the progression; see
  // `library/kinds/places.ts`.
  //
  // **`homes`, not `places`** (M4): a figure may have a parameter of its own
  // called `places` — a circle's is how many quarters of the ring it walks —
  // and the two would share one name in one object.
  const homes: Vec2[] = gathersOnPlaces(def) ? homesOf(ctx, plan) : [];

  return {
    figure: call.figure,
    params: { ...params, homes, nearby: [], slots: slotViewFor(ctx, plan.frame, cast) },
    cast,
    group: {
      id: `${plan.id}/${def.id}/${stations.join("-")}`,
      kind: "set",
      frame: plan.frame,
      stations: instanceStations,
      members,
      couples: [...plan.couples],
    },
    frame: plan.frame,
    start: at,
    beats: call.beats,
    holdPlace: false,
  };
}

/**
 * Which figure-role each of an instance's dancers plays, **in the order the
 * pairing named them**.
 *
 * A swing's roles are `lark` and `robin` and are assigned by the dancers' own
 * roles, because a swing is asymmetric — the robin ends on the right and her
 * hand stacks on top. A symmetric figure's roles (`a`, `b`, `a`…`d`) are
 * assigned by position. Either way the insertion order is the order the call's
 * pairing produced, so a figure that asks "which of us was named first" — an
 * `endFacing` that has to break a tie, a becket pair standing square across the
 * set — gets the same answer the coded figure got from `pairsOf`.
 */
function castRoles(
  def: FigureDefinition,
  stations: readonly StationId[],
  plan: GroupPlan,
  ctx: ResolveContext,
): Record<FigureRole, DancerId> {
  // **A lane figure's parts are its dancers' own slots.** A long wave or a
  // grand right and left has one part per dancer of a line and no definition
  // can write their names down, because how many there are is how long the
  // hall is. `roles: ["*"]` says so, and the wildcard track in `kinds/waypoints.ts`
  // is what a definition writes instead of a part per name.
  if (def.roles.length === 1 && def.roles[0] === LANE_ROLES) return castOf(plan, stations);
  if (stations.length > def.roles.length) {
    throw new Error(
      `figure "${def.id}" has ${String(def.roles.length)} roles ` +
        `[${def.roles.join(", ")}] but the call cast ${String(stations.length)} dancers`,
    );
  }
  const dancers = stations.map((id) => {
    const dancer = plan.members[id];
    if (dancer === undefined) throw new Error(`group "${plan.id}" has nobody on station "${id}"`);
    return dancer;
  });
  const byRole = def.roles.every((role) => role === "lark" || role === "robin");
  const cast: Record<FigureRole, DancerId> = {};
  if (!byRole) {
    dancers.forEach((dancer, i) => {
      cast[def.roles[i]!] = dancer;
    });
    return cast;
  }
  const roles = dancers.map((dancer) => ctx.model.dancers[dancer]!.role);
  if (new Set(roles).size < roles.length) {
    // **Q10: a same-role figure takes its figure-roles by position.**
    //
    // "Women balance and swing" is 33 dances in the corpus and two phrases of
    // Anna's Reel. A swing's two parts really are asymmetric — the robin's part
    // ends on the right with her hand on top — so two robins swinging is not a
    // figure without parts, it is a figure whose parts somebody has to take.
    // Which is what a hall does: one of them dances the lark's part.
    //
    // Who, is the **order the pairing named them in**, which for a relation is
    // the order the lattice runs; the call may swap it with `trade` (handled in
    // `resolveCall`, before this is reached, so it applies to a lane pairing
    // and a four's alike). Nothing here guesses at height or handedness.
    dancers.forEach((dancer, i) => {
      cast[def.roles[i]!] = dancer;
    });
    return cast;
  }
  for (const dancer of dancers) {
    cast[ctx.model.dancers[dancer]!.role] = dancer;
  }
  return cast;
}

/**
 * The pairs, with each pair's two dancers swapped when the call says `trade`.
 *
 * Q10's other half: when both dancers of a pair share a role the figure-roles go
 * by position, and `trade` is how a caller says *the other way round*. It is a
 * call-level instruction to **resolution** rather than a figure parameter — no
 * figure reads it and none should, exactly as `rebind` is — so it rides in
 * `params` and is stripped before the figure is planned (`planCycle.ts`).
 */
function tradeOrder(params: Record<string, unknown>, pairs: StationId[][]): StationId[][] {
  if (params[TRADE_PARAM] !== true) return pairs;
  return pairs.map((pair) => [...pair].reverse());
}

/**
 * The call-level parameter that swaps which of a same-role pair takes which
 * figure-role (Q10).
 *
 * Written in a dance record as `"params": { "trade": true }`.
 */
export const TRADE_PARAM = "trade";

/**
 * The pairs a `pairs` parameter names, as station ids of this group.
 *
 * Two forms, both of which the corpus writes today: a **relation word**, which
 * is resolved against the live set (and is the one a dance record should
 * prefer), and an explicit list of **station pairs**, which is how "larks
 * allemande left" is written — `[["1L","2L"]]` — until M6 gives the role
 * selectors their own relation.
 */
function pairStations(
  pairs: unknown,
  selected: readonly StationId[],
  plan: GroupPlan,
  ctx: ResolveContext,
): StationId[][] {
  const here = new Set(selected);
  if (Array.isArray(pairs)) {
    const out: StationId[][] = [];
    for (const pair of pairs as readonly (readonly StationId[])[]) {
      const [a, b] = pair;
      if (a === undefined || b === undefined) throw new Error(`a pair needs two stations`);
      if (!here.has(a) || !here.has(b)) continue;
      out.push([a, b]);
    }
    return out;
  }
  if (typeof pairs !== "string") {
    throw new Error(
      `"pairs" must be a relation word or a list of station pairs, not ${JSON.stringify(pairs)}`,
    );
  }
  if (!isRelationWord(pairs)) throw new Error(`"pairs" is not a relation: "${pairs}"`);
  const rel = parseRelation(pairs);
  const table = setRulesOf(ctx.formation.id).relations;
  const byDancer = new Map<DancerId, StationId>();
  for (const id of selected) {
    const dancer = plan.members[id];
    if (dancer !== undefined) byDancer.set(dancer, id);
  }
  const done = new Set<StationId>();
  const out: StationId[][] = [];
  for (const id of selected) {
    if (done.has(id)) continue;
    const dancer = plan.members[id];
    if (dancer === undefined) continue;
    const other = relate(ctx.model, table, dancer, rel);
    const otherStation = other === undefined ? undefined : byDancer.get(other);
    if (otherStation === undefined || done.has(otherStation)) continue;
    done.add(id);
    done.add(otherStation);
    out.push([id, otherStation]);
  }
  return out;
}

/**
 * The formation's own places, for **every** dancer of the group a call resolved
 * in — not just the ones this instance cast.
 *
 * A swing settles on to the nearest two places that suit it, whoever's they
 * are, which is what makes "balance and swing your neighbour" the progression;
 * see `library/kinds/places.ts`.
 */
const homesOf = (ctx: ResolveContext, plan: GroupPlan): Vec2[] => {
  const homes: Vec2[] = [];
  for (const dancer of Object.values(plan.members)) {
    if (ctx.model.dancers[dancer] === undefined) continue;
    homes.push(localPoint(plan.frame, homeOf(ctx.model, dancer).p));
  }
  return homes;
};

/**
 * **The set's own lattice, in one instance's frame** (M7): what lets a
 * definition name a place on the set rather than a place in its own shape.
 *
 * The node M6 asked for and could not write — see `set/shape.ts`'s `SlotView`
 * and `library/expr.ts`'s `{ point: "slot" }`. Two origins and a step are the
 * whole of it, because every contra formation's `homeAt` is affine in the
 * position; the four facings are the home facing on each line for each travel,
 * which is what tells a wave which way "in" is.
 *
 * Built per instance because it is frame-local, and cheap enough to: six points
 * and four angles, once per instance, against a figure that samples hundreds of
 * times.
 */
function slotViewFor(
  ctx: ResolveContext,
  frame: Frame,
  cast: Record<FigureRole, DancerId>,
): SlotView {
  const { lattice } = setRulesOf(ctx.formation.id);
  const local = (slot: { line: 0 | 1; position: number }, travel: 1 | -1): Vec2 =>
    localPoint(frame, framePoint(ctx.model.frame, lattice.homeAt(slot, travel).p));
  const facingAt = (line: 0 | 1, travel: 1 | -1): number =>
    localAngle(
      frame,
      frameAngle(ctx.model.frame, lattice.homeAt({ line, position: 0 }, travel).facing),
    );
  const zero: [Vec2, Vec2] = [
    local({ line: 0, position: 0 }, 1),
    local({ line: 1, position: 0 }, 1),
  ];
  const one = local({ line: 0, position: 1 }, 1);
  const at: Record<string, { line: 0 | 1; position: number; travel: 1 | -1 }> = {};
  for (const [role, dancer] of Object.entries(cast)) {
    const state = ctx.model.dancers[dancer];
    if (!state) continue;
    at[role] = { line: state.slot.line, position: state.slot.position, travel: state.travel };
  }
  return {
    origin: zero,
    step: [one[0] - zero[0][0], one[1] - zero[0][1]],
    facing: {
      "0/1": facingAt(0, 1),
      "0/-1": facingAt(0, -1),
      "1/1": facingAt(1, 1),
      "1/-1": facingAt(1, -1),
    },
    at,
  };
}

/** Where an instance's dancers meet, in the frame's own px. */
function instanceCentre(instance: FigureInstance): Vec2 {
  const points = instance.group.stations
    .filter((station) => instance.cast[station.id] !== undefined)
    .map((station) => station.p);
  if (points.length === 0) return [0, 0];
  if (points.length === 2) return midpoint(points[0]!, points[1]!);
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

/** Where one dancer stands, in the frame's own axes. */
function localSpot(ctx: ResolveContext, dancer: DancerId, frame: Frame): Spot {
  const memo = ctx.localOf?.(dancer, frame);
  if (memo) return memo;
  const state = ctx.model.dancers[dancer];
  if (!state) throw new Error(`set "${ctx.model.id}" has no dancer "${dancer}"`);
  return { p: localPoint(frame, state.spot.p), facing: localAngle(frame, state.spot.facing) };
}

/**
 * Which stations a call's `who` names, in the group it is resolved against.
 *
 * Everything `resolveSelector` already answers — `undefined`, `"all"`, a
 * station array, a tag the formation defines — is answered by it, unchanged, so
 * every dance written before this milestone resolves exactly as it did. What is
 * new is a **relation word**: `who: "N2"` selects everybody whose N2 is in this
 * group, which is how a call names its actors by who they are dancing with
 * rather than by where they stand.
 */
export function resolveActors(
  who: Selector | undefined,
  ctx: ResolveContext,
  selector: GroupSelector,
  plan: GroupPlan,
): StationId[] {
  if (who === undefined || who === "all" || Array.isArray(who)) {
    return resolveSelector(who, ctx.formation, selector, plan.stations);
  }
  // A tag the formation defines wins: `"partners"` and `"neighbors"` are both
  // relation words and tags, and the tag is what every dance written so far
  // means by them.
  const tags = ctx.formation.tags(selector);
  if (tags[who]) return resolveSelector(who, ctx.formation, selector, plan.stations);
  if (!isRelationWord(who)) {
    // Not a tag and not a relation: let `resolveSelector` throw its own error,
    // which names the tags the formation does have.
    return resolveSelector(who, ctx.formation, selector, plan.stations);
  }
  const rel = parseRelation(who);
  const table = setRulesOf(ctx.formation.id).relations;
  const here = new Set(Object.values(plan.members));
  return plan.stations
    .filter((s: Station) => {
      const dancer = plan.members[s.id];
      if (dancer === undefined) return false;
      const other = relate(ctx.model, table, dancer, rel);
      return other !== undefined && here.has(other);
    })
    .map((s) => s.id);
}

/** The stations named, as figure-role → dancer. */
function castOf(plan: GroupPlan, stations: readonly StationId[]): Record<FigureRole, DancerId> {
  const cast: Record<FigureRole, DancerId> = {};
  for (const id of stations) {
    const dancer = plan.members[id];
    if (dancer === undefined) throw new Error(`group "${plan.id}" has nobody on station "${id}"`);
    cast[id] = dancer;
  }
  return cast;
}
