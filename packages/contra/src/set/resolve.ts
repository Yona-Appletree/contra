import type { Beat, Vec2 } from "@caller/core";
import { dist } from "@caller/core";
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
  callBeats,
  concurrentCalls,
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
import { CLAIMS_PARAM, type PlaceLedger } from "../library/kinds/places.js";
import { homeOf, type DancerState, type SetModel } from "./SetModel.js";
import type { SlotView } from "./shape.js";
import { lanePlaces, latticeSpan, relatedPairs, relationLeavesTheFour } from "./lattice.js";
import type { Relation } from "./relations.js";
import {
  isRelationWord,
  isSymmetricRelation,
  parseRelation,
  parseRelationList,
  relate,
} from "./relations.js";
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
 * Whether this call has to be handed the formation's own places at all.
 *
 * A gatherer, and — since DD41 — a call that forms a **diamond**. A diamond is
 * the hands-four's own four places turned an eighth of a turn, so a figure that
 * forms one cannot work out where it is going without them; and it is not a
 * gatherer, because it settles on the turned places and never on the plain ones.
 * The shape may be named by the definition's `ends` or by the call's own `form`
 * clause, so the question is asked of both.
 */
export function needsPlaces(def: FigureDefinition, params: Record<string, unknown>): boolean {
  if (gathersOnPlaces(def)) return true;
  return shapeFormedBy(def, params) === "diamond";
}

