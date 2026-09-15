import type { Beat } from "@caller/core";
import type {
  AnyFigureDef,
  CycleEmission,
  Dance,
  DancerId,
  EndPose,
  FigureCall,
  FigureRegistry,
  Formation,
  Selector,
  Group,
  GroupPlan,
  HallState,
  Station,
  StationId,
  Timeline,
} from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  WALK_TO_STATION,
  concurrentCalls,
  createGroup,
  createHall,
  createTimeline,
  defaultCyclePlanner,
  frame,
  frameAngle,
  framePoint,
  motionReport,
  poseAt,
  withDefaults,
} from "@caller/choreo";
import type {
  ContraCall,
  FigureDefaultsOverride,
  FigureDefinition,
  FigureTexts,
  Library,
  Spots,
} from "@caller/contra";
import {
  DATA_DEFINITIONS,
  DATA_IDS,
  dataOnlyDefinitions,
  needsTheSet,
  dataOnlyFigureIds,
  contraDataFigures,
  ALL_DANCES,
  CONTRA_MOTION_BOUNDS,
  DEMO_DANCES,
  DUPLE_IMPROPER,
  contraDance,
  contraDataEngine,
  createContraCyclePlanner,
  createContraRegistry,
  formationFor,
  isRelationWord,
  resolveFigureText,
} from "@caller/contra";
import type { EngineChoice } from "./state/engineQuery.js";
import { DEFAULT_ENGINE } from "./state/engineQuery.js";

/**
 * The gallery's data: one tile per figure, one tile per figure-to-figure seam
 * the ten demo dances actually dance, each with a real timeline behind it.
 *
 * Nothing here calls `FigureDef.sample`, and since M3 nothing here decides who
 * dances either. A tile is **one two-couple set run through a cycle planner**
 * for the tile's own window: a real `HallState`, a real synthetic `Dance` of
 * the tile's calls, and the same `CyclePlanner` the Stage hands the decider.
 * The page reads the result with `poseAt`, so what the gallery draws is what
 * the hall draws, seam easing and all.
 *
 * ## Why it has to be the planner, and not a loop of its own
 *
 * Until M3 this file threaded its own calls (`chainCalls`), resolved its own
 * `who` (`resolveSelector`), and gave everybody the selector left out a
 * `walk-to-station` of its own — a second, smaller copy of the decider. M2
 * made that copy unable to draw the new figures at all: a data figure's
 * `anchor: "meet"` is a rule about *two dancers*, and it refuses a
 * four-station hands-four group. Resolution is what turns a call into
 * instances of two, so the gallery has to go through it.
 *
 * Which also fixes something the old loop got wrong: it ran every figure from
 * the formation's own stations three times over, a place no dance ever hands a
 * figure over. Now the tile's dancers stand where the tile's own dance puts
 * them and the figure's `ends` decide the rest.
 *
 * ## The two engines
 *
 * A tile is built for one {@link EngineChoice}. `new` is the contra planner
 * over `contraDataEngine()`'s registry-and-library pair; `old` is
 * `defaultCyclePlanner` over the plain coded registry, which is the path every
 * strip and plate before M3 was taken against. The Moves page runs `new`;
 * `?engine=old` on it, and the seam lab, are how the two are compared.
 */

/** The zooms the gallery offers (DD20). */
export const GALLERY_ZOOMS = [1, 2, 3, 4, 6] as const;

/** The zoom the whole gallery opens at (DD20). */
export const DEFAULT_ZOOM = 2;

/** The zoom one figure or seam opens at on its own: "loop this one". */
export const SOLO_ZOOM = 4;

/**
 * How far outside a dancer's floor point the drawing reaches, in px: a head is
 * about 10 px up the screen from the feet and an arm reaches 15 px out, so a
 * tile's world is its sampled travel plus this on every side.
 */
export const TILE_MARGIN_PX = 18;

/** No tile is drawn smaller than this, however little its figure moves. */
export const MIN_TILE_WORLD = { w: 64, h: 48 } as const;

/**
 * How often a tile's world is sampled when it is being sized, in beats.
 *
 * An **eighth** since M5, which is the step `galleryTiles.test.ts` checks the
 * bounds at: at a quarter the sizer stepped straight over the widest moment of
 * a shoulder round and drew two of On the Prowl's seam tiles 0.93 px too
 * narrow. Measured over every tile in the gallery, the finer step changes the
 * world of **exactly those two** and of nothing that was drawn before.
 */
export const TILE_BOUNDS_STEP = 0.125;

/** A plain floor and no furniture, as M4 owns the hall's boards and walls. */
export const FLOOR_COLOUR = "#c9a06a";

/** Down the hall: the axis every set in the demo is seated on. */
const AXIS = 90;

/** The one group every tile dances in. */
const GROUP_ID = "gallery";

/** One figure inside a tile, as the tile lists it. */
export interface GalleryCall {
  figure: string;
  beats: Beat;
  /** What the caller says for it — the dance's own words where a dance gave any. */
  call: string;
  /**
   * What the dancers actually do, in the figure's own prose: `FigureDef.describe`,
   * written by F3a. `undefined` only if a figure has none, which the registry
   * test makes hard.
   *
   * The fallback now, not the text the row shows: W1 moved the prose into
   * `data/figures/<id>.json` and {@link GalleryCall.texts} is what the page
   * reads. It stays until the cleanup that removes `describe` from the figure
   * contract altogether.
   */
  describe?: string;
  /**
   * The move's four texts, resolved against **this** call's own parameters and
   * this tile's own group: the short and long walkthrough and the short and
   * long call (`data/figures/<id>.json`).
   *
   * `undefined` only for a figure with no text file. The long walkthrough ends
   * on the generated landmark, which is why the group has to be in hand to
   * resolve it — "you should be across the set from your partner" is a fact
   * about the figure *here*.
   */
  texts?: FigureTexts;
  /** The tuning it ran with. `from` is left out: it is threaded, not chosen. */
  params: Record<string, unknown>;
}

/**
 * **One parameter row**: the same definition at a tuning other than its own.
 *
 * M12. Where the tuning came from is {@link MoveVariant}'s business in
 * `moveCatalogue.ts`; all a tile needs is the parameters, a key to be deep-linked
 * by, a title, and — when the row is a real call out of the record — the dance it
 * was called in, so the tile is danced in that dance's own formation by that
 * call's own dancers.
 */
export interface TileVariant {
  /** The deep-link key: `hey~amount=0.5`. */
  key: string;
  /** What the row is called: `hey · amount 0.5`. */
  title: string;
  /** The parameters, written as a dance record writes them. */
  params: Record<string, unknown>;
  /** The count this row is danced at; the definition's nominal otherwise. */
  beats?: Beat;
  /** The dance whose call this is, when the row came out of the record. */
  dance?: string;
  /** That call's own `who`, where it had one. */
  who?: Selector;
  notes?: readonly string[];
}

