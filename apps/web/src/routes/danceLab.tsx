import type { Beat, Clock, Hand, Vec2 } from "@caller/core";
import { createClock } from "@caller/core";
import type { Dance, DancerId } from "@caller/choreo";
import { danceSchedule } from "@caller/choreo";
import type { Renderer } from "@caller/hall";
import { FONT, GLYPH_H, createRenderer, drawText } from "@caller/hall";
import { Card } from "@caller/music";
import type { JSX } from "react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CandidateColumn, CandidateMeasure, DanceCandidateTile } from "../danceCandidates.js";
import {
  DANCE_LAB_SLUGS,
  SHOWN_COUPLES,
  candidateNumbers,
  danceCandidateTiles,
  danceLabSection,
  measureCandidate,
} from "../danceCandidates.js";
import { cardDance } from "../danceCard.js";
import { FLOOR_COLOUR } from "../galleryTiles.js";
import { hallFrame } from "../hallFrame.js";

/**
 * `#/lab/dance/<slug>`: **the dance lab** (M9h) — one dance, its record and two
 * or three candidate readings of where it carries its progression, side by side
 * on one clock over a whole time through and the first beats of the next.
 *
 * The question it exists to ask is the director's E6 and it is a **choreography**
 * question: the engine reseats every dancer at the boundary, the bodies of these
 * five dances end a whole shift away, and no amount of measuring can say where
 * the dance is supposed to carry them. So it is asked the way a caller answers
 * it — by watching. The user's own words (DD60): *"figure out a way to ask me by
 * showing me the dances, maybe alternatives so I can see it. its hard to imagine
 * it all."*
 *
 * The page is the seam lab's shape with the two things this question needs
 * changed. The treatments are **records** rather than engines, because what is
 * being chosen is the dance; and the window is a **whole time through** rather
 * than a seam, because a progression is only visible at the boundary and the
 * window has to run on past it.
 *
 * Under each column: the four oracle numbers at the length being danced, a dot
 * per checked length saying whether that reading is green there, and one line
 * saying what it assumes. **A reading that fails is shown failing** — the user is
 * choosing the choreography, not the green.
 *
 * Nothing writes back. The pick button copies the chosen record's id and shows
 * it; the user tells the director.
 */

/** The tempo the lab loops at, the gallery's own. */
const BPM = 112;

/** The speeds offered; the lab opens slowed, which is what it is for. */
const SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_SPEED = 0.5;

/** The zooms offered. A whole line is tall, so the lab opens smaller than the seam lab. */
const ZOOMS = [1, 2, 3, 4] as const;
const DEFAULT_ZOOM = 2;

/** The slug of `#/lab/dance/<slug>`, `""` for the index, or `null` for another route. */
export function danceLabSlug(path: string): string | null {
  const parts = path.split("/").filter((part) => part.length > 0);
  if (parts[0] !== "lab" || parts[1] !== "dance") return null;
  return parts[2] ?? "";
}

export function DanceLabPage({
  path,
  params,
}: {
  path: string;
  params: URLSearchParams;
}): JSX.Element {
  const slug = danceLabSlug(path);
  if (slug === null || slug === "") return <DanceLabIndex />;
  return <DanceLab slug={slug} params={params} />;
}

