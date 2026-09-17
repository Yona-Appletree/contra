import type { AnyFigureDef, FigureParams, Group, RoleName, StationId } from "@caller/choreo";
import { localAngle, localPoint } from "@caller/choreo";
import type { Spots } from "../figures/ContraFigure.js";
import { NEIGHBORS, PARTNERS } from "../figures/pairing.js";
import type { Place } from "./seam.js";
import { relationTo, sayWhoIsWhere } from "./seam.js";

/**
 * **Where a figure leaves you, said about the figure rather than about a
 * dance**: the Moves page's own hint.
 *
 * The same sentence the seam says, in the same words, over one figure's own
 * boundary pair rather than over a dance's (A3). `seam.ts` owns the vocabulary
 * and the thresholds; this is the one place that asks a `FigureDef` where it
 * leaves the four dancers of a hands-four, which is the question the Moves
 * gallery can ask and a dance's planner answers differently.
 *
 * W1's two other branches are gone. "You are back where you started" was a
 * fact about the figure's own `from`, which on the Moves page is the formation's
 * stations and in a dance is wherever the dance had got to, so the same figure
 * said two different things for no reason a reader could see; and "facing your
 * partner" said again what "across from you" already said. Two sentences, two
 * people, one vocabulary.
 */

/**
 * Where a figure leaves this group, as the hint under its teach.
 *
 * `undefined` when the group is not a minor set of four — a couple waiting out
 * at the end of the line has no neighbour to be beside — when the figure cannot
 * be planned over four dancers at all, and when the four disagree about
 * something finer than their roles, none of which is a sentence a caller says.
 */
export function landmark(
  def: AnyFigureDef,
  params: FigureParams,
  group: Group,
): string | undefined {
  const places = placesOf(def, params, group);
  if (places === undefined) return undefined;

  const said = new Map<StationId, string>();
  for (const station of group.stations) {
    const one = sentenceFor(station.id, places.end);
    if (one === undefined) return undefined;
    said.set(station.id, one);
  }

  const all = [...said.values()];
  const distinct = new Set(all);
  if (distinct.size === 1) return [...distinct][0]!;

  // The figures that leave the two roles in different places — a chain, an
  // allemande for the robins alone — are taught that way too. Anything finer
  // than by role is not a sentence a caller says, so the hint stands down
  // rather than invent one.
  const byRole = new Map<RoleName, Set<string>>();
  for (const station of group.stations) {
    const held = byRole.get(station.role) ?? new Set<string>();
    held.add(said.get(station.id)!);
    byRole.set(station.role, held);
  }
  const parts: string[] = [];
  for (const [role, texts] of byRole) {
    if (texts.size !== 1) return undefined;
    parts.push(`${role === "lark" ? "Larks" : "Robins"}: ${[...texts][0]!}`);
  }
  return parts.join(" ");
}

/** What one dancer's hint says: their partner, then their neighbour. */
function sentenceFor(station: StationId, end: Record<StationId, Place>): string | undefined {
  const me = end[station];
  if (me === undefined) return undefined;
  const sentences: string[] = [];
  for (const [words, pairs] of [
    ["your partner", PARTNERS],
    ["your neighbor", NEIGHBORS],
  ] as const) {
    const other = partnerIn(pairs, station);
    const them = other === undefined ? undefined : end[other];
    if (them === undefined) return undefined;
    sentences.push(sayWhoIsWhere(relationTo(me, them), words));
  }
  return sentences.join(" ");
}

/** Who this station pairs with, or `undefined` if the pairing leaves them out. */
function partnerIn(
  pairs: readonly (readonly [StationId, StationId])[],
  station: StationId,
): StationId | undefined {
  for (const [a, b] of pairs) {
    if (a === station) return b;
    if (b === station) return a;
  }
  return undefined;
}

/**
 * Where everybody stands before and after, in the set's own axes.
 *
 * The end places come from `FigureDef.ends`, which is world px, and are turned
 * back into the frame's local axes — +y along the set, +x across it — because
 * every relation here is about the set and not about the hall. The start places
 * are the figure's own `from`, which is where the figure before it left people;
 * without one, the group's stations.
 */
export function placesOf(
  def: AnyFigureDef,
  params: FigureParams,
  group: Group,
): { start: Record<StationId, Place>; end: Record<StationId, Place> } | undefined {
  if (group.stations.length !== 4) return undefined;
  const from = (params as { from?: Spots }).from ?? {};
  // **A figure that refuses the four has no landmark.** One minted per dancer,
  // or danced by a whole line, cannot be planned over a hands-four at all and
  // says so by name; that is not a sentence a caller says, which is the same
  // answer as the four disagreeing.
  let ends;
  try {
    ends = def.ends(group, params);
  } catch {
    return undefined;
  }
  const start: Record<StationId, Place> = {};
  const end: Record<StationId, Place> = {};
  for (const station of group.stations) {
    const was = from[station.id] ?? { p: station.p, facing: station.facing };
    start[station.id] = { across: was.p[0], along: was.p[1], facing: was.facing };
    const there = ends[station.id];
    if (there === undefined) return undefined;
    const local = localPoint(group.frame, there.p);
    end[station.id] = {
      across: local[0],
      along: local[1],
      facing: localAngle(group.frame, there.facing),
    };
  }
  return { start, end };
}
