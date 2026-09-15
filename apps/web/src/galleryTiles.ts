import type { Beat } from "@caller/core";
import type {
  AnyFigureDef,
  Dance,
  EndPose,
  FigureCall,
  FigureRegistry,
  Formation,
  Group,
  Station,
  StationId,
  Timeline,
} from "@caller/choreo";
import {
  HANDS_FOUR_GROUP,
  WALK_TO_STATION,
  complementOf,
  createGroup,
  createTimeline,
  frame,
  motionReport,
  poseAt,
  resolveSelector,
  withDefaults,
} from "@caller/choreo";
import type { ContraCall, FigureDefaultsOverride, FigureTexts } from "@caller/contra";
import {
  CONTRA_FIGURE_IDS,
  CONTRA_MOTION_BOUNDS,
  DEMO_DANCES,
  DUPLE_IMPROPER,
  chainCalls,
  contraFigureOf,
  createContraRegistry,
  formationFor,
  resolveFigureText,
} from "@caller/contra";

/**
 * The gallery's data: one tile per figure, one tile per figure-to-figure seam
 * the ten demo dances actually dance, each with a real timeline behind it.
 *
 * Nothing here calls `FigureDef.sample`. A tile owns a `Timeline` built the way
 * the script decider builds one — a group, figure events on it, `walk-to-station`
 * for anybody a `who` leaves out — and the page reads it with `poseAt`, so what
 * the gallery draws is what the hall draws, seam easing and all.
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

/** How often a tile's world is sampled when it is being sized, in beats. */
export const TILE_BOUNDS_STEP = 0.25;

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