/** `#/lab/dance`: the five dances the question is open on. */
function DanceLabIndex(): JSX.Element {
  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4"
      data-testid="dance-lab-index"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">The dance lab</h1>
        <p className="max-w-[90ch] text-sm text-muted-foreground">
          Five dances are finished except for one thing, and it is not something a measurement can
          settle: <b>where does each of them physically carry its progression?</b> The engine
          reseats everybody at the boundary and these five leave their dancers a whole shift away,
          because nothing in the record walks anyone to the new place. Each page below shows the
          record as it stands and two or three readings of where the travel really happens, danced
          side by side on one clock, with every reading&rsquo;s numbers under it. Pick the one that
          looks like the dance.
        </p>
      </header>
      <ul className="flex flex-col gap-2" data-testid="dance-lab-list">
        {DANCE_LAB_SLUGS.map((slug) => {
          const section = danceLabSection(slug);
          if (section === undefined) return null;
          return (
            <li key={slug} className="flex flex-col gap-0.5">
              <a
                href={`#/lab/dance/${slug}`}
                data-testid="dance-lab-link"
                data-slug={slug}
                className="text-base"
              >
                {section.title}
                <span className="moves-row-dim"> &middot; {section.author}</span>
              </a>
              <p className="max-w-[90ch] text-xs text-muted-foreground">
                {section.question} &mdash; {String(section.columns.length - 1)} readings.
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-sm">
        <a href="#/lab">The seam lab</a> &middot; <a href="#/moves">Back to the moves</a>
      </p>
    </main>
  );
}

function DanceLab({ slug, params }: { slug: string; params: URLSearchParams }): JSX.Element {
  const couples = Number(params.get("couples")) || SHOWN_COUPLES;
  const section = useMemo(() => danceLabSection(slug, couples), [slug, couples]);
  const [speed, setSpeed] = useState<number>(() => speedFrom(params.get("speed")));
  const [zoom, setZoom] = useState<number>(() => zoomFrom(params.get("zoom")));
  const [trails, setTrails] = useState(params.get("trails") === "1");
  const frozen = params.get("beat");
  const [paused, setPaused] = useState(frozen !== null);
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tiles = useMemo(
    () => (section === undefined ? [] : danceCandidateTiles(section)),
    [section],
  );
  const window = tiles[0]?.window.beats ?? 1;
  const [beat, setBeat] = useState(() => (frozen === null ? 0 : Number(frozen)));

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

  const pick = useCallback((id: string) => {
    setPicked(id);
    setCopied(false);
    navigator.clipboard?.writeText(id).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, []);

  const measures = useCandidateMeasures(section);

  if (section === undefined) {
    return (
      <main className="p-6">
        <p data-testid="dance-lab-missing">
          No dance called <code>{slug}</code> in the lab.{" "}
          <a href="#/lab/dance">Back to the dance lab</a>.
        </p>
      </main>
    );
  }

  const local = ((beat % window) + window) % window;

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4"
      data-testid="dance-lab-page"
      data-slug={section.slug}
      data-couples={String(section.couples)}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {section.title}
          <span className="moves-row-dim"> &middot; {section.author}</span>
        </h1>
        <p className="max-w-[90ch] text-sm">
          <b>{section.question}</b>
        </p>
        <p className="max-w-[90ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
          Every column is the same record with one reading&rsquo;s clauses written on to it, danced
          at <b>{section.couples} couples</b> over one whole time through and the first eight beats
          of the next, from one clock. The numbers under each are{" "}
          <code>pnpm dance {section.slug}</code>&rsquo;s own, at this length; the dots are every
          length the formation is checked at. <b>A reading that fails is shown failing</b> &mdash;
          what is being chosen is the dance, not the green.
        </p>
        <p className="max-w-[90ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
          {section.contraDb}
        </p>
        <p className="text-sm">
          <a href="#/lab/dance">The other four dances</a> &middot;{" "}
          <a href={`#/dances/${section.slug}`}>this dance&rsquo;s record</a> &middot;{" "}
          <a href="#/lab">the seam lab</a>
        </p>
      </header>

      <div
        className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-sm"
        data-testid="dance-lab-controls"
        data-measured={measures.shown ? "1" : "0"}
        data-swept={measures.done ? "1" : "0"}
      >
        <button
          type="button"
          onClick={togglePlay}
          data-testid="dance-lab-play"
          className="min-h-9 rounded border px-3 py-1"
        >
          {paused ? "Play" : "Pause"}
        </button>
        <Choice
          label="speed"
          options={SPEEDS}
          value={speed}
          onChange={setSpeed}
          text={(s) => (s === 0.25 ? "¼×" : s === 0.5 ? "½×" : "1×")}
        />
        <Choice
          label="zoom"
          options={ZOOMS}
          value={zoom}
          onChange={setZoom}
          text={(z) => `${String(z)}×`}
        />
        <Choice
          label="couples"
          options={section.lines}
          value={section.couples}
          onChange={(n) => {
            globalThis.location.hash = `#/lab/dance/${section.slug}?couples=${String(n)}`;
          }}
          text={(n) => String(n)}
        />
        <button
          type="button"
          onClick={() => setTrails((on) => !on)}
          aria-pressed={trails}
          className={`min-h-9 rounded border px-3 py-1 ${trails ? "border-current font-semibold" : "opacity-60"}`}
        >
          trails
        </button>
        <label className="flex min-w-[14rem] flex-1 items-center gap-2">
          <span className="w-12 text-right tabular-nums" data-testid="dance-lab-beat">
            {local.toFixed(1)}
          </span>
          <input
            type="range"
            min={0}
            max={window}
            step={0.25}
            value={local}
            onChange={(e) => {
              const v = Number(e.target.value);
              clock.setBeat(v);
              setBeat(v);
            }}
            className="h-9 flex-1"
            aria-label="beat"
          />
        </label>
      </div>

      <CallCard
        dance={section.columns[0]!.dance}
        beat={local}
        boundaryAt={tiles[0]?.boundaryAt ?? 0}
        onJump={(to) => {
          clock.setBeat(to);
          setBeat(to);
        }}
      />

      <ol className="lab-variants" data-testid="dance-lab-columns">
        {section.columns.map((column, i) => (
          <Column
            key={column.id}
            column={column}
            tile={tiles[i]!}
            beat={local}
            zoom={zoom}
            trails={trails}
            lines={section.lines}
            couples={section.couples}
            measures={measures.of(column.id)}
            picked={picked === column.id}
            onPick={() => pick(column.id)}
          />
        ))}
      </ol>

      <div className="lab-strips" data-testid="dance-lab-strips">
        <ol className="lab-strip-rows">
          {section.columns.map((column, i) => (
            <li
              key={column.id}
              className="lab-strip-row"
              data-variant={column.letter}
              data-id={column.id}
            >
              <span className="lab-strip-letter" aria-hidden="true">
                {column.letter}
              </span>
              <Strip tile={tiles[i]!} />
            </li>
          ))}
        </ol>
      </div>

      <section className="flex flex-col gap-1" data-testid="dance-lab-pick">
        <h2 className="text-sm font-semibold">Your pick</h2>
        {picked === null ? (
          <p className="text-[0.8125rem] text-muted-foreground">
            Nothing picked yet. Watch the columns, then press <b>pick this one</b> under the reading
            that looks like the dance &mdash; or say none of them, which is also an answer.
          </p>
        ) : (
          <p className="text-[0.8125rem]">
            <code data-testid="dance-lab-picked">{picked}</code> &mdash;{" "}
            {copied ? "copied to the clipboard. " : ""}tell the director this id.
          </p>
        )}
      </section>
    </main>
  );
}

/** One column: the live line, what the reading assumes, its numbers and its dots. */
function Column({
  column,
  tile,
  beat,
  zoom,
  trails,
  lines,
  couples,
  measures,
  picked,
  onPick,
}: {
  column: CandidateColumn;
  tile: DanceCandidateTile;
  beat: Beat;
  zoom: number;
  trails: boolean;
  lines: readonly number[];
  couples: number;
  measures: ReadonlyMap<number, CandidateMeasure>;
  picked: boolean;
  onPick: () => void;
}): JSX.Element {
  const here = measures.get(couples);
  return (
    <li
      className="lab-variant"
      data-testid="dance-lab-column"
      data-id={column.id}
      data-letter={column.letter}
    >
      <div className="lab-variant-tile">
        {tile.error === undefined ? (
          <DanceCanvas tile={tile} beat={beat} zoom={zoom} trails={trails} />
        ) : (
          <p className="dance-lab-broken" data-testid="dance-lab-broken">
            This reading does not plan at {couples} couples: <code>{tile.error}</code>
          </p>
        )}
      </div>
      <h3 className="lab-variant-title">
        <span className="lab-variant-letter">{column.letter}</span> {column.title}
        {column.isRecord ? (
          <span className="lab-rung">the record on disk</span>
        ) : (
          <span className="lab-rung lab-rung-new">candidate</span>
        )}
      </h3>
      <p className="lab-variant-thesis">{column.assumes}</p>
      {column.quotes === undefined ? null : <p className="dance-lab-quote">{column.quotes}</p>}
      {column.source === undefined ? null : (
        <p className="dance-lab-quote">
          <a href={column.source.url} rel="noreferrer">
            {column.source.name}
          </a>
        </p>
      )}
      {column.clauses.length === 0 ? null : (
        <ul className="dance-lab-clauses">
          {column.clauses.map((clause) => (
            <li key={clause}>
              <code>{clause}</code>
            </li>
          ))}
        </ul>
      )}
      <p className="moves-row-metrics" data-testid="dance-lab-metrics" data-id={column.id}>
        {here === undefined ? (
          <span className="moves-row-dim">measuring…</span>
        ) : here.oracles === undefined ? (
          <span className="moves-metric moves-over">did not plan</span>
        ) : (
          candidateNumbers(here.oracles).map((n) => (
            <span key={n.label} className={n.over ? "moves-metric moves-over" : "moves-metric"}>
              <abbr title={n.detail}>{n.label}</abbr> {n.value}
            </span>
          ))
        )}
      </p>
      <p className="dance-lab-dots" data-testid="dance-lab-dots" data-id={column.id}>
        {lines.map((line) => {
          const at = measures.get(line);
          const state = at === undefined ? "unknown" : at.ok ? "pass" : "fail";
          return (
            <span
              key={line}
              className={`dance-lab-dot dance-lab-dot-${state}${line === couples ? " dance-lab-dot-shown" : ""}`}
              data-line={String(line)}
              data-state={state}
              data-shown={line === couples ? "1" : undefined}
              title={dotTitle(line, at)}
            >
              {String(line)}
            </span>
          );
        })}
      </p>
      <p>
        <button
          type="button"
          onClick={onPick}
          data-testid="dance-lab-pick-button"
          data-id={column.id}
          aria-pressed={picked}
          className={`min-h-9 rounded border px-3 py-1 text-sm ${picked ? "border-current font-semibold" : ""}`}
        >
          {picked ? "picked" : "pick this one"}
        </button>
      </p>
    </li>
  );
}

/** What one every-length dot says when you rest on it. */
function dotTitle(line: number, at: CandidateMeasure | undefined): string {
  if (at === undefined) return `${String(line)} couples: not measured yet`;
  if (at.oracles === undefined) return `${String(line)} couples: ${at.error ?? "did not plan"}`;
  const o = at.oracles;
  return (
    `${String(line)} couples — closure ${o.closurePx.toFixed(4)} px · ` +
    `progressed ${o.progressedPx.toFixed(4)} px · reach ${o.maxShort.toFixed(4)} px short · ` +
    `collision ${Number.isFinite(o.minDistancePx) ? o.minDistancePx.toFixed(3) : "—"} px`
  );
}

/**
 * The dance's own card under the control bar — the same `Card` the Stage puts
 * beside the hall, read at the lab's beat, so the call being watched is the
 * bold line and the phrase's fill bar says how far through it the tiles are.
 *
 * It used to be a ruler of figure ids in a line ("A1 allemande 8"), and the
 * user's own words on it were that it was missing so much detail and did not
 * match the dance at all — the caller's words ("BALANCE THE WAVE OF FOUR,
 * ROBINS BY THE RIGHT, NEIGHBOUR BY THE LEFT") are what say what the dance
 * is, and the card is the thing that already prints them. Here it prints
 * **one call per line** (`.dance-lab-card`), because the question the page
 * asks is *which call* carries the travel and a reader jumps to it by
 * clicking its line. The boundary — the beat the next time through starts —
 * is a button under the phrases, where the Stage's card puts the tune.
 */
function CallCard({
  dance,
  beat,
  boundaryAt,
  onJump,
}: {
  dance: Dance;
  beat: Beat;
  boundaryAt: Beat;
  onJump: (to: Beat) => void;
}): JSX.Element {
  const steps = useMemo(() => danceSchedule(dance), [dance]);
  const card = useMemo(() => cardDance(dance), [dance]);
  // A click on a call's line jumps to its start. The card draws the lines
  // and knows nothing of beats to jump to, so the line is found by its phrase
  // and its place in it — the two coordinates a phrase list has — and looked
  // up in the schedule.
  const jumpTo = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const line = target.closest<HTMLElement>(".caller-music-card-figure");
      const row = line?.closest<HTMLElement>("[data-phrase]");
      if (line === null || line === undefined || row === null || row === undefined) return;
      const phrase = row.dataset["phrase"];
      const index = Array.from(row.querySelectorAll(".caller-music-card-figure")).indexOf(line);
      const step = steps.filter((s) => s.phrase === phrase)[index];
      if (step !== undefined) onJump(step.start);
    },
    [steps, onJump],
  );
  return (
    <div className="dance-lab-card" data-testid="dance-lab-ruler" onClick={jumpTo}>
      <Card dance={card} beat={beat}>
        <button
          type="button"
          onClick={() => onJump(boundaryAt)}
          className={`dance-lab-call dance-lab-boundary ${beat >= boundaryAt ? "dance-lab-call-now" : ""}`}
          data-testid="dance-lab-boundary"
        >
          the boundary, beat {String(boundaryAt)}
          {beat >= boundaryAt ? " — the next time through" : ""}
        </button>
      </Card>
    </div>
  );
}

/**
 * The strips: one column's whole time through as still frames, a phrase at a
 * time, in the same columns as every other reading's.
 *
 * The seam lab's own idea, at the scale a dance needs. A seam is twelve beats
 * and gets a frame a beat; a time through is sixty-four or a hundred and
 * twenty-eight, so a frame a beat would be a strip nobody can read. A frame
 * every **eight** beats is a frame per phrase half — the grain a caller thinks
 * in — and it lets the whole dance be read down a column while the tiles above
 * are still moving.
 */
const STRIP_STEP: Beat = 8;

/** The strips draw at 1× whatever the tiles do: a whole line has to fit a row. */
const STRIP_ZOOM = 1;

function Strip({ tile }: { tile: DanceCandidateTile }): JSX.Element {
  const cells = useMemo(() => {
    const out: Beat[] = [];
    for (let t = 0; t < tile.window.beats - 1e-9; t += STRIP_STEP) out.push(t);
    return out;
  }, [tile]);
  if (tile.error !== undefined) {
    return (
      <div className="lab-strip" data-testid="dance-lab-strip" data-id={tile.id} data-cells="0">
        <span className="dance-lab-quote">did not plan</span>
      </div>
    );
  }
  return (
    <div
      className="lab-strip"
      data-testid="dance-lab-strip"
      data-id={tile.id}
      data-cells={cells.length}
    >
      {cells.map((at) => (
        <StripCell key={at} tile={tile} at={at} />
      ))}
    </div>
  );
}

function StripCell({ tile, at }: { tile: DanceCandidateTile; at: Beat }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    delete canvas.dataset["ready"];
    const renderer = createRenderer(canvas, {
      world: { ...tile.world, zoom: STRIP_ZOOM },
      skirts: false,
    });
    paintFloor(renderer, String(at));
    renderer.render(shifted(tile, at, false, undefined).frame);
    canvas.dataset["ready"] = "1";
  }, [tile, at]);
  return <canvas ref={canvasRef} className="block flex-none" />;
}

