import type { Beat, Clock, Vec2 } from "@caller/core";
import { createClock } from "@caller/core";
import type { Dance, DancerId } from "@caller/choreo";
import { DEMO_DANCES } from "@caller/contra";
import type { BlitCtx2D, HallWorld, Person, Renderer } from "@caller/hall";
import {
  FONT,
  HALL_THEMES,
  clearFloorCache,
  clearFurnitureLayer,
  createRenderer,
  drawBubble,
  drawFloor,
  drawFurniture,
  layoutHall,
} from "@caller/hall";
import type { Medley, Player, Tune } from "@caller/music";
import { Notation, createPlayer, medleys, tunes } from "@caller/music";
import { Popover, usePopoverClose } from "@caller/ui-base";
import type { CSSProperties, JSX, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoveDetail } from "../MoveDetail.js";
import { MoveSheet } from "../MoveSheet.js";
import { MuteButton } from "../MuteButton.js";
import { InfoIcon, Notecard } from "../Notecard.js";
import { TransportBand } from "../TransportBand.js";
import type { DanceMove } from "../danceMoves.js";
import { danceMoves, moveAt } from "../danceMoves.js";
import { createHallPeople, hallFrame } from "../hallFrame.js";
import type { DemoProgram } from "../program.js";
import {
  LOOKAHEAD_BEATS,
  MUSIC_BEATS_PER_ITEM,
  POTATO_BEATS,
  TIMES_THROUGH,
  bandPlaying,
  betweenDancesStatus,
  createDemoProgram,
  demoLines,
  lineUpStartBeat,
  lineUpStartOf,
  musicBeatOf,
  musicItemEnd,
  positionAt,
  programBeatOf,
  shownMusicBeat,
} from "../program.js";
import { engineFromQuery, otherEngine } from "../state/engineQuery.js";
import { engineHash, readLines, readSeed, setHallUrl, startBeatFor } from "../state/hallUrl.js";
import { readMuted, writeMuted } from "../state/muted.js";
import { moveTarget, nextDance, nextMove, prevDance, prevMove } from "../transport.js";
import { useMediaQuery } from "../useMediaQuery.js";

/** The zooms the bar offers (director ruling DD20). */
const ZOOMS = [1, 2, 3, 4, 6] as const;

/**
 * The width at which the page stops stacking and puts the card beside the
 * hall. The same breakpoint Tailwind's `lg:` uses, written out because the
 * zoom arithmetic has to agree with the layout about which one is running —
 * and, since P4, because the move popup's dressing hangs off it too: a bottom
 * sheet below this width, `@caller/ui-base`'s `Popover` at or above it (D6).
 */
const WIDE_QUERY = "(min-width: 1024px)";

/**
 * How much of a wide page the card keeps for itself, and the gap beside it.
 *
 * The card holds four phrase rows of call text and, under them, a whole tune
 * on four staves: below about this the calls wrap to three lines each and the
 * notation stops being readable. So on a laptop the hall gets what is left
 * over rather than everything it can fill, which is what keeps the two columns
 * from turning back into one.
 */
const CARD_MIN_PX = 420;
const COLUMN_GAP_PX = 24;

/**
 * The height of the transport band under the canvas: a 44 px hit area with the
 * spike's own 6 px above and 7 px below (`.stagebar.bare`).
 */
const TRANSPORT_BAND_PX = 57;

/**
 * What sits above and below the hall in the window's own height: the tab bar,
 * the control bar, the transport band in the strip and the gaps between them.
 * "Auto" fits the hall in what is left, so the thing you press play with is
 * never below the fold — a hall two screenfuls tall is not a bigger hall, it
 * is a hall you have to scroll. P3 put the transport *inside* the strip, so
 * the band's own height joined the chrome the zoom has to leave room for (D9).
 */
const HALL_CHROME_PX = 72 + TRANSPORT_BAND_PX;

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

/**
 * The sentinel value for "let the programme's seeded shuffle choose" — the
 * default, and since U4 removed the tune selector, the only choice a visit
 * with no `?tune=` ever makes (T1: "ensure we have more tunes to randomize
 * (I am so sick of soldier's joy)"). Distinct from every real medley slug
 * (`@caller/music`'s slugs are all `kebab-case-words`, never this bare
 * word), so it is safe to store alongside a pinned medley slug and in the
 * `?tune=` URL parameter.
 */
const SHUFFLE_MEDLEY = "shuffle";