/** One tile of the gallery: a figure looping, one of its parameter rows, or one seam. */
export interface GalleryTile {
  kind: "figure" | "variant" | "seam";
  /** The deep-link key: a figure id, or `<a>--<b>`. */
  key: string;
  title: string;
  /** The figures this tile runs, in order. */
  calls: readonly GalleryCall[];
  /** The figure a seam tile is filed under: its first figure. */
  under: string;
  formation: string;
  /**
   * The four (or two) dancers the tile draws, and where their stations are.
   *
   * Since M3 this is the minor set's own plan out of a real `HallState`, so
   * its members are hall dancer ids (`set0/c0/lark`) rather than names this
   * file made up. It is **not** the group the timeline's events are bound to —
   * a data figure's instances are groups of two whose stations are figure-roles
   * — it is who to draw and where the tile's own axes are.
   */
  group: Group;
  timeline: Timeline;
  /** Which engine planned this tile's timeline. */
  engine: EngineChoice;
  /** The looping window on that timeline: where it starts and how long it is. */
  window: { start: Beat; beats: Beat };
  /** The world this tile is drawn on, before zoom: its own travel plus a margin. */
  world: { w: number; h: number };
  /** Beats into the window where the seam falls, for a seam tile. */
  seamAt?: Beat;
  /**
   * Whether a seam tile is a dance's wrap: its last figure back into its first.
   *
   * The row needs it because the oracle needs it. In the hall the progression
   * re-forms the minor set between those two figures and this tile cannot, so
   * a wrap tile's dancers jump a couple place at the seam — and the motion
   * numbers below measure that jump, not the figure. The tile has always said
   * so in its notes; this is the same fact in a form the metrics line can read.
   */
  wrapped?: boolean;
  /** The dance the parameters came from, when they came from one. */
  source?: string;
  /** Anything about this tile a reviewer needs told. */
  notes: readonly string[];
}

/** The group of four (or two) a tile dances in, centred on the world's origin. */
export function galleryGroup(formation: Formation, n = 4): Group {
  const stations = formation.group(n);
  return createGroup(
    {
      id: GROUP_ID,
      kind: "set",
      frame: frame([0, 0], AXIS),
      stations,
      members: Object.fromEntries(stations.map((s) => [s.id, dancerOn(s)])),
      couples: [],
    },
    formation.roleSet,
  );
}

/** The dancer standing on a station of a gallery group. */
export const dancerOn = (station: Station): string => `${GROUP_ID}/${station.id}`;

/**
 * Every tile, figures first, then the seams grouped under their first figure.
 *
 * `overrides` is a figure-defaults override's route in: a figure named in it
 * dances every tile — its own row and every seam it appears in — at the
 * overridden defaults instead of the shipped ones. See
 * {@link FigureDefaultsOverride}.
 */
export function galleryTiles(
  overrides: FigureDefaultsOverride = {},
  engine: EngineChoice = DEFAULT_ENGINE,
): GalleryTile[] {
  return [...figureTiles(overrides, engine), ...seamTiles(overrides, engine)];
}

/** One figure and every seam that leaves it, in the order the page lists them. */
export interface TileGroup {
  figure: GalleryTile;
  seams: GalleryTile[];
}

/**
 * The tiles as the page lays them out: one group per figure, each seam filed
 * under the figure it comes out of.
 *
 * A seam's `under` is its first figure, which is always a figure that has a
 * tile of its own — every seam comes from a demo dance and every figure a demo
 * dance calls is in the registry. A seam whose `under` somehow has no tile
 * would be dropped silently, so it gets a group of its own at the end instead,
 * with the seam tile standing in for the missing figure.
 */
export function groupedTiles(tiles: readonly GalleryTile[]): TileGroup[] {
  const groups = new Map<string, TileGroup>();
  for (const tile of tiles) {
    if (tile.kind === "figure") groups.set(tile.key, { figure: tile, seams: [] });
  }
  const orphans: TileGroup[] = [];
  for (const tile of tiles) {
    if (tile.kind !== "seam") continue;
    const group = groups.get(tile.under);
    if (group === undefined) orphans.push({ figure: tile, seams: [] });
    else group.seams.push(tile);
  }
  return [...groups.values(), ...orphans];
}

/** The widest and tallest world any of these tiles is drawn on, before zoom. */
export function maxTileWorld(tiles: readonly GalleryTile[]): { w: number; h: number } {
  return {
    w: Math.max(MIN_TILE_WORLD.w, ...tiles.map((t) => t.world.w)),
    h: Math.max(MIN_TILE_WORLD.h, ...tiles.map((t) => t.world.h)),
  };
}

/** One number the motion oracle measured, ready to put on the page. */
export interface TileMetric {
  /** What it is, short enough for a chip: `hand`, `elbow/hand`, `dip`. */
  label: string;
  /** The number, formatted, with its unit where it has one. */
  value: string;
  /** Whether it is over the bound `@caller/contra` derives from the library. */
  over: boolean;
  /** The whole story, for the chip's `title`: the bound, and where the worst was. */
  detail: string;
}

/**
 * What F3a's motion oracle says about one tile, measured over the tile's own
 * looping window and against `@caller/contra`'s derived bounds.
 *
 * This is the same instrument `docs/motion-report.md` is written with, pointed
 * at the gallery's timelines instead of the dances': each tile is one figure
 * (or one seam) danced by one group of four, so the numbers are that figure's
 * own and are not averaged with anything else's. The bounds are guards, three
 * times the fastest thing an honest take does, so a number over one is worth a
 * look and is not by itself a defect.
 *
 * Costs a sampling sweep at 1/32 beat per tile — about 9 ms each, half a second
 * for the whole gallery — so the page measures after it has painted rather than
 * before.
 */
export function tileMetrics(tile: GalleryTile): TileMetric[] {
  const report = motionReport(tile.timeline, tile.window.start + tile.window.beats, {
    from: tile.window.start,
    bounds: CONTRA_MOTION_BOUNDS,
  });
  const o = report.overall;
  const b = CONTRA_MOTION_BOUNDS;
  return [
    metric(
      "hand",
      o.handSpeed.value,
      b.handSpeedPx,
      "px/beat",
      "a hand's floor speed",
      o.handSpeed,
    ),
    metric(
      "elbow/hand",
      o.elbowPerHand.value,
      b.elbowPerHand,
      "×",
      "how much faster an elbow moves than the hand it belongs to — the number that catches flail",
      o.elbowPerHand,
    ),
    metric(
      "height",
      o.heightRate.value,
      b.heightRatePx,
      "px/beat",
      "how fast a hand changes height",
      o.heightRate,
    ),
    metric("dip", o.dip.value, b.dipPx, "px", "the worst out-and-back inside one beat", o.dip),
    countMetric(
      "flips",
      o.stateFlips,
      "how many times a hand swapped between placed and hanging",
      o.flipJump.value > 0 ? `worst jump ${o.flipJump.value.toFixed(2)} px` : undefined,
    ),
    countMetric(
      "NaN",
      o.nonFinite,
      "samples where a hand or an elbow was not a finite number — an arm that is drawn as nothing",
      undefined,
      true,
    ),
  ];
}

