import type { Beat } from "@caller/core";
import { HOLD_SPACING_PX } from "@caller/core";
import type {
  Dance,
  DancePhrase,
  FigureCall,
  Formation,
  GroupSelector,
  PhraseName,
  Selector,
  Station,
} from "@caller/choreo";
import { HANDS_FOUR_GROUP, resolveSelector, validateDance, withDefaults } from "@caller/choreo";
import type { Carried, ContraParams, HandJoin, Spots } from "./ContraFigure.js";
import { contraFigureOf } from "./registry.js";

/**
 * One call of a dance, before the places are threaded through it.
 *
 * The same thing a `FigureCall` is, without `params.from`: {@link chainCalls}
 * fills that in by asking each figure where it leaves everybody and handing the
 * answer to the next call.
 */
export interface ContraCall {
  figure: string;
  beats: Beat;
  params?: object;
  who?: Selector;
  /**
   * How wide this call draws its dancers from; see `FigureCall.group`. Left out
   * is `"hands-four"`, the ordinary minor set, which is every call so far.
   *
   * Carried through to the threaded `FigureCall` and used here to resolve `who`
   * against the right tag table. The authoring template a call is threaded
   * against is still the dance-wide `group(4)`: widening `places` to the union
   * of every template a dance's calls use is the work that lands with the first
   * selector that needs it.
   */
  group?: GroupSelector;
  call?: string;
  /** Overrides the spoken-length estimate for this call; see `FigureCall.spokenBeats`. */
  spokenBeats?: Beat;
}

/** One phrase of a dance, before threading. */
export interface ContraPhrase {
  name: PhraseName;
  figures: ContraCall[];
}

/** What a dance is written as. */
export interface ContraDanceSpec {
  slug: string;
  title: string;
  author: string;
  formation: Formation;
  phrases: ContraPhrase[];
  notes?: string;
  /**
   * Where each station's dancer stands at beat 0, frame-local — the stations by
   * default. A dance whose first figure is the progression starts somewhere
   * else; see `Dance.startPlaces`.
   *
   * It may name the waiting group's stations as well as the dancing group's:
   * the chain only reads the four it dances in, and the rest goes on to the
   * dance for the decider's line-up and `wait-out` to read.
   */
  startPlaces?: Spots;
  /** Parameters for the waiting couple's `wait-out`; see `Dance.waitOut`. */
  waitOut?: object;
}

/**
 * Thread a run of calls: give each one the places the one before it left, and
 * answer the calls as data, plus where the run ends.
 *
 * A contra figure is a pure function of the group and its parameters, so a
 * figure that does not start at the stations has to be *told* where its dancers
 * are (`ContraParams.from`). Writing that out by hand for every call of every
 * dance would be unreadable and wrong within two figures; this composes it from
 * the figures themselves. What comes out is still plain data — the places are
 * numbers in the group frame's own axes — so a dance survives
 * `JSON.parse(JSON.stringify(dance))` exactly as the engine requires.
 *
 * A call's `who` matters here: the dancers a selector leaves out stand where
 * they are (the decider gives them `walk-to-station`), so only the selected
 * stations take their figure's ends.
 */
export function chainCalls(
  formation: Formation,
  calls: readonly ContraCall[],
  options: { start?: Spots; stations?: readonly Station[]; spacing?: number } = {},
): { calls: FigureCall[]; ends: Spots } {
  const stations = options.stations ?? formation.group(4);
  const spacing = options.spacing ?? HOLD_SPACING_PX;
  let places: Spots =
    options.start ?? Object.fromEntries(stations.map((s) => [s.id, { p: s.p, facing: s.facing }]));

  const out: FigureCall[] = [];
  /** What each call holds at its last beat, and through its middle. */
  const ending: HandJoin[][] = [];
  const middle: HandJoin[][] = [];
  for (const call of calls) {
    const def = contraFigureOf(call.figure);
    if (!def) {
      throw new Error(
        `chainCalls: "${call.figure}" is not a contra figure; the engine's own figures cannot be chained`,
      );
    }
    const from = places;
    const params = withDefaults<ContraParams>(def, { ...(call.params ?? {}), from }, call.beats);
    const ends = def.moves(params, stations, spacing);
    const selected = resolveSelector(call.who, formation, call.group ?? HANDS_FOUR_GROUP, stations);
    const next: Spots = { ...places };
    for (const id of selected) {
      const end = ends[id];
      if (end) next[id] = end;
    }
    places = next;
    ending.push(def.joins(params, call.beats, stations, spacing));
    middle.push(def.joins(params, call.beats / 2, stations, spacing));
    out.push({
      figure: call.figure,
      beats: call.beats,
      params: { ...(call.params ?? {}), from },
      ...(call.who === undefined ? {} : { who: call.who }),
      ...(call.group === undefined ? {} : { group: call.group }),
      ...(call.call === undefined ? {} : { call: call.call }),
      ...(call.spokenBeats === undefined ? {} : { spokenBeats: call.spokenBeats }),
    });
  }
  carryHolds(out, ending, middle);
  return { calls: out, ends: places };
}

