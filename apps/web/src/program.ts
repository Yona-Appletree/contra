import type { Beat } from "@caller/core";
import type { Dance, Decider, HallState, Program, Timeline } from "@caller/choreo";
import { createHall, createLibrary, createScriptDecider } from "@caller/choreo";
import { BECKET, DEMO_DANCES, DUPLE_IMPROPER, createContraRegistry } from "@caller/contra";
import type { HallWorld } from "@caller/hall";
import type { Medley, Tune } from "@caller/music";
import { medleys as musicMedleys } from "@caller/music";

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
  /**
   * The medley slug shuffled onto each dance, parallel to `dances`
   * (`medleys[i]` is what `dances[i]` is danced to when the tune select is
   * on "Shuffle" rather than pinned to one medley by `?tune=`).
   */
  medleys: readonly string[];
  /**
   * The one concrete tune each dance actually plays in Shuffle mode,
   * parallel to `dances`. Each dance is exactly `MUSIC_BEATS_PER_ITEM`
   * beats of music — one tune, played `TIMES_THROUGH` times — so a dance
   * does not cycle through its assigned medley's other tunes the way a
   * medley pinned for the whole evening does; instead, each medley
   * remembers its own place in its tune list from the last dance it was
   * shuffled onto, so a two- or three-tune medley is heard in full across
   * the evening rather than always giving up only its first tune.
   */
  tunes: readonly Tune[];
  /** How long one time round the whole programme takes, in beats. */
  totalBeats: Beat;
}

/**
 * A default seed for callers that do not care which medleys play (this
 * package's own tests, mostly) — fixed rather than the wall clock, so
 * `createDemoProgram` stays a pure function of its arguments. The page
 * itself always resolves a real seed first, from `?seed=<n>` or the date
 * (`readSeed` in `../state/hallUrl.js`), and passes it in.
 */
const DEFAULT_SEED = 0;

/** A tiny deterministic PRNG (mulberry32), seeded by a 32-bit integer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, drawing from `rng` at each step. Mutates and returns `items`. */
function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = items[i]!;
    items[i] = items[j]!;
    items[j] = a;
  }
  return items;
}

/**
 * A seeded, circular assignment of one medley to each dance — the shuffle
 * the user asked for ("I am so sick of soldier's joy").
 *
 * Two properties hold over the *circular* order of `danceSlugs` (the
 * programme loops back to its first dance after its last, and that
 * loop-back counts as "consecutive" too, or the evening would repeat a
 * medley across the seam every single lap):
 *
 *  - no two circularly-adjacent dances share a medley;
 *  - every medley is danced once before any medley repeats — each run of
 *    `medleySlugs.length` dances is a fresh shuffle of all of them (a
 *    "bag" shuffle, the way a good DJ or a card-game randomizer avoids
 *    back-to-back repeats without ever losing "everyone gets a turn").
 *
 * Built over the dances' own fixed order rather than however a caller has
 * rotated them (`danceOrder`'s `first`, used when someone picks a dance
 * from the page), because a rotation of a circular sequence that is
 * already adjacency-safe stays adjacency-safe — it is the same cycle of
 * neighbours, just read starting from a different point.
 *
 * With fewer than three medleys, the final wrap-around comparison (last
 * dance against first) cannot always be resolved — an odd-length cycle
 * genuinely cannot be 2-coloured without two neighbours matching, a fact
 * about cycle graphs rather than a bug here — so that fix-up only runs
 * when there are at least three medleys to choose the mismatched slot
 * from.
 */