/** A measured number against its bound. */
function metric(
  label: string,
  value: number,
  bound: number,
  unit: string,
  what: string,
  worst: { dancer?: string; side?: string; beat?: Beat },
): TileMetric {
  const where =
    worst.dancer === undefined
      ? ""
      : ` Worst at ${worst.dancer} ${worst.side ?? ""} beat ${(worst.beat ?? 0).toFixed(2)}.`;
  return {
    label,
    value: `${value.toFixed(unit === "×" ? 2 : 1)}${unit === "×" ? "×" : ` ${unit}`}`,
    over: value > bound,
    detail: `${what}. Bound ${bound.toFixed(unit === "×" ? 2 : 1)}${unit === "×" ? "×" : ` ${unit}`}.${where}`,
  };
}

/** A count, which has no bound: any non-zero is worth a look, zero is silent. */
function countMetric(
  label: string,
  n: number,
  what: string,
  extra?: string,
  always = false,
): TileMetric {
  return {
    label,
    value: String(n),
    over: n > 0 && always,
    detail: `${what}.${extra === undefined ? "" : ` ${extra}.`}`,
  };
}

/** The tile with this deep-link key, or `undefined`. */
export function tileByKey(tiles: readonly GalleryTile[], key: string): GalleryTile | undefined {
  return tiles.find((t) => t.key === key);
}

/**
 * **One tile per definition the library holds**, in the library's own order,
 * and then whatever the registry holds that the library does not.
 *
 * M12: there is no hand-written list of figure ids here any more, and nothing
 * here asks whether a figure has a coded twin. The Moves page is a browser of
 * **definitions** (`DATA_DEFINITIONS`), so a definition that lands in the
 * library — a milestone's, or a dance file's own local one — gets a row, a
 * strip and four trace plates with no edit to this file.
 *
 * The tail is the two figures the **registry** has and the library does not:
 * `wait-out` and `walk-to-station`, which `@caller/choreo` and contra supply
 * for the decider rather than for a dance to call. They are read off the two
 * registries rather than written down, so the tail empties itself the day the
 * library holds them. See {@link figureTile} for why their tiles are built by
 * hand.
 */
export function figureTiles(
  overrides: FigureDefaultsOverride = {},
  engine: EngineChoice = DEFAULT_ENGINE,
): GalleryTile[] {
  // The registry is built with the interpreted definitions in it, because
  // `registry.get(id)` is what a tile reads its beats and its call text off for
  // the two figures that have no definition at all.
  const registry = createContraRegistry(contraDataFigures(), overrides);
  return definitionIds().map((id) => figureTile(id, registry, overrides, engine));
}

/**
 * Every figure the Moves page has a row for, in the order it lists them: the
 * library's definitions, then the registry's own two.
 */
export function definitionIds(): string[] {
  const held = new Set<string>(DATA_IDS);
  const rest = createContraRegistry()
    .ids()
    .filter((id) => !held.has(id));
  return [...DATA_DEFINITIONS.map((def) => def.id), ...rest];
}

/** The definition of that id, or `undefined` for one of the registry's own two. */
export const definitionOf = (id: string): FigureDefinition | undefined =>
  DATA_DEFINITIONS.find((def) => def.id === id);

/**
 * **One parameter row's tile, or the reason there is none** (M12).
 *
 * A parameter row is generated from the definition's own parameter spec, from
 * the record and from the move's texts — so it can name a tuning that expands
 * perfectly well and that **nothing can draw**: a hey for three is a real hey
 * with one dancer standing out, and the tile's two-couple set has nobody to
 * stand out. The brief's own rule is that such a row says so rather than
 * throwing, so the failure is caught here, once, and comes back as prose.
 *
 * Built lazily and memoised: the index page lists a hundred-odd parameter rows
 * and a tile costs a planner run and a sampling sweep, so a row's tile is built
 * when somebody opens it, not when the page loads.
 */
export function variantTile(
  id: string,
  variant: TileVariant,
  overrides: FigureDefaultsOverride = {},
  engine: EngineChoice = DEFAULT_ENGINE,
): { tile: GalleryTile } | { problem: string } {
  const key = `${engine}|${JSON.stringify(overrides)}|${variant.key}`;
  const cached = variantCache.get(key);
  if (cached !== undefined) return cached;
  let made: { tile: GalleryTile } | { problem: string };
  try {
    const registry = createContraRegistry(contraDataFigures(), overrides);
    made = { tile: figureTile(id, registry, overrides, engine, variant) };
  } catch (error) {
    made = { problem: String(error instanceof Error ? error.message : error) };
  }
  variantCache.set(key, made);
  return made;
}

const variantCache = new Map<string, { tile: GalleryTile } | { problem: string }>();

/**
 * One tile per distinct `(figure A → figure B)` the ten demo dances dance,
 * including the wrap from a dance's last figure back into its first — a dance
 * is danced twice through, so that seam is danced too.
 */
export function seamTiles(
  overrides: FigureDefaultsOverride = {},
  engine: EngineChoice = DEFAULT_ENGINE,
): GalleryTile[] {
  const byKey = new Map<string, GalleryTile>();
  for (const seam of corpusSeams()) {
    if (byKey.has(seam.key)) continue;
    byKey.set(seam.key, seamTile(seam, overrides, engine));
  }
  const order = new Map(definitionIds().map((id, i) => [id, i]));
  return [...byKey.values()].sort(
    (x, y) => (order.get(x.under) ?? 99) - (order.get(y.under) ?? 99) || x.key.localeCompare(y.key),
  );
}

/**
 * **Which engine a tile can actually be drawn on** (M5, widened by M7).
 *
 * The old planner hands a figure the four dancers of a hands-four and asks it
 * where it leaves them. Two kinds of figure cannot answer, and both are drawn on
 * the contra planner whichever engine the page asked for:
 *
 * - one resolution mints **per pair** or **per dancer**, which refuses four
 *   roles by name — M5's shoulder round was the first with no coded twin to
 *   answer for it, and M7's cast off, leads, turn alone and the two going down
 *   the outside are seven more;
 * - one whose definition names a **slot on the lattice** (M7), which only
 *   resolution can supply — a circulate crosses the set and a long wave's hands
 *   go to the dancer one place along, and neither is a fact a hands-four group
 *   carries.
 *
 * Both are the same question asked of `actors`: a figure resolution hands the
 * whole four is `"all"` or `"ring"`, and everything else needs the set.
 *
 * **And a third, since M7b: the *call* rather than the figure.** A do-si-do is a
 * figure for the whole four and the old planner draws it happily — until Whoosh
 * asks for one with `pairs: "N2"`, which is a relation the lane resolves and a
 * hands-four has no dancer for, and the coded figure's own pairing returns
 * nothing to walk (`pairsOf("N2").map is not a function`). So a seam tile asks
 * about its two calls as well as about their two figures.
 *
 * The choice goes away with the coded layer (M11).
 */
