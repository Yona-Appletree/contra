import type { Beat } from "@caller/core";
import { HOLD_SPACING_PX } from "@caller/core";
import type {
  Dance,
  DancePhrase,
  FigureCall,
  Formation,
  PhraseName,
  Selector,
  Station,
} from "@caller/choreo";
import { resolveSelector, validateDance, withDefaults } from "@caller/choreo";
import type { ContraParams, Spots } from "./ContraFigure.js";
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
  call?: string;
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
    const selected = resolveSelector(call.who, formation, stations);
    const next: Spots = { ...places };
    for (const id of selected) {
      const end = ends[id];
      if (end) next[id] = end;
    }
    places = next;
    out.push({
      figure: call.figure,
      beats: call.beats,
      params: { ...(call.params ?? {}), from },
      ...(call.who === undefined ? {} : { who: call.who }),
      ...(call.call === undefined ? {} : { call: call.call }),
    });
  }
  return { calls: out, ends: places };
}

/**
 * A dance from its phrases, with every call's places threaded through it and
 * the whole thing checked by the engine's own `validateDance`.
 */
export function contraDance(spec: ContraDanceSpec): Dance {
  const stations = spec.formation.group(4);
  let places: Spots | undefined;
  const phrases: DancePhrase[] = [];
  for (const phrase of spec.phrases) {
    const threaded = chainCalls(spec.formation, phrase.figures, {
      stations,
      ...(places === undefined ? {} : { start: places }),
    });
    places = threaded.ends;
    phrases.push({ name: phrase.name, figures: threaded.calls });
  }
  return validateDance({
    slug: spec.slug,
    title: spec.title,
    author: spec.author,
    formation: spec.formation.id,
    phrases,
    ...(spec.notes === undefined ? {} : { notes: spec.notes }),
  });
}

/** Where a dance leaves every dancer, in frame-local px: what its closure is checked against. */
export function danceEnds(spec: ContraDanceSpec): Spots {
  const stations = spec.formation.group(4);
  let places: Spots | undefined;
  for (const phrase of spec.phrases) {
    const threaded = chainCalls(spec.formation, phrase.figures, {
      stations,
      ...(places === undefined ? {} : { start: places }),
    });
    places = threaded.ends;
  }
  return places ?? Object.fromEntries(stations.map((s) => [s.id, { p: s.p, facing: s.facing }]));
}
