import type { Beat } from "@caller/core";
import type { Dance, Decider, HallState, Program, Timeline } from "@caller/choreo";
import { createHall, createLibrary, createScriptDecider } from "@caller/choreo";
import { BECKET, DEMO_DANCES, DUPLE_IMPROPER, createContraRegistry } from "@caller/contra";
import type { HallWorld } from "@caller/hall";

/**
 * The evening: every encoded dance, each two times through, looping for as
 * long as the page is open.
 *
 * The script decider does the work — it announces the next dance over the
 * last eight beats, walks everybody to their new places over an eight-beat
 * line-up, calls hands four from the top, and loops the programme — so the
 * page only has to say which dances, in which order, and read the timeline.
 */

/** How many times through each dance is danced before the next one. */
export const TIMES_THROUGH = 2;

/** One time through, in beats. Every encoded dance is four sixteen-beat phrases. */
export const CYCLE_BEATS = 64;

/** The eight-beat gap between two dances: `SCRIPT_DECIDER_DEFAULTS.lineUpBeats`. */
export const LINE_UP_BEATS = 8;

/** Beats one programme item takes: its times through plus the line-up after it. */
export const ITEM_BEATS = TIMES_THROUGH * CYCLE_BEATS + LINE_UP_BEATS;

/**
 * Beats of **music** one programme item takes: the dancing beats, and no more.
 *
 * The line-up is silent, which is the whole point. A dance is two times through
 * of 64 beats and the medley switches tune every 64; the line-up is 8. If the
 * tune kept looping through the line-up, every dance switch would put the music
 * eight beats out of phase with the dance, and after eight switches the drift
 * would be a whole time through — which is what M9 measured on the page. So the
 * music runs on its own count of dancing beats, the player stops at the end of
 * the last time through, the eight line-up beats run on the silent clock, and
 * the next tune starts at **its own beat 0** exactly as the next dance starts.
 * `MUSIC_BEATS_PER_ITEM` is a whole number of tune cycles, which is what makes
 * that true for every dance rather than for the first one.
 */
export const MUSIC_BEATS_PER_ITEM = TIMES_THROUGH * CYCLE_BEATS;

/**
 * The tune's own beat at a programme beat, or `null` during the line-up, when
 * nothing is playing.
 */
export function musicBeatOf(beat: Beat): Beat | null {
  const index = Math.floor(beat / ITEM_BEATS);
  const into = beat - index * ITEM_BEATS;
  if (into >= MUSIC_BEATS_PER_ITEM) return null;
  return index * MUSIC_BEATS_PER_ITEM + into;
}

/**
 * The programme beat a music beat belongs to: `musicBeatOf` read backwards, so
 * the page can go on asking one clock what beat it is while the tune plays
 * (AC4) and still know where in the evening that is.
 */
export function programBeatOf(musicBeat: Beat): Beat {
  const index = Math.floor(musicBeat / MUSIC_BEATS_PER_ITEM);
  return index * ITEM_BEATS + (musicBeat - index * MUSIC_BEATS_PER_ITEM);
}

/**
 * The music beat the notation and the tune name follow: `musicBeatOf`, except
 * that during the silent line-up it is the **next** dance's beat 0, because
 * that is the tune the caller has just announced.
 */
export function shownMusicBeat(beat: Beat): Beat {
  return musicBeatOf(beat) ?? (Math.floor(beat / ITEM_BEATS) + 1) * MUSIC_BEATS_PER_ITEM;
}

/** Where a music beat's own item ends, in music beats: when the tune stops. */
export const musicItemEnd = (musicBeat: Beat): Beat =>
  (Math.floor(musicBeat / MUSIC_BEATS_PER_ITEM) + 1) * MUSIC_BEATS_PER_ITEM;

/** The programme beat that same moment is: where the silent line-up begins. */
export const lineUpStartOf = (musicBeat: Beat): Beat =>
  Math.floor(musicBeat / MUSIC_BEATS_PER_ITEM) * ITEM_BEATS + MUSIC_BEATS_PER_ITEM;

/** How far ahead of the play head the decider is kept. */
export const LOOKAHEAD_BEATS = CYCLE_BEATS;