function tileEngine(
  ids: readonly string[],
  engine: EngineChoice,
  calls: readonly { who?: unknown; params?: unknown }[] = [],
): EngineChoice {
  if (engine === "new") return "new";
  // `needsTheSet` is the library's own predicate (M8) — the one question the
  // hands-four template, the symmetry harness and this page were all asking
  // separately: a figure resolution mints per pair or per dancer, or one whose
  // shape reads the lattice, can only be planned against a real set. M7b asks it
  // of the tile's own **calls** as well.
  const set =
    ids.some((id) => dataOnlyDefinitions().some((def) => def.id === id && needsTheSet(def))) ||
    calls.some(callNeedsTheSet);
  return set ? "new" : "old";
}

/** Whether a call's own `who` or pairing names somebody a hands-four does not hold. */
function callNeedsTheSet(call: { who?: unknown; params?: unknown }): boolean {
  const params = call.params as Record<string, unknown> | undefined;
  for (const value of [call.who, params?.["pairs"], params?.["couples"]]) {
    if (typeof value !== "string") continue;
    const word = value.trim();
    if (word === "partners" || word === "neighbors") continue;
    if (isRelationWord(word)) return true;
  }
  return false;
}

/** The note a tile forced on to the other engine carries, so the page says so. */
const FORCED_ENGINE_NOTE =
  "Drawn on the new engine whichever the page asked for: this figure is minted " +
  "one instance per pair or per dancer, and the old planner asks a figure where " +
  "it leaves the four dancers of a hands-four.";

/**
 * One figure, run three times over so its take and its release both have a seam.
 *
 * `variant` is M12's parameter row: the same figure at a different tuning, with
 * its own deep-link key and its own reason for being on the page. Left out, the
 * tile is the definition's own — the parameters of the first call any dance in
 * the record makes of it, or the definition's defaults where no dance calls it.
 */
export function figureTile(
  id: string,
  registry: FigureRegistry,
  overrides: FigureDefaultsOverride = {},
  asked: EngineChoice = DEFAULT_ENGINE,
  variant?: TileVariant,
): GalleryTile {
  const engine = tileEngine([id], asked);
  const def = registry.get(id);
  const found =
    variant === undefined
      ? danceableCallOf(id, registry, overrides, engine)
      : variantCallOf(id, variant);
  const formation = found === undefined ? DUPLE_IMPROPER : formationFor(found.dance);
  const beats = variant?.beats ?? found?.call.beats ?? def.beats;
  const params = variant === undefined ? withoutFrom(found?.call.params) : { ...variant.params };
  const callText = found?.call.call ?? def.call;
  const notes: string[] = [...(variant?.notes ?? [])];
  if (engine !== asked) notes.push(FORCED_ENGINE_NOTE);

  if (!DATA_IDS.includes(id)) {
    // `wait-out` and `walk-to-station` are `@caller/choreo`'s own figures, and
    // **the library does not hold them**: `legacyLibrary` bridges what answers
    // `joins`, which these two do not. A planner cannot resolve a call of a
    // figure it has no definition for, so these two tiles keep a timeline built
    // by hand — one group, the figure on every station, nobody left out and so
    // no complement to fill. It is the smallest exception the re-base allows
    // and it disappears when M4 and M5 give the library everything.
    return engineFigureTile(id, def, formation, beats, params, callText, found, engine);
  }

  const who = variant === undefined ? found?.call.who : variant.who;
  const one: ContraCall = {
    figure: id,
    beats,
    params,
    ...(who === undefined ? {} : { who }),
  };

  // Three times over: the middle one is the tile, so its first beat eases out
  // of the figure before it and its last beat releases into the figure after
  // it. The planner is what carries each instance's start, its holds and its
  // ends into the next.
  let run = planTile({ formation, cycles: [{ calls: [one, one, one] }], overrides, engine });
  let start: Beat = beats;
  if (!closes(run, beats)) {
    // A figure that progresses walks away from itself: three of them in a row
    // end a couple place or more down the hall, which makes the tile a map of
    // the drift rather than a look at the figure. So the other bracket —
    // stand, figure, stand — with the standing places taken from where the
    // figure starts and where it leaves everybody.
    run = planTile({
      formation,
      cycles: [{ calls: [one] }],
      overrides,
      engine,
      bracket: BRACKET_BEATS,
    });
    start = BRACKET_BEATS;
    notes.push(
      "does not end where it began: bracketed by standing rather than by itself, and the loop jumps back when it wraps",
    );
  }

  if (found === undefined) {
    notes.push(
      "no dance in the programme calls this figure: it runs from the formation's stations on its own defaults, which is not where a dance would hand it over — a lab dance that calls it is in the index below",
    );
  }
  if (!dancesHere(run, id)) {
    notes.push(
      "nobody dances it on this tile: the parameters name a dancer a two-couple set has not got, so the four of them stand",
    );
  }

  return sized({
    kind: variant === undefined ? "figure" : "variant",
    key: variant?.key ?? id,
    title: variant?.title ?? id,
    calls: [listed(run.calls[0]!, callText, run.group, def.describe)],
    under: id,
    formation: formation.id,
    group: run.group,
    timeline: run.timeline,
    engine,
    window: { start, beats },
    world: MIN_TILE_WORLD,
    ...(found === undefined ? {} : { source: found.dance.slug }),
    notes,
  });
}

/** How long the standing bracket around a figure that progresses lasts. */
const BRACKET_BEATS = 4;

/**
 * **The first call of this figure the tile's own set can actually dance**
 * (FR-A2), and the definition's own defaults when no dance's can.
 *
 * The user, on the pull-by tile: *"no one is moving at all."* And nobody was.
 * A tile is planned over **one two-couple set** (`tileHall`), and the
 * parameters it takes are the first call the record makes of the figure —
 * which for `pull-by` is Whoosh's *"(2) N3 neighbor pull by right"*. In a line
 * of two couples nobody has an N3, so resolution cast nobody, the planner
 * emitted no pull-by at all, and the tile drew four dancers standing still
 * under a caption that said PULL BY.
 *
 * So the tile asks the question it was really asking all along — *which of this
 * figure's calls can these four dance?* — by planning them in the record's own
 * order and keeping the first whose figure actually reaches somebody. A Rare
 * Bird's *"neighbor pull by right"* is the one that does, and the tile says so
 * in its "params from" column. Where none of them do, the tile falls back to
 * the definition's defaults and {@link figureTile} notes it, so a row can never
 * silently draw nothing again.
 *
 * It costs one extra planner run per figure whose first call is out of reach,
 * and nothing at all for the rest: the loop stops at the first that dances.
 */
