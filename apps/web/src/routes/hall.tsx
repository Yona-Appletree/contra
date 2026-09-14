import type { Beat, Clock, Vec2 } from "@caller/core";
import { createClock } from "@caller/core";
import type { DancerId } from "@caller/choreo";
import { DEMO_DANCES } from "@caller/contra";
import type { BlitCtx2D, HallWorld, Person, Renderer } from "@caller/hall";
import {
  FONT,
  clearFloorCache,
  clearFurnitureLayer,
  createRenderer,
  drawBubble,
  drawFloor,
  drawFurniture,
  layoutHall,
} from "@caller/hall";
import type { Medley, Player, Tune } from "@caller/music";
import { Card, Notation, createPlayer, medleys, tunes } from "@caller/music";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@caller/ui-base";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createHallPeople, hallFrame } from "../hallFrame.js";
import type { DemoProgram } from "../program.js";
import {
  LOOKAHEAD_BEATS,
  MUSIC_BEATS_PER_ITEM,
  createDemoProgram,
  lineUpStartOf,
  musicBeatOf,
  musicItemEnd,
  positionAt,
  programBeatOf,
  shownMusicBeat,
} from "../program.js";
import { setHallUrl } from "../state/hallUrl.js";

/** The demo hall: two lines, five couples and four (plan Q16). */
const DEMO_LINES: readonly number[] = [5, 4];

/** The zooms the bar offers (director ruling DD20). */
const ZOOMS = [1, 2, 3, 4, 6] as const;

/** The biggest zoom "auto" will choose: "somewhat small" is the look the user asked for. */
const AUTO_MAX_ZOOM = 2;

/**
 * How wide the caller's bubble may get, in characters.
 *
 * M4's default is 22, which is about 100 px of a 268 px hall — over a third
 * of its width, and wide enough to sit on the band at 1× on a phone. 16
 * columns is about 79 px, which clears the fiddler with room to spare and
 * still fits "LONG LINES FORWARD" on a line.
 */
const BUBBLE_MAX_COLS = 16;

/** The tempo slider's ends, in beats per minute. */
const TEMPO_MIN = 96;
const TEMPO_MAX = 124;

/** The theme the demo hall is painted in. */
const THEME = "grange";

/** What the caller says while nobody is dancing, so the bubble is never blank. */
const IDLE_CALL = "";

/**
 * The front page: the hall.
 *
 * Two lines of pixel dancers dance every encoded dance twice through to a set
 * of real tunes, with a caller in the corner calling the figures in a pixel
 * speech bubble, the dance card and the notation following along, and the
 * next dance chosen by the programme rather than by anyone clicking.
 *
 * The beat comes from one clock. Before the first click on play the browser
 * will not let a page make a sound, so a silent clock on `performance.now`
 * runs and the hall dances anyway; the moment the tune starts, the player's
 * clock — a linear function of `AudioContext.currentTime` — takes over and
 * nothing else ever reads a timer (plan AC4).
 */