/** What the page needs to draw and to read a beat back as a dance. */
export interface DemoProgram {
  decider: Decider;
  timeline: Timeline;
  hall: HallState;
  /** The dances, in the order this programme dances them. */
  dances: readonly Dance[];
  /** How long one time round the whole programme takes, in beats. */
  totalBeats: Beat;
}

/** Where a beat falls in the programme. */
export interface ProgramPosition {
  dance: Dance;
  /** Which item of the programme, counting from 0. */
  index: number;
  /** Which time through of that dance, counting from 0. */
  timeThrough: number;
  /** The beat within the dance's own sixty-four, or `null` during the line-up. */
  danceBeat: Beat | null;
  /** True while the hall is lining up for the next dance. */
  liningUp: boolean;
  /** The dance that comes after this one. */
  next: Dance;
}

/**
 * The dances in programme order, rotated so `first` leads.
 *
 * Choosing a dance on the page jumps the programme to it, which is this
 * rotation plus a rebuilt decider; everything after it keeps the caller's
 * order, so the evening still runs through every dance.
 */
export function danceOrder(first?: string): Dance[] {
  const at = first === undefined ? -1 : DEMO_DANCES.findIndex((d) => d.slug === first);
  if (at <= 0) return [...DEMO_DANCES];
  return [...DEMO_DANCES.slice(at), ...DEMO_DANCES.slice(0, at)];
}

/**
 * A hall of two lines, seated on the world the renderer draws.
 *
 * `layoutHall` decides where the lines go in the hall's own world
 * coordinates; `createHall` seats the dancers there, one choreo set per line,
 * its frame centred on the first couple's place and its axis pointing down
 * the hall. Both packages use the same 20 px between adjacent places, which
 * is what lets the two agree without a conversion.
 */
export function seatHall(world: HallWorld, couplesPerLine: readonly number[]): HallState {
  return createHall(
    DUPLE_IMPROPER,
    world.sets.map((set, i) => ({
      id: `set${i}`,
      couples: couplesPerLine[i] ?? set.couples,
      centre: set.centre(0),
      axis: DOWN_THE_HALL,
    })),
  );
}

/** Frame-local degrees for "down the hall": the choreo frame's own +y. */
const DOWN_THE_HALL = 90;

/** Build the programme and the decider that dances it. */
export function createDemoProgram(world: HallWorld, first?: string): DemoProgram {
  const dances = danceOrder(first);
  const program: Program = {
    slug: "the-evening",
    items: dances.map((d) => ({
      dance: d.slug,
      medley: "reel-set",
      timesThrough: TIMES_THROUGH,
    })),
  };
  const hall = seatHall(
    world,
    world.sets.map((s) => s.couples),
  );
  const decider = createScriptDecider(
    program,
    createContraRegistry(),
    hall,
    createLibrary(dances, [DUPLE_IMPROPER, BECKET]),
  );
  decider.advance(LOOKAHEAD_BEATS);
  return {
    decider,
    timeline: decider.timeline(),
    hall,
    dances,
    totalBeats: dances.length * ITEM_BEATS,
  };
}

/**
 * Which dance a beat belongs to.
 *
 * Read off the programme's own arithmetic rather than the timeline: every
 * encoded dance is 64 beats and every item is `TIMES_THROUGH` of them plus
 * the line-up, so an item is `ITEM_BEATS` long and the programme loops.
 */
export function positionAt(program: DemoProgram, beat: Beat): ProgramPosition {
  const n = program.dances.length;
  const t = ((beat % program.totalBeats) + program.totalBeats) % program.totalBeats;
  const index = Math.floor(t / ITEM_BEATS);
  const into = t - index * ITEM_BEATS;
  const dancing = into < TIMES_THROUGH * CYCLE_BEATS;
  return {
    dance: program.dances[index]!,
    index,
    timeThrough: dancing ? Math.floor(into / CYCLE_BEATS) : TIMES_THROUGH - 1,
    danceBeat: dancing ? into % CYCLE_BEATS : null,
    liningUp: !dancing,
    next: program.dances[(index + 1) % n]!,
  };
}