/** One column's canvas: the whole line, looped over the tile's window. */
function DanceCanvas({
  tile,
  beat,
  zoom,
  trails,
}: {
  tile: DanceCandidateTile;
  beat: Beat;
  zoom: number;
  trails: boolean;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const previousRef = useRef<{ beat: Beat; at: Map<DancerId, Vec2> } | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const renderer = createRenderer(canvas, { world: { ...tile.world, zoom }, skirts: false });
    paintFloor(renderer);
    rendererRef.current = renderer;
    previousRef.current = undefined;
    return () => {
      rendererRef.current = null;
    };
  }, [tile, zoom]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    const local =
      tile.window.start + (((beat % tile.window.beats) + tile.window.beats) % tile.window.beats);
    const previous = previousRef.current;
    // The loop wrapping is a jump, not motion: drop the trails and the velocity
    // rather than drawing a streak the length of the set.
    if (previous !== undefined && local < previous.beat) {
      renderer.clearTrails();
      previousRef.current = undefined;
    }
    const drawn = shifted(tile, local, trails, previousRef.current);
    renderer.render(drawn.frame);
    previousRef.current = { beat: local, at: drawn.at };
    canvasRef.current?.setAttribute("data-ready", "1");
  }, [tile, beat, zoom, trails]);

  useEffect(() => {
    rendererRef.current?.clearTrails();
  }, [trails]);

  return (
    <canvas ref={canvasRef} data-testid="dance-lab-canvas" data-id={tile.id} className="block" />
  );
}

