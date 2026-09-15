import type { Beat, Dance, FigureCall } from "@caller/choreo";
import { concurrentCalls } from "@caller/choreo";
import type { FigureDefinition, FigureShape, ParamValue, TimingProfile } from "@caller/contra";
import {
  ALL_DANCES,
  DEMO_DANCES,
  FIGURE_TEXTS,
  formFor,
  paramDefaults,
  resolveFigureForms,
} from "@caller/contra";
import { callsOf, definitionIds, definitionOf } from "./galleryTiles.js";
import { alternativeValues, paramValueText } from "./moveParams.js";

/**
 * **The Moves page's catalogue: every figure the library holds, as a
 * definition** (M12).
 *
 * The page used to be a gallery of tiles over a hand-written list of figure
 * ids. It is a browser of `FigureDefinition`s now, and everything on a row is
 * read off the definition, the record (`data/dances/*.json`) or the move's
 * texts (`data/figures/<id>.json`) — so a definition that lands in the library
 * gets a row, its parameters, its variants and its place in the dance index
 * with no edit to this file or to the page.
 *
 * Three things a row knows, and where each comes from:
 *
 * - **What the figure is.** `nominalBeats`, `roles`, `actors`, `anchor`, the
 *   shape's kind, `ends`, `timing` and the parameter spec — the definition,
 *   verbatim. Nothing is restated here; {@link MoveEntry} carries the
 *   definition itself so a row can ask it anything.
 * - **Its parameter rows.** {@link moveVariants}: the record first, then the
 *   texts, then the parameter spec's own vocabulary.
 * - **Which dances call it, with what.** {@link MoveUse}, read off every dance
 *   file the package bundles, `while` branches included.
 *
 * Pure and cheap: no tile is planned here. A parameter row's tile is built when
 * somebody opens it (`variantTile`), because a hundred-odd extra planner runs
 * on page load is exactly what a phone cannot afford.
 */

/** Everything the Moves page says about one definition. */
export interface MoveEntry {
  /** The figure id, which is the row's deep-link key. */
  id: string;
  /**
   * The definition, or `undefined` for a figure the **registry** holds and the
   * library does not: `wait-out` and `walk-to-station`, which the decider needs
   * and no dance calls. Such a row says so and has no parameter rows.
   */
  def?: FigureDefinition;
  family: MoveFamilyId;
  /** The figure's own natural count. A call's own count overrides it (D3). */
  nominalBeats: Beat;
  /** The parts this figure has: `lark`/`robin`, `a`/`b`, the hands-four's four. */
  roles: readonly string[];
  /** How a call becomes instances: `pairs`, `ring`, `all`, `each`, `line`. */
  actors: string;
  /** Where the shape is anchored inside the instance's frame. */
  anchor: string;
  /** Where the figure leaves people, in one word. */
  ends: MoveEnds;
  timing?: TimingProfile;
  /** The canonical parameters and what each takes when a call is silent. */
  params: readonly MoveParam[];
  /** The parameter rows: the same figure at another tuning. */
  variants: readonly MoveVariant[];
  /** Which dances call it, with which parameters. */
  dances: readonly MoveUse[];
}

/**
 * Where a figure leaves people, as one word off its `ends` rule.
 *
 * The rebuild's own distinction (`library/figures/index.ts`): a **gatherer**
 * settles people on to the formation's own places, a **carrier** leaves them
 * wherever its shape put them, and a figure with a target shape is solved
 * backwards from the shape it is asked to make.
 */
export type MoveEnds = "gathers" | "carries" | "makes a shape" | "unknown";

/** One canonical parameter of a definition, and its default. */
export interface MoveParam {
  name: string;
  /** What the shape reads when a call is silent. */
  value: ParamValue;
  /** That value written the way a row shows it. */
  text: string;
  /** Whether any dance in the record writes this parameter. */
  written: boolean;
}

