import type { Angle } from "@caller/core";
import { angleDiff } from "@caller/core";
import type { AnyFigureDef, FigureParams, Group, RoleName, StationId } from "@caller/choreo";
import { localAngle, localPoint } from "@caller/choreo";
import type { Spots } from "../figures/ContraFigure.js";
import { NEIGHBORS, PARTNERS } from "../figures/pairing.js";

/**
 * The last sentence of a long walkthrough, worked out from the engine instead
 * of written: where the figure leaves you, in the words a caller uses.
 *
 * The user's own example, for a circle left three quarters, ends "you should be
 * across the set from your partner, next to your neighbor". That is not a fact
 * about the *figure*; it is a fact about the figure **in this dance**. The same
 * circle left three quarters leaves a becket dancer across the set from their
 * partner and a duple improper dancer beside them. So the written text carries
 * the doing and ends in a `{where}` slot, and this fills it from
 * `FigureDef.ends` — the very end places the decider chains the next figure on
 * to. Nothing here is written per figure: a figure the library gains next month
 * gets its landmark for nothing.
 *
 * It lives beside the figures rather than in the web app because it is the seed
 * of the generated **dance** walkthrough, which is a `@caller/contra` question.
 */

/** How far two places may differ and still be the same place, px. */
const HOME_PX = 1.5;

/**
 * How near your own facing another dancer has to be for you to be facing them,
 * degrees.
 *
 * Half of the 90° between "across the set" and "along the line", less a little:
 * a dancer facing across the set at their partner is never within 40° of the
 * one beside them, and a swing that opens out a few degrees off square is still
 * facing whoever it opened out toward.
 */
const FACING_DEG = 40;

/**
 * How close across the set two dancers stand to be in one line, px.
 *
 * The lines are `ACROSS_PX` — 32 px — apart, so a third of that separates "the
 * same line" from "the other one" with room to spare either way. Generous on
 * purpose: a swing opens out a px or two off the exact stations and a caller
 * still says "on your own side".
 */
const SAME_LINE_PX = 11;

/** How close along the set two dancers stand to be level with each other, px. */
const SAME_ROW_PX = 11;

/** No further along your own line than this and a caller says "next to", px. */
const NEXT_TO_PX = 30;

/** One dancer's place when the figure is over, in the set's own axes. */
export interface Place {
  /** Across the set: one sign is one line, the other sign the other. */
  across: number;
  /** Along the set: up and down the hall. */
  along: number;
  /** Which way they face, in the set's axes; 90° is down the hall. */
  facing: Angle;
}

/**
 * How one dancer stands to another, in the words a caller uses.
 *
 * Four of them and no more. This is the whole vocabulary a landmark is built
 * from, so a sentence that reads wrong is a rule to change here, not prose to
 * rewrite in nineteen files.
 */
export type Relation =
  "across the set from" | "next to" | "on the diagonal from" | "along the line from";

/** Where `them` stands, seen from `me`. */
export function relationOf(me: Place, them: Place): Relation {
  const across = Math.abs(them.across - me.across);
  const along = Math.abs(them.along - me.along);
  if (across <= SAME_LINE_PX) return along <= NEXT_TO_PX ? "next to" : "along the line from";
  return along <= SAME_ROW_PX ? "across the set from" : "on the diagonal from";
}

/**
 * Whether a dancer ends on the place they set off from.
 *
 * The place only, never the facing. A station's own `facing` is the formation's
 * progression axis — a duple improper one faces *down the hall* on paper — and
 * not where a dancer is looking, so a figure's first call in a dance starts
 * from that convention and ends facing across the set. Counting that as "you
 * have moved" would call every opening long lines a journey. Which way you end
 * up looking is said by {@link facingClause} instead, in the words a caller
 * uses for it.
 */
export function isHome(start: Place, end: Place): boolean {
  return Math.hypot(end.across - start.across, end.along - start.along) <= HOME_PX;
}

/** Who this dancer has ended up looking at, if it is squarely one of the two. */
export function facingClause(
  me: Place,
  partner: Place | undefined,
  neighbor: Place | undefined,
): string | undefined {
  let best: { who: string; off: number } | undefined;
  for (const [who, them] of [
    ["partner", partner],
    ["neighbor", neighbor],
  ] as const) {
    if (them === undefined) continue;
    const bearing = (Math.atan2(them.along - me.along, them.across - me.across) * 180) / Math.PI;
    const off = Math.abs(angleDiff(me.facing, bearing));
    if (off <= FACING_DEG && (best === undefined || off < best.off)) best = { who, off };
  }
  return best === undefined ? undefined : `facing your ${best.who}`;
}