/**
 * One frame of a column, with the tile's own origin taken off every pose.
 *
 * The renderer draws a world centred on its own origin, and a whole line is not
 * centred on anything: `danceAlone` seats the first couple on the origin and
 * runs the rest of the line down +y, so a six-couple line reaches a hundred px
 * one way and nothing the other. The tile carries the middle of what its
 * section really drew (`DanceCandidateTile.origin`, shared across the columns so
 * they are comparable) and this takes it off. Velocities are differences and a
 * constant shift does not touch them, so the quiet motion is unchanged.
 *
 * A **placed** hand (a figure's joined hold, not `'down'`) is a floor point in
 * the same absolute frame as `p` — `PoseSample`'s own contract, "two dancers
 * joining hands compute the same `Hand` from the same figure frame" — so it has
 * to move by the same `[ox, oy]` or the shoulder (hung off the shifted `p`) and
 * the hand it is reaching for land in two different frames. `drawnArms`
 * dutifully clamps the resulting shoulder-to-hand vector to the 15 px reach, so
 * no single arm is ever drawn longer than the contract, but a whole column of
 * dancers were being fed a shoulder-hand mismatch of the tile's own origin (up
 * to ~75 px for these five dances) and every arm within reach of that mismatch
 * maxed out its clamp pointing at the wrong place — which is what read as
 * "arms three body-heights long" on a failing candidate column.
 */
