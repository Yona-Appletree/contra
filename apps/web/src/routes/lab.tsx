import type { Beat, Clock } from "@caller/core";
import { createClock } from "@caller/core";
import type { CSSProperties, JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GalleryTile, TileMetric } from "../galleryTiles.js";
import { tileMetrics } from "../galleryTiles.js";
import type { LabReach, LabTreatment } from "../labTiles.js";
import { LAB_BEFORE, LAB_SEAMS, LAB_TREATMENTS, labSection } from "../labTiles.js";
import { chainOverridesFromQuery } from "../state/chainQuery.js";
import { Metrics, StripCell, TileCanvas, beatText, peopleOf } from "./moves.js";

/**
 * `#/lab/seam/<a>--<b>`: the **seam lab** (M3, gate G1).
 *
 * One seam of the corpus, danced through the **old** engine and the **new**
 * engine at the same time, from one clock, slowed, looping the four beats
 * before the boundary and the eight after it — with a strip per treatment
 * underneath, the same beats in the same columns, so the two can be read down
 * a column as well as watched side by side.
 *
 * `#/lab` on its own lists the shortlist. Any seam key the corpus has opens,
 * whether it is on that list or not.
 *
 * The route is its own, under the Moves tab: the Moves page is a gallery of
 * every figure and every seam at one scale, and this is two treatments of one
 * seam at a scale big enough to see a hand. Putting it inside `#/moves/...`
 * would have meant a page that ignores most of the Moves page's own controls.
 *
 * What the gate is being asked, beyond "A or B":
 *
 * - the **allemande gathers less than the swing** — it keeps the direction the
 *   turn stopped on and, displaced, lands up to 3.56 px off the place;
 * - the gatherers **settle on the formation's nearest suitable places** rather
 *   than on each dancer's own slot (each dancer's own slot collided in becket:
 *   see `library/kinds/places.ts`).
 *
 * Both are M2's and both are left open on purpose; every seam's page says so
 * under the strips.
 */

/** The tempo the lab loops at, the gallery's own. */
const BPM = 112;

/** The speeds offered; the lab opens slowed, which is what it is for. */
const SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_SPEED = 0.5;

/** The zooms offered for the live tiles. */
const ZOOMS = [2, 3, 4, 6] as const;
const DEFAULT_ZOOM = 4;

/** The strips draw at this zoom whatever the tiles do: a column per beat has to fit. */
const STRIP_ZOOM = 2;

/** The strips' step choices, in beats. */
const STEPS = [1, 0.5] as const;

/** The seam key of `#/lab/seam/<key>`, or `null` for the index. */
export function labSeamKey(path: string): string | null {
  const parts = path.split("/").filter((part) => part.length > 0);
  return parts.length === 3 && parts[0] === "lab" && parts[1] === "seam" ? parts[2]! : null;
}

export function SeamLabPage({
  path,
  params,
}: {
  path: string;
  params: URLSearchParams;
}): JSX.Element {
  const key = labSeamKey(path);
  if (key === null) return <LabIndex />;
  return <SeamLab seamKey={key} params={params} />;
}

