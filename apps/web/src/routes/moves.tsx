import type { Beat, Clock, Vec2 } from "@caller/core";
import { createClock } from "@caller/core";
import type { DancerId, Group } from "@caller/choreo";
import { CONTRA_ROLES } from "@caller/contra";
import type { Person, Renderer } from "@caller/hall";
import { FONT, GLYPH_H, createPerson, createRenderer, drawText } from "@caller/hall";
import type { CSSProperties, JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GalleryTile, TileMetric } from "../galleryTiles.js";
import {
  DEFAULT_ZOOM,
  FLOOR_COLOUR,
  GALLERY_ZOOMS,
  SOLO_ZOOM,
  galleryTiles,
  groupedTiles,
  maxTileWorld,
  tileMetrics,
} from "../galleryTiles.js";
import { hallFrame, seedOf } from "../hallFrame.js";

/**
 * The Moves tab: every figure the registry holds and every figure-to-figure
 * seam the ten demo dances dance, each looping in a real group of four, all
 * driven from one beat so they can be compared at the same instant.
 *
 * Every tile reads a `Timeline` with `poseAt`, exactly as the hall does. The
 * page never calls `FigureDef.sample`, so a figure that looks wrong here looks
 * wrong on the Stage tab too — which is the whole point of the gallery.
 *
 * One move to a row, never a grid (U2): the tile on the left in a slot as wide
 * as the widest world in the gallery, so every set stands on the same axis and
 * the writing beside them starts in the same column; the id, the call, the
 * figure's own `describe` and the motion oracle's numbers on the right. Each
 * seam is filed in the same row shape under the figure it comes out of, so the
 * page reads as one move and then every way out of it.
 *
 * Deep links, which are what a review is conducted in:
 *
 * - `#/moves` — everything.
 * - `#/moves/<figure-id>` — one figure alone, at 4&times;.
 * - `#/moves/seam/<a>--<b>` — one seam alone, at 4&times;.
 * - `?beat=<n>` freezes; `?zoom=<n>`; `?speed=<n>`; `?trails=1`;
 *   `?strip=1&step=<beats>` shows the one-frame-per-step strip;
 *   `?bare=1` renders only the canvas, for screenshots.
 */

/** The tempo the gallery loops at, matching the pair page's plain clock. */
const BPM = 112;

/** How long the shared scrubber is: one time through of a dance. */
const SCRUB_BEATS = 64;

/** The speeds the gallery offers. */
const SPEEDS = [0.25, 0.5, 1] as const;

/** Beats each side of a seam that a seam strip covers. */
export const SEAM_STRIP_BEATS = 4;

/** The most cells a strip draws, however long the figure is. */
export const MAX_STRIP_CELLS = 32;

/** The strip's step on the page. The e2e strips ask for half a beat. */
const DEFAULT_STRIP_STEP = 1;

/** Ink for the beat number under each strip cell, in the hall's own font. */
const STRIP_INK = "#3b2a17";