export function shifted(
  tile: DanceCandidateTile,
  beat: Beat,
  trails: boolean,
  previous: { beat: Beat; at: Map<DancerId, Vec2> } | undefined,
): ReturnType<typeof hallFrame> {
  const drawn = hallFrame(tile.timeline, tile.people, beat, { trails, previous });
  const [ox, oy] = tile.origin;
  const shiftHand = (hand: Hand | "down"): Hand | "down" =>
    hand === "down" ? hand : { ...hand, p: [hand.p[0] - ox, hand.p[1] - oy] as Vec2 };
  return {
    at: drawn.at,
    frame: {
      ...drawn.frame,
      people: drawn.frame.people.map((dancer) => ({
        ...dancer,
        pose: {
          ...dancer.pose,
          p: [dancer.pose.p[0] - ox, dancer.pose.p[1] - oy] as Vec2,
          hands: { L: shiftHand(dancer.pose.hands.L), R: shiftHand(dancer.pose.hands.R) },
        },
      })),
    },
  };
}

/** A plain floor, and the beat number under it in the hall's own bitmap font. */
function paintFloor(renderer: Renderer, label?: string): void {
  const g = renderer.layers.floor.getContext("2d");
  if (g === null) return;
  g.fillStyle = FLOOR_COLOUR;
  g.fillRect(0, 0, renderer.world.w, renderer.world.h);
  if (label !== undefined) drawText(g, FONT, label, 2, renderer.world.h - GLYPH_H - 2, STRIP_INK);
}