export function shuffleMedleyAssignment(
  seed: number,
  danceSlugs: readonly string[],
  medleySlugs: readonly string[],
): Map<string, string> {
  const n = danceSlugs.length;
  const m = medleySlugs.length;
  const map = new Map<string, string>();
  if (n === 0 || m === 0) return map;
  if (m === 1) {
    for (const slug of danceSlugs) map.set(slug, medleySlugs[0]!);
    return map;
  }

  const rng = mulberry32(seed);
  const order: string[] = [];
  let previous: string | undefined;
  while (order.length < n) {
    const bag = shuffleInPlace([...medleySlugs], rng);
    // A fresh bag's first draw must not repeat the previous bag's last —
    // otherwise the seam between two "everyone gets a turn" rounds would
    // itself be a repeat.
    if (previous !== undefined && bag[0] === previous) {
      const j = 1 + Math.floor(rng() * (m - 1));
      const a = bag[0]!;
      bag[0] = bag[j]!;
      bag[j] = a;
    }
    order.push(...bag);
    previous = bag[bag.length - 1];
  }
  order.length = n;

  // The programme loops, so the last dance and the first are consecutive
  // too — fix the one seam the bag construction above cannot see.
  if (n > 1 && m >= 3 && order[n - 1] === order[0]) {
    const left = order[n - 2];
    const replacement = medleySlugs.find((slug) => slug !== order[0] && slug !== left);
    if (replacement !== undefined) order[n - 1] = replacement;
  }

  danceSlugs.forEach((slug, i) => map.set(slug, order[i]!));
  return map;
}

/**
 * Layers `shuffleMedleyAssignment` with a per-medley tune pointer, so the
 * seeded shuffle picks both a medley and a concrete tune for every dance.
 *
 * `shuffleMedleyAssignment` decides which *medley* plays each dance — the
 * property the brief asks for. Within that, this walks the dances in order
 * and gives each dance its assigned medley's *next* tune, remembering where
 * each medley left off the last time the shuffle landed on it (not always
 * tune 0): a three-tune medley is heard in full across the evening rather
 * than always giving up only its first tune. Built over the dances' own
 * fixed order for the same reason `shuffleMedleyAssignment` is.
 */
export function shuffleProgramme(
  seed: number,
  danceSlugs: readonly string[],
  medleyList: readonly Medley[],
): { medleyOf: Map<string, string>; tuneOf: Map<string, Tune> } {
  const medleyOf = shuffleMedleyAssignment(
    seed,
    danceSlugs,
    medleyList.map((m) => m.slug),
  );
  const bySlug = new Map(medleyList.map((m) => [m.slug, m]));
  const nextTuneIndex = new Map<string, number>();
  const tuneOf = new Map<string, Tune>();
  for (const slug of danceSlugs) {
    const medleySlug = medleyOf.get(slug);
    if (medleySlug === undefined) continue;
    const medley = bySlug.get(medleySlug);
    if (medley === undefined) continue;
    const i = nextTuneIndex.get(medleySlug) ?? 0;
    tuneOf.set(slug, medley.tunes[i % medley.tunes.length]!);
    nextTuneIndex.set(medleySlug, i + 1);
  }
  return { medleyOf, tuneOf };
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

/**
 * Build the programme and the decider that dances it.
 *
 * `seed` drives the medley shuffle (`shuffleMedleyAssignment`): the caller
 * resolves it once from `?seed=<n>` or the date (`readSeed` in
 * `../state/hallUrl.js`) and passes the same number in every time, which
 * is what makes a seeded URL reproduce one evening. The assignment is
 * built over the dances' own fixed order (`DEMO_DANCES`), not over
 * `dances` (which `first` may have rotated), so that choosing a dance to
 * start from does not change which medley any dance is shuffled onto.
 */
export function createDemoProgram(
  world: HallWorld,
  first?: string,
  seed = DEFAULT_SEED,
): DemoProgram {
  const dances = danceOrder(first);
  const { medleyOf, tuneOf } = shuffleProgramme(
    seed,
    DEMO_DANCES.map((d) => d.slug),
    musicMedleys,
  );
  const medleyFor = (slug: string): string => medleyOf.get(slug) ?? musicMedleys[0]!.slug;
  const tuneFor = (slug: string): Tune => tuneOf.get(slug) ?? musicMedleys[0]!.tunes[0]!;
  const program: Program = {
    slug: "the-evening",
    items: dances.map((d) => ({
      dance: d.slug,
      medley: medleyFor(d.slug),
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
    medleys: dances.map((d) => medleyFor(d.slug)),
    tunes: dances.map((d) => tuneFor(d.slug)),
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