/**
 * What the bubble shows when nobody is being said anything: nothing.
 *
 * C3: a call used to keep the bubble showing "the last thing the caller said"
 * for the whole figure it led into, so a two-beat call sat on the bubble for a
 * six- or sixteen-beat figure — "the calls stay around too long... but not
 * until the next call" (the user, 2026-09-14). Now a call's utterance lasts
 * however long it takes to say (`spokenBeats`) plus a short tail, and once it
 * has run out the bubble is this — empty — until the next call leads in. The
 * page never draws a bubble for it (`draw`'s `if (call !== "")`); the only
 * place this name still means anything is the page before the first click on
 * play, when the decider has produced nothing yet to say.
 */
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
  // `?lines=<n>` asks for another set. There is no control for it in the bar:
  // the bar is already one row wider than a phone (U1) and another select
  // would push the tempo slider off the screen, so this is URL-only until the
  // bar is redesigned. Two lines is the shipped hall.
  const lineCount = readLines(params);
  const lines = useMemo(
    () =>
      benchCouples > 0
        ? (Array.from({ length: lineCount }, () => benchCouples) as number[])
        : demoLines(lineCount),
    [benchCouples, lineCount],
  );

  // The seed for the evening's medley shuffle: `?seed=<n>` when given, else
  // the date, so a seeded URL reproduces one evening exactly (T1).
  const seed = readSeed(params);

  // `?engine=new|old` (M3): which of the two engines the hall dances on. `new`
  // — the default since M3 — is the contra cycle planner resolving every call
  // against live set state, with the five migrated gatherers read as data;
  // `old` is the path every golden before M3 was taken against and stays
  // reachable until M11. It is deliberately not a control in the bar: it is a
  // reviewer's switch for a gate, not something a dancer chooses.
  const engine = engineFromQuery(params.get("engine"));

  const [danceSlug, setDanceSlug] = useState<string | undefined>(routeDance);
  // "Shuffle" is the default and, since U4, the only choice ("the music
  // probably just random for now, I don't like the selector" — the control
  // is gone; the seeded shuffle T1 built stays the mechanism): the
  // programme's own seeded shuffle picks the medley for whichever dance is
  // playing. `?tune=<slug>` still pins every dance to one medley for a deep
  // link or a test, resolved once at mount — there is no longer a control
  // that could change it mid-visit.
  const medleySlug = routeTune ?? SHUFFLE_MEDLEY;
  const [tempo, setTempo] = useState(112);
  const [playing, setPlaying] = useState(false);
  // Whether the band is turned down, remembered on its own key across visits
  // (AC4). Not pause: a muted player keeps running at gain 0, so the hall goes
  // on dancing on a beat that is still a linear function of
  // `AudioContext.currentTime`. Picking a dance does not touch it (A2).
  const [muted, setMuted] = useState(readMuted);
  // Which move's popup is open on a phone, by index into this dance's moves
  // (P4). Only the narrow dressing needs page state: the laptop's popover is
  // `@caller/ui-base`'s, which holds its own open flag beside its trigger.
  const [openMove, setOpenMove] = useState<number | null>(null);
  // Which dressing the ⓘ wears (D6): the sheet below the breakpoint, the
  // popover at or above it. The same query the zoom arithmetic reads, so the
  // two cannot disagree about which layout is running.
  const wide = useMediaQuery(WIDE_QUERY);
  // Zoom is automatic (U4: "no size selector. its fine on auto") — the only
  // way to pick a fixed zoom now is the URL, for deep links and goldens.
  const zoomChoice = useMemo<"auto" | number>(() => zoomFrom(params.get("zoom")), [params]);
  const [trails, setTrails] = useState(true);
  const [beat, setBeat] = useState<Beat>(() => startBeatFor(routeDance, params));
  // What the *clock* (not just the React state above) should be seeded to the
  // next time the silent clock is rebuilt — on mount, and whenever picking a
  // new dance rebuilds `program` (U4 requirement 6). `resetToLineUp` below
  // rewinds the *current* clock directly instead, since picking it does not
  // rebuild `program`. `beat`'s own lazy initial value is the same number, on
  // the first render only — after that this ref is only ever written by the
  // handlers below.
  const pendingStartBeatRef = useRef<Beat | null>(beat);
  const [fitZoom, setFitZoom] = useState(1);
  // The renderer is state rather than a ref so that everything that draws
  // re-runs when a new zoom builds a new one.
  const [renderer, setRenderer] = useState<Renderer | null>(null);

  const world = useMemo<HallWorld>(
    () => layoutHall({ lines: lines.length, couplesPerLine: [...lines] }),
    [lines],
  );
  // **A lab dance may not dance at all** (M8). The Stage is where a record is
  // watched while it is being worked out, and a record whose figures are half
  // written throws somewhere inside the planner — which took the whole route
  // down, so the page did not render at all and neither did the note saying
  // why. The evening is built instead, and the reason is said in words above
  // the hall.
  const built = useMemo<{ program: DemoProgram; error?: string }>(() => {
    try {
      return { program: createDemoProgram(world, danceSlug, seed, {}, engine) };
    } catch (error) {
      return {
        program: createDemoProgram(world, undefined, seed, {}, engine),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [world, danceSlug, seed, engine]);
  const program = built.program;
  const people = useMemo<Map<DancerId, Person>>(() => createHallPeople(program.hall), [program]);
  // The programme's own shuffle, read as a `Medley`: `program.tunes` is one
  // concrete tune per dance (each dance's assigned medley's next tune in
  // turn), so this is a real medley whose own tune-cycling arithmetic
  // (`tuneAt`, `Player`'s internal `sequence`) already gives the right tune
  // for the right dance with no further bookkeeping — a dance is exactly
  // `MUSIC_BEATS_PER_ITEM` beats of music, `TIMES_THROUGH` times through the
  // one tune the shuffle gave it.
  const shuffleMedley = useMemo<Medley>(
    () => ({ slug: SHUFFLE_MEDLEY, tunes: [...program.tunes], timesThroughEach: TIMES_THROUGH }),
    [program],
  );
  const medley = useMemo(
    () => (medleySlug === SHUFFLE_MEDLEY ? shuffleMedley : medleyOf(medleySlug)),
    [medleySlug, shuffleMedley],
  );
  // Which tune is playing is arithmetic on the beat rather than something the
  // player tells us, so the notation follows the silent clock too: the medley
  // plays each tune `timesThroughEach` times through and then moves on, which
  // is exactly how `Player` chooses its own buffers. It is the *music* beat —
  // the count of dancing beats, with the silent line-ups left out — so a tune
  // always changes between two dances rather than eight beats into one. This
  // holds for the shuffle medley too: it is a real `Medley`, just one this
  // programme's own seed built rather than one of `@caller/music`'s fixed
  // ones.
  const tune = tuneAt(medley, shownMusicBeat(beat));

  const zoom = zoomChoice === "auto" ? fitZoom : zoomChoice;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
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
  /**
   * True while ▮▮ is holding the evening still (A1, D3).
   *
   * Distinct from `!playing`: before the first ▶ the page is not playing
   * either, and the hall is dancing anyway on the silent clock (the attract
   * mode). Only a real pause sets this, and it is what makes a seek land
   * frozen at its target rather than running on from it.
   */
  const pausedRef = useRef(false);
  useEffect(() => {
    clockRef.current = silent;
    musicOnRef.current = false;
    previousRef.current = undefined;
    // A fresh clock always starts at its own beat 0; when a start beat is
    // pending — the initial mount, or a dance just picked from the bar — seed
    // it there instead, so the evening opens on that dance's own line-up
    // rather than on its dancing beat 0 (U4 requirement 6).
    if (pendingStartBeatRef.current !== null) {
      silent.setBeat(pendingStartBeatRef.current);
      pendingStartBeatRef.current = null;
    }
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

  /**
   * True once the next tune's buffers are scheduled but the silent clock is
   * still the one being read — the four potatoes before a dance.
   */
  const countingInRef = useRef(false);
  /**
   * How many times the band has counted a dance in, so a headless test can tell
   * that it did. Nobody can hear the potatoes from a Playwright run (DD12), so
   * the proxy is the count and the beat it happened on.
   */
  const potatoesRef = useRef(0);
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
      // A seek — or the end of a dance — while the potatoes were counting in
      // throws those away with everything else the player had scheduled.
      countingInRef.current = false;
      previousRef.current = undefined;
    },
    [silent],
  );

  /**
   * Start the next tune, optionally `potatoBeats` of potatoes ahead of it.
   *
   * With potatoes the tune's own buffers are scheduled *now* and start four
   * beats from now, so the clock is not handed over yet: the silent clock goes
   * on carrying the last beats of the interval and `handOver` swaps it for the
   * player's at the dance's own beat 0. Without them (the start of the evening,
   * or a seek that lands inside a dance) the hand-over is immediate, exactly as
   * it was.
   */
  const goMusic = useCallback((musicBeat: Beat, potatoBeats = 0): void => {
    const player = playerRef.current;
    if (player === null || !primedRef.current) return;
    musicEndRef.current = musicItemEnd(musicBeat);
    lineUpAtRef.current = lineUpStartOf(musicBeat);
    itemStartRef.current = lineUpStartOf(musicBeat) - MUSIC_BEATS_PER_ITEM;
    player.play(musicBeat, { potatoBeats });
    if (potatoBeats > 0) {
      potatoesRef.current += 1;
      countingInRef.current = true;
      return;
    }
    countingInRef.current = false;
    clockRef.current = player.clock;
    musicOnRef.current = true;
    previousRef.current = undefined;
  }, []);

  /** Let the tune's own clock take over, now that its first beat has come. */
  const handOver = useCallback((): void => {
    const player = playerRef.current;
    if (player === null) return;
    countingInRef.current = false;
    clockRef.current = player.clock;
    musicOnRef.current = true;
    previousRef.current = undefined;
  }, []);

  /**
   * Jump the evening to a beat, on whichever clock belongs there (D3).
   *
   * The same rule `hallDemo.seek` has always used — with the band on, a target
   * inside a dance goes through `goMusic`, which re-plays the tune from there
   * and keeps the beat a linear function of `AudioContext.currentTime` (AC3);
   * a target in a line-up hands back to the silent clock, because a line-up is
   * silent. The two things P3 adds: a paused evening stays paused (`goSilent`
   * resumes the silent clock, so the freeze is re-applied after it), and the
   * React state that draws the card follows the jump immediately rather than
   * on the frame loop's next quarter-beat.
   *
   * Playing state is untouched: seeking is not starting or stopping the band.
   */
  const seekTo = useCallback(
    (to: Beat): void => {
      const musicBeat = wantsMusicRef.current ? musicBeatOf(to) : null;
      if (musicBeat === null) goSilent(to);
      else goMusic(musicBeat);
      if (pausedRef.current) silent.pause();
      setBeat(to);
    },
    [goMusic, goSilent, silent],
  );

  // Auto zoom: the biggest whole-number zoom whose world fits the width the
  // hall actually has (DD20 — "auto" may pick any of 1/2/3/4/6 by fit). On a
  // phone that width is the viewport, because the stage runs edge to edge; on
  // a laptop it is what is left of the row once the card has its column.
  useEffect(() => {
    const row = rowRef.current;
    if (row === null) return;
    const media = window.matchMedia(WIDE_QUERY);
    const measure = (): void => {
      const wide = media.matches ? row.clientWidth - CARD_MIN_PX - COLUMN_GAP_PX : row.clientWidth;
      const tall = window.innerHeight - HALL_CHROME_PX;
      // 1× always wins if nothing fits: a hall too big for the page is
      // scrolled, never shrunk off its pixel grid.
      let best: number = ZOOMS[0];
      for (const z of ZOOMS) {
        if (world.world.w * z <= wide && world.world.h * z <= tall) best = z;
      }
      setFitZoom(best);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    media.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
    };
  }, [world]);

  // The renderer, rebuilt whenever the world or the zoom changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    clearFloorCache();
    clearFurnitureLayer();
    // The Stage is the one surface that draws skirts (a user ruling of
    // 2026-09-14): they are the big hall's look, and a move example is about
    // the move, not the wardrobe.
    setRenderer(createRenderer(canvas, { world: { ...world.world, zoom }, skirts: true }));
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
        // The band plays while a tune is on and over the four potatoes that
        // count the next dance in, and holds still for the rest of the
        // interval — B3's "band shouldn't be playing when no dancing is
        // happening", on the canvas as well as in the speakers.
        drawFurniture(floor, world, at, { skirts: true, playing: bandPlaying(at) });
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
      // The tune stops at the end of the dance's last time through, the whole
      // between-dances interval runs on the silent clock, and the next tune
      // starts at its own beat 0 exactly as the next dance does. Without this
      // the tune would loop through the interval and put the music 44 beats
      // out of phase with the dance at every switch.
      if (wantsMusicRef.current && primedRef.current) {
        if (musicOnRef.current) {
          if (clockRef.current.beat() >= musicEndRef.current) {
            goSilent(lineUpAtRef.current);
          }
        } else {
          const beat = clockRef.current.beat();
          const next = musicBeatOf(beat);
          if (next !== null) {
            // The dance has begun. Either the potatoes were scheduled four
            // beats ago and the tune is coming in under its own clock now, or
            // this is the first dance of the evening (or a seek) and there is
            // nothing to count in.
            if (countingInRef.current) handOver();
            else goMusic(next);
          } else if (!countingInRef.current) {
            // The potatoes: four beats before the dance, the band picks up and
            // plays it in. `musicBeatOf` is null right through the interval and
            // becomes the next dance's beat 0 exactly `POTATO_BEATS` from here.
            const counting = musicBeatOf(beat + POTATO_BEATS);
            if (counting !== null) goMusic(counting, POTATO_BEATS);
          }
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
  }, [draw, frozen, beatNow, goMusic, goSilent, handOver]);

  // Keep the address bar on the dance that is actually playing. "Shuffle"
  // does not round-trip through `?tune=` — it is the default, so leaving it
  // out is what a URL with no `?tune=` at all already means.
  const position = positionAt(program, beat);
  useEffect(() => {
    setHallUrl(position.dance.slug, medleySlug === SHUFFLE_MEDLEY ? undefined : medleySlug);
  }, [position.dance.slug, medleySlug]);

  /**
   * The dance on the card, as one flat table of moves (D1) — the primitive the
   * notecard, the popup and the transport all read. Memoised per dance object:
   * it costs a registry build and a call resolution per figure, and the card
   * re-renders four times a beat.
   */
  const moves = useMemo(() => danceMoves(position.dance), [position.dance]);
  /** Which move the hall is on and how far through it, or nothing between dances. */
  const current = useMemo(() => {
    const danceBeat = position.danceBeat;
    if (danceBeat === null) return null;
    const move = moveAt(moves, danceBeat);
    if (move === undefined) return null;
    return { index: move.index, progress: (danceBeat - move.start) / move.beats };
  }, [moves, position.danceBeat]);
  /** A tap on a call: its start in the time through the hall is dancing (AC6). */
  const seekMove = useCallback(
    (move: DanceMove): void => {
      seekTo(moveTarget(program, beatNow(), move.index).beat);
    },
    [program, beatNow, seekTo],
  );
  const closeMove = useCallback((): void => {
    setOpenMove(null);
  }, []);
  /**
   * The ⓘ at the end of a call, in whichever dressing this width wears (D6).
   *
   * On a laptop the trigger *is* `@caller/ui-base`'s `Popover` — its panel is
   * the merged-outline chrome, welded to the icon, so the popup grows out of
   * the call it belongs to. On a phone it is a plain button that opens the
   * page's own bottom sheet. The two share `MoveDetail`, and nothing else.
   */
  const renderInfo = useCallback(
    (move: DanceMove): ReactNode =>
      wide ? (
        <Popover
          label="About this move"
          title={`About ${move.call}`}
          placement="bottom-start"
          className="info"
          triggerTestId="notecard-info"
          panelTestId="hall-move-panel"
          panelClassName="move-panel"
          trigger={<InfoIcon />}
        >
          <PopoverMoveDetail
            move={move}
            dance={position.dance}
            onJump={() => {
              seekMove(move);
            }}
          />
        </Popover>
      ) : (
        <button
          type="button"
          className="info"
          aria-label="About this move"
          data-testid="notecard-info"
          data-move={move.index}
          onClick={() => {
            setOpenMove(move.index);
          }}
        >
          <InfoIcon />
        </button>
      ),
    [wide, position.dance, seekMove],
  );
  // The sheet's move, re-read off the current dance every render: a dance
  // change while a sheet is open would otherwise leave last dance's move on it.
  const sheetMove = openMove === null ? undefined : moves.moves[openMove];

  const play = useCallback(async (): Promise<void> => {
    // ▶ un-freezes the evening (D3). A fresh page is not paused, so this is a
    // no-op on the first press — the one that primes the audio.
    pausedRef.current = false;
    silent.resume();
    let player = playerRef.current;
    if (player === null) {
      const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
      const ctx = AudioCtor === undefined ? undefined : new AudioCtor();
      ctxRef.current = ctx ?? null;
      // The band's samples ship with the app (public/soundfont/), so nothing
      // streams from abcjs' default host at run time.
      player = createPlayer(ctx, { soundFontUrl: `${import.meta.env.BASE_URL}soundfont/` });
      playerRef.current = player;
      // A player born while the chip says muted starts muted, rather than
      // shouting for the one frame it takes the effect below to notice it.
      player.setMuted(muted);
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
  }, [medley, muted, tempo, beatNow, goMusic, goSilent, silent]);

  /**
   * ▮▮ freezes the evening, not just the band (A1, D3).
   *
   * Before P3 "pause" only stopped the tune: `goSilent` resumes the silent
   * clock, so the hall carried on dancing in silence. Yona's brief ruled the
   * other way — the whole evening holds still, hall, notecard and cursor
   * together — so the clock is paused straight after it is handed back.
   */
  const pause = useCallback((): void => {
    wantsMusicRef.current = false;
    goSilent(beatNow());
    silent.pause();
    pausedRef.current = true;
    setPlaying(false);
  }, [beatNow, goSilent, silent]);

  // The four seeks. Each reads the beat the press was made on and hands
  // `transport.ts`'s ruling (AC1) to `seekTo`; none of them starts or stops
  // the band.
  const onPrevDance = useCallback((): void => {
    seekTo(prevDance(program, beatNow()).beat);
  }, [program, beatNow, seekTo]);
  const onPrevMove = useCallback((): void => {
    seekTo(prevMove(program, beatNow()).beat);
  }, [program, beatNow, seekTo]);
  const onNextMove = useCallback((): void => {
    seekTo(nextMove(program, beatNow()).beat);
  }, [program, beatNow, seekTo]);
  const onNextDance = useCallback((): void => {
    seekTo(nextDance(program, beatNow()).beat);
  }, [program, beatNow, seekTo]);

  const toggleMute = useCallback((): void => {
    setMuted((on) => !on);
  }, []);

  // Remember the flag, and turn whatever player exists up or down. A player
  // created later reads it in `play`.
  useEffect(() => {
    writeMuted(muted);
    playerRef.current?.setMuted(muted);
  }, [muted]);

  /**
   * The keyboard (AC5): space ▶/▮▮, ←/→ the moves, ⇧←/⇧→ the dances, m mute.
   *
   * On `window` rather than on the page's own element, because the transport
   * is meant to work wherever the caller's hands are — but not while they are
   * typing into something, so a focused `input`, `select`, `textarea` or
   * editable element keeps its own arrow keys and space bar (the dance
   * `<select>` in the row below is the one this matters for). A modifier other
   * than Shift belongs to the browser.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        if (target.isContentEditable) return;
      }
      switch (event.key) {
        case " ":
          // Space scrolls a page otherwise, and this page is the transport.
          event.preventDefault();
          if (playing) pause();
          else void play();
          return;
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) onPrevDance();
          else onPrevMove();
          return;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) onNextDance();
          else onNextMove();
          return;
        case "m":
        case "M":
          toggleMute();
          return;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [playing, play, pause, onPrevDance, onPrevMove, onNextMove, onNextDance, toggleMute]);

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
      // How many times the band has played a dance in with four potatoes.
      potatoes: () => potatoesRef.current,
      // Whether ▮▮ is holding the evening still. Only ever true on the silent
      // clock: pause hands the evening back to it and then freezes it.
      paused: () => clockRef.current === silent && !musicOnRef.current && silent.isPaused(),
      // Whether the mute chip is on. The flag the page holds, not the gain —
      // `gain()` is on its way there.
      muted: () => playerRef.current?.muted() ?? muted,
      // The band's master gain right now, or null before anything has played.
      // Live, so just after a mute it is still coming down the ramp.
      gain: () => playerRef.current?.gain() ?? null,
      // Jump the evening to a beat, keeping whichever clock should be running
      // there. A programme item is 172 beats, which is nearly a minute and a
      // half of wall clock, so this is the only way a headless test can watch a
      // dance switch happen.
      seek: (to: Beat) => {
        seekTo(to);
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
  }, [draw, program, beatNow, muted, seekTo, silent]);

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-3"
      data-testid="hall-page"
      data-engine={engine}
    >
      {built.error === undefined ? null : (
        <p className="px-4 pt-4 text-xs" data-testid="hall-dance-error">
          <code>{danceSlug}</code> does not dance yet, so the Stage is showing the evening instead:{" "}
          {built.error}
        </p>
      )}
      {/*
       * No title line: the tab bar above already says which page this is, and
       * a phone has no height to spare (U1). The row is the page's only
       * horizontal measure — the zoom rule reads its width — so it carries the
       * laptop's padding and the phone has none, which is what lets the stage
       * strip run to both edges.
       */}
      <div
        className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6 lg:px-4 lg:pt-4"
        ref={rowRef}
      >
        <div className="flex min-w-0 flex-col gap-2 lg:flex-none">
          {/*
           * Edge to edge on a phone: the strip runs the full width of the
           * viewport painted in the hall's own wall colour, so on a screen too
           * narrow for the next zoom up the wall carries on to both edges
           * instead of the page's paper showing beside it. On a laptop there
           * is no edge to run to, so the strip hugs the canvas instead.
           */}
          <div
            className="caller-stage-strip lg:w-fit lg:rounded"
            style={{ "--stage-backdrop": HALL_THEMES[THEME].wallTop } as CSSProperties}
          >
            <div className="caller-stage-canvas-wrap">
              <canvas ref={canvasRef} data-testid="hall-canvas" />
              {/*
               * The mute chip, on the wall at the stage's top-right. It is the
               * only control still overlaid on the canvas: the play control
               * U3 put here is the transport's ▶ in the band below now, and
               * U4's reset is |◀◀. Mute is not pause (AC4), which is why the
               * two are nowhere near each other.
               */}
              <div className="caller-stage-corner">
                <MuteButton muted={muted} onToggle={toggleMute} />
              </div>
            </div>
            {/*
             * The transport, centred in the strip's own colour under the hall
             * (the spike's 1F): five bare pixel glyphs on the wall rather than
             * chips over the dancers.
             */}
            <TransportBand
              playing={playing}
              onPlay={() => void play()}
              onPause={pause}
              onPrevDance={onPrevDance}
              onPrevMove={onPrevMove}
              onNextMove={onNextMove}
              onNextDance={onNextDance}
            />
          </div>
          <ControlBar
            dance={position.dance.slug}
            onDance={(slug) => {
              pendingStartBeatRef.current = lineUpStartBeat(program.dances.length);
              setDanceSlug(slug);
              setBeat(pendingStartBeatRef.current);
              setPlaying(false);
              wantsMusicRef.current = false;
              musicOnRef.current = false;
              // A2: the pick rebuilds `program`, so a brand-new silent clock
              // runs from that dance's line-up — the attract mode again, not a
              // frozen evening. Mute is deliberately left alone.
              pausedRef.current = false;
              playerRef.current?.stop();
            }}
            tempo={tempo}
            onTempo={setTempo}
            trails={trails}
            onTrails={setTrails}
          />
        </div>

        <aside className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 pb-1 lg:px-0">
          <div className="flex min-w-0 flex-col gap-1.5" data-testid="hall-card">
            {/* P4: the notecard replaces `@caller/music`'s `Card` on the Stage
                (AC6). The `Card` itself stays where it still belongs — the
                Dances tab's static card — and `danceCard.ts` with it. */}
            <Notecard
              title={moves.title}
              author={moves.author}
              timeThrough={
                position.danceBeat === null
                  ? undefined
                  : `${String(position.timeThrough + 1)} of ${String(TIMES_THROUGH)}`
              }
              phrases={moves.phrases}
              current={current}
              onSeek={seekMove}
              renderInfo={renderInfo}
            />
            {/* Interim: the tune gets its own box in P5, with the phrase
                letters, the calls under the bars and the potatoes. Until then
                it sits on its own sheet of the same paper under the notecard,
                so the cursor keeps following the music beat and
                `hall-notation`'s own test keeps measuring it. */}
            <div className="paper min-w-0 p-1.5" data-testid="hall-notation">
              <span className="stage-tune-caption" data-testid="hall-tune">
                {tune.title}
              </span>
              {/* The music beat, not the evening's: the notation takes its
                  beat modulo the cycle, and the evening's beat counts the
                  interval too, which put the cursor bars off after the first
                  dance and kept it walking through the silence. During the
                  interval this is the next tune's beat 0, so the cursor waits
                  on bar 1 for the potatoes. */}
              <Notation tune={tune} beat={shownMusicBeat(beat)} showTitle={false} />
            </div>
          </div>
          {/*
           * U3: one discoverable link off the note card to this dance's own
           * page — the shapes, the walkthrough, "play on the Stage" — beside
           * the status line rather than a button competing with play.
           */}
          <p className="hall-dance-link" data-testid="hall-dance-page-link">
            <a href={`#/dances/${position.dance.slug}`}>{position.dance.title}: the dance page</a>
          </p>
          {/*
           * Which part of the evening this is: the time through while the hall
           * is dancing, and which stretch of the between-dances interval
           * otherwise — the thanks, the announcement, the walk or the wait
           * for the tune (B1, B4).
           */}
          <p className="text-xs text-muted-foreground" data-testid="hall-status">
            {betweenDancesStatus(position)}
          </p>
          {/*
           * Which engine this hall is dancing on, and the link to the other
           * one (M3, gate G1). Small and quiet: it is a reviewer's switch,
           * not a dancer's, and the whole point of the default being `new` is
           * that nobody has to ask for it.
           */}
          <p className="text-xs text-muted-foreground" data-testid="hall-engine">
            {engine === "new" ? "the new engine" : "the old engine"}{" "}
            <a
              href={engineHash(danceSlug, params, otherEngine(engine))}
              data-testid="hall-engine-swap"
            >
              ({otherEngine(engine)} engine)
            </a>
          </p>
        </aside>
      </div>

      <SiteFooter />

      {/* The phone's move popup, over everything (D6). Rendered from the page
          rather than from the notecard so that only one can ever be open. */}
      {wide || sheetMove === undefined ? null : (
        <MoveSheet
          move={sheetMove}
          dance={position.dance}
          onClose={closeMove}
          onJump={() => {
            seekMove(sheetMove);
            closeMove();
          }}
        />
      )}
    </main>
  );
}

/**
 * `MoveDetail` inside the laptop's popover, so "▶ Jump here" closes it.
 *
 * `usePopoverClose` only answers inside a `Popover`'s own panel, which is why
 * this is a component rather than a callback the page could have built: the
 * hook has to run under the panel's context provider.
 */
function PopoverMoveDetail({
  move,
  dance,
  onJump,
}: {
  move: DanceMove;
  dance: Dance;
  onJump: () => void;
}): JSX.Element {
  const close = usePopoverClose();
  return (
    <MoveDetail
      move={move}
      dance={dance}
      onJump={() => {
        onJump();
        close();
      }}
    />
  );
}

/**
 * The control bar: everything the page lets anybody change, and nothing else.
 *
 * U4 cut it down to three controls (the user: "the control bar needs some
 * love"): the tune set is always the seeded shuffle now (no selector — "I
 * don't like the selector"), and zoom is always automatic (no selector —
 * "its fine on auto"); `?tune=` and `?zoom=` still work as deep links, they
 * are just no longer something the bar lets you change. What is left is one
 * row that never wraps: the dance, the tempo (a fixed-width readout so its
 * digits changing width never reflows the row after it) and trails.
 *
 * The dance picker is a native `<select>` (requirement 1: "should probably
 * just be native"), styled only as far as the theme's colours and font allow
 * — no custom popover.
 *
 * Play moved out of this row in U3, onto the stage itself as the speaker
 * icon; reset joined it there in U4, beside the speaker, rather than in this
 * row.
 */
function ControlBar(props: {
  dance: string;
  onDance: (slug: string) => void;
  tempo: number;
  onTempo: (bpm: number) => void;
  trails: boolean;
  onTrails: (on: boolean) => void;
}): JSX.Element {
  return (
    <div
      className="flex w-full items-center gap-1.5 overflow-x-auto px-2 text-xs whitespace-nowrap lg:px-0"
      data-testid="hall-controls"
    >
      <select
        value={props.dance}
        onChange={(e) => props.onDance(e.target.value)}
        aria-label="Dance"
        data-testid="hall-dance-select"
        className="h-7 w-[9.5rem] shrink-0 rounded border border-input bg-background px-1.5 text-xs text-foreground"
      >
        {DEMO_DANCES.map((d) => (
          <option key={d.slug} value={d.slug}>
            {d.title}
          </option>
        ))}
      </select>

      <label className="flex shrink-0 items-center gap-1" htmlFor="hall-tempo">
        <input
          id="hall-tempo"
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          step={1}
          value={props.tempo}
          onChange={(e) => props.onTempo(Number(e.target.value))}
          data-testid="hall-tempo"
          className="h-4 w-16"
        />
        {/* U4 requirement 5: "the bpm selector causes reflow because the text
            changes width". `TEMPO_MAX` (124) is the widest value, three
            digits, so a fixed width sized to it — plus tabular figures, so
            the digits themselves never shift width either — means nothing
            after it (trails) ever moves. */}
        <span
          className="inline-block w-[1.6em] text-right tabular-nums text-muted-foreground"
          data-testid="hall-tempo-value"
        >
          {props.tempo}
        </span>
      </label>

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

/**
 * The footer: the side doors out of the hall, and the licence.
 *
 * V1 moved the version string and the GitHub link out of here and into the
 * build-info badge in the tab bar, where they belong together with the commit
 * and the recent releases — and where a phone can reach them without
 * scrolling to the bottom of the page. What is left is what has nowhere else
 * to be.
 */
function SiteFooter(): JSX.Element {
  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 pt-2 pb-3 text-xs text-muted-foreground lg:px-4">
      <a className="underline" href="#/spikes">
        Spikes
      </a>
      <a className="underline" href="#/pair">
        The pair
      </a>
      <span>AGPL-3.0-or-later. Dances are their choreographers&rsquo;; tunes are traditional.</span>
    </footer>
  );
}

const zoomClass = (on: boolean): string =>
  `h-7 rounded border px-1.5 ${on ? "border-current font-semibold" : "opacity-60"}`;

/**
 * What the bubble says on this beat, or nothing (C3: "silence is silence").
 *
 * The utterance covering the beat when there is one — each call starts its
 * figure's `lead` beats early and lasts however long it takes to say, plus a
 * short tail (AC9, `spokenBeats`) — and otherwise **nothing**: no more
 * falling back to the last thing the caller said. The user: "the calls stay
 * around too long. they should stay around either how many beats they are, or
 * maybe 1 or 2 beats past. but not until the next call." A caller who said
 * "balance and swing" two beats ago and is not due to say anything else for a
 * while is not still talking; the hall is just dancing.
 */
function callAt(program: DemoProgram, beat: Beat): string {
  const now = program.timeline.utterancesAt(beat);
  if (now.length === 0) return IDLE_CALL;
  // Calls overlap: a call is said its figure's lead beats before it and runs
  // into it, so at the moment a figure starts the caller is already leading
  // the next one. The bubble shows the call that started first, which is the
  // figure the hall is dancing right now; it gives way to the next as soon as
  // it has run out.
  return now.reduce((a, b) => (a.start <= b.start ? a : b)).text;
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
      potatoes: () => number;
      paused: () => boolean;
      muted: () => boolean;
      gain: () => number | null;
      seek: (to: Beat) => void;
      call: (at?: Beat) => string;
      bench: (frames: number) => number[];
    };
  }
}