/** One tile of the gallery: a figure looping, or one seam between two figures. */
export interface GalleryTile {
  kind: "figure" | "seam";
  /** The deep-link key: a figure id, or `<a>--<b>`. */
  key: string;
  title: string;
  /** The figures this tile runs, in order. */
  calls: readonly GalleryCall[];
  /** The figure a seam tile is filed under: its first figure. */
  under: string;
  formation: string;
  group: Group;
  timeline: Timeline;
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
 * `overrides` is `?chain=`'s route in: a figure named in it dances every tile
 * — its own row and every seam it appears in — at the overridden defaults
 * instead of the shipped ones. See {@link FigureDefaultsOverride}.
 */
export function galleryTiles(overrides: FigureDefaultsOverride = {}): GalleryTile[] {
  return [...figureTiles(overrides), ...seamTiles(overrides)];
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
 * One tile per figure in `createContraRegistry()`: the sixteen contra figures,
 * contra's own `wait-out`, and the engine's `walk-to-station`.
 */
export function figureTiles(overrides: FigureDefaultsOverride = {}): GalleryTile[] {
  const registry = createContraRegistry([], overrides);
  const ids = [...CONTRA_FIGURE_IDS, "wait-out", "walk-to-station"];
  return ids.map((id) => figureTile(id, registry, overrides));
}

/**
 * One tile per distinct `(figure A → figure B)` the ten demo dances dance,
 * including the wrap from a dance's last figure back into its first — a dance
 * is danced twice through, so that seam is danced too.
 */
export function seamTiles(overrides: FigureDefaultsOverride = {}): GalleryTile[] {
  const byKey = new Map<string, GalleryTile>();
  for (const dance of DEMO_DANCES) {
    const flat = dance.phrases.flatMap((p) => p.figures);
    for (let i = 0; i < flat.length; i++) {
      const a = flat[i]!;
      const b = flat[(i + 1) % flat.length]!;
      const key = `${a.figure}--${b.figure}`;
      if (byKey.has(key)) continue;
      byKey.set(key, seamTile(dance, a, b, i + 1 === flat.length, overrides));
    }
  }
  const order = new Map(CONTRA_FIGURE_IDS.map((id, i) => [id as string, i]));
  return [...byKey.values()].sort(
    (x, y) => (order.get(x.under) ?? 99) - (order.get(y.under) ?? 99) || x.key.localeCompare(y.key),
  );
}

/** One figure, run three times over so its take and its release both have a seam. */
function figureTile(
  id: string,
  registry: FigureRegistry,
  overrides: FigureDefaultsOverride = {},
): GalleryTile {
  const def = registry.get(id);
  const found = firstCallOf(id);
  const formation = found === undefined ? DUPLE_IMPROPER : formationFor(found.dance);
  const beats = found?.call.beats ?? def.beats;
  const params = withoutFrom(found?.call.params);
  const callText = found?.call.call ?? def.call;
  const notes: string[] = [];
  const contra = contraFigureOf(id);

  let group: Group;
  let calls: FigureCall[];
  let start: Beat;

  if (contra !== undefined) {
    group = galleryGroup(formation, 4);
    const one: ContraCall = {
      figure: id,
      beats,
      params,
      ...(found?.call.who === undefined ? {} : { who: found.call.who }),
    };
    // Three times over, threaded: the middle one is the tile, so its first beat
    // eases out of the figure before it and its last beat releases into the
    // figure after it. `chainCalls` is what gives each instance its `from`.
    const thrice = chainCalls(formation, [one, one, one], { stations: group.stations }).calls;
    if (closes(group.stations, thrice)) {
      calls = thrice;
      start = beats;
    } else {
      // A figure that progresses walks away from itself: three of them in a row
      // end a couple place or more down the hall, which makes the tile a map of
      // the drift rather than a look at the figure. So the brief's other
      // bracket — stand, figure, stand — with the standing places taken from
      // where the figure starts and where it leaves everybody.
      calls = [
        standCall(thrice[0]!, BRACKET_BEATS),
        thrice[0]!,
        standCall(thrice[1]!, BRACKET_BEATS),
      ];
      start = BRACKET_BEATS;
      notes.push(
        "does not end where it began: bracketed by standing rather than by itself, and the loop jumps back when it wraps",
      );
    }
  } else if (id === "walk-to-station") {
    group = galleryGroup(DUPLE_IMPROPER, 4);
    const one: FigureCall = { figure: id, beats, params };
    calls = [one, one, one];
    start = beats;
    notes.push("the engine's own placeholder: nobody is told to go anywhere, so nobody moves");
  } else {
    // `wait-out` dances in a group of two and is not a `chainCalls` figure, so
    // it runs alone: the seam into it is the start of the timeline.
    group = galleryGroup(formation, 2);
    calls = [{ figure: id, beats, params }];
    start = 0;
    notes.push("runs alone: the engine's own figures are not threaded by chainCalls");
    notes.push("a group of two — the couple waiting out at the end of the line");
  }

  if (found === undefined && contra !== undefined) {
    notes.push(
      "no demo dance calls this figure: it runs from the formation's stations on its own defaults, which is not where a dance would hand it over",
    );
  }

  const shown = calls.find((c) => c.figure === id) ?? calls[0]!;
  return sized({
    kind: "figure",
    key: id,
    title: id,
    calls: [listed(shown, callText, group, def.describe)],
    under: id,
    formation: formation.id,
    group,
    timeline: buildTimeline(group, formation, calls, overrides),
    window: { start, beats },
    world: MIN_TILE_WORLD,
    ...(found === undefined ? {} : { source: found.dance.slug }),
    notes,
  });
}

/** How long the standing bracket around a figure that progresses lasts. */
const BRACKET_BEATS = 4;

/** Everybody standing where `call` found them, for `beats`. */
function standCall(call: FigureCall, beats: Beat): FigureCall {
  const from = (call.params as { from?: Record<StationId, EndPose> } | undefined)?.from ?? {};
  return {
    figure: WALK_TO_STATION.id,
    beats,
    params: { startPlaces: from, endPlaces: from },
  };
}

/** Two figures from one dance, back to back, with the seam in the middle. */
function seamTile(
  dance: Dance,
  a: FigureCall,
  b: FigureCall,
  wrapped: boolean,
  overrides: FigureDefaultsOverride = {},
): GalleryTile {
  const formation = formationFor(dance);
  const group = galleryGroup(formation, 4);
  const registry = createContraRegistry([], overrides);
  const notes = wrapped
    ? [
        "the wrap: this dance's last figure into its first, one time through into the next",
        "the hall re-forms the minor set between the two, and this tile does not: a place shift across this seam is the progression, not a jump",
      ]
    : [];
  return sized({
    kind: "seam",
    key: `${a.figure}--${b.figure}`,
    title: `${a.figure} → ${b.figure}`,
    calls: [a, b].map((c) => {
      const def = registry.get(c.figure);
      return listed(c, c.call ?? def.call, group, def.describe);
    }),
    under: a.figure,
    formation: formation.id,
    group,
    timeline: buildTimeline(group, formation, [a, b], overrides),
    window: { start: 0, beats: a.beats + b.beats },
    world: MIN_TILE_WORLD,
    seamAt: a.beats,
    ...(wrapped ? { wrapped: true } : {}),
    source: dance.slug,
    notes,
  });
}

/**
 * The tile with a world big enough for it: every dancer sampled across the
 * looping window, plus {@link TILE_MARGIN_PX} for the body the pose point only
 * marks the feet of.
 *
 * Per tile rather than one size for all, because a becket dance starts a whole
 * couple place off its stations and a balance moves nobody more than a step:
 * one world big enough for both would draw the balance in the middle of a lot
 * of empty floor. The zoom is shared, so tiles still compare at the same scale.
 */
function sized(tile: GalleryTile): GalleryTile {
  let x = 0;
  let y = 0;
  for (const dancer of tile.timeline.dancers()) {
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
      w: Math.max(MIN_TILE_WORLD.w, 2 * Math.ceil(x + TILE_MARGIN_PX)),
      h: Math.max(MIN_TILE_WORLD.h, 2 * Math.ceil(y + TILE_MARGIN_PX)),
    },
  };
}

/**
 * A timeline holding one group and these calls back to back, built the way the
 * script decider builds one: the selected stations get the figure, everybody
 * else stands where the call found them.
 */
function buildTimeline(
  group: Group,
  formation: Formation,
  calls: readonly FigureCall[],
  overrides: FigureDefaultsOverride = {},
): Timeline {
  const registry = createContraRegistry([], overrides);
  const timeline = createTimeline(registry);
  timeline.addGroup(group);

  let at: Beat = 0;
  for (const call of calls) {
    const def = registry.get(call.figure);
    const selected = resolveSelector(
      call.who,
      formation,
      call.group ?? HANDS_FOUR_GROUP,
      group.stations,
    );
    addEvent(timeline, group, def, withDefaults(def, call.params, call.beats), selected, at);

    const resting = complementOf(group.stations, selected);
    if (resting.length > 0) {
      const here = placesOf(call, resting);
      const stand = withDefaults(
        WALK_TO_STATION,
        { startPlaces: here, endPlaces: here },
        call.beats,
      );
      addEvent(timeline, group, WALK_TO_STATION as AnyFigureDef, stand, resting, at);
    }
    at += call.beats;
  }
  return timeline;
}

function addEvent(
  timeline: Timeline,
  group: Group,
  def: AnyFigureDef,
  params: object & { beats: Beat },
  stations: readonly StationId[],
  start: Beat,
): void {
  if (stations.length === 0) return;
  const bindings: Record<StationId, string> = {};
  for (const id of stations) {
    const dancer = group.members[id];
    if (dancer === undefined) throw new Error(`gallery group has nobody on station "${id}"`);
    bindings[id] = dancer;
  }
  timeline.add({
    kind: "figure",
    group: group.id,
    figure: def.id,
    params,
    bindings,
    start,
    end: start + params.beats,
  });
}

/** Where a call found these stations, frame-local: the `from` `chainCalls` threaded. */
function placesOf(call: FigureCall, stations: readonly StationId[]): Record<StationId, EndPose> {
  const from = (call.params as { from?: Record<StationId, EndPose> } | undefined)?.from;
  const out: Record<StationId, EndPose> = {};
  if (from === undefined) return out;
  for (const id of stations) {
    const place = from[id];
    if (place !== undefined) out[id] = place;
  }
  return out;
}

/** The first call of this figure anywhere in the ten demo dances. */
function firstCallOf(figure: string): { dance: Dance; call: FigureCall } | undefined {
  for (const dance of DEMO_DANCES) {
    for (const phrase of dance.phrases) {
      for (const call of phrase.figures) {
        if (call.figure === figure) return { dance, call };
      }
    }
  }
  return undefined;
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

/** One registry for every text this module resolves; building one is not free. */
let textRegistryCache: FigureRegistry | undefined;
function textRegistry(): FigureRegistry {
  textRegistryCache ??= createContraRegistry();
  return textRegistryCache;
}

/**
 * Whether one instance of a chained figure leaves everybody where it found
 * them, to 0.01 px — the closure tolerance the dances are checked to.
 *
 * A figure that does not close is a figure that progresses, and looping it on
 * its own middle instance has to jump back somewhere; the tile says so.
 */
function closes(stations: readonly Station[], calls: readonly FigureCall[]): boolean {
  const first = (calls[0]?.params as { from?: Record<StationId, EndPose> } | undefined)?.from;
  const second = (calls[1]?.params as { from?: Record<StationId, EndPose> } | undefined)?.from;
  if (first === undefined || second === undefined) return true;
  return stations.every((s) => {
    const a = first[s.id];
    const b = second[s.id];
    if (a === undefined || b === undefined) return true;
    return Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 0.01;
  });
}