/** The ink the strips' beat numbers are written in, the Moves page's own. */
const STRIP_INK = "#3b2a17";

/** A row of exclusive buttons, in the seam lab's own idiom. */
function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  text,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  text: (value: T) => string;
}): JSX.Element {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          data-testid={`dance-lab-${label}-${String(option)}`}
          className={`min-h-9 rounded border px-2 py-1 ${option === value ? "border-current font-semibold" : "opacity-60"}`}
        >
          {text(option)}
        </button>
      ))}
    </span>
  );
}

/** One scheduled measurement task's handle, whichever scheduler ran it. */
type WorkHandle = ReturnType<typeof setTimeout> | number;

/**
 * Runs `cb` on the next task — soon, when `eager`, or only when the browser
 * is otherwise idle.
 *
 * The shown length's jobs are few and gate what the page is showing right
 * now, so they run back to back with `setTimeout`. Everything past that is
 * the sweep of every other checked length, which nobody is waiting on: on a
 * slow device (a phone, a loaded CI runner) running it eagerly starves the
 * very click or repaint the page exists to answer, so it runs through
 * `requestIdleCallback` instead, which yields to input and rendering and only
 * spends spare time on it. `{ timeout }` is a ceiling, not a target, so the
 * sweep still finishes rather than starving forever on a page that is never
 * idle.
 */
