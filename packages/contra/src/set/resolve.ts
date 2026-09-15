import type { Beat } from "@caller/core";
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
import { HANDS_FOUR_GROUP, excludedByEnds, resolveSelector } from "@caller/choreo";
import type { FigureRole } from "../library/FigureDefinition.js";
import type { Library } from "../library/Library.js";
import { isRelationWord, parseRelation, relate } from "./relations.js";
import type { SetModel } from "./SetModel.js";
import { setRulesOf } from "./SetRules.js";

/**
 * **Resolution**: one call, against the live set, becomes concurrent figure
 * instances over disjoint actors, plus one hold-place instance for everybody
 * the call did not select (`vision.md` §"Resolution").
 *
 * M1 resolves what the legacy bridge needs and nothing more: `actors: "all"`
 * and `anchor: "hands-four"`, which is one instance per minor set over
 * everybody the call selected, in the formation's own group frame. `who` grows
 * a relation word here (`"partner"`, `"neighbor"`, `"N2"`) beside the tags and
 * station arrays it already took; the pairing *within* an instance is still the
 * coded figure's own `params.pairs` until M2.
 */

/** The figure this instance is, who plays which part, and where it sits. */
export interface FigureInstance {
  /** A library id, or `"walk-to-station"` for a hold-place instance. */
  figure: string;
  /** The call's own parameters, canonical. `from` and `carried` are the planner's. */
  params: Record<string, unknown>;
  /** The figure-roles this instance actually dances, and by whom. Disjoint across instances. */
  cast: Record<FigureRole, DancerId>;
  /**
   * The group the instance runs in — "a `Group` whose stations are
   * figure-roles", as plain data. For a bridged coded figure it is the
   * formation's own minor-set plan, verbatim, which is what makes the legacy
   * path reproduce today's geometry exactly.
   */
  group: GroupPlan;
  /** Where the anchor rule put the frame. The same frame as `group.frame`. */
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
}

/** The figure id a dancer nobody selected dances: stand where you are, honestly. */
export const HOLD_PLACE_FIGURE = "walk-to-station";

/**
 * One call, resolved: the instances it dances, in partition order, each
 * followed by the hold-place instance for whoever that group left out.
 *
 * "One hold-place instance **per group**, not per dancer" is deliberate and is
 * the one place M1 reads the brief's two phrasings as one: the brief asks for
 * hold-place "exactly as the decider does now", and what the decider does now
 * is one `walk-to-station` event per group over all of its resting stations. A
 * per-dancer event would sample identically (the figure is per station) but
 * would change the timeline's event count and `timeline.dancers()`' insertion
 * order, which the oracle reports AC1 compares are sensitive to.
 */
export function resolveCall(call: FigureCall, ctx: ResolveContext, at: Beat): FigureInstance[] {
  const def = ctx.library.get(call.figure);
  if (def.actors !== "all") {
    throw new Error(`unsupported: actors "${def.actors}" on "${def.id}" (M2)`);
  }
  if (def.anchor !== "hands-four") {
    throw new Error(`unsupported: anchor "${JSON.stringify(def.anchor)}" on "${def.id}" (M2)`);
  }

  const selector: GroupSelector = call.group ?? HANDS_FOUR_GROUP;
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
    const resting = active.map((s) => s.id).filter((id) => !selected.includes(id));

    out.push({
      figure: call.figure,
      params: { ...(call.params as Record<string, unknown> | undefined) },
      cast: castOf(plan, selected),
      group: plan,
      frame: plan.frame,
      start: at,
      beats: call.beats,
      holdPlace: false,
    });
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