/** One parameter row: the same figure at a tuning other than its own. */
export interface MoveVariant {
  /** The deep-link key: `hey~amount=0.5`, filename- and markdown-safe. */
  key: string;
  /** The figure it is a row of. */
  id: string;
  /** The parameters, as a dance record writes them. */
  params: Record<string, ParamValue>;
  /** Just the parameters that differ from the definition's own, as prose. */
  label: string;
  /**
   * **What a caller says for this tuning**, or `undefined` where the move's
   * texts cannot say it.
   *
   * Resolved from `data/figures/<id>.json` against the **whole** parameter bag —
   * the definition's defaults with this row's differences over them — because a
   * template's slots name parameters the row did not have to change: a balance's
   * short call is `BALANCE {pairs}` and a row that only moves `hand` still has
   * to fill it. `undefined` rather than a throw for a value the text vocabulary
   * has no words for, which is a real state: Jeremy Corners promenades a third
   * of the way round and `{amount}` has no word for a third (M13).
   */
  callShort?: string;
  /** Where this row came from, and why it is worth a row. */
  from: MoveVariantSource;
  /** The dance it was called in, when it came out of the record. */
  dance?: string;
  /** That call's own `who`, where it had one. */
  who?: FigureCall["who"];
  /** That call's own count, where it came out of the record. */
  beats?: Beat;
}

/**
 * The three places a parameter row comes from, in the order they are trusted.
 *
 * - `"record"` — a real call in a real dance. The strongest kind: somebody
 *   wrote it down and `pnpm dance <slug>` checks it.
 * - `"texts"` — a `"<param>=<value>"` key in `data/figures/<id>.json`. A value
 *   whose prose is a different sentence is by definition a variant worth a row.
 * - `"spec"` — the definition's own parameter spec, read through the caller's
 *   vocabulary (`moveParams.ts`): the handed and directional words' opposites,
 *   `amount`'s half, and a hey `for` one fewer than its cast.
 */
export type MoveVariantSource = "record" | "texts" | "spec";

/** One dance's call of one figure: the dance ↔ figure index, a row at a time. */
export interface MoveUse {
  slug: string;
  title: string;
  /** Whether the dance is in the evening's programme or only in the lab. */
  programme: boolean;
  phrase: string;
  beats: Beat;
  /** The parameters the record writes, `from` and `carried` left out. */
  params: Record<string, unknown>;
  who?: FigureCall["who"];
  /** What the caller says for it, where the dance wrote its own words. */
  call?: string;
}

/** Which family a definition is filed under: its shape's own kind. */
export type MoveFamilyId = FigureShape["kind"] | "engine";

/** One family of the catalogue, with its own moves. */
export interface MoveFamily {
  id: MoveFamilyId;
  title: string;
  blurb: string;
  moves: readonly MoveEntry[];
}

/**
 * **What each shape kind is, in a caller's words.**
 *
 * The families are the definitions' own shape kinds and nothing else — "the
 * gatherers" and "the carriers" are a fact about `ends`, which every row
 * carries as a badge, and filing by *milestone* (which is what
 * `GATHERER_DEFINITIONS` and friends really are) would be filing by the
 * repository's history rather than by the dancing.
 *
 * A kind with no entry here still gets a section, titled by its own kind name:
 * a family that goes missing from this table is a plain heading, never a
 * dropped figure.
 */