/** `#/lab`: the shortlist, and what each seam is for. */
function LabIndex(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4" data-testid="lab-index">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">The seam lab</h1>
        <p className="max-w-[90ch] text-sm text-muted-foreground">
          One seam of the corpus, danced through both engines at once: today&rsquo;s coded figures
          beside the honest-ends treatment, slowed, looping the four beats before the boundary and
          the eight after it, with a strip of each underneath in the same columns. Any seam the
          Moves page lists opens here by its own key; these are the ones worth looking at, and each
          one says how far apart the two treatments actually get before it asks which is right.
        </p>
      </header>
      <ul className="flex flex-col gap-2" data-testid="lab-seam-list">
        {LAB_SEAMS.map((seam) => (
          <li key={seam.key} className="flex flex-col gap-0.5">
            <a
              href={`#/lab/seam/${seam.key}`}
              data-testid="lab-seam-link"
              data-key={seam.key}
              className="text-base"
            >
              {seam.key.replace("--", " → ")}
            </a>
            <p className="max-w-[90ch] text-xs text-muted-foreground">{seam.hint}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <a href="#/moves">Back to the moves</a>
      </p>
    </main>
  );
}

function SeamLab({ seamKey, params }: { seamKey: string; params: URLSearchParams }): JSX.Element {
  const [reach, setReach] = useState<LabReach>(() => reachFrom(params.get("reach")));
  const [speed, setSpeed] = useState<number>(() => speedFrom(params.get("speed")));
  const [zoom, setZoom] = useState<number>(() => zoomFrom(params.get("zoom")));
  const [step, setStep] = useState<number>(() => stepFrom(params.get("step")));
  const [trails, setTrails] = useState(params.get("trails") === "1");
  const frozen = params.get("beat");
  const [paused, setPaused] = useState(frozen !== null);
  const chain = params.get("chain");

  const section = useMemo(() => {
    try {
      return labSection(seamKey, reach, chainOverridesFromQuery(chain));
    } catch {
      return null;
    }
  }, [seamKey, reach, chain]);

  const window = section?.beats ?? 1;
  const [beat, setBeat] = useState(() => (frozen === null ? 0 : Number(frozen) + LAB_BEFORE));

  const clock = useMemo<Clock>(() => {
    const c = createClock(() => performance.now() / 1000, BPM);
    if (frozen !== null) {
      c.setBeat(Number(frozen) + LAB_BEFORE);
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

  const metrics = useLabMetrics(section?.tiles ?? []);

  if (section === null) {
    return (
      <main className="p-6">
        <p data-testid="lab-missing">
          No seam called <code>{seamKey}</code> in the demo corpus.{" "}
          <a href="#/lab">Back to the seam lab</a>.
        </p>
      </main>
    );
  }

  const local = ((beat % window) + window) % window;

  return (
    <main
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4"
      data-testid="lab-page"
      data-seam={section.key}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {section.title}
          <span className="moves-row-dim"> &middot; {section.dance}</span>
        </h1>
        <p className="max-w-[90ch] text-sm text-muted-foreground">
          The same two calls of the same dance, from the same places, over the same beats, driven by
          one clock &mdash; the only difference is which engine planned them. Beat <b>0</b> is the
          boundary and the counts before it are negative. Choose by watching, then read the strips
          down a column. <a href="#/lab">The other seams</a> &middot;{" "}
          <a href={`#/moves/seam/${section.key}`}>this seam in the moves</a> &middot;{" "}
          <a href={`#/dance/${section.dance}`}>dance {section.dance} on the stage</a>
        </p>
        {section.hint === "" ? null : (
          <p className="max-w-[90ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
            {section.hint}
          </p>
        )}
        {/*
         * The number before the question. Two tiles that look alike may be
         * alike to the pixel or may differ by a step somewhere the eye was
         * not; saying which saves the reviewer from deciding by squinting.
         */}
        <p
          className="text-[0.8125rem]"
          data-testid="lab-divergence"
          data-px={section.divergence.px.toFixed(4)}
        >
          {section.divergence.px < 5e-4 && section.divergence.degrees < 5e-4 ? (
            <>
              The two treatments are <b>identical</b> over this window, to 0.000 px and 0.000°.
            </>
          ) : (
            <>
              The two treatments are <b>{section.divergence.px.toFixed(2)} px</b> and{" "}
              <b>{section.divergence.degrees.toFixed(1)}°</b> apart at their worst &mdash;{" "}
              {section.divergence.dancer} at beat {beatText(section.divergence.at)}.
            </>
          )}
        </p>
      </header>

      <div
        className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 text-sm"
        data-testid="lab-controls"
        data-measured={metrics === null ? "0" : "1"}
      >
        <button
          type="button"
          onClick={togglePlay}
          data-testid="lab-play"
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
          label="loop"
          options={["seam", "figure"] as const}
          value={reach}
          onChange={setReach}
          text={(r) => (r === "seam" ? "around the seam" : "the whole second figure")}
        />
        <Choice
          label="strip"
          options={STEPS}
          value={step}
          onChange={setStep}
          text={(s) => (s === 1 ? "a beat" : "½ beat")}
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
          <span className="w-12 text-right tabular-nums" data-testid="lab-beat">
            {beatText(local - LAB_BEFORE)}
          </span>
          <input
            type="range"
            min={0}
            max={window}
            step={0.05}
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

      <ol className="lab-variants">
        {section.tiles.map((tile, i) => (
          <Treatment
            key={tile.key}
            tile={tile}
            treatment={LAB_TREATMENTS[i]!}
            beat={beat}
            zoom={zoom}
            trails={trails}
            metrics={metrics?.get(tile.key)}
          />
        ))}
      </ol>

      <div className="lab-strips" data-testid="lab-strips">
        <ol className="lab-strip-rows">
          {section.tiles.map((tile, i) => (
            <li
              key={tile.key}
              className="lab-strip-row"
              data-variant={LAB_TREATMENTS[i]!.letter}
              data-key={tile.key}
            >
              <span className="lab-strip-letter" aria-hidden="true">
                {LAB_TREATMENTS[i]!.letter}
              </span>
              <Strip tile={tile} cells={labCells(tile, step)} />
            </li>
          ))}
        </ol>
      </div>

      <section className="flex flex-col gap-1" data-testid="lab-open-questions">
        <h2 className="text-sm font-semibold">Still open, and shown here on purpose</h2>
        <ul className="max-w-[90ch] list-disc pl-5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          <li>
            The <b>allemande gathers less than the swing</b>. It keeps the direction the turn
            stopped on and reads only its end <i>spacing</i> off the formation, so a displaced
            allemande lands up to 3.56 px off the place itself. Settling the point as well would
            mean rounding the turn, which the swing does and the allemande&rsquo;s{" "}
            <code>round: &quot;none&quot;</code> deliberately does not &mdash; once and a half means
            once and a half.
          </li>
          <li>
            The gatherers settle on the <b>formation&rsquo;s nearest suitable places</b>, not on
            each dancer&rsquo;s own slot. Own-slot collided in becket: Butter&rsquo;s neighbour
            swing pairs two dancers whose home slots are 32 px apart on opposite lines, and sending
            each to their own put two larks in the same place.
          </li>
        </ul>
      </section>
    </main>
  );
}

/** One treatment: the live tile, its letter and name, what to watch, its numbers. */
function Treatment({
  tile,
  treatment,
  beat,
  zoom,
  trails,
  metrics,
}: {
  tile: GalleryTile;
  treatment: LabTreatment;
  beat: Beat;
  zoom: number;
  trails: boolean;
  metrics: TileMetric[] | undefined;
}): JSX.Element {
  return (
    <li
      className="lab-variant"
      data-testid="lab-treatment"
      data-variant={treatment.letter}
      data-engine={treatment.engine}
      data-key={tile.key}
    >
      <div className="lab-variant-tile">
        <TileCanvas tile={tile} beat={beat} zoom={zoom} trails={trails} always />
      </div>
      <h3 className="lab-variant-title">
        <span className="lab-variant-letter">{treatment.letter}</span> {treatment.name}
        <span className={`lab-rung lab-rung-${treatment.engine}`}>{treatment.engine} engine</span>
      </h3>
      <p className="lab-variant-thesis">{treatment.thesis}</p>
      <Metrics tile={tile} metrics={metrics} />
    </li>
  );
}

/** The strip of one tile over the lab's cells. */
function Strip({
  tile,
  cells,
}: {
  tile: GalleryTile;
  cells: readonly { at: Beat; label: string }[];
}): JSX.Element {
  const people = useMemo(() => peopleOf(tile.group), [tile]);
  return (
    <div
      className="lab-strip"
      data-testid="lab-strip"
      data-key={tile.key}
      data-cells={cells.length}
      style={{ "--lab-cells": cells.length } as CSSProperties}
    >
      {cells.map((cell) => (
        <StripCell key={cell.label} tile={tile} cell={cell} zoom={STRIP_ZOOM} people={people} />
      ))}
    </div>
  );
}

/** A lab strip's frames: every `step` beats of the window, labelled from the seam. */
function labCells(tile: GalleryTile, step: number): { at: Beat; label: string }[] {
  const seamAt = tile.seamAt ?? 0;
  const cells: { at: Beat; label: string }[] = [];
  for (let t = 0; t < tile.window.beats - 1e-9; t += step) {
    cells.push({ at: tile.window.start + t, label: beatText(t - seamAt) });
  }
  return cells;
}

/** A row of exclusive buttons, in the Moves control shelf's own idiom. */
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
          data-testid={`lab-${label}-${String(option)}`}
          className={`min-h-9 rounded border px-2 py-1 ${option === value ? "border-current font-semibold" : "opacity-60"}`}
        >
          {text(option)}
        </button>
      ))}
    </span>
  );
}

