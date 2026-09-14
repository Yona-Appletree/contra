import type { Beat, Clock } from "@caller/core";
import { createClock } from "@caller/core";
import type { PairCall, PairSequenceSample } from "@caller/contra";
import { CONTRA_ROLES, DEMO_PAIR_SEQUENCE } from "@caller/contra";
import type { Frame, Person, Renderer, World } from "@caller/hall";
import { createPerson, createRenderer } from "@caller/hall";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** The tempo the spike ran at; M9 hands the clock to the tune instead. */
const BPM = 112;

/** The zooms the page offers. 6x is the upper bound the user asked for. */
const ZOOMS = [1, 2, 3, 4, 6] as const;

/** The zoom the page opens at: "2x is pretty good honestly" (user, gate G1). */
const DEFAULT_ZOOM = 2;

/** The world the pair dances in: the renderer's default, at the chosen zoom. */
const PAIR_WORLD: Omit<World, "zoom"> = { w: 128, h: 88 };

/** One strip cell: big enough for the lines, which are the widest the pair gets. */
const STRIP_WORLD: Omit<World, "zoom"> = { w: 48, h: 30 };

/** A plain floor, no furniture: M4 owns the hall's boards, walls and stage. */
const FLOOR_COLOUR = "#c9a06a";

const sequence = DEMO_PAIR_SEQUENCE;

/**
 * The pair page: the two-dancers spike's 64-beat sequence, played by the
 * figure definitions in `@caller/contra` and drawn by `@caller/hall`.
 *
 * `#/pair?beat=6&zoom=6` freezes one frame, which is what the golden tests
 * screenshot; `#/pair?strip=swing&bare=1` shows one figure's strip on its own,
 * which is the gate G1 artifact.
 */
export function PairPage({ params }: { params: URLSearchParams }): JSX.Element {
  const frozen = params.get("beat");
  const bare = params.get("bare") === "1";
  const [zoom, setZoom] = useState(() => zoomFrom(params.get("zoom")));
  const [beat, setBeat] = useState(() => (frozen === null ? 0 : Number(frozen)));
  const [paused, setPaused] = useState(frozen !== null);
  const [stripOpen, setStripOpen] = useState(params.get("strip") !== null);
  const [stripFigure, setStripFigure] = useState(() =>
    figureIndexFrom(params.get("strip"), frozen === null ? 0 : Number(frozen)),
  );

  const clock = useMemo<Clock>(() => {
    const c = createClock(() => performance.now() / 1000, BPM);
    if (frozen !== null) {
      c.setBeat(Number(frozen));
      c.pause();
    }
    return c;
  }, [frozen]);

  // Play: one rAF loop that only ever moves the beat.
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

  const scrub = useCallback(
    (value: number) => {
      clock.setBeat(value);
      setBeat(value);
    },
    [clock],
  );

  const togglePlay = useCallback(() => {
    setPaused((was) => {
      if (was) clock.resume();
      else clock.pause();
      return !was;
    });
  }, [clock]);

  const sample = sequence.sampleAt(beat);

  if (bare) {
    return (
      <main className="w-fit">
        <FigureStrip index={stripFigure} zoom={zoom} />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-start gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold">The pair</h1>
        <p className="max-w-[80ch] text-sm text-muted-foreground">
          The two-dancers spike&rsquo;s sixty-four beats, played from the figure definitions in{" "}
          <code>@caller/contra</code>: walk in and take two hands, balance, swing, allemande left
          1&frac12;, do-si-do, balance, swing, allemande left once, fall back. The clock is a plain
          one at {BPM} bpm until the music drives it.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <button
          type="button"
          onClick={togglePlay}
          data-testid="pair-play"
          className="rounded border px-3 py-1"
        >
          {paused ? "Play" : "Pause"}
        </button>
        <label className="flex items-center gap-2">
          zoom
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={z === zoom}
              data-testid={`pair-zoom-${String(z)}`}
              className={`rounded border px-2 py-1 ${z === zoom ? "border-current font-semibold" : "opacity-60"}`}
            >
              {z}&times;
            </button>
          ))}
        </label>
        <button
          type="button"
          onClick={() => setStripOpen((open) => !open)}
          aria-pressed={stripOpen}
          data-testid="pair-strip-toggle"
          className="rounded border px-3 py-1"
        >
          {stripOpen ? "Hide figure strip" : "Show figure strip"}
        </button>
      </div>

      <label className="flex w-full max-w-3xl items-center gap-3 text-sm">
        <span className="w-10 tabular-nums">{beat.toFixed(1)}</span>
        <input
          type="range"
          min={0}
          max={sequence.beats}
          step={0.05}
          value={beat % sequence.beats}
          onChange={(e) => scrub(Number(e.target.value))}
          data-testid="pair-scrub"
          className="flex-1"
        />
        <span className="w-14 tabular-nums">/ {sequence.beats}</span>
      </label>

      <PairCanvas beat={beat} zoom={zoom} sample={sample} />

      <p className="text-sm" data-testid="pair-readout">
        {sample.index + 1}. {callText(sample.call)} &middot; beat {sample.t.toFixed(1)} of{" "}
        {sample.call.beats}
      </p>

      {stripOpen ? (
        <section className="flex w-full flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>figure</span>
            {sequence.calls.map((call, i) => (
              <button
                key={`${call.id}-${i}`}
                type="button"
                onClick={() => setStripFigure(i)}
                aria-pressed={i === stripFigure}
                className={`rounded border px-2 py-1 ${i === stripFigure ? "border-current font-semibold" : "opacity-60"}`}
              >
                {callText(call)}
              </button>
            ))}
          </div>
          <div className="w-full overflow-x-auto">
            <FigureStrip index={stripFigure} zoom={zoom} />
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** The live pair, one frame per animation frame. */
function PairCanvas({
  beat,
  zoom,
  sample,
}: {
  beat: Beat;
  zoom: number;
  sample: PairSequenceSample;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const people = usePair();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const renderer = createRenderer(canvas, { world: { ...PAIR_WORLD, zoom } });
    paintFloor(renderer);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
    };
  }, [zoom]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    renderer.render(frameOf(sample, people, beat));
    document.documentElement.dataset["pairReady"] = "true";
  }, [beat, sample, people, zoom]);

  return <canvas ref={canvasRef} data-testid="pair-canvas" className="block" />;
}