export function MovesPage({
  path,
  params,
}: {
  /** What follows `#/moves`: `""`, `"/balance"`, `"/seam/balance--swing"`. */
  path: string;
  params: URLSearchParams;
}): JSX.Element {
  const tiles = useTiles();
  const solo = soloKey(path);
  const shown = useMemo(
    () => (solo === null ? tiles : tiles.filter((t) => t.key === solo)),
    [tiles, solo],
  );

  const frozen = params.get("beat");
  const bare = params.get("bare") === "1";
  const stripOnly = params.get("strip") === "1";
  const step = Number(params.get("step") ?? DEFAULT_STRIP_STEP) || DEFAULT_STRIP_STEP;

  const [zoom, setZoom] = useState(() => zoomFrom(params.get("zoom"), solo !== null));
  const [speed, setSpeed] = useState(() => speedFrom(params.get("speed")));
  const [trails, setTrails] = useState(params.get("trails") === "1");
  const [beat, setBeat] = useState(() => (frozen === null ? 0 : Number(frozen)));
  const [paused, setPaused] = useState(frozen !== null);
  const [strips, setStrips] = useState<ReadonlySet<string>>(
    () => new Set(stripOnly && solo !== null ? [solo] : []),
  );
  const metrics = useMetrics(shown, bare);

  const clock = useMemo<Clock>(() => {
    const c = createClock(() => performance.now() / 1000, BPM);
    if (frozen !== null) {
      c.setBeat(Number(frozen));
      c.pause();
    }
    return c;
  }, [frozen]);

  useEffect(() => {
    clock.setTempo(BPM * speed);
  }, [clock, speed]);

  // One rAF loop for the whole page: it only ever moves the beat, and every
  // tile draws from that one number.
  useEffect(() => {
    if (paused) return;
    let running = true;
    const tick = (): void => {
      if (!running) return;
      setBeat(clock.beat());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      running = false;
    };
  }, [clock, paused]);

  const togglePlay = useCallback(() => {
    setPaused((was) => {
      if (was) clock.resume();
      else clock.pause();
      return !was;
    });
  }, [clock]);

  const toggleStrip = useCallback((key: string) => {
    setStrips((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (shown.length === 0) {
    return (
      <main className="p-6">
        <p data-testid="moves-missing">
          No move called <code>{solo}</code>. <a href="#/moves">Back to the gallery</a>.
        </p>
      </main>
    );
  }

  if (bare) {
    const tile = shown[0]!;
    return (
      <main className="w-fit">
        {stripOnly ? (
          <TileStrip tile={tile} zoom={zoom} step={step} />
        ) : (
          <TileCanvas tile={tile} beat={beat} zoom={zoom} trails={trails} always />
        )}
      </main>
    );
  }

  const groups = groupedTiles(shown);
  const figures = shown.filter((t) => t.kind === "figure").length;
  const seams = shown.length - figures;
  // The tile column is one width for the whole page: the widest world in the
  // gallery at the current zoom. Every set then stands on the same axis and
  // the writing beside them starts in the same column, which is the whole
  // point of a row — a slot per tile would be a ragged left edge.
  const slot = maxTileWorld(shown).w * zoom;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">Moves</h1>
        <p className="max-w-[80ch] text-sm text-muted-foreground">
          {solo === null
            ? `${String(figures)} figures and ${String(seams)} seams between them, one to a row:`
            : "One move, on its own:"}{" "}
          the tile, what the caller says, what the dancers do in the figure&rsquo;s own words, and
          what the motion oracle measured over the beats the tile loops.
          {solo === null ? " Every seam sits under the figure it comes out of." : ""} A number in{" "}
          <span className="moves-over px-1">this colour</span> is over the bound{" "}
          <code>@caller/contra</code> derives from the library — a thing to look at, not a verdict.
        </p>
      </header>

      <div
        /*
         * Opaque, not 95%: the page ground carries a board grain now, and a
         * translucent shelf let both the grain and whatever row was under it
         * ghost through the controls. The rule under it is what says it is a
         * shelf rather than a gap.
         */
        className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-sm"
        data-testid="moves-controls"
        data-measured={metrics === null ? "0" : "1"}
      >
        <button
          type="button"
          onClick={togglePlay}
          data-testid="moves-play"
          className="min-h-9 rounded border px-3 py-1"
        >
          {paused ? "Play" : "Pause"}
        </button>
        <span className="flex items-center gap-1">
          zoom
          {GALLERY_ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={z === zoom}
              data-testid={`moves-zoom-${String(z)}`}
              className={`min-h-9 rounded border px-2 py-1 ${z === zoom ? "border-current font-semibold" : "opacity-60"}`}
            >
              {z}&times;
            </button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          speed
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={s === speed}
              data-testid={`moves-speed-${String(s)}`}
              className={`min-h-9 rounded border px-2 py-1 ${s === speed ? "border-current font-semibold" : "opacity-60"}`}
            >
              {speedText(s)}
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setTrails((on) => !on)}
          aria-pressed={trails}
          data-testid="moves-trails"
          className={`min-h-9 rounded border px-3 py-1 ${trails ? "border-current font-semibold" : "opacity-60"}`}
        >
          trails
        </button>
        {solo === null ? null : (
          <a href="#/moves" className="min-h-9 rounded border px-3 py-1" data-testid="moves-back">
            all moves
          </a>
        )}
        <label className="flex min-w-[14rem] flex-1 items-center gap-2">
          <span className="w-10 tabular-nums">{(beat % SCRUB_BEATS).toFixed(1)}</span>
          <input
            type="range"
            min={0}
            max={SCRUB_BEATS}
            step={0.05}
            value={beat % SCRUB_BEATS}
            onChange={(e) => {
              const v = Number(e.target.value);
              clock.setBeat(v);
              setBeat(v);
            }}
            data-testid="moves-scrub"
            className="h-9 flex-1"
          />
        </label>
      </div>

      <ol className="moves-list" style={{ "--moves-tile-w": `${String(slot)}px` } as CSSProperties}>
        {groups.map((group) => (
          <li key={group.figure.key} className="moves-group">
            <Row
              tile={group.figure}
              beat={beat}
              zoom={zoom}
              trails={trails}
              strip={strips.has(group.figure.key)}
              step={step}
              onStrip={toggleStrip}
              metrics={metrics?.get(group.figure.key)}
              solo={solo !== null}
            />
            {group.seams.length === 0 ? null : (
              <ol className="moves-seams">
                {group.seams.map((tile) => (
                  <li key={tile.key}>
                    <Row
                      tile={tile}
                      beat={beat}
                      zoom={zoom}
                      trails={trails}
                      strip={strips.has(tile.key)}
                      step={step}
                      onStrip={toggleStrip}
                      metrics={metrics?.get(tile.key)}
                      solo={solo !== null}
                    />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}

/**
 * One move, one row: the looping canvas in the shared left column, everything
 * that is known about it on the right, and its strip under both when it is open.
 */
function Row({
  tile,
  beat,
  zoom,
  trails,
  strip,
  step,
  onStrip,
  metrics,
  solo,
}: {
  tile: GalleryTile;
  beat: Beat;
  zoom: number;
  trails: boolean;
  strip: boolean;
  step: number;
  onStrip: (key: string) => void;
  /** `undefined` until the page has measured; the line says so meanwhile. */
  metrics: TileMetric[] | undefined;
  /** Whether this row is the only one on the page: `#/moves/<key>`. */
  solo: boolean;
}): JSX.Element {
  // A seam row sits under the figure it comes out of, whose own row says what
  // that figure is, so the prose that is new here is the figure it goes into.
  // On its own deep link there is no row above it, so both are shown.
  const described = tile.kind === "seam" && !solo ? tile.calls.slice(-1) : tile.calls;

  return (
    <article
      className="moves-row"
      data-testid="moves-tile"
      data-key={tile.key}
      data-kind={tile.kind}
      data-beats={tile.window.beats}
      data-source={tile.source ?? ""}
      data-formation={tile.formation}
    >
      <div className="moves-row-tile">
        <TileCanvas tile={tile} beat={beat} zoom={zoom} trails={trails} />
      </div>

      <div className="moves-row-head">
        <h2 className="moves-row-title">
          <a href={soloHref(tile)}>{tile.title}</a>
        </h2>
        {tile.calls.map((call, i) => (
          <p key={i} className="moves-row-call">
            <span className="moves-row-callid">{call.figure}</span> {call.call}
            <span className="moves-row-dim">
              {" · "}
              {call.beats} beats
              {paramText(call.params) === "" ? "" : ` · ${paramText(call.params)}`}
            </span>
          </p>
        ))}
        <p className="moves-row-dim">
          {tile.formation}
          {tile.source === undefined ? " · figure defaults" : ` · from ${tile.source}`}
        </p>
        <Metrics tile={tile} metrics={metrics} />
      </div>

      <div className="moves-row-body">
        {described.map((call) => (
          <p key={call.figure} className="moves-row-describe">
            {tile.kind === "seam" ? <b>{call.figure}: </b> : null}
            {call.describe ?? "No description: this figure has no `describe` yet."}
          </p>
        ))}
        {tile.notes.map((note) => (
          <p key={note} className="moves-row-note">
            {note}
          </p>
        ))}
        <p className="moves-row-actions">
          <button type="button" onClick={() => onStrip(tile.key)} aria-pressed={strip}>
            {strip ? "hide strip" : "strip"}
          </button>
          <a href={soloHref(tile)}>loop this one</a>
        </p>
        {strip ? (
          <div className="moves-row-strip">
            <TileStrip tile={tile} zoom={zoom} step={step} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** The oracle's line for one row: six numbers, the ones over a bound marked. */
function Metrics({
  tile,
  metrics,
}: {
  tile: GalleryTile;
  metrics: TileMetric[] | undefined;
}): JSX.Element {
  if (metrics === undefined) {
    return (
      <p className="moves-row-metrics" data-testid="moves-metrics" data-key={tile.key}>
        <span className="moves-row-dim">measuring…</span>
      </p>
    );
  }
  return (
    <p className="moves-row-metrics" data-testid="moves-metrics" data-key={tile.key}>
      {metrics.map((m) => (
        <span key={m.label} className={m.over ? "moves-metric moves-over" : "moves-metric"}>
          <abbr title={m.detail}>{m.label}</abbr> {m.value}
        </span>
      ))}
      {tile.wrapped === true ? (
        <span className="moves-row-dim">
          across the wrap: these measure the tile&rsquo;s own place shift, not the figure
        </span>
      ) : null}
    </p>
  );
}

/**
 * The motion oracle's numbers for every row, measured **after** the page has
 * painted.
 *
 * A sweep at 1/32 beat costs about 9 ms a tile, which is half a second over the
 * whole gallery — cheap enough to do for every row and far too much to do in
 * front of the first paint on a phone. So the rows render with `measuring…` in
 * the slot and fill in on the next tick; `data-measured` on the control bar is
 * how a screenshot waits for them. The bare and strip routes never measure:
 * they draw one canvas for a camera.
 */
function useMetrics(
  tiles: readonly GalleryTile[],
  bare: boolean,
): ReadonlyMap<string, TileMetric[]> | null {
  const [measured, setMeasured] = useState<ReadonlyMap<string, TileMetric[]> | null>(null);
  useEffect(() => {
    if (bare) return;
    let live = true;
    const id = requestAnimationFrame(() => {
      if (!live) return;
      setMeasured(new Map(tiles.map((tile) => [tile.key, tileMetrics(tile)])));
    });
    return () => {
      live = false;
      cancelAnimationFrame(id);
    };
  }, [tiles, bare]);
  return measured;
}

/** The looping canvas of one tile. */
function TileCanvas({
  tile,
  beat,
  zoom,
  trails,
  always = false,
}: {
  tile: GalleryTile;
  beat: Beat;
  zoom: number;
  trails: boolean;
  /** Draw even when the tile is off screen: the bare screenshot route. */
  always?: boolean;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const previousRef = useRef<{ beat: Beat; at: Map<DancerId, Vec2> } | undefined>(undefined);
  const people = useMemo(() => peopleOf(tile.group), [tile]);
  const onScreen = useOnScreen(canvasRef, always);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const renderer = createRenderer(canvas, { world: { ...tile.world, zoom } });
    paintFloor(renderer);
    rendererRef.current = renderer;
    previousRef.current = undefined;
    return () => {
      rendererRef.current = null;
    };
  }, [tile, zoom]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null || !onScreen) return;
    const local = localBeat(tile, beat);
    const previous = previousRef.current;
    // The loop wrapping is a jump, not motion: drop the trails and the velocity
    // rather than drawing a streak across the tile.
    if (previous !== undefined && local < previous.beat) {
      renderer.clearTrails();
      previousRef.current = undefined;
    }
    const drawn = hallFrame(tile.timeline, people, local, {
      trails,
      previous: previousRef.current,
    });
    renderer.render(drawn.frame);
    previousRef.current = { beat: local, at: drawn.at };
    canvasRef.current?.setAttribute("data-ready", "1");
  }, [tile, beat, zoom, trails, people, onScreen]);

  useEffect(() => {
    rendererRef.current?.clearTrails();
  }, [trails]);

  return (
    <canvas ref={canvasRef} data-testid="moves-canvas" data-key={tile.key} className="block" />
  );
}

/** One frame per `step` beats, the beat drawn under each in the hall's font. */
function TileStrip({
  tile,
  zoom,
  step,
}: {
  tile: GalleryTile;
  zoom: number;
  step: number;
}): JSX.Element {
  const people = useMemo(() => peopleOf(tile.group), [tile]);
  const cells = stripCells(tile, step);

  return (
    <div
      className="flex w-fit flex-none gap-1 bg-[#0c0a09] p-2"
      data-testid="moves-strip"
      data-key={tile.key}
      data-cells={cells.length}
    >
      {cells.map((cell) => (
        <StripCell key={cell.label} tile={tile} cell={cell} zoom={zoom} people={people} />
      ))}
    </div>
  );
}

/** Which frames a strip draws: the whole figure, or the beats either side of a seam. */
export function stripCells(tile: GalleryTile, step: number): Array<{ at: Beat; label: string }> {
  const { start, beats } = tile.window;
  const from = tile.seamAt === undefined ? 0 : Math.max(0, tile.seamAt - SEAM_STRIP_BEATS);
  const to = tile.seamAt === undefined ? beats : Math.min(beats, tile.seamAt + SEAM_STRIP_BEATS);
  const span = to - from;
  const used = Math.max(step, span / MAX_STRIP_CELLS);
  const cells: Array<{ at: Beat; label: string }> = [];
  for (let t = from; t < to - 1e-9; t += used) {
    const relative = tile.seamAt === undefined ? t : t - tile.seamAt;
    cells.push({ at: start + t, label: beatText(relative) });
  }
  return cells;
}

function StripCell({
  tile,
  cell,
  zoom,
  people,
}: {
  tile: GalleryTile;
  cell: { at: Beat; label: string };
  zoom: number;
  people: Map<DancerId, Person>;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    delete canvas.dataset["ready"];
    const renderer = createRenderer(canvas, { world: { ...tile.world, zoom } });
    paintFloor(renderer, cell.label);
    renderer.render(hallFrame(tile.timeline, people, cell.at, { trails: false }).frame);
    canvas.dataset["ready"] = "1";
  }, [tile, cell.at, cell.label, zoom, people]);

  return <canvas ref={canvasRef} className="block flex-none" />;
}

/** The people of a gallery group: one per station, seeded off the dancer id. */
function peopleOf(group: Group): Map<DancerId, Person> {
  const people = new Map<DancerId, Person>();
  for (const station of group.stations) {
    const id = group.members[station.id];
    if (id === undefined) continue;
    people.set(
      id,
      createPerson({
        id,
        role: station.role,
        seed: seedOf(id),
        // The ones travel down and get the darker trail, as in the hall.
        ones: station.id.startsWith("1"),
        roleShirts: CONTRA_ROLES,
      }),
    );
  }
  return people;
}

/** A plain floor, and the beat number under it in the hall's own bitmap font. */
function paintFloor(renderer: Renderer, label?: string): void {
  const g = renderer.layers.floor.getContext("2d");
  if (g === null) return;
  g.fillStyle = FLOOR_COLOUR;
  g.fillRect(0, 0, renderer.world.w, renderer.world.h);
  if (label !== undefined) drawText(g, FONT, label, 2, renderer.world.h - GLYPH_H - 2, STRIP_INK);
}

/** Where on a tile's own timeline a page beat falls: its window, looped. */
export function localBeat(tile: GalleryTile, beat: Beat): Beat {
  const { start, beats } = tile.window;
  return start + (((beat % beats) + beats) % beats);
}

/** `""`, `"balance"` or `"balance--swing"` from what follows `#/moves`. */
export function soloKey(path: string): string | null {
  const rest = path.replace(/^\/+/, "");
  if (rest === "") return null;
  if (rest.startsWith("seam/")) return rest.slice("seam/".length);
  return rest;
}

/** The deep link that opens one tile on its own. */
export const soloHref = (tile: GalleryTile): string =>
  tile.kind === "seam" ? `#/moves/seam/${tile.key}` : `#/moves/${tile.key}`;

/** Build the tiles once for the life of the page: they cost a sampling sweep. */
function useTiles(): GalleryTile[] {
  return useMemo(() => galleryTiles(), []);
}

/**
 * Whether an element is on screen, so fifty-odd tiles do not all redraw every
 * animation frame on a phone. `always` is the bare screenshot route, which has
 * one tile and must draw whether the viewport says so or not.
 */
function useOnScreen(ref: React.RefObject<Element | null>, always: boolean): boolean {
  const [seen, setSeen] = useState(always);
  useEffect(() => {
    if (always) return;
    const el = ref.current;
    if (el === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setSeen(entries.some((e) => e.isIntersecting)),
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, always]);
  return seen;
}

function zoomFrom(raw: string | null, solo: boolean): number {
  const n = Number(raw);
  if (GALLERY_ZOOMS.some((z) => z === n)) return n;
  return solo ? SOLO_ZOOM : DEFAULT_ZOOM;
}

function speedFrom(raw: string | null): number {
  const n = Number(raw);
  return SPEEDS.some((s) => s === n) ? n : 1;
}

const speedText = (s: number): string => (s === 0.25 ? "¼×" : s === 0.5 ? "½×" : "1×");

/**
 * A beat as the strip labels it: no trailing zero, and a bare minus for the
 * beats before a seam. The rounding matters — a seam cell lands on the seam
 * through a float sum, and `(-1e-15).toFixed(1)` is the string `"-0.0"`.
 */
export function beatText(beat: Beat): string {
  const rounded = Math.round(beat * 10) / 10;
  const text = (rounded === 0 ? 0 : rounded).toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/**
 * A call's tuning as one short line.
 *
 * Objects are written out rather than `String`ed: a `carried` parameter is a
 * record of which hands come in already joined, and `String({...})` made the
 * row read `carried [object Object]`, which is worse than saying nothing. A
 * value too long to belong on one line is given as its shape instead.
 */
export function paramText(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k} ${paramValue(v)}`)
    .join(", ");
}

/** The most this line will spend on one parameter's value. */
const PARAM_VALUE_CHARS = 40;

function paramValue(value: unknown): string {
  if (value === null || typeof value !== "object") return String(value);
  const written = JSON.stringify(value) ?? "?";
  if (written.length <= PARAM_VALUE_CHARS) return written;
  const keys = Object.keys(value);
  return `{${String(keys.length)} keys: ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""}}`;
}