function danceableCallOf(
  id: string,
  registry: FigureRegistry,
  overrides: FigureDefaultsOverride,
  engine: EngineChoice,
): { dance: Dance; call: FigureCall } | undefined {
  const calls = callsOf(id, DEMO_DANCES);
  if (calls.length === 0 || !DATA_IDS.includes(id)) return calls[0];
  for (const found of calls) {
    const one: ContraCall = {
      figure: id,
      beats: found.call.beats,
      params: withoutFrom(found.call.params),
      ...(found.call.who === undefined ? {} : { who: found.call.who }),
    };
    const run = planTile({
      formation: formationFor(found.dance),
      cycles: [{ calls: [one, one, one] }],
      overrides,
      engine,
    });
    if (dancesHere(run, id)) return found;
  }
  return undefined;
}

/** Whether anybody on the tile's own group dances this figure at all. */
function dancesHere(run: TileRun, id: string): boolean {
  for (const station of run.group.stations) {
    const dancer = run.group.members[station.id];
    if (dancer === undefined) continue;
    if (run.timeline.figuresOf(dancer).some((event) => event.figure === id)) return true;
  }
  return false;
}

/**
 * A tile for one of `@caller/choreo`'s own figures, built without a planner.
 *
 * See {@link figureTile} for why these two cannot go through resolution. The
 * group is the gallery's own four (or two) stations rather than a hall's,
 * which is exactly what it was before M3, so these two tiles are unchanged by
 * the re-base and their strips are byte-identical.
 */
function engineFigureTile(
  id: string,
  def: AnyFigureDef,
  formation: Formation,
  beats: Beat,
  params: Record<string, unknown>,
  callText: string,
  found: { dance: Dance; call: FigureCall } | undefined,
  engine: EngineChoice,
): GalleryTile {
  const alone = id !== "walk-to-station";
  const group = galleryGroup(alone ? formation : DUPLE_IMPROPER, alone ? 2 : 4);
  const calls: FigureCall[] = alone
    ? [{ figure: id, beats, params }]
    : [
        { figure: id, beats, params },
        { figure: id, beats, params },
        { figure: id, beats, params },
      ];
  const timeline = createTimeline(createContraRegistry());
  timeline.addGroup(group);
  let at: Beat = 0;
  for (const call of calls) {
    addEmission(timeline, {
      group,
      def,
      params: withDefaults(def, call.params, call.beats),
      stations: group.stations.map((s) => s.id),
      start: at,
    });
    at += call.beats;
  }
  const notes = alone
    ? [
        "runs alone: the engine's own figures have no definition in the library, so the planner cannot resolve a call of one",
        "a group of two — the couple waiting out at the end of the line",
      ]
    : ["the engine's own placeholder: nobody is told to go anywhere, so nobody moves"];
  return sized({
    kind: "figure",
    key: id,
    title: id,
    calls: [listed(calls[0]!, callText, group, def.describe)],
    under: id,
    formation: formation.id,
    group,
    timeline,
    engine,
    window: { start: alone ? 0 : beats, beats },
    world: MIN_TILE_WORLD,
    ...(found === undefined ? {} : { source: found.dance.slug }),
    notes,
  });
}

/** One `(figure A → figure B)` boundary of one demo dance. */
export interface CorpusSeam {
  key: string;
  dance: Dance;
  a: FigureCall;
  b: FigureCall;
  /** The dance's last figure back into its first: a time through into the next. */
  wrapped: boolean;
}

/**
 * Every `(figure A → figure B)` the ten demo dances dance, in dance order,
 * including each dance's wrap.
 *
 * Exported shape rather than an inline loop because the seam lab (`#/lab`)
 * looks a seam up by the same key the Moves page files it under, and two
 * places deciding separately what "the hey into the balance and swing" means
 * would eventually disagree.
 */
export function corpusSeams(dances: readonly Dance[] = DEMO_DANCES): CorpusSeam[] {
  const out: CorpusSeam[] = [];
  for (const dance of dances) {
    // **One step of the dance may be several figures** (M8): a concurrent call
    // is two figures over the same beats, so a step is a *list* and a seam is
    // every figure of one step into every figure of the next. Two branches make
    // four seams out of one boundary, which is right — the robins' loop into the
    // partner swing is as real a seam as the larks' allemande into it.
    const steps = dance.phrases.flatMap((p) => p.figures).map((call) => concurrentCalls(call));
    for (let i = 0; i < steps.length; i++) {
      const wrapped = i + 1 === steps.length;
      for (const a of steps[i]!) {
        for (const b of steps[(i + 1) % steps.length]!) {
          out.push({ key: `${a.figure}--${b.figure}`, dance, a, b, wrapped });
        }
      }
    }
  }
  return out;
}

/** The first seam of this key anywhere in the demo dances, or `undefined`. */
export const seamByKey = (key: string): CorpusSeam | undefined =>
  corpusSeams().find((s) => s.key === key);

/**
 * Two figures from one dance, back to back, with the seam in the middle.
 *
 * The seam starts **where the dance really has it** — the tile's set is stood
 * on the first call's own threaded places, not on the formation's stations —
 * because a seam is a fact about two figures meeting somewhere in particular,
 * and the same two figures meeting at the top of a dance would be a different
 * picture.
 */