/**
 * Where a figure leaves this group, as the sentence that ends its walkthrough.
 *
 * `undefined` when the group is not a minor set of four — a couple waiting out
 * at the end of the line has no neighbour to be next to — in which case that
 * figure's text must not use `{where}` at all.
 */
export function landmark(
  def: AnyFigureDef,
  params: FigureParams,
  group: Group,
): string | undefined {
  const places = placesOf(def, params, group);
  if (places === undefined) return undefined;

  const stands = new Map<StationId, Stand>();
  for (const station of group.stations) {
    const stand = standFor(station.id, places);
    if (stand === undefined) return undefined;
    stands.set(station.id, stand);
  }

  const all = [...stands.values()];
  const whole = agreed(all);
  if (whole !== undefined) return `You ${whole}.`;

  // The figures that leave the two roles in different places — a chain, an
  // allemande for the robins alone — are taught that way too: "larks, you are
  // home; robins, you have traded". Anything finer than by role is not a
  // sentence a caller says, so the landmark stands down rather than invent one.
  const byRole = new Map<RoleName, Stand[]>();
  for (const station of group.stations) {
    byRole.set(station.role, [...(byRole.get(station.role) ?? []), stands.get(station.id)!]);
  }
  const said: string[] = [];
  for (const [role, held] of byRole) {
    const one = agreed(held);
    if (one === undefined) return undefined;
    said.push(`${role === "lark" ? "Larks" : "Robins"}, you ${one}`);
  }
  return `${said.join("; ")}.`;
}

/** What one dancer's landmark says, before it is compared with anybody else's. */
interface Stand {
  /** Home, or where their partner and neighbour are: the part that matters. */
  where: string;
  /** Who they ended up looking at, when it is squarely one of the two. */
  looking: string | undefined;
}

/**
 * The one thing these dancers all say, or `undefined` if they do not agree.
 *
 * Which way you are looking is the part most likely to differ by a station —
 * two dancers of a star open out on different bearings — and it is also the
 * least of what the sentence is for. So a disagreement about the facing drops
 * the facing; only a disagreement about the *place* stops the sentence.
 */
function agreed(stands: readonly Stand[]): string | undefined {
  const wheres = new Set(stands.map((s) => s.where));
  if (wheres.size !== 1) return undefined;
  const where = [...wheres][0]!;
  const looks = new Set(stands.map((s) => s.looking));
  const look = looks.size === 1 ? [...looks][0] : undefined;
  return look === undefined ? where : `${where}, ${look}`;
}

/** One dancer's landmark: home, or where their partner and neighbour are. */
function standFor(
  station: StationId,
  places: { start: Record<StationId, Place>; end: Record<StationId, Place> },
): Stand | undefined {
  const me = places.end[station];
  const was = places.start[station];
  if (me === undefined || was === undefined) return undefined;

  const partner = placeOf(places.end, PARTNERS, station);
  const neighbor = placeOf(places.end, NEIGHBORS, station);
  if (partner === undefined || neighbor === undefined) return undefined;

  // Two clauses, never three. "Across the set from your partner, next to your
  // neighbor" is the user's own standard and it already implies the way you are
  // looking; adding "facing your partner" to it says the same thing twice. Home
  // is the case that needs it — "you are back where you started" says nothing
  // at all about which way you ended up — and it is exactly where the user's
  // hey example puts it: "face your partner on your side".
  if (!isHome(was, me)) {
    const where = `should be ${relationOf(me, partner)} your partner, ${relationOf(me, neighbor)} your neighbor`;
    return { where, looking: undefined };
  }
  return {
    where: "are back where you started",
    looking: facingClause(me, partner, neighbor),
  };
}

/** The end place of whoever this station pairs with under `pairs`. */
function placeOf(
  end: Record<StationId, Place>,
  pairs: readonly (readonly [StationId, StationId])[],
  station: StationId,
): Place | undefined {
  const other = partnerIn(pairs, station);
  return other === undefined ? undefined : end[other];
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
function placesOf(
  def: AnyFigureDef,
  params: FigureParams,
  group: Group,
): { start: Record<StationId, Place>; end: Record<StationId, Place> } | undefined {
  if (group.stations.length !== 4) return undefined;
  const from = (params as { from?: Spots }).from ?? {};
  const ends = def.ends(group, params);
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
