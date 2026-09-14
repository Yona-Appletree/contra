import type { Beat, Clock, Vec2 } from "@caller/core";
import { createClock } from "@caller/core";
import type { DancerId, Group } from "@caller/choreo";
import { CONTRA_ROLES } from "@caller/contra";
import type { Person, Renderer } from "@caller/hall";
import { FONT, GLYPH_H, createPerson, createRenderer, drawText } from "@caller/hall";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GalleryTile } from "../galleryTiles.js";
import {
  DEFAULT_ZOOM,
  DESCRIBE_SLOT,
  FLOOR_COLOUR,
  GALLERY_ZOOMS,
  METRICS_SLOT,
  SLOTS_NOTE,
  SOLO_ZOOM,
  galleryTiles,
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

  const figures = shown.filter((t) => t.kind === "figure");
  const seams = shown.filter((t) => t.kind === "seam");

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">Moves</h1>
        <p className="max-w-[80ch] text-sm text-muted-foreground">
          Every figure, and every seam between two figures the ten dances dance. One group of four,
          the real engine, one beat driving all of them. {SLOTS_NOTE}
        </p>
      </header>

      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 bg-background/95 py-2 text-sm"
        data-testid="moves-controls"
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

      {figures.length === 0 ? null : (
        <Section title="Figures" count={figures.length}>
          {figures.map((tile) => (
            <Tile
              key={tile.key}
              tile={tile}
              beat={beat}
              zoom={zoom}
              trails={trails}
              strip={strips.has(tile.key)}
              step={step}
              onStrip={toggleStrip}
            />
          ))}
        </Section>
      )}

      {seams.length === 0 ? null : (
        <Section title="Seams" count={seams.length}>
          {seams.map((tile) => (
            <Tile
              key={tile.key}
              tile={tile}
              beat={beat}
              zoom={zoom}
              trails={trails}
              strip={strips.has(tile.key)}
              step={step}
              onStrip={toggleStrip}
            />
          ))}
        </Section>
      )}
    </main>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">({count})</span>
      </h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

/** One tile: the looping canvas, what it is, and its strip when it is open. */
function Tile({
  tile,
  beat,
  zoom,
  trails,
  strip,
  step,
  onStrip,
}: {
  tile: GalleryTile;
  beat: Beat;
  zoom: number;
  trails: boolean;
  strip: boolean;
  step: number;
  onStrip: (key: string) => void;
}): JSX.Element {
  return (
    <figure
      className="flex max-w-full flex-none flex-col gap-1"
      data-testid="moves-tile"
      data-key={tile.key}
      data-kind={tile.kind}
      data-beats={tile.window.beats}
      data-source={tile.source ?? ""}
      data-formation={tile.formation}
    >
      <TileCanvas tile={tile} beat={beat} zoom={zoom} trails={trails} />
      <figcaption className="flex max-w-[28rem] flex-col gap-0.5 text-xs">
        <span className="text-sm font-semibold">{tile.title}</span>
        {tile.calls.map((call, i) => (
          <span key={i} className="text-muted-foreground">
            {call.call} &middot; {call.beats} beats
            {paramText(call.params) === "" ? "" : ` · ${paramText(call.params)}`}
          </span>
        ))}
        <span className="text-muted-foreground">
          {tile.formation}
          {tile.source === undefined ? " · figure defaults" : ` · from ${tile.source}`}
        </span>
        {/* F3a's two lines, when F3a lands them. See the note in the header. */}
        <span className="italic opacity-50" data-testid="moves-slots">
          {DESCRIBE_SLOT} &middot; {METRICS_SLOT}
        </span>
        {tile.notes.map((note) => (
          <span key={note} className="text-muted-foreground">
            {note}
          </span>
        ))}
        <span className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onStrip(tile.key)}
            aria-pressed={strip}
            className="min-h-8 rounded border px-2 py-1"
          >
            {strip ? "hide strip" : "strip"}
          </button>
          <a href={soloHref(tile)} className="min-h-8 rounded border px-2 py-1">
            loop this one
          </a>
        </span>
      </figcaption>
      {strip ? (
        <div className="w-full max-w-[90vw] overflow-x-auto">
          <TileStrip tile={tile} zoom={zoom} step={step} />
        </div>
      ) : null}
    </figure>
  );
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

/** A call's tuning as one short line. */
function paramText(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(", ");
}