export function seamTile(
  seam: CorpusSeam,
  overrides: FigureDefaultsOverride = {},
  asked: EngineChoice = DEFAULT_ENGINE,
  window?: { before: Beat; after: Beat },
  key = seam.key,
): GalleryTile {
  const { dance, a, b, wrapped } = seam;
  const engine = tileEngine([a.figure, b.figure], asked, [a, b]);
  const formation = formationFor(dance);
  const run = planTile({
    formation,
    // One time through for an ordinary seam, so the second figure starts from
    // where the first one left everybody and the hold between them carries.
    // **Two for a wrap**, because that is what a wrap is: the dance's first
    // figure starts from the dance's own first places, whoever the last figure
    // left where — and the place shift that makes at the seam is the
    // progression, which this tile does not draw and says so.
    cycles: wrapped
      ? [
          { calls: [unthreaded(a)], startPlaces: startOf(a) },
          { calls: [unthreaded(b)], startPlaces: startOf(b) },
        ]
      : [{ calls: [unthreaded(a), unthreaded(b)], startPlaces: startOf(a) }],
    overrides,
    engine,
  });
  const registry = createContraRegistry([], overrides);
  const notes = [
    ...(wrapped
      ? [
          "the wrap: this dance's last figure into its first, one time through into the next",
          "the hall re-forms the minor set between the two, and this tile does not: a place shift across this seam is the progression, not a jump",
        ]
      : []),
    ...(engine === asked ? [] : [FORCED_ENGINE_NOTE]),
  ];
  const before = window === undefined ? a.beats : Math.min(window.before, a.beats);
  const after = window === undefined ? b.beats : Math.min(window.after, b.beats);
  return sized({
    kind: "seam",
    key,
    title: `${a.figure} → ${b.figure}`,
    calls: run.calls.map((c) => {
      const def = registry.get(c.figure);
      return listed(c, c.call ?? def.call, run.group, def.describe);
    }),
    under: a.figure,
    formation: formation.id,
    group: run.group,
    timeline: run.timeline,
    engine,
    window: { start: a.beats - before, beats: before + after },
    world: MIN_TILE_WORLD,
    seamAt: before,
    ...(wrapped ? { wrapped: true } : {}),
    source: dance.slug,
    notes,
  });
}

/** A dance's call as a call again: the two things the chain derived stripped off. */
function unthreaded(call: FigureCall): ContraCall {
  const params: Record<string, unknown> = withoutFrom(call.params);
  delete params["carried"];
  return {
    figure: call.figure,
    beats: call.beats,
    params,
    ...(call.who === undefined ? {} : { who: call.who }),
    ...(call.group === undefined ? {} : { group: call.group }),
    ...(call.call === undefined ? {} : { call: call.call }),
  };
}

/** Where the dance had this call's dancers standing, frame-local. */
const startOf = (call: FigureCall): Spots | undefined =>
  (call.params as { from?: Spots } | undefined)?.from;

/**
 * The tile with a world big enough for it: every dancer **the tile draws**
 * sampled across the looping window, plus {@link TILE_MARGIN_PX} for the body
 * the pose point only marks the feet of.
 *
 * The tile's own group, not `timeline.dancers()`: a becket set needs four
 * couples to have a minor set at all, so its timeline also holds the two
 * couples waiting out at the ends of the line, a couple place away and not
 * drawn here.
 *
 * Per tile rather than one size for all, because a becket dance starts a whole
 * couple place off its stations and a balance moves nobody more than a step:
 * one world big enough for both would draw the balance in the middle of a lot
 * of empty floor. The zoom is shared, so tiles still compare at the same scale.
 */
function sized(tile: GalleryTile): GalleryTile {
  let x = 0;
  let y = 0;
  for (const dancer of tileDancers(tile)) {
    for (let t = 0; t <= tile.window.beats; t += TILE_BOUNDS_STEP) {
      const pose = poseAt(
        tile.timeline,
        dancer,
        tile.window.start + Math.min(t, tile.window.beats),
      );
      x = Math.max(x, Math.abs(pose.p[0]));
      y = Math.max(y, Math.abs(pose.p[1]));
    }
  }
  return {
    ...tile,
    world: {
      // `Math.ceil` on a raw float, as it has always been. Worth knowing that
      // it is a knife edge: a figure's geometry lands on round numbers — a
      // swing's ring is 12.0 px from the centre — and two ways of computing the
      // same number do not always agree on the last bit, so a difference of
      // 4 × 10⁻¹⁵ px in a dancer's reach changes the **height of the canvas by
      // two pixels**. Three seam tiles moved that way and only that way between
      // the two engines in M3. Rounding the reach first would fix it and would
      // also resize twenty-two tiles that are sitting on the same edge today,
      // which is a bigger change than a milestone about the engine should make;
      // M12 (the Moves page) is where it belongs.
      w: Math.max(MIN_TILE_WORLD.w, 2 * Math.ceil(x + TILE_MARGIN_PX)),
      h: Math.max(MIN_TILE_WORLD.h, 2 * Math.ceil(y + TILE_MARGIN_PX)),
    },
  };
}

/** The dancers a tile draws: its own group's members, in station order. */
export function tileDancers(tile: GalleryTile): DancerId[] {
  const out: DancerId[] = [];
  for (const station of tile.group.stations) {
    const dancer = tile.group.members[station.id];
    if (dancer !== undefined) out.push(dancer);
  }
  return out;
}

/** One two-couple set, planned: the timeline, who to draw, and what was called. */
interface TileRun {
  timeline: Timeline;
  /** The minor set the tile draws, out of the hall the run was planned in. */
  group: Group;
  /** The calls as the tile's own dance holds them, threaded. */
  calls: readonly FigureCall[];
}

/** One time through, as a tile asks for it. */
interface TileCycle {
  /** The calls, **unthreaded**: the tile's own dance threads them. */
  calls: readonly ContraCall[];
  /** Where the set stands at this cycle's beat 0, frame-local. Left out: the stations. */
  startPlaces?: Spots | undefined;
}

/** What {@link planTile} is asked for. */
interface TileSpec {
  formation: Formation;
  /**
   * The times through, back to back.
   *
   * Almost always one. **A wrap tile is two**: a dance's last figure into its
   * own first is a cycle boundary, and the first figure of a time through
   * starts from the dance's own first places rather than from wherever the
   * last figure left anybody — which is why a wrap tile's dancers shift a
   * place at the seam, and why the tile says that shift is the progression
   * rather than a jump. Two planner runs is what that is, honestly.
   */
  cycles: readonly TileCycle[];
  overrides: FigureDefaultsOverride;
  engine: EngineChoice;
  /**
   * Beats of standing before and after the calls, for a figure that does not
   * close. Left out (or 0) the calls fill the whole timeline.
   */
  bracket?: Beat;
}

/**
 * **One two-couple set run through a cycle planner** — the whole of how a tile
 * gets its timeline since M3.
 *
 * Everything here is the real thing: a real `HallState` (`createHall`), a real
 * `Dance` (`contraDance`, which threads the calls exactly as a dance file is
 * threaded at load), a real `CyclePlanner`, and the emissions added to the
 * timeline the way `createScriptDecider`'s own `emitFigure` adds them. What is
 * *not* here is any decision about who dances, where they start, or what
 * anybody left out does: those are resolution's, and resolution is what the
 * new figures need.
 *
 * The hall is stood so that **the minor set's own frame is the world's
 * origin**, which is where the gallery has always drawn from — a tile's world
 * is sized symmetrically about the centre, so a set sitting a couple place off
 * would draw every figure in the corner of a tile twice the size it needs.
 */