export function HallPage({
  dance: routeDance,
  tune: routeTune,
  params,
}: {
  dance: string | undefined;
  tune: string | undefined;
  params: URLSearchParams;
}): JSX.Element {
  // Test hooks: `?beat=` freezes one frame for a golden, `?couples=` builds
  // the bigger hall the AC7 perf test measures.
  const frozen = params.get("beat");
  const benchCouples = Number(params.get("couples") ?? "0");
  const lines = useMemo(
    () => (benchCouples > 0 ? [benchCouples, benchCouples] : DEMO_LINES),
    [benchCouples],
  );

  const [danceSlug, setDanceSlug] = useState<string | undefined>(routeDance);
  const [medleySlug, setMedleySlug] = useState(routeTune ?? medleys[0]!.slug);
  const [tempo, setTempo] = useState(112);
  const [playing, setPlaying] = useState(false);
  const [zoomChoice, setZoomChoice] = useState<"auto" | number>(() => zoomFrom(params.get("zoom")));
  const [trails, setTrails] = useState(true);
  const [beat, setBeat] = useState<Beat>(frozen === null ? 0 : Number(frozen));
  const [fitZoom, setFitZoom] = useState(1);
  // The renderer is state rather than a ref so that everything that draws
  // re-runs when a new zoom builds a new one.
  const [renderer, setRenderer] = useState<Renderer | null>(null);

  const world = useMemo<HallWorld>(
    () => layoutHall({ lines: lines.length, couplesPerLine: [...lines] }),
    [lines],
  );
  const program = useMemo<DemoProgram>(
    () => createDemoProgram(world, danceSlug),
    [world, danceSlug],
  );
  const people = useMemo<Map<DancerId, Person>>(() => createHallPeople(program.hall), [program]);
  const medley = useMemo(() => medleyOf(medleySlug), [medleySlug]);
  // Which tune is playing is arithmetic on the beat rather than something the
  // player tells us, so the notation follows the silent clock too: the medley
  // plays each tune `timesThroughEach` times through and then moves on, which
  // is exactly how `Player` chooses its own buffers. It is the *music* beat —
  // the count of dancing beats, with the silent line-ups left out — so a tune
  // always changes between two dances rather than eight beats into one.
  const tune = tuneAt(medley, shownMusicBeat(beat));

  const zoom = zoomChoice === "auto" ? fitZoom : zoomChoice;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const primedRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const previousRef = useRef<{ beat: Beat; at: Map<DancerId, Vec2> } | undefined>(undefined);

  /** The silent clock: what runs until a tune does. */
  const silent = useMemo<Clock>(
    () => createClock(() => performance.now() / 1000, tempo),
    // A new programme starts at beat 0, so the clock starts again with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [program],
  );
  const clockRef = useRef<Clock>(silent);
  /** True while the tune is the clock, so its beat is a music beat (AC4). */
  const musicOnRef = useRef(false);
  /** True while the page wants a tune, whether or not one is sounding. */
  const wantsMusicRef = useRef(false);
  useEffect(() => {
    clockRef.current = silent;
    musicOnRef.current = false;
    previousRef.current = undefined;
  }, [silent]);

  /**
   * What beat of the evening it is.
   *
   * One clock, always — but while a tune plays that clock counts the tune's own
   * beats, which leave the silent line-ups out, so the evening's beat is that
   * count read back through `programBeatOf`. It is still a linear function of
   * `AudioContext.currentTime` (AC4); it is the same line with a step in it
   * where the music stopped.
   */
  const beatNow = useCallback(
    (): Beat =>
      musicOnRef.current
        ? // `Player.play` schedules its first buffer `START_LATENCY` ahead and
          // rebases the clock to match, so for a tenth of a beat after a tune
          // starts its beat is a shade negative. At the start of an item that
          // would read as the *previous* dance's last beat and draw one frame of
          // it, so the evening never goes back past the dance that is playing.
          Math.max(itemStartRef.current, programBeatOf(clockRef.current.beat()))
        : clockRef.current.beat(),
    [],
  );

  /** Where the tune this player is on stops, in its own beats, and in the evening's. */
  const musicEndRef = useRef(0);
  const lineUpAtRef = useRef(0);
  /** Where the dance this tune belongs to starts, in the evening's beats. */
  const itemStartRef = useRef(0);

  /** Stop the tune and hand the evening back to the silent clock at `at`. */
  const goSilent = useCallback(
    (at: Beat): void => {
      playerRef.current?.stop();
      silent.setBeat(at);
      silent.resume();
      clockRef.current = silent;
      musicOnRef.current = false;
      previousRef.current = undefined;
    },
    [silent],
  );

  /** Start the next tune at its own beat 0 and let it be the clock again. */
  const goMusic = useCallback((musicBeat: Beat): void => {
    const player = playerRef.current;
    if (player === null || !primedRef.current) return;
    musicEndRef.current = musicItemEnd(musicBeat);
    lineUpAtRef.current = lineUpStartOf(musicBeat);
    itemStartRef.current = lineUpStartOf(musicBeat) - MUSIC_BEATS_PER_ITEM;
    player.play(musicBeat);
    clockRef.current = player.clock;
    musicOnRef.current = true;
    previousRef.current = undefined;
  }, []);

  // Auto zoom: the biggest of 1× and 2× that fits the space the hall has.
  useEffect(() => {
    const shell = shellRef.current;
    if (shell === null) return;
    const measure = (): void => {
      const wide = shell.clientWidth;
      let best = 1;
      for (const z of ZOOMS) {
        if (z <= AUTO_MAX_ZOOM && world.world.w * z <= wide) best = z;
      }
      setFitZoom(best);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [world]);

  // The renderer, rebuilt whenever the world or the zoom changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    clearFloorCache();
    clearFurnitureLayer();
    setRenderer(createRenderer(canvas, { world: { ...world.world, zoom } }));
    previousRef.current = undefined;
    return () => {
      setRenderer(null);
    };
  }, [world, zoom]);

  useEffect(() => {
    renderer?.clearTrails();
  }, [renderer, trails, program]);

  /** Draw one frame: the hall into the floor layer, then the dancers over it. */
  const draw = useCallback(
    (at: Beat): void => {
      if (renderer === null) return;
      program.decider.advance(at + LOOKAHEAD_BEATS);

      const floor = renderer.layers.floor.getContext("2d") as BlitCtx2D | null;
      if (floor !== null) {
        drawFloor(floor, world, THEME);
        drawFurniture(floor, world, at);
        const call = callAt(program, at);
        if (call !== "") {
          drawBubble(floor, FONT, call, world.caller, {
            world: world.world,
            maxCols: BUBBLE_MAX_COLS,
          });
        }
      }

      const built = hallFrame(program.timeline, people, at, {
        trails,
        previous: previousRef.current,
      });
      renderer.render(built.frame);
      previousRef.current = { beat: at, at: built.at };
      document.documentElement.dataset["hallReady"] = "true";
    },
    [renderer, program, people, world, trails],
  );

  // One frame loop, and it only ever asks the clock what beat it is.
  useEffect(() => {
    if (frozen !== null) {
      clockRef.current.setBeat(Number(frozen));
      clockRef.current.pause();
      draw(Number(frozen));
      return;
    }
    let running = true;
    let lastShown = -1;
    const tick = (): void => {
      if (!running) return;
      // The tune stops at the end of the dance's last time through, the eight
      // line-up beats run on the silent clock, and the next tune starts at its
      // own beat 0 exactly as the next dance does. Without this the tune would
      // loop through the line-up and put the music eight beats out of phase
      // with the dance at every switch.
      if (wantsMusicRef.current && primedRef.current) {
        if (musicOnRef.current) {
          if (clockRef.current.beat() >= musicEndRef.current) goSilent(lineUpAtRef.current);
        } else {
          const next = musicBeatOf(clockRef.current.beat());
          if (next !== null) goMusic(next);
        }
      }
      const now = beatNow();
      draw(now);
      // The card and the notation cursor do not need sixty updates a second.
      if (Math.abs(now - lastShown) >= 1 / 4) {
        lastShown = now;
        setBeat(now);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      running = false;
    };
  }, [draw, frozen, beatNow, goMusic, goSilent]);

  // Keep the address bar on the dance that is actually playing.
  const position = positionAt(program, beat);
  useEffect(() => {
    setHallUrl(position.dance.slug, medleySlug);
  }, [position.dance.slug, medleySlug]);

  const play = useCallback(async (): Promise<void> => {
    let player = playerRef.current;
    if (player === null) {
      const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
      const ctx = AudioCtor === undefined ? undefined : new AudioCtor();
      ctxRef.current = ctx ?? null;
      player = createPlayer(ctx);
      playerRef.current = player;
    }
    await ctxRef.current?.resume();
    await player.load(medley);
    primedRef.current = true;
    player.setTempo(tempo);
    wantsMusicRef.current = true;
    const from = beatNow();
    const musicBeat = musicBeatOf(from);
    // From here the beat is a linear function of `AudioContext.currentTime`
    // and nothing reads a wall clock (AC4) — unless the click landed in a
    // line-up, in which case the silent clock finishes it and the tune comes
    // in at the next dance's own beat 0.
    if (musicBeat === null) goSilent(from);
    else goMusic(musicBeat);
    setPlaying(true);
  }, [medley, tempo, beatNow, goMusic, goSilent]);

  const pause = useCallback((): void => {
    wantsMusicRef.current = false;
    goSilent(beatNow());
    setPlaying(false);
  }, [beatNow, goSilent]);

  useEffect(() => {
    silent.setTempo(tempo);
    if (playing) playerRef.current?.setTempo(tempo);
  }, [tempo, playing, silent]);

  // What a headless test can ask about, since it cannot hear anything (DD12).
  useEffect(() => {
    window.hallDemo = {
      audioState: () => ctxRef.current?.state ?? null,
      primed: () => primedRef.current,
      beat: () => beatNow(),
      // Whether a tune is the clock right now: false through every line-up,
      // which is what makes the line-up silent.
      musicOn: () => musicOnRef.current,
      // Jump the evening to a beat, keeping whichever clock should be running
      // there. A programme item is 136 beats, which is over a minute of
      // wall clock, so this is the only way a headless test can watch a dance
      // switch happen.
      seek: (to: Beat) => {
        const musicBeat = wantsMusicRef.current ? musicBeatOf(to) : null;
        if (musicBeat === null) goSilent(to);
        else goMusic(musicBeat);
      },
      // The bubble is pixels on a canvas, so a test cannot read it; this is
      // the string that was drawn into it.
      call: (at?: Beat) => callAt(program, at ?? clockRef.current.beat()),
      bench: (frames: number) => {
        const times: number[] = [];
        const at = clockRef.current.beat();
        for (let i = 0; i < frames; i++) {
          const t0 = performance.now();
          draw(at + i / 16);
          times.push(performance.now() - t0);
        }
        draw(at);
        return times;
      },
    };
    return () => {
      delete window.hallDemo;
    };
  }, [draw, program, beatNow, goMusic, goSilent]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">The hall</h1>
        <p className="text-sm text-muted-foreground">
          A contra dance that dances itself: real dances, real tunes, a caller who calls.
        </p>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-3 lg:flex-none" ref={shellRef}>
          <canvas
            ref={canvasRef}
            data-testid="hall-canvas"
            className="block max-w-full bg-[#0c0a09] [image-rendering:pixelated]"
          />
          <ControlBar
            dance={position.dance.slug}
            onDance={(slug) => {
              setDanceSlug(slug);
              setBeat(0);
              setPlaying(false);
              wantsMusicRef.current = false;
              musicOnRef.current = false;
              playerRef.current?.stop();
            }}
            medley={medleySlug}
            onMedley={(slug) => {
              setMedleySlug(slug);
              if (playing) void play();
            }}
            tempo={tempo}
            onTempo={setTempo}
            playing={playing}
            onPlay={() => void (playing ? pause() : play())}
            zoom={zoomChoice}
            onZoom={setZoomChoice}
            trails={trails}
            onTrails={setTrails}
          />
        </div>

        <aside className="flex min-w-0 flex-1 flex-col gap-4">
          <div data-testid="hall-card">
            <p className="mb-1 text-sm text-muted-foreground" data-testid="hall-dance-title">
              {position.dance.title} &middot; {position.dance.author}
            </p>
            <Card dance={position.dance} beat={position.danceBeat ?? 0} />
            <p className="mt-1 text-xs text-muted-foreground" data-testid="hall-status">
              {position.liningUp
                ? `Lining up for ${position.next.title}`
                : `Time through ${String(position.timeThrough + 1)} of 2`}
            </p>
          </div>
          <div className="hidden min-w-0 lg:block" data-testid="hall-notation">
            <p className="mb-1 text-sm text-muted-foreground" data-testid="hall-tune">
              {tune.title}
            </p>
            <Notation tune={tune} beat={beat} />
          </div>
        </aside>
      </div>

      <SiteFooter />
    </main>
  );
}

/** The control bar: everything the page lets anybody change, and nothing else. */
function ControlBar(props: {
  dance: string;
  onDance: (slug: string) => void;
  medley: string;
  onMedley: (slug: string) => void;
  tempo: number;
  onTempo: (bpm: number) => void;
  playing: boolean;
  onPlay: () => void;
  zoom: "auto" | number;
  onZoom: (zoom: "auto" | number) => void;
  trails: boolean;
  onTrails: (on: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="hall-controls">
      <Button onClick={props.onPlay} data-testid="hall-play" size="sm">
        {props.playing ? "Pause" : "Play"}
      </Button>

      <Select value={props.dance} onValueChange={props.onDance}>
        <SelectTrigger className="w-[13rem]" data-testid="hall-dance-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DEMO_DANCES.map((d) => (
            <SelectItem key={d.slug} value={d.slug}>
              {d.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={props.medley} onValueChange={props.onMedley}>
        <SelectTrigger className="w-[9rem]" data-testid="hall-tune-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {medleys.map((m) => (
            <SelectItem key={m.slug} value={m.slug}>
              {medleyName(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2" htmlFor="hall-tempo">
        <span className="w-20 tabular-nums text-muted-foreground">{props.tempo} bpm</span>
      </label>
      <input
        id="hall-tempo"
        type="range"
        min={TEMPO_MIN}
        max={TEMPO_MAX}
        step={1}
        value={props.tempo}
        onChange={(e) => props.onTempo(Number(e.target.value))}
        data-testid="hall-tempo"
        className="w-32"
      />

      <span className="flex items-center gap-1">
        <span className="text-muted-foreground">zoom</span>
        <button
          type="button"
          onClick={() => props.onZoom("auto")}
          aria-pressed={props.zoom === "auto"}
          data-testid="hall-zoom-auto"
          className={zoomClass(props.zoom === "auto")}
        >
          auto
        </button>
        {ZOOMS.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => props.onZoom(z)}
            aria-pressed={props.zoom === z}
            data-testid={`hall-zoom-${String(z)}`}
            className={zoomClass(props.zoom === z)}
          >
            {z}&times;
          </button>
        ))}
      </span>

      <button
        type="button"
        onClick={() => props.onTrails(!props.trails)}
        aria-pressed={props.trails}
        data-testid="hall-trails"
        className={zoomClass(props.trails)}
      >
        trails
      </button>
    </div>
  );
}

function SiteFooter(): JSX.Element {
  const base = import.meta.env.BASE_URL;
  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  return (
    <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      <span data-testid="hall-version">{version}</span>
      <a className="underline" href={`${base}spikes/hall/`}>
        Hall spike
      </a>
      <a className="underline" href={`${base}spikes/two-dancers/`}>
        Two-dancers spike
      </a>
      <a className="underline" href="#/pair">
        The pair
      </a>
      <a className="underline" href="https://github.com/Yona-Appletree/contra">
        Source on GitHub
      </a>
      <span>AGPL-3.0-or-later. Dances are their choreographers&rsquo;; tunes are traditional.</span>
    </footer>
  );
}

const zoomClass = (on: boolean): string =>
  `rounded border px-2 py-1 ${on ? "border-current font-semibold" : "opacity-60"}`;

/**
 * What the bubble says on this beat.
 *
 * The utterance covering the beat when there is one — each call starts its
 * figure's `lead` beats early and runs two beats past it (AC9) — and
 * otherwise the last thing the caller said, so the bubble does not blink out
 * between calls. A caller who has just said "balance" is still the reason the
 * hall is balancing.
 */
function callAt(program: DemoProgram, beat: Beat): string {
  const now = program.timeline.utterancesAt(beat);
  // Calls overlap: each one is said four beats before its own figure and runs
  // two beats into it, so at the moment a figure starts the caller is already
  // leading the next one. The bubble shows the call that started first, which
  // is the figure the hall is dancing right now; it gives way to the next as
  // soon as it has run out.
  if (now.length > 0) return now.reduce((a, b) => (a.start <= b.start ? a : b)).text;
  // Backwards from the end: the decider runs a cycle ahead of the play head,
  // so the most recent call is a handful of entries back however long the
  // evening has been going.
  const said = program.timeline.utterances();
  for (let i = said.length - 1; i >= 0; i--) {
    const u = said[i]!;
    if (u.start <= beat) return u.text;
  }
  return IDLE_CALL;
}

const medleyOf = (slug: string): Medley => medleys.find((m) => m.slug === slug) ?? medleys[0]!;

/**
 * The tune a beat falls in: each tune of the medley, `timesThroughEach` times
 * through, then the next, looping. The same arithmetic `Player` does.
 */
export function tuneAt(medley: Medley, beat: Beat): Tune {
  const cycle = Math.floor(beat / 64);
  const per = Math.max(1, medley.timesThroughEach);
  const n = medley.tunes.length;
  const i = ((Math.floor(cycle / per) % n) + n) % n;
  return medley.tunes[i]!;
}

/** "Two reels", "A jig" — the tune set named by what is in it. */
function medleyName(medley: Medley): string {
  const kinds = new Set(medley.tunes.map((t) => t.type));
  const kind = kinds.size === 1 ? `${[...kinds][0]!}s` : "tunes";
  return `${medley.tunes.length} ${medley.tunes.length === 1 ? kind.slice(0, -1) : kind}`;
}

function zoomFrom(raw: string | null): "auto" | number {
  const n = Number(raw);
  return ZOOMS.some((z) => z === n) ? n : "auto";
}

/** Every bundled tune, so a build that drops one fails loudly rather than quietly. */
if (tunes.length < 3) throw new Error("@caller/music: the demo needs at least three tunes");

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    /** What a headless test can ask the page, since it cannot hear it. */
    hallDemo?: {
      audioState: () => string | null;
      primed: () => boolean;
      beat: () => Beat;
      musicOn: () => boolean;
      seek: (to: Beat) => void;
      call: (at?: Beat) => string;
      bench: (frames: number) => number[];
    };
  }
}