const FAMILIES: Readonly<Record<string, { title: string; blurb: string }>> = {
  rock: {
    title: "Balances",
    blurb: "A step towards and a step back, on the spot, with the hands already taken.",
  },
  orbitPair: {
    title: "Turns for two",
    blurb: "Two dancers turning about the point between them: the swing, the allemande, the round.",
  },
  ringWalk: {
    title: "Rings and stars",
    blurb: "A regular ring of joined hands, ridden round or walked as a bowed chord.",
  },
  path: {
    title: "Crossings and passes",
    blurb:
      "A walk to a computed point along a named curve, with the pairing read off where people stand.",
  },
  courtesyTurn: {
    title: "Courtesy turns",
    blurb:
      "The half turn a couple makes at the end of a chain or a right and left through, solved backwards from its end.",
  },
  lineWalk: {
    title: "Lines",
    blurb:
      "A line with an order, formed and then travelled: down the hall, up, and the bend at the bottom.",
  },
  wave: {
    title: "Waves",
    blurb: "A line of joined hands facing alternately in and out, rocking.",
  },
  unit: {
    title: "Couples as one",
    blurb:
      "Two dancers as a single actor with its own orientation: the promenade, the turn as couples.",
  },
  schedule: {
    title: "Heys",
    blurb:
      "A weave written as the meetings it is made of — who meets whom, on which beat, by which shoulder.",
  },
  waypoints: {
    title: "Walks",
    blurb:
      "A short walk between named places: the pull by, the cast, the loop, going down the outside.",
  },
  sequence: {
    title: "Figures made of parts",
    blurb:
      "Several shapes in a row inside one figure, with the ends and the hands threaded between them.",
  },
  legacy: {
    title: "Still bridged",
    blurb: "A definition whose geometry is still the coded figure's. The bridge is empty since M5.",
  },
  engine: {
    title: "The engine's own",
    blurb:
      "In the registry and not in the library: the decider needs these whether a dance calls them or not, so no planner ever resolves a call of one.",
  },
};

/** The catalogue: every definition, in families, in the library's own order. */
export function moveCatalogue(): MoveFamily[] {
  const families = new Map<MoveFamilyId, MoveEntry[]>();
  for (const entry of moveEntries()) {
    const held = families.get(entry.family);
    if (held === undefined) families.set(entry.family, [entry]);
    else held.push(entry);
  }
  return [...families].map(([id, moves]) => ({
    id,
    title: FAMILIES[id]?.title ?? id,
    blurb: FAMILIES[id]?.blurb ?? "",
    moves,
  }));
}

/** Every entry, flat, in the order the catalogue lists them. */
export function moveEntries(): MoveEntry[] {
  return definitionIds().map((id) => moveEntry(id));
}

/** The entry for one figure id. */
export function moveEntry(id: string): MoveEntry {
  const def = definitionOf(id);
  const dances = movesUses(id);
  if (def === undefined) {
    return {
      id,
      family: "engine",
      nominalBeats: 0,
      roles: [],
      actors: "—",
      anchor: "—",
      ends: "unknown",
      params: [],
      variants: [],
      dances,
    };
  }
  const defaults = paramDefaults(def);
  const written = new Set(dances.flatMap((use) => Object.keys(use.params)));
  return {
    id,
    def,
    family: def.shape.kind,
    nominalBeats: def.nominalBeats,
    roles: def.roles,
    actors: def.actors,
    anchor: typeof def.anchor === "string" ? def.anchor : anchorText(def.anchor),
    ends: endsOf(def),
    timing: def.timing,
    params: Object.entries(defaults).map(([name, value]) => ({
      name,
      value,
      text: paramValueText(value),
      written: written.has(name),
    })),
    variants: moveVariants(def, dances),
    dances,
  };
}

/** `{ pivot: "pivot" }` and `{ other: "a" }` as the words a row shows. */
const anchorText = (anchor: object): string =>
  Object.entries(anchor)
    .map(([kind, role]) => `${kind} ${String(role)}`)
    .join(" ");

/** Which of the three things a definition's `ends` rule says. */
function endsOf(def: FigureDefinition): MoveEnds {
  if (def.ends === "home") return "gathers";
  if (def.ends === "relative") return "carries";
  if (typeof def.ends === "object") return "makes a shape";
  return "unknown";
}

/**
 * **The parameter rows for one definition**, from the record, the texts and the
 * parameter spec, in that order, deduped on the tuning itself.
 *
 * One row per *tuning*, not per parameter: "star left 7/8" is two parameters
 * (`hand` and `amount`) and one row, because it is one thing a caller says.
 * What a row shows is the parameters that differ from the definition's own,
 * which is what makes it a variant rather than the figure.
 *
 * Capped **per source** rather than overall, and that is not a detail: a figure
 * the record calls a dozen ways — Anna's Reel alone allemandes four — would
 * otherwise take every row and leave its own parameter spec with none, which is
 * exactly how the hey lost its "hey for three". Every call the cap drops is
 * still listed in the dance index below the row.
 */