/**
 * Give every boundary the holds that cross it: the hands one call is still
 * holding at its last beat that the next call holds through its middle.
 *
 * Both halves are read from the figures themselves — what `joinsAt` says — so a
 * dance never writes a carried hold down and a figure that changes its mind
 * about what it holds cannot leave a stale one behind. The *middle* is the
 * right question of the incoming figure: almost every figure takes hands over
 * its first beat, so asking what it holds at beat 0 would answer "nothing" for
 * all of them.
 */
function carryHolds(
  calls: FigureCall[],
  ending: readonly HandJoin[][],
  middle: readonly HandJoin[][],
): void {
  for (let i = 1; i < calls.length; i++) {
    const kept = (ending[i - 1] ?? []).filter((join) => holds(middle[i] ?? [], join));
    if (kept.length === 0) continue;
    addCarried(calls[i - 1]!, "out", kept);
    addCarried(calls[i]!, "in", kept);
  }
}

/** Whether this join — either way round — is one of those. */
const holds = (joins: readonly HandJoin[], join: HandJoin): boolean =>
  joins.some(
    (other) =>
      (other.a === join.a &&
        other.aSide === join.aSide &&
        other.b === join.b &&
        other.bSide === join.bSide) ||
      (other.a === join.b &&
        other.aSide === join.bSide &&
        other.b === join.a &&
        other.bSide === join.aSide),
  );

/** Write the joins into one call's `carried.in` or `carried.out`. */
function addCarried(call: FigureCall, way: "in" | "out", joins: readonly HandJoin[]): void {
  const params = call.params as { carried?: Carried };
  const carried: Carried = params.carried ?? { in: {}, out: {} };
  const side = { ...carried[way] };
  for (const join of joins) {
    side[join.a] = { ...side[join.a], [join.aSide]: { with: join.b, side: join.bSide } };
    side[join.b] = { ...side[join.b], [join.bSide]: { with: join.a, side: join.aSide } };
  }
  params.carried = { ...carried, [way]: side };
}

/**
 * A dance from its phrases, with every call's places threaded through it and
 * the whole thing checked by the engine's own `validateDance`.
 */
export function contraDance(spec: ContraDanceSpec): Dance {
  const stations = spec.formation.group(4);
  const places = danceStart(spec, stations);
  // Threaded as one run and cut back into phrases afterwards, so a hold carries
  // across a phrase boundary — "partner balance" at the end of B1 into "partner
  // swing" at the start of B2 — exactly as it does inside one.
  const threaded = chainCalls(
    spec.formation,
    spec.phrases.flatMap((p) => p.figures),
    { stations, ...(places === undefined ? {} : { start: places }) },
  );
  const phrases: DancePhrase[] = [];
  let at = 0;
  for (const phrase of spec.phrases) {
    phrases.push({
      name: phrase.name,
      figures: threaded.calls.slice(at, at + phrase.figures.length),
    });
    at += phrase.figures.length;
  }
  return validateDance({
    slug: spec.slug,
    title: spec.title,
    author: spec.author,
    formation: spec.formation.id,
    phrases,
    ...(spec.notes === undefined ? {} : { notes: spec.notes }),
    ...(spec.startPlaces === undefined ? {} : { startPlaces: { ...spec.startPlaces } }),
    ...(spec.waitOut === undefined ? {} : { waitOut: { ...spec.waitOut } }),
  });
}

/** The dancing group's own first places, or `undefined` for the stations. */
function danceStart(spec: ContraDanceSpec, stations: readonly Station[]): Spots | undefined {
  if (spec.startPlaces === undefined) return undefined;
  const start: Spots = {};
  for (const station of stations) {
    const place = spec.startPlaces[station.id];
    if (place) start[station.id] = place;
  }
  return start;
}

/** Where a dance leaves every dancer, in frame-local px: what its closure is checked against. */
export function danceEnds(spec: ContraDanceSpec): Spots {
  const stations = spec.formation.group(4);
  const places = danceStart(spec, stations);
  return chainCalls(
    spec.formation,
    spec.phrases.flatMap((p) => p.figures),
    { stations, ...(places === undefined ? {} : { start: places }) },
  ).ends;
}