/**
 * The oracle's numbers for both treatments, measured after the page has
 * painted, as the Moves page does — a sweep per tile is cheap but not free.
 */
function useLabMetrics(tiles: readonly GalleryTile[]): ReadonlyMap<string, TileMetric[]> | null {
  const [measured, setMeasured] = useState<ReadonlyMap<string, TileMetric[]> | null>(null);
  useEffect(() => {
    let live = true;
    setMeasured(null);
    const id = requestAnimationFrame(() => {
      if (!live) return;
      setMeasured(new Map(tiles.map((tile) => [tile.key, tileMetrics(tile)])));
    });
    return () => {
      live = false;
      cancelAnimationFrame(id);
    };
  }, [tiles]);
  return measured;
}

function reachFrom(raw: string | null): LabReach {
  return raw === "figure" ? "figure" : "seam";
}

function speedFrom(raw: string | null): number {
  const n = Number(raw);
  return SPEEDS.some((s) => s === n) ? n : DEFAULT_SPEED;
}

function zoomFrom(raw: string | null): number {
  const n = Number(raw);
  return ZOOMS.some((z) => z === n) ? n : DEFAULT_ZOOM;
}

function stepFrom(raw: string | null): number {
  const n = Number(raw);
  return STEPS.some((s) => s === n) ? n : 1;
}