export function moveVariants(def: FigureDefinition, dances: readonly MoveUse[]): MoveVariant[] {
  const defaults = paramDefaults(def);
  const found: Record<MoveVariantSource, MoveVariant[]> = { record: [], texts: [], spec: [] };
  const seen = new Set<string>();
  const add = (
    params: Record<string, ParamValue>,
    from: MoveVariantSource,
    extra: Partial<MoveVariant> = {},
  ): void => {
    const differs = differences(params, defaults);
    if (Object.keys(differs).length === 0) return;
    const label = Object.entries(differs)
      .map(([name, value]) => `${name} ${paramValueText(value)}`)
      .join(", ");
    if (seen.has(label)) return;
    seen.add(label);
    const callShort = shortCallOf(def.id, { ...defaults, ...differs });
    found[from].push({
      key: variantKey(def.id, differs),
      id: def.id,
      params: differs,
      label,
      ...(callShort === undefined ? {} : { callShort }),
      from,
      ...extra,
    });
  };

  // 1. The record: every distinct tuning a real dance really calls.
  for (const use of dances) {
    add(onlyValues(use.params), "record", {
      dance: use.slug,
      beats: use.beats,
      ...(use.who === undefined ? {} : { who: use.who }),
    });
  }

  // 2. The texts: a `"<param>=<value>"` key is the record of a tuning whose
  //    prose is a different sentence, which is exactly what a variant is.
  for (const key of Object.keys(FIGURE_TEXTS[def.id]?.variants ?? {})) {
    const at = key.indexOf("=");
    if (at < 0) continue;
    // **`who` is the call's word, not the figure's** (M13): a text keyed
    // `who=robins` is the prose for the tuning whose *pairing parameter* names
    // the two robins, and which parameter that is — `pairs`, `couples` — is the
    // definition's business. Without this the four role variants the allemande
    // and the do-si-do write had no row at all, which is M12's first finding
    // read the other way round.
    const name = pairingParamOf(key.slice(0, at), defaults);
    if (name === undefined) continue;
    add({ [name]: sameShapeAs(defaults[name], key.slice(at + 1)) }, "texts");
  }

  // 3. The parameter spec, read through the caller's own vocabulary.
  for (const [name, value] of Object.entries(defaults)) {
    for (const other of alternativeValues(name, value, def)) add({ [name]: other }, "spec");
  }

  return [
    ...found.record.slice(0, MAX_VARIANTS.record),
    ...found.texts.slice(0, MAX_VARIANTS.texts),
    ...found.spec.slice(0, MAX_VARIANTS.spec),
  ];
}

/**
 * Which parameter a text variant's key names: its own, or — for `who` — the
 * pairing parameter this definition happens to declare.
 */
function pairingParamOf(
  name: string,
  defaults: Readonly<Record<string, ParamValue>>,
): string | undefined {
  if (name in defaults) return name;
  if (name !== "who") return undefined;
  return ["pairs", "couples"].find((each) => each in defaults);
}

/** The most parameter rows one definition puts on the page, per source. */
export const MAX_VARIANTS: Readonly<Record<MoveVariantSource, number>> = {
  record: 4,
  texts: 2,
  spec: 3,
};

/**
 * The caller's short line for one tuning, or nothing where the texts cannot say
 * it.
 *
 * `resolveFigureForms` throws by name rather than leaving a `{slot}` showing,
 * which is the right rule for a page that shows a dance's own calls and the
 * wrong one for a page that **generates** tunings from a parameter spec — the
 * whole point of a generated row is that nobody has written prose for it yet.
 * So the throw is caught here and the row simply has no call line.
 */
function shortCallOf(id: string, params: Record<string, ParamValue>): string | undefined {
  try {
    const forms = resolveFigureForms(id, params);
    return forms === undefined ? undefined : formFor(forms, SHORT_CALL_BEATS)?.text;
  } catch {
    return undefined;
  }
}

/** The register a parameter row's one call line is printed in: the 2-beat form. */
const SHORT_CALL_BEATS = 2;