function planTile(spec: TileSpec): TileRun {
  const { formation, cycles, overrides, engine } = spec;
  const bracket = spec.bracket ?? 0;
  const { hall, plan } = tileHall(formation);

  const { registry, library } = engineHalves(engine, overrides);
  const timeline = createTimeline(registry);
  let seq = 0;
  const mintGroup = (p: GroupPlan): Group => {
    const group = createGroup({ ...p, id: `${p.id}#${seq++}` }, formation.roleSet);
    timeline.addGroup(group);
    return group;
  };
  // The tile's own group is minted first, so it is on the timeline and can
  // carry the standing bracket's events whether or not the planner happens to
  // mint this plan for itself. A data figure's instances are groups of two
  // whose stations are figure-roles, so it very often does not.
  const group = mintGroup(plan);

  // Stand, figure, stand, for a figure that does not close — with the standing
  // places taken from where the figure starts and from where it leaves
  // everybody, which is the same pair of answers the old bracket read off the
  // chain's `from`. The leading half has to go on **before** the figures:
  // `Timeline.add` wants each dancer's own events in chronological order.
  if (bracket > 0) stand(timeline, group, stationPoses(group), 0, bracket);

  const planner =
    library === undefined ? defaultCyclePlanner : createContraCyclePlanner({ library });
  const ends = new Map<DancerId, EndPose>();
  const threaded: FigureCall[] = [];
  let at: Beat = bracket;
  for (const cycle of cycles) {
    const dance = contraDance({
      slug: "gallery",
      title: "gallery",
      author: "the moves page",
      formation,
      phrases: [{ name: "A1", figures: [...cycle.calls] }],
      ...(cycle.startPlaces === undefined ? {} : { startPlaces: cycle.startPlaces }),
    });
    const planned = planner({
      dance,
      formation,
      registry,
      // The hall is **not** progressed between two cycles, exactly as the wrap
      // tile has always not progressed it: a tile is a picture of two figures
      // meeting, and moving the whole set a place between them would draw the
      // progression twice.
      hall,
      start: at,
      first: true,
      // Where everybody is standing as this time through opens. In the hall
      // the line-up before a dance puts that there; here it has to be said.
      // It is not decoration: a call that leaves somebody out gives them a
      // hold-place instance whose `origins` are read out of exactly this, and
      // an empty map left the two robins of "larks allemande left" standing on
      // their **stations** — a whole couple place, 20 px, from where the dance
      // has them.
      standingAt: standingOn(formation, hall, cycle.startPlaces),
      mintGroup,
    });
    for (const emission of planned.emissions) {
      addEmission(timeline, emission);
      const to = emission.def.ends(emission.group, emission.params);
      for (const id of emission.stations) {
        const dancer = emission.group.members[id];
        const end = to[id];
        if (dancer !== undefined && end) ends.set(dancer, end);
      }
    }
    threaded.push(...dance.phrases[0]!.figures);
    at += danceBeatsOf(cycle.calls);
  }

  if (bracket > 0) stand(timeline, group, only(ends, group), at, bracket);

  return { timeline, group, calls: threaded };
}

/** How long a run of calls lasts. */
const danceBeatsOf = (calls: readonly { beats: Beat }[]): Beat =>
  calls.reduce((sum, c) => sum + c.beats, 0);

/** One emission on the timeline, exactly as `createScriptDecider.emitFigure` puts it there. */
function addEmission(timeline: Timeline, emission: CycleEmission): void {
  if (emission.stations.length === 0) return;
  const bindings: Record<StationId, DancerId> = {};
  for (const id of emission.stations) {
    const dancer = emission.group.members[id];
    if (dancer === undefined) {
      throw new Error(`group "${emission.group.id}" has nobody on station "${id}"`);
    }
    bindings[id] = dancer;
  }
  timeline.add({
    kind: "figure",
    group: emission.group.id,
    figure: emission.def.id,
    params: emission.params,
    bindings,
    start: emission.start,
    end: emission.start + emission.params.beats,
  });
}

/** Everybody in `group` standing still at `origins` for `beats`. */
function stand(
  timeline: Timeline,
  group: Group,
  origins: Record<StationId, EndPose>,
  start: Beat,
  beats: Beat,
): void {
  addEmission(timeline, {
    group,
    def: WALK_TO_STATION as AnyFigureDef,
    // `origins` and nothing else: with no `to` and no `endPlaces`, every
    // dancer's end pose *is* their start pose, which is what standing means.
    params: withDefaults(WALK_TO_STATION, { origins }, beats),
    stations: group.stations.map((s) => s.id),
    start,
  });
}

/**
 * Where every dancer in the hall stands at the top of a time through, in world
 * px: the cycle's own first places, or the formation's stations.
 *
 * The same answer `planCycle`'s own `firstPlaces` computes, read off
 * `groupsFor("hands-four", …)` for the same reason — a waiting couple's wait
 * stations are not lattice homes, and a becket dance's `startPlaces` reaches
 * them by the `WL`/`WR` ids `wait-out` uses.
 */
function standingOn(
  formation: Formation,
  hall: HallState,
  startPlaces: Spots | undefined,
): Map<DancerId, EndPose> {
  const standing = new Map<DancerId, EndPose>();
  for (const set of hall.sets) {
    for (const plan of formation.groupsFor(HANDS_FOUR_GROUP, set)) {
      for (const station of plan.stations) {
        const dancer = plan.members[station.id];
        if (dancer === undefined) continue;
        const place = startPlaces?.[station.id] ?? { p: station.p, facing: station.facing };
        standing.set(dancer, {
          p: framePoint(plan.frame, place.p),
          facing: frameAngle(plan.frame, place.facing),
        });
      }
    }
  }
  return standing;
}

/** Where a group's stations are, in world px: where its dancers start. */
function stationPoses(group: Group): Record<StationId, EndPose> {
  const out: Record<StationId, EndPose> = {};
  for (const station of group.stations) {
    out[station.id] = {
      p: framePoint(group.frame, station.p),
      facing: frameAngle(group.frame, station.facing),
    };
  }
  return out;
}

/** The ends of the dancers on `group`'s stations, keyed by station. */
function only(ends: ReadonlyMap<DancerId, EndPose>, group: Group): Record<StationId, EndPose> {
  const out: Record<StationId, EndPose> = {};
  for (const station of group.stations) {
    const dancer = group.members[station.id];
    const end = dancer === undefined ? undefined : ends.get(dancer);
    if (end) out[station.id] = end;
  }
  return out;
}

/**
 * The hall a tile dances in: **one minor set**, and whatever the formation
 * needs around it, stood so the minor set's frame is the world's origin.
 *
 * Duple improper makes a minor set out of two couples, which is the brief's
 * "one two-couple set". Becket refuses a set of fewer than four couples — its
 * minor set is two couples side by side facing two more across the way — so it
 * gets four, of which two wait out at the ends of the line. The extra two are
 * in the timeline and are not drawn: {@link tileDancers} is the tile's own
 * four.
 *
 * The count is found by asking rather than by naming formations, so a third
 * contra formation (M7's proper) needs nothing here.
 */