/** The shape this call forms, from the definition's `ends` or the call's `form`. */
function shapeFormedBy(def: FigureDefinition, params: Record<string, unknown>): string | undefined {
  const said = params["form"];
  if (typeof said === "object" && said !== null && "shape" in said) {
    const shape = (said as { shape?: unknown }).shape;
    if (typeof shape === "string") return shape;
  }
  if (typeof def.ends === "object" && "target" in def.ends) return def.ends.target.shape;
  return undefined;
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
export function resolveCall(
  call: FigureCall,
  ctx: ResolveContext,
  at: Beat,
  ledgers: PlaceLedgers = new Map(),
): FigureInstance[] {
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
  if (lane !== undefined) return resolveInLane(call, def, ctx, at, params, lane, ledgers);
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
      const cast = castOf(plan, stations);
      const extra: Record<string, unknown> = { ...params };
      if (needsPlaces(def, params)) extra["homes"] = homesOf(ctx, plan);
      extra["slots"] = slotViewFor(ctx, plan.frame, cast);
      // **The `pairs` word, as this instance's own roles** (DD73). See
      // {@link castPairsOf}: in a minor set it is the identity for the two
      // words `pairsOf` already read, and an answer for every other one.
      const paired = castPairsOf(def, params, cast, ctx);
      if (paired !== undefined) extra["pairs"] = paired;
      instances.push({
        figure: call.figure,
        params: extra,
        cast,
        group: castGroup(plan, cast, call.figure, stations),
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
    // **The claims ledger for this frame** (M9d): the second fact about the
    // resolution that an instance of a call cannot work out alone. The pool of
    // places is shared and the choosing is per instance, so the choices have to
    // be told about each other; see `kinds/places.ts`'s `PlaceLedger`.
    const ledger = ledgerFor(ledgers, plan.frame);
    for (const [at, instance] of instances.entries()) {
      // **The centres of the *other* instances**, never this one's own. A figure
      // for two has its own centre where its pair stands, so the self entry was
      // a gap of zero and `orbitRadius` skipped it; a figure whose parts turn
      // about points of their own — turn contra corners, over six dancers —
      // reads its own instance centre as a pair standing beside it and squeezes
      // its orbit to nothing (measured at Chorus Jig beat 45.25, 0.000 px).
      if (instance.group !== plan) instance.params["nearby"] = without(centres, at);
      seatAtLedger(instance, ledger);
      out.push(instance);
    }

    if (resting.length > 0) {
      holdPlaces(ctx, plan, resting, ledger.ledger);
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
 * One {@link PlaceLedger} per **frame**, for the length of one call.
 *
 * Per frame is measured rather than chosen: a pool is frame-local px and the
 * two minor sets of a duple improper line hold the same four numbers in two
 * frames, so one ledger for the whole call has `p0`'s swing taking a place away
 * from `p2`'s — Chorus Jig, beat 16, `c2/lark` standing on `c3/lark` (M9b).
 */
export type PlaceLedgers = Map<string, LedgerSeat>;

/** A ledger, the frame it is in, and how many instances have been seated at it. */
interface LedgerSeat {
  frame: Frame;
  ledger: PlaceLedger;
  next: number;
}

/** The ledger for this frame, made on first use. */
function ledgerFor(ledgers: PlaceLedgers, frame: Frame): LedgerSeat {
  const key = `${String(frame.centre[0])},${String(frame.centre[1])},${String(frame.axis)},${String(frame.spacing)}`;
  const seen = ledgers.get(key);
  if (seen) return seen;
  const made: LedgerSeat = { frame, ledger: { by: new Map(), held: [] }, next: 0 };
  ledgers.set(key, made);
  return made;
}

/**
 * Give one instance its seat at the frame's ledger, in resolution order.
 *
 * Only an instance that was handed the formation's places has anything to
 * claim: a figure that does not gather ends where its own geometry leaves it
 * and takes nothing off the pool.
 */
function seatAtLedger(instance: FigureInstance, seat: LedgerSeat): void {
  const homes = instance.params["homes"];
  if (!Array.isArray(homes) || homes.length === 0) return;
  instance.params[CLAIMS_PARAM] = { ledger: seat.ledger, me: seat.next };
  seat.next += 1;
}

/**
 * **A dancer standing through a call occupies their place for its whole span**
 * — the brief's own rule, and Jeremy Corners' beat 48.
 *
 * B1's balance and swing is a gatherer, and it settled the ones on to `(16, 20)`
 * and `(−16, 20)` — where the twos had been standing since beat 32, because the
 * twos are an instance of that call too, on hold-place, and a pool of the
 * group's four homes says nothing at all about who is already on them.
 *
 * **Where they are standing, not the place the lattice calls theirs**, and the
 * difference is measured. A dancer left off the places by the figure before is
 * not on any of them, and blocking "their" home anyway takes a place out of the
 * pool that nobody is on: with the lattice reading, Chorus Jig, Whoosh and A
 * Rare Bird — three of the fifteen — went from green to `collision 0.000 px`,
 * because the ones' gatherer was pushed off the two places it had always taken
 * by a couple that was nowhere near them. Standing where they stand costs no
 * threshold either: a dancer a gatherer put on a place is on it to the last bit
 * of the number the place was computed as, and a point that is not one of the
 * pool's places simply never matches one.
 */
function holdPlaces(
  ctx: ResolveContext,
  plan: GroupPlan,
  resting: readonly StationId[],
  ledger: PlaceLedger,
): void {
  for (const id of resting) {
    const dancer = plan.members[id];
    if (dancer === undefined || ctx.model.dancers[dancer] === undefined) continue;
    ledger.held.push(localSpot(ctx, dancer, plan.frame).p);
  }
}

/**
 * **One call and everything that runs beside it** (M8): the `||` of the corpus,
 * resolved as one thing.
 *
 * `resolveCall` answers "who dances this call, and who is standing through it".
 * The second half of that question cannot be answered one branch at a time: the
 * robins looping right while the larks allemande are not standing through the
 * allemande, and a per-branch resting complement would put every one of them on
 * hold-place *and* in a figure at the same beat, which the timeline refuses per
 * dancer.
 *
 * So the branches are resolved independently — each is an ordinary call and
 * nothing in `resolveCall` knows about `while` — and then the two things only a
 * whole call can say are said here:
 *
 * - **the actors are disjoint**, checked by name before anything is emitted
 *   (Q13: the timeline admits concurrency *over disjoint dancers*), and
 * - **the hold-place complement is the complement of all of them**, so a dancer
 *   in none of the branches stands, and a dancer in one of them does not.
 */
export function resolveConcurrent(
  call: FigureCall,
  ctx: ResolveContext,
  at: Beat,
): FigureInstance[] {
  const branches = call.while ?? [];
  if (branches.length === 0) return resolveCall(call, ctx, at);

  const dancing: FigureInstance[] = [];
  const holding: FigureInstance[] = [];
  // **One ledger per frame for the whole call**, branches included (M9d). The
  // branches of a `while` are one call, so two of them settling in one frame
  // are two instances of one call and have to see each other's claims.
  const ledgers: PlaceLedgers = new Map();
  for (const branch of concurrentCalls(call)) {
    for (const instance of resolveCall(branch, ctx, at, ledgers)) {
      (instance.holdPlace ? holding : dancing).push(instance);
    }
  }

  // **Disjointness**, named rather than discovered downstream. Two figures over
  // one dancer is not a thing a hall can do and `Timeline.add()` would refuse it
  // with a message about events; this says which dancer and which two figures.
  const by = new Map<DancerId, string>();
  for (const instance of dancing) {
    for (const dancer of Object.values(instance.cast)) {
      const already = by.get(dancer);
      if (already !== undefined) {
        throw new Error(
          `concurrent calls "${already}" and "${instance.figure}" both cast "${dancer}" — ` +
            `a \`while\`'s branches must be over disjoint dancers`,
        );
      }
      by.set(dancer, instance.figure);
    }
  }

  // **The complement of all of them.** A hold-place instance is per group, so
  // the ones the branches produced are merged group by group and whoever any
  // branch cast is struck out of them.
  const rest = new Map<string, FigureInstance>();
  for (const instance of holding) {
    const kept: Record<FigureRole, DancerId> = {};
    for (const [station, dancer] of Object.entries(instance.cast)) {
      if (!by.has(dancer)) kept[station] = dancer;
    }
    if (Object.keys(kept).length === 0) continue;
    const seen = rest.get(instance.group.id);
    // Standing through the **whole** call, not through the shortest branch of
    // it: a dancer nobody named waits out all of `(2) cast back || go forward`.
    if (seen) Object.assign(seen.cast, kept);
    else rest.set(instance.group.id, { ...instance, cast: kept, beats: callBeats(call) });
  }
  // **Who is really standing through this call**, and therefore whose places are
  // really held. Each branch's own complement includes the dancers the *other*
  // branches cast, so the per-branch answer over-claims; the merged one above is
  // the truth and it is what the ledgers are given.
  for (const seat of ledgers.values()) seat.ledger.held.length = 0;
  for (const instance of rest.values()) {
    const seat = ledgerFor(ledgers, instance.frame);
    holdPlaces(ctx, instance.group, Object.keys(instance.cast), seat.ledger);
  }
  return [...dancing, ...rest.values()];
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
  // **A figure that declares the dancers it needs** (FR-B1) is always resolved
  // in the lane: turn contra corners reaches a couple above and a couple below,
  // which is three couples and no partition of the set into fours holds them.
  if (def.cast !== undefined) return { among, plan: plan() };

  // **A written relation list reaches** when any one of its relations does
  // (M9b): "self, my partner, my neighbour and the lark after them" is four
  // dancers out of two minor sets, so the call is resolved in the lane exactly
  // as a single reaching relation is.
  const written = typeof call.who === "string" ? parseRelationList(call.who) : undefined;
  const reaches =
    written !== undefined
      ? written.some((rel) => relationLeavesTheFour(rel))
      : typeof call.who === "string" &&
        !ctx.formation.tags(selector)[call.who] &&
        isRelationWord(call.who) &&
        relationLeavesTheFour(parseRelation(call.who));
  if (def.actors === "ring" || def.actors === "all") {
    if (reaches) return { among, plan: plan() };
    // **A figure for the whole four still pairs its dancers up** (DD73), and
    // when that pairing reaches past the four it is a lane call like any other.
    // See {@link reachingPairsOf}.
    const reaching = reachingPairsOf(def, params, ctx, among);
    if (reaching !== undefined) return { among, plan: plan(), pairs: reaching };
    // **Measured, like the pairing below.** A figure for four whose `who` names
    // a relation is cut into rings (`relationRings`), and the lane is used only
    // when one of those rings really does span two minor sets. Contrablend's B2
    // is the case: `partner` has been rebound to the shadow, so "you, your
    // partner, your neighbour and their partner" is four dancers out of two
    // hands-fours even though N1 never leaves the four on its own.
    const rings = relationRings(call, ctx, among, order);
    if (rings === undefined) return undefined;
    const spans = rings.some((four) => four.some((id) => !sameFour(ctx, four[0]!, id)));
    return spans ? { among, plan: plan() } : undefined;
  }
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

/**
 * **The pairs an `actors: "all"` figure's `pairs` word names, when they reach
 * past the four** — and `undefined` when they do not, or when there is no word.
 *
 * DD73. A figure for the whole minor set can still pair its dancers up: a
 * twirl, a do-si-do, a roll away and a mad robin all declare
 * `pairing: { kind: "param", param: "pairs" }` and are `actors: "all"`. Until
 * this ruling resolution never read that parameter for them — {@link laneFor}
 * only looked at it under `actors: "pairs"` — so the **word** reached the
 * figure, where `pairsOf` understands exactly two of them (`"partners"` and
 * `"neighbors"`) and silently returns nothing for every other one. Three
 * dances in the record were standing through a call because of it: The Set
 * Monster's `jersey-twirl` with `"N4"`, Whoosh's `do-si-do` with `"N2"` and
 * Contrablend's `roll-away` with `"shadow"`, every dancer measured at
 * **0.00 px** through the whole call.
 *
 * Two halves fix it and this is the first: a pairing that leaves the four
 * makes the call a **lane** call, exactly as it does for `actors: "pairs"`, so
 * both dancers of a pair are in one instance. The second is
 * {@link castPairsOf}, which turns the word into this instance's own roles.
 *
 * A pairing that stays inside the four returns `undefined` on purpose: the four
 * is enough, the old path keeps the old frame and the old group ids, and every
 * call written `"partners"` or `"neighbors"` resolves exactly as it did.
 */
function reachingPairsOf(
  def: FigureDefinition,
  params: Record<string, unknown>,
  ctx: ResolveContext,
  among: ReadonlySet<DancerId>,
): Array<[DancerId, DancerId]> | undefined {
  if (def.actors !== "all") return undefined;
  const rel = pairsRelation(params);
  if (rel === undefined) return undefined;
  const pairs = relatedPairs(ctx.model, rel, among);
  if (pairs.length === 0) return undefined;
  return pairs.every(([a, b]) => sameFour(ctx, a, b)) ? undefined : pairs;
}

/**
 * The relation an instance's `pairs` parameter names, or `undefined` when it
 * names station pairs outright or is not there at all.
 *
 * The directional refusal is {@link laneFor}'s own, word for word: a relation
 * that does not point back at you selects actors and cannot pair a set up.
 */
function pairsRelation(params: Record<string, unknown>): Relation | undefined {
  const word = params["pairs"];
  if (typeof word !== "string" || !isRelationWord(word)) return undefined;
  const rel = parseRelation(word);
  if (!isSymmetricRelation(rel)) {
    throw new Error(`"${word}" is directional and cannot pair a set up; it selects actors`);
  }
  return rel;
}

/**
 * **One instance's `pairs`, as its own figure-roles** (DD73) — the second half
 * of {@link reachingPairsOf}.
 *
 * A definition's `pairing: { kind: "param" }` reads `params.pairs` through
 * `pairsOf`, which knows `"partners"`, `"neighbors"` and an explicit list of
 * station pairs and nothing else. So resolution hands the figure the list: who
 * each of *this instance's* dancers is dancing with, named by the role they
 * were cast into, read off the live set through the same relation table
 * `actors: "pairs"` figures are cut up by.
 *
 * In a minor set this is the identity for the two words `pairsOf` already
 * understood — `"partners"` comes back `[["1L","1R"],["2L","2R"]]` — and it is
 * an answer rather than silence for every other one. In the lane, where an
 * instance is one pair, it is that pair's two roles.
 *
 * A dancer the relation leaves out is left out, which is M6's end-of-set rule:
 * the figure stands them still and the end-effects table says who.
 */
function castPairsOf(
  def: FigureDefinition,
  params: Record<string, unknown>,
  cast: Record<FigureRole, DancerId>,
  ctx: ResolveContext,
): FigureRole[][] | undefined {
  if (def.actors !== "all") return undefined;
  const rel = pairsRelation(params);
  if (rel === undefined) return undefined;
  const table = setRulesOf(ctx.formation.id).relations;
  const roleOf = new Map<DancerId, FigureRole>();
  for (const [role, dancer] of Object.entries(cast)) roleOf.set(dancer, role);
  const done = new Set<FigureRole>();
  const out: FigureRole[][] = [];
  for (const [role, dancer] of Object.entries(cast)) {
    if (done.has(role)) continue;
    const other = relate(ctx.model, table, dancer, rel);
    const otherRole = other === undefined ? undefined : roleOf.get(other);
    if (otherRole === undefined || otherRole === role || done.has(otherRole)) continue;
    done.add(role);
    done.add(otherRole);
    out.push([role, otherRole]);
  }
  return out;
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
  ledgers: PlaceLedgers,
): FigureInstance[] {
  const plan = lane.plan;
  // **`actors: "line"` is one instance per line of the lattice**, not one for
  // the whole set. That is what a long wave is — the dancers of one line, joined
  // along it — and what a grand right and left is: two of them, one down each
  // line, passing nobody across the set. `"ring"` in the lane is the whole pool.
  // **A ring the relation names** (M7b) comes before either of the whole-four
  // rules, because it is the one thing neither of them can say: a circle of four
  // that is not a minor set. See {@link relationRings}.
  const rings =
    def.actors === "ring" || def.actors === "all"
      ? relationRings(
          call,
          ctx,
          lane.among,
          plan.stations.flatMap((s) => plan.members[s.id] ?? []),
        )
      : undefined;
  const ringStations = rings?.map((four) => four.map((id) => slotOfDancer(ctx, id)));
  // **The dancers the figure itself says it needs** (FR-B1), cut out of the lane
  // from each dancer the call named — which for turn contra corners is "the
  // ones" and their two corner couples. Before every other rule, because it is
  // the only one that reads the *definition*: a figure that declares its cast
  // is not asking to be partitioned at all.
  const declared =
    def.cast === undefined
      ? undefined
      : castRings(def.cast, ctx, lane.among, selectedInFours(call, ctx)).map((ids) =>
          ids.map((id) => slotOfDancer(ctx, id)),
        );
  const dancing: StationId[][] =
    declared !== undefined
      ? declared
      : def.actors === "line"
        ? byLine(ctx, plan)
        : ringStations !== undefined
          ? ringStations
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
  const homes = needsPlaces(def, params) ? lanePlaces(ctx.model, plan.frame) : [];
  const instances: FigureInstance[] = [];
  for (const stations of dancing) {
    if (stations.length === 0) continue;
    const made = dataInstance(call, def, stations, plan, ctx, at, params);
    instances.push({ ...made, params: { ...made.params, homes, nearby: [] } });
  }
  const centres = instances.map((instance) => instanceCentre(instance));
  const seat = ledgerFor(ledgers, plan.frame);
  const out: FigureInstance[] = [];
  for (const [at, instance] of instances.entries()) {
    instance.params["nearby"] = without(centres, at);
    seatAtLedger(instance, seat);
    out.push(instance);
  }

  const taken = new Set(dancing.flat());
  const resting = plan.stations.map((s) => s.id).filter((id) => !taken.has(id));
  if (resting.length > 0) {
    holdPlaces(ctx, plan, resting, seat.ledger);
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

/**
 * **The rings a relation names** (M7b): a circle of four that is not a minor
 * set — *you, your partner, the dancer the relation names, and their partner*.
 *
 * Contrablend's B2 is the case, and it is the last thing in that dance nothing
 * could resolve: *"Circle right 3/4 [with shadow]; turn alone"*. A circle is a
 * figure for four and every figure for four the library has ever had took the
 * four of a hands-four; this one takes two dancers out of one minor set and two
 * out of the next, and which two is a **relation** rather than a partition. So
 * it is resolved in the lane like every other call that reaches past the four
 * (Q15), and cut up here rather than by `groupsFor`.
 *
 * The rule is the brief's own and is the smallest one that makes a ring: walk
 * the lane in lattice order, and for each dancer not yet in a ring take the four
 * `{ self, partner, who, partner-of-who }`. A dancer the relation leaves out —
 * the ends of the line, where a shadow is off the end — is in no ring and gets
 * hold-place, which is M6's end-of-set rule unchanged. Four distinct dancers or
 * it is not a ring, and the ones that are not go back in the pool.
 *
 * Ring **order** is not this function's business: `kinds/ringWalk.ts` reads the
 * order round the circle off where the dancers are standing (`ringOf`'s circular
 * mean), and `anchor: "hands-four"` is the centroid of whoever the instance
 * cast — so the four are framed on their own middle wherever in the set that is.
 *
 * `undefined` means "this call did not name a relation", and everything resolves
 * exactly as it did.
 */
function relationRings(
  call: FigureCall,
  ctx: ResolveContext,
  among: ReadonlySet<DancerId>,
  order: readonly DancerId[],
): DancerId[][] | undefined {
  const who = call.who;
  if (typeof who !== "string") return undefined;
  const written = parseRelationList(who);
  if (written !== undefined) return writtenRings(written, ctx, among, order);
  if (!isRelationWord(who)) return undefined;
  if (ctx.formation.tags(HANDS_FOUR_GROUP)[who]) return undefined;
  const rel = parseRelation(who);
  const table = setRulesOf(ctx.formation.id).relations;
  const used = new Set<DancerId>();
  const rings: DancerId[][] = [];
  for (const me of order) {
    if (used.has(me)) continue;
    const other = relate(ctx.model, table, me, rel);
    if (other === undefined || !among.has(other) || used.has(other)) continue;
    const four = [
      me,
      relate(ctx.model, table, me, { kind: "partner" }),
      other,
      relate(ctx.model, table, other, { kind: "partner" }),
    ].filter((id): id is DancerId => id !== undefined && among.has(id) && !used.has(id));
    if (new Set(four).size !== 4) continue;
    for (const id of four) used.add(id);
    rings.push(four);
  }
  return rings;
}

/**
 * **The foursomes a written relation list names** (M9b, DD31): *you, and these
 * dancers, one relation at a time*.
 *
 * `relationRings` above makes a ring out of **one** relation — you, your
 * partner, the dancer the relation names and their partner — which is every
 * cross-set figure for four the corpus wrote until Jeremy Corners. Its A1 names
 * its four dancers individually and out of two minor sets: *"Interrupted square
 * through 2 [with twos, W1, and N2 M1]"*. No group selector says that, and no
 * single relation does either: a `who` is a role, a number, a relation word or
 * a station list, and none of the four can name "the twos, the ones' robin and
 * the lark of the couple after".
 *
 * The ruling is that a `who` may be a **list of relations from the active
 * dancer**, written `"self+partner+N1+N2"`, and this resolves it: walk the set
 * in lattice order and for each dancer nobody has used yet, follow every
 * relation in the list. The cast comes out **in the order the list wrote it**,
 * which is what lets a record say which of the four dances which part of the
 * figure — `relationRings`' own four is `{self, partner, who, their partner}`
 * and is a special case of this one.
 *
 * The same rules as the ring: distinct dancers or it is not a foursome, nobody
 * is in two of them, and a dancer any relation leaves out (the ends of the
 * line) is in none and dances hold-place. M6's end-of-set rule, unchanged.
 */
function writtenRings(
  written: readonly Relation[],
  ctx: ResolveContext,
  among: ReadonlySet<DancerId>,
  order: readonly DancerId[],
): DancerId[][] {
  const table = setRulesOf(ctx.formation.id).relations;
  const used = new Set<DancerId>();
  const rings: DancerId[][] = [];
  for (const me of order) {
    if (used.has(me)) continue;
    const four = written
      .map((rel) => (rel.kind === "self" ? me : relate(ctx.model, table, me, rel)))
      .filter((id): id is DancerId => id !== undefined && among.has(id) && !used.has(id));
    if (new Set(four).size !== written.length) continue;
    for (const id of four) used.add(id);
    rings.push(four);
  }
  return rings;
}

/**
 * **The casts a definition's own `cast` list names** (FR-B1): from each dancer
 * the call selected, the dancers the figure says it needs, in the order it
 * listed them.
 *
 * `writtenRings` above is the same idea written by a **record** — Jeremy
 * Corners' `"who": "self+partner+N1+N2"` — and this is the same idea written by
 * a **figure**. The difference is which question it answers: a record's list
 * says who is dancing, and a figure's says who a dancer dancing it reaches. Turn
 * contra corners needs both at once — *"the ones turn contra corners"* is the
 * card, and the six dancers that reaches is the figure's own fact — so the seed
 * is the call's `who` and the shape of the cast is the definition's.
 *
 * The same three rules as the rings: distinct dancers or it is not a cast,
 * nobody is in two of them, and a dancer any relation leaves out — at the top or
 * the bottom of the line, where there is no couple above or below — is in none
 * and dances hold-place. M6's end-of-set rule, unchanged.
 */
function castRings(
  cast: readonly string[],
  ctx: ResolveContext,
  among: ReadonlySet<DancerId>,
  seed: readonly DancerId[],
): DancerId[][] {
  const table = setRulesOf(ctx.formation.id).relations;
  const model = standingModel(ctx);
  const used = new Set<DancerId>();
  const out: DancerId[][] = [];
  for (const me of seed) {
    if (used.has(me)) continue;
    const found = cast.map((path) => followRelations(model, table, me, path));
    if (found.some((id) => id === undefined || !among.has(id) || used.has(id))) continue;
    const ids = found as DancerId[];
    if (new Set(ids).size !== cast.length) continue;
    for (const id of ids) used.add(id);
    out.push(ids);
  }
  return out;
}

/**
 * Who a **chain** of relations names: `"C1.partner"` is the partner of my first
 * corner, followed left to right.
 *
 * The one thing a single relation cannot say, and turn contra corners needs it
 * exactly once: the other active's corners are the partners of mine, and no
 * table has a row for "the partner of the dancer two steps that way". Chaining
 * is honest here because each step is a real relation a dancer really has.
 */
function followRelations(
  model: SetModel,
  table: Parameters<typeof relate>[1],
  from: DancerId,
  path: string,
): DancerId | undefined {
  let at: DancerId | undefined = from;
  for (const word of path.split(".")) {
    if (at === undefined) return undefined;
    if (word === "self") continue;
    at = relate(model, table, at, parseRelation(word));
  }
  return at;
}

/**
 * **The set as the dancers are standing in it**: every dancer re-seated on the
 * lattice place they are actually nearest.
 *
 * A slot is where a dancer *lives* this time through, and it moves at the
 * progression; a body moves whenever a figure moves it. Almost nothing cares,
 * because almost every figure names its dancers inside a hands-four and the four
 * is where they stand. A figure that names **a couple beside you** does care, and
 * Chorus Jig is the proof: its cast off is the time through's progression and it
 * happens at beat 28, so from beat 32 the ones are standing in second place with
 * their slots still saying first. Contra corners read off those slots reaches
 * three dancing places up the hall — measured, at four couples, as a corner
 * turning about a point the couple above was standing on.
 *
 * So a declared cast is cut out of *this* reading of the set. It is a
 * measurement and not a guess — the nearest lattice place to where you are — and
 * it is the identity whenever nobody has been moved off their place, which is
 * every figure boundary but the ones this exists for.
 */
function standingModel(ctx: ResolveContext): SetModel {
  const { lattice } = setRulesOf(ctx.formation.id);
  const span = latticeSpan(ctx.model);
  const dancers: Record<DancerId, DancerState> = {};
  for (const dancer of Object.values(ctx.model.dancers)) {
    let best = dancer.slot;
    let gap = Infinity;
    for (const line of [0, 1] as const) {
      const reach = span.line[line];
      if (reach === undefined) continue;
      for (let position = reach.lowest; position <= reach.highest; position++) {
        const home = framePoint(
          ctx.model.frame,
          lattice.homeAt({ line, position }, dancer.travel).p,
        );
        const here = dist(home, dancer.spot.p);
        if (here < gap) {
          gap = here;
          best = { line, position };
        }
      }
    }
    dancers[dancer.id] = { ...dancer, slot: best };
  }
  return { ...ctx.model, dancers };
}

/**
 * The dancers this call's `who` names, read group by group through the
 * formation's own partition, in order along the set.
 *
 * A lane has no `1L`, so a tag like `"ones"` cannot be resolved against it; it
 * is the hands-four partition that knows which couple is active. So the seed for
 * {@link castRings} is read where the tag means something and then carried into
 * the lane.
 */
function selectedInFours(call: FigureCall, ctx: ResolveContext): DancerId[] {
  const selector: GroupSelector = call.group ?? HANDS_FOUR_GROUP;
  const out: DancerId[] = [];
  for (const plan of ctx.groups) {
    if (plan.kind !== "set") continue;
    const denied = excludedByEnds(ctx.formation, selector, call.ends, plan.stations);
    for (const id of resolveActors(call.who, ctx, selector, plan)) {
      if (denied.has(id)) continue;
      const dancer = plan.members[id];
      if (dancer === undefined || ctx.model.dancers[dancer] === undefined) continue;
      out.push(dancer);
    }
  }
  return out.sort((a, b) => {
    const x = ctx.model.dancers[a]!.slot;
    const y = ctx.model.dancers[b]!.slot;
    return x.position - y.position || x.line - y.line;
  });
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
  const homes: Vec2[] = needsPlaces(def, params) ? homesOf(ctx, plan) : [];
  // **The `pairs` word, as this instance's own roles** (DD73) — in the lane an
  // `actors: "all"` instance is one pair, and these are its two roles.
  const paired = castPairsOf(def, params, cast, ctx);

  return {
    figure: call.figure,
    params: {
      ...params,
      ...(paired === undefined ? {} : { pairs: paired }),
      homes,
      nearby: [],
      slots: slotViewFor(ctx, plan.frame, cast),
    },
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
 * **A figure is planned over the dancers it has** — M9c.
 *
 * `actors: "all"` keeps the formation's own group, which is what makes the
 * legacy path reproduce today's geometry exactly, and that is right for every
 * call that takes the whole minor set. It is wrong for one that does not: the
 * dancers a call *named* and the dancers a figure is *planned over* are allowed
 * to differ only here — `dataInstance` builds its stations from the cast for
 * every other `actors` — and every geometry read off `ctx.ids` then describes a
 * group with somebody in it who is standing still.
 *
 * Jeremy Corners is where that was measured. B2's single-file promenade is
 * written for three of the four (`"who": ["1L","2L","2R"]`); the ring came out
 * a ring of **four**, so `{ number: "dancers" }` answered 4, a third of the ring
 * snapped to a quarter turn, and `2L` finished on `(−16, 20)` — where `1R` had
 * been standing on `walk-to-station` for the whole call. `collision 0.000 px`,
 * `c0/robin ~ c1/robin` at beat 56, at every checked length. The travel turn was
 * already the honest third (120°) while the end was the snapped quarter, so the
 * figure disagreed with itself.
 *
 * The narrowing is the identity when the call takes every station, which is
 * every other call in the corpus: measured, eight calls carry a `who` on an
 * `actors: "all"`/`"ring"` figure and Jeremy Corners' two promenades are the
 * only ones whose selection is a proper subset of the four.
 */
function castGroup(
  plan: GroupPlan,
  cast: Record<StationId, DancerId>,
  figure: string,
  stations: readonly StationId[],
): GroupPlan {
  const inCast = plan.stations.filter((s) => cast[s.id] !== undefined);
  if (inCast.length === plan.stations.length) return plan;
  return {
    ...plan,
    id: `${plan.id}/${figure}/${stations.join("-")}`,
    stations: inCast,
    members: cast,
  };
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

/** A list with one entry left out: the centres of everybody **but** me. */
const without = <T>(all: readonly T[], at: number): T[] => all.filter((_, i) => i !== at);

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
  // **A written relation list** (M9b) selects everybody who can follow every
  // relation in it inside this group — the foursome itself is cut out by
  // `writtenRings`, which is where the order the list wrote matters.
  const written = parseRelationList(who);
  if (written !== undefined) {
    const table = setRulesOf(ctx.formation.id).relations;
    const here = new Set(Object.values(plan.members));
    return plan.stations
      .filter((s: Station) => {
        const dancer = plan.members[s.id];
        if (dancer === undefined) return false;
        return written.every((rel) => {
          if (rel.kind === "self") return true;
          const other = relate(ctx.model, table, dancer, rel);
          return other !== undefined && here.has(other);
        });
      })
      .map((s) => s.id);
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