/** A value from a variant key, given the shape the definition's own default has. */
function sameShapeAs(like: ParamValue | undefined, written: string): ParamValue {
  if (typeof like === "number") {
    const n = Number(written);
    return Number.isFinite(n) ? n : written;
  }
  if (typeof like === "boolean") return written === "true";
  return written;
}

/** Only the parameters whose value differs from the definition's own default. */
function differences(
  params: Record<string, ParamValue>,
  defaults: Readonly<Record<string, ParamValue>>,
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [name, value] of Object.entries(params)) {
    if (JSON.stringify(value) === JSON.stringify(defaults[name])) continue;
    out[name] = value;
  }
  return out;
}

/** A call's parameters as the plain values a variant holds, `from` left out. */
function onlyValues(params: Record<string, unknown>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [name, value] of Object.entries(params)) {
    if (name === "from" || name === "carried" || name === "homes" || name === "nearby") continue;
    if (value === undefined) continue;
    out[name] = value as ParamValue;
  }
  return out;
}

/**
 * A parameter row's deep-link key: `<id>~<param>=<value>`, several joined by
 * `+` — `star~hand=L+amount=0.875`.
 *
 * It is a URL fragment, **the name of a file** (the strips are written one PNG
 * per key) and a **link in a generated markdown index**, and the third is what
 * decides the punctuation: everything outside the safe set is replaced, one `~`
 * separates the figure from its tuning, and the parameters themselves are
 * joined by `+` rather than by a second `~` because `prettier` reads `~a~` in a
 * link as strikethrough and rewrites the generated index it is asked to check.
 *
 * A key too long to write out — a hey's whole pass list is one parameter value
 * — is cut short and given four characters of its own text back, so two rows of
 * one figure cannot collide.
 */
export function variantKey(id: string, params: Record<string, ParamValue>): string {
  const written = Object.entries(params)
    .map(([name, value]) => `${name}=${paramValueText(value)}`)
    .join("+");
  const safe = written.replace(/[^A-Za-z0-9=.+-]+/g, "-").replace(/^[-+]+|[-+]+$/g, "");
  const cut = safe.length <= KEY_CHARS ? safe : `${safe.slice(0, KEY_CHARS)}-${hash(written)}`;
  return `${id}~${cut}`;
}

/** How much of a parameter row's own text its key keeps. */
const KEY_CHARS = 40;

/** Four characters that stand in for the rest of a key too long to write out. */
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 4).padStart(4, "0");
}

/**
 * **The dance ↔ figure index for one figure**: every call of it in every dance
 * the package bundles, the lab dances included, `while` branches included.
 *
 * The programme first, then the lab, because the programme is the evening and
 * the lab is what is still being encoded — and a row says which it is looking
 * at rather than letting a reader guess from the slug.
 */
export function movesUses(figure: string): MoveUse[] {
  const programme = new Set(DEMO_DANCES.map((dance) => dance.slug));
  const order = [
    ...DEMO_DANCES,
    ...ALL_DANCES.filter((dance) => !programme.has(dance.slug)),
  ] as readonly Dance[];
  const out: MoveUse[] = [];
  for (const dance of order) {
    for (const phrase of dance.phrases) {
      for (const parent of phrase.figures) {
        for (const call of concurrentCalls(parent)) {
          if (call.figure !== figure) continue;
          out.push({
            slug: dance.slug,
            title: dance.title,
            programme: programme.has(dance.slug),
            phrase: phrase.name,
            beats: call.beats,
            params: onlyValues((call.params ?? {}) as Record<string, unknown>),
            ...(call.who === undefined ? {} : { who: call.who }),
            ...(call.call === undefined ? {} : { call: call.call }),
          });
        }
      }
    }
  }
  return out;
}

/** Every dance that calls any of these figures, for a family's own summary. */
export const dancesCalling = (ids: readonly string[]): string[] => [
  ...new Set(ids.flatMap((id) => callsOf(id, ALL_DANCES).map(({ dance }) => dance.slug))),
];