function tileHall(formation: Formation): { hall: HallState; plan: GroupPlan } {
  const couples = minCouples(formation);
  const at = (centre: [number, number]): { hall: HallState; plan: GroupPlan } => {
    const hall = createHall(formation, [{ id: "set0", couples, centre, axis: AXIS }]);
    const plan = formation.groupsFor(HANDS_FOUR_GROUP, hall.sets[0]!).find((p) => p.kind === "set");
    if (plan === undefined) {
      throw new Error(`formation "${formation.id}" has no minor set at ${String(couples)} couples`);
    }
    return { hall, plan };
  };
  // `groupsFor`'s frames are a rigid translation of the set's own, so the
  // offset measured from the origin is exactly the offset to stand back by.
  const centred = at([0, 0]).plan.frame.centre;
  return at([-centred[0]!, -centred[1]!]);
}

/** The smallest number of couples this formation will make a minor set out of. */
function minCouples(formation: Formation): number {
  for (let n = 2; n <= 8; n++) {
    try {
      const hall = createHall(formation, [{ id: "set0", couples: n, centre: [0, 0], axis: AXIS }]);
      if (formation.groupsFor(HANDS_FOUR_GROUP, hall.sets[0]!).some((p) => p.kind === "set")) {
        return n;
      }
    } catch {
      // A formation that refuses a short line says so by throwing; try a longer one.
    }
  }
  throw new Error(`formation "${formation.id}" makes no minor set in a line of eight or fewer`);
}

/**
 * The registry and the library one engine runs on, built once per engine and
 * per override map.
 *
 * `contraDataEngine()` interprets five definitions and builds a registry, and
 * the gallery asks for a tile fifty-odd times; the pair is a pure function of
 * its two arguments, so building it once per distinct pair of arguments is the
 * same answer for a fraction of the work.
 */
const engineCache = new Map<string, { registry: FigureRegistry; library?: Library }>();
function engineHalves(
  engine: EngineChoice,
  overrides: FigureDefaultsOverride,
): { registry: FigureRegistry; library?: Library } {
  const key = `${engine}|${JSON.stringify(overrides)}`;
  let halves = engineCache.get(key);
  if (halves === undefined) {
    halves =
      engine === "new"
        ? contraDataEngine([], overrides)
        : { registry: createContraRegistry([], overrides) };
    engineCache.set(key, halves);
  }
  return halves;
}

/** The first call of this figure anywhere in the ten demo dances. */
function firstCallOf(figure: string): { dance: Dance; call: FigureCall } | undefined {
  return callsOf(figure, DEMO_DANCES)[0];
}

/**
 * Where a parameter row is danced: the call it came out of, when it came out of
 * the record, and otherwise the definition's own first call — which is only
 * being asked for the **formation** and the caller's words, because the row's
 * own parameters replace the call's.
 */
function variantCallOf(
  figure: string,
  variant: TileVariant,
): { dance: Dance; call: FigureCall } | undefined {
  if (variant.dance === undefined) return firstCallOf(figure);
  const dance = ALL_DANCES.find((each) => each.slug === variant.dance);
  return (dance === undefined ? undefined : callsOf(figure, [dance])[0]) ?? firstCallOf(figure);
}

/**
 * Every call of this figure in these dances, **concurrent branches included**.
 *
 * A `while` branch is an ordinary call (M8) and a figure only ever called in one
 * — Fatal Attraction's larks going forward while the robins cast back — would
 * otherwise have no formation and no caller's words to draw its tile with.
 */
export function callsOf(
  figure: string,
  dances: readonly Dance[],
): { dance: Dance; call: FigureCall }[] {
  const out: { dance: Dance; call: FigureCall }[] = [];
  for (const dance of dances) {
    for (const phrase of dance.phrases) {
      for (const parent of phrase.figures) {
        for (const call of concurrentCalls(parent)) {
          if (call.figure === figure) out.push({ dance, call });
        }
      }
    }
  }
  return out;
}

/** A call's tuning without the places threaded into it. */
function withoutFrom(params: object | undefined): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(params ?? {}) };
  delete rest["from"];
  return rest;
}

const listed = (call: FigureCall, text: string, group: Group, describe?: string): GalleryCall => {
  const texts = textsFor(call, group);
  return {
    figure: call.figure,
    beats: call.beats,
    call: text,
    ...(describe === undefined ? {} : { describe }),
    ...(texts === undefined ? {} : { texts }),
    params: withoutFrom(call.params),
  };
};

/**
 * This call's four texts, resolved.
 *
 * The **threaded** parameters, `from` and all — that is the difference between
 * "you are back where you started" and a landmark computed from the stations a
 * dance has long since left. `withDefaults` is what the decider hands a figure,
 * so the row reads exactly what the hall would.
 */
function textsFor(call: FigureCall, group: Group): FigureTexts | undefined {
  const def = textRegistry().get(call.figure);
  return resolveFigureText(call.figure, withDefaults(def, call.params, call.beats), group);
}

/**
 * One registry for every text this module resolves; building one is not free.
 *
 * The **coded** figures, plus only those definitions that have no coded twin
 * (M6's `pull-by`), which have no other way to say how many beats they take or
 * what a caller says for them. Deliberately not the whole data library: the
 * `{where}` landmark asks a figure where it leaves the four dancers of a
 * hands-four group, and a data gatherer's `anchor: "meet"` refuses anything but
 * a pair. The migrated five keep answering that question through their coded
 * twins, exactly as they did before M6.
 */
let textRegistryCache: FigureRegistry | undefined;
function textRegistry(): FigureRegistry {
  textRegistryCache ??= createContraRegistry(
    contraDataFigures().filter((def) => dataOnlyFigureIds().includes(def.id)),
  );
  return textRegistryCache;
}

/**
 * Whether one instance of a figure leaves everybody where it found them, to
 * 0.01 px — the closure tolerance the dances are checked to.
 *
 * Measured off the run itself rather than off the chain's threaded places: the
 * pose at the top of the second instance against the pose at the top of the
 * first is the same question, asked of whatever actually happened.
 *
 * A figure that does not close is a figure that progresses, and looping it on
 * its own middle instance has to jump back somewhere; the tile says so.
 */
function closes(run: TileRun, beats: Beat): boolean {
  for (const station of run.group.stations) {
    const dancer = run.group.members[station.id];
    if (dancer === undefined) continue;
    const a = poseAt(run.timeline, dancer, 0).p;
    const b = poseAt(run.timeline, dancer, beats).p;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 0.01) return false;
  }
  return true;
}
