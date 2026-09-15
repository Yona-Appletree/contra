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
import type { Carried, ContraFigure, ContraParams, HandJoin, Spots } from "./ContraFigure.js";
import { contraFigureOf } from "./registry.js";
import { templateFigureOf } from "../library/figures/index.js";

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
  /**
   * Calls danced beside this one, by other dancers; see `FigureCall.while` (M8).
   *
   * The hands-four template cannot thread one: two figures over disjoint dancers
   * at the same beats is exactly what a single running `from` cannot express. So
   * a call that carries one takes the chain's unthreaded path, its branches are
   * carried through as written, and resolution does the work — which is the same
   * answer the chain already gives a figure it has no coded twin for.
   */
  while?: ConcurrentContraCall[];
}

/** One branch of a {@link ContraCall.while}: beats left out are the parent's. */
export type ConcurrentContraCall = Omit<ContraCall, "beats" | "while"> & { beats?: Beat };

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
  /** How many passes the phrase list holds; see `Dance.passes` (M8). */
  passes?: number;
  /** How many passes between progressions; see `Dance.progressEvery` (M8). */
  progressEvery?: number;
  /**
   * How far each role progresses in one time through, in dancing places.
   *
   * Left out is `{ lark: 1, robin: 1 }` — the single progression every dance in
   * the demo programme dances, and what the formation's own `Progression.next`
   * answers. A dance that progresses both roles the same whole number of places
   * (M9's triple-progression Set Monster) writes that number for both; a dance
   * that progresses them **differently** — Cary Ravitz's Contrablend, "M1, W3"
   * — writes both, and the set re-partners at the boundary because a lark and
   * the robin they started beside no longer end on one place. See
   * `set/lattice.ts`, which is what reads it.
   *
   * **The long form carries a line swap** (M8b): `{ places: { lark, robin },
   * line: "swap" }` is the same shift plus *everybody crosses to the other side
   * of the set*, which is Rick Mohr's Anna's Reel — the Caller's Box calls its
   * formation "other; single, swap sides". The flat form above is the short
   * form of `{ places: <this>, line: "along" }` and every record that writes one
   * keeps meaning exactly what it meant.
   */
  progression?: DanceProgression;
}

/**
 * A dance's own progression, in the two forms a record may write.
 *
 * The flat map is the short form and the one eleven records already use; the
 * long form exists because a progression turned out to have a second axis.
 * `set/lattice.ts`'s `progressionOf` normalises both to the long one.
 */
export type DanceProgression =
  | Readonly<Record<string, number>>
  | Readonly<{ places: Readonly<Record<string, number>>; line?: "along" | "swap" }>;

/**
 * A contra dance, with the one contra fact a `Dance` does not carry.
 *
 * `Dance` is `@caller/choreo`'s and stays form-neutral (AC7): it knows nothing
 * about larks, robins or progressions. A contra dance's own per-role
 * progression rides along on the object, where only `@caller/contra` reads it
 * (`set/lattice.ts`'s `progressionOf`), so the record can say "M1, W3" without
 * the engine learning what a robin is.
 */
export interface ContraDance extends Dance {
  progression?: DanceProgression;
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
    const def = (contraFigureOf(call.figure) ??
      (templateFigureOf(call.figure) as ContraFigure | undefined)) as ContraFigure | undefined;
    if (!def || call.while !== undefined || reachesPastTheFour(call)) {
      // **A call the hands-four template cannot answer threads nothing.**
      //
      // Two of them since M6. One is a figure with no coded twin: a
      // `FigureDefinition` such as `pull-by`, or a figure a later milestone
      // still owes such as `shoulder-round`. The other is a call that reaches
      // **past the minor set** — "allemande N4", "roll away your shadow" — which
      // a four-station template has no dancer for at all, and which the coded
      // figure's own pairing would throw on at *load* time, taking the whole
      // package's import down with it.
      //
      // The chain is dead weight on the new path either way: `planCycle` strips
      // `from` and `carried` back out and derives both from set state. So the
      // honest answer is to carry the places through unchanged and let
      // resolution do the work; the old path cannot dance such a dance at all,
      // and says so where it tries. The ten demo dances name nothing of the
      // kind, and AC1's golden — which compares the new path against this
      // threading — is what proves they still thread exactly as they did.
      out.push({
        figure: call.figure,
        beats: call.beats,
        params: { ...(call.params ?? {}), from: places },
        ...(call.who === undefined ? {} : { who: call.who }),
        ...(call.group === undefined ? {} : { group: call.group }),
        ...(call.call === undefined ? {} : { call: call.call }),
        ...(call.spokenBeats === undefined ? {} : { spokenBeats: call.spokenBeats }),
        // Branches keep their own parameters exactly as written: no `from`,
        // because the whole point of a concurrent call is that there is no one
        // running set of places for the template to hand on.
        ...(call.while === undefined ? {} : { while: call.while }),
      });
      ending.push([]);
      middle.push([]);
      continue;
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
 * Whether a call names somebody a four-station template has no dancer for.
 *
 * Every relation word but `partner` and `neighbor` reaches outside the minor
 * set on both contra lattices — N0 and N2 upward are other fours by
 * construction, and a shadow is two places along — so a call that names one
 * cannot be threaded against the template, and `chainCalls` carries the places
 * through instead. Written as a word test here rather than read off the
 * relation table, because the table lives in `set/` and this module is the
 * *load*-time half that `set/` is built to replace.
 */
function reachesPastTheFour(call: ContraCall): boolean {
  const params = call.params as Record<string, unknown> | undefined;
  for (const value of [call.who, params?.["pairs"]]) {
    if (typeof value !== "string") continue;
    if (
      /^(n0|n[2-9]|s\d+|shadows?|t\d+|trail-buddy|c\d+|corners?|opposites?)$/i.test(value.trim())
    ) {
      return true;
    }
  }
  // **A `who` that is a relation at all** (M7b). `pairs: "N1"` is `neighbors` by
  // another name and the template pairs it happily, but a *selector* is looked
  // up in the formation's own tag table and `N1` is not one: Contrablend's B2
  // circle names its four by relation, and without this `resolveSelector` threw
  // `formation "duple-improper" has no tag "N1"` at **load** time and took the
  // whole package's import down with it. Whether the ring that relation names
  // really leaves the four is measured in `set/resolve.ts`; here it is enough
  // that the template cannot answer the question.
  return typeof call.who === "string" && /^n[01]$/i.test(call.who.trim());
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
export function contraDance(spec: ContraDanceSpec): ContraDance {
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
  const dance: ContraDance = {
    slug: spec.slug,
    title: spec.title,
    author: spec.author,
    formation: spec.formation.id,
    phrases,
    ...(spec.notes === undefined ? {} : { notes: spec.notes }),
    ...(spec.startPlaces === undefined ? {} : { startPlaces: { ...spec.startPlaces } }),
    ...(spec.waitOut === undefined ? {} : { waitOut: { ...spec.waitOut } }),
    ...(spec.passes === undefined ? {} : { passes: spec.passes }),
    ...(spec.progressEvery === undefined ? {} : { progressEvery: spec.progressEvery }),
    ...(spec.progression === undefined ? {} : { progression: { ...spec.progression } }),
  };
  validateDance(dance);
  return dance;
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