function scheduleWork(cb: () => void, eager: boolean): WorkHandle {
  if (!eager && typeof requestIdleCallback === "function") {
    return requestIdleCallback(cb, { timeout: 500 });
  }
  return setTimeout(cb, 0);
}

/** Cancels a {@link scheduleWork} task, whichever scheduler it came from. */
function cancelWork(handle: WorkHandle): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
  if (typeof cancelIdleCallback === "function") cancelIdleCallback(handle as number);
}

/**
 * Every column's oracles, at the length being danced first and then at every
 * other checked length, **one measurement per task**.
 *
 * A sweep is expensive — a whole dance planned over two times through per
 * length, about a tenth of a second each, and The Set Monster is checked at
 * eight lengths — so doing them all before the first paint would leave a phone
 * with a blank page for several seconds. The shown length comes first for every
 * column, because that is the row of numbers under the picture; the rest fill in
 * behind it, scheduled idle (see {@link scheduleWork}) so the sweep never gets
 * ahead of what the page actually needs to do, and the dots are grey until it
 * does.
 *
 * `data-measured` and `data-swept` on the control bar are how a screenshot waits
 * for each stage.
 */
function useCandidateMeasures(section: ReturnType<typeof danceLabSection>): {
  of: (id: string) => ReadonlyMap<number, CandidateMeasure>;
  shown: boolean;
  done: boolean;
} {
  const [table, setTable] = useState<ReadonlyMap<string, ReadonlyMap<number, CandidateMeasure>>>(
    new Map(),
  );
  const [stage, setStage] = useState<{ shown: boolean; done: boolean }>({
    shown: false,
    done: false,
  });

  useEffect(() => {
    setTable(new Map());
    setStage({ shown: false, done: false });
    if (section === undefined) return;
    const jobs: { column: CandidateColumn; couples: number }[] = [
      ...section.columns.map((column) => ({ column, couples: section.couples })),
      ...section.lines
        .filter((line) => line !== section.couples)
        .flatMap((line) => section.columns.map((column) => ({ column, couples: line }))),
    ];
    const shownJobs = section.columns.length;
    let live = true;
    let i = 0;
    let pending: ReturnType<typeof setTimeout> | number | undefined;
    const next = (): void => {
      if (!live) return;
      const job = jobs[i];
      if (job === undefined) {
        setStage({ shown: true, done: true });
        return;
      }
      const measure = measureCandidate(job.column.dance, job.couples);
      setTable((was) => {
        const out = new Map(was);
        const mine = new Map(out.get(job.column.id) ?? []);
        mine.set(job.couples, measure);
        out.set(job.column.id, mine);
        return out;
      });
      i += 1;
      if (i === shownJobs) setStage({ shown: true, done: false });
      // The shown length's jobs (one per column) gate `data-measured` and are
      // few, so they run back to back. Every length past that is the sweep —
      // The Set Monster alone is eight lengths of a triple progression, tens
      // of seconds of planning nobody is waiting on — so once the shown length
      // is in, the rest is scheduled idle: whatever the page (a click, a
      // render, a phone's own touch handling) needs runs first, and the sweep
      // fills the grey dots in behind it rather than in front of it.
      pending = scheduleWork(next, i < shownJobs);
    };
    pending = scheduleWork(next, true);
    return () => {
      live = false;
      if (pending !== undefined) cancelWork(pending);
    };
  }, [section]);

  const empty = useMemo(() => new Map<number, CandidateMeasure>(), []);
  return {
    of: (id) => table.get(id) ?? empty,
    shown: stage.shown,
    done: stage.done,
  };
}

function speedFrom(raw: string | null): number {
  const n = Number(raw);
  return SPEEDS.some((s) => s === n) ? n : DEFAULT_SPEED;
}

function zoomFrom(raw: string | null): number {
  const n = Number(raw);
  return ZOOMS.some((z) => z === n) ? n : DEFAULT_ZOOM;
}