/** One frame per beat of one figure — the gate G1 artifact. */
function FigureStrip({ index, zoom }: { index: number; zoom: number }): JSX.Element {
  const call = sequence.calls[index];
  const start = sequence.starts[index];
  const people = usePair();
  if (call === undefined || start === undefined) return <p>no such figure</p>;

  return (
    <div
      className="flex w-fit flex-none gap-1 bg-[#0c0a09] p-2"
      data-testid="pair-strip"
      data-figure={call.id}
    >
      {Array.from({ length: call.beats }, (_, offset) => (
        <StripCell
          key={offset}
          beat={start + offset}
          label={`${offset + 1}`}
          zoom={zoom}
          people={people}
        />
      ))}
    </div>
  );
}

function StripCell({
  beat,
  label,
  zoom,
  people,
}: {
  beat: Beat;
  label: string;
  zoom: number;
  people: { lark: Person; robin: Person };
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    delete canvas.dataset["ready"];
    const renderer = createRenderer(canvas, { world: { ...STRIP_WORLD, zoom } });
    paintFloor(renderer);
    renderer.render(frameOf(sequence.sampleAt(beat), people, beat));
    // The strip tests wait for every cell to have drawn before screenshotting.
    canvas.dataset["ready"] = "1";
  }, [beat, zoom, people]);

  return (
    <figure className="flex flex-none flex-col items-center gap-1">
      <canvas ref={canvasRef} className="block" />
      <figcaption className="text-xs tabular-nums text-[#a8977f]">{label}</figcaption>
    </figure>
  );
}

/**
 * The two dancers. Fixed seeds, so a golden and a strip are reproducible: seed
 * 13 dresses the lark in the palette's plain blue and 15 the robin in its rose,
 * which is as close to the two-dancers spike's own pair as the seeded
 * appearance gets.
 */
function usePair(): { lark: Person; robin: Person } {
  return useMemo(
    () => ({
      lark: createPerson({
        id: "lark",
        role: "lark",
        seed: 63,
        skirt: false,
        roleShirts: CONTRA_ROLES,
      }),
      robin: createPerson({
        id: "robin",
        role: "robin",
        seed: 91,
        skirt: false,
        roleShirts: CONTRA_ROLES,
      }),
    }),
    [],
  );
}

function frameOf(
  sample: PairSequenceSample,
  people: { lark: Person; robin: Person },
  beat: Beat,
): Frame {
  return {
    beat,
    roleSet: CONTRA_ROLES,
    people: [
      {
        person: people.lark,
        pose: sample.lark.pose,
        velocity: sample.lark.velocity,
        // No trails on the pair page: the spike drew none, and an empty list
        // keeps a screenshot a pure function of the beat.
        trail: [],
      },
      {
        person: people.robin,
        pose: sample.robin.pose,
        velocity: sample.robin.velocity,
        trail: [],
      },
    ],
  };
}

function paintFloor(renderer: Renderer): void {
  const g = renderer.layers.floor.getContext("2d");
  if (g === null) return;
  g.fillStyle = FLOOR_COLOUR;
  g.fillRect(0, 0, renderer.world.w, renderer.world.h);
}

/** "Allemande left 1½", from the figure's call text and its parameters. */
function callText(call: PairCall): string {
  const parts: string[] = [call.call];
  if (call.id === "allemande") {
    parts.push(call.params["hand"] === "L" ? "left" : "right");
    parts.push(amountText(call.params["amount"]));
  }
  if (call.id === "swing") parts.push(`${String(call.params["turns"])} turns`);
  return parts.join(" ");
}

function amountText(amount: unknown): string {
  if (amount === 1) return "once";
  if (amount === 1.5) return "1½";
  if (amount === 2) return "twice";
  return String(amount);
}

function zoomFrom(raw: string | null): number {
  const n = Number(raw);
  return ZOOMS.some((z) => z === n) ? n : DEFAULT_ZOOM;
}

/**
 * `strip=swing` or `strip=2`: a figure id or an index into the sequence.
 * Anything else — `strip`, `strip=on` — opens the strip at whatever figure the
 * current beat is in.
 */
function figureIndexFrom(raw: string | null, beat: Beat): number {
  if (raw === null) return sequence.indexAt(beat);
  const byIndex = Number(raw);
  if (raw !== "" && Number.isInteger(byIndex) && byIndex >= 0 && byIndex < sequence.calls.length) {
    return byIndex;
  }
  const byId = sequence.calls.findIndex((call) => call.id === raw);
  return byId < 0 ? sequence.indexAt(beat) : byId;
}
