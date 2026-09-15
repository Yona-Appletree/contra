import type { Beat } from "@caller/core";
import type { Dance, Decider, HallState, Program, Timeline } from "@caller/choreo";
import {
  SCRIPT_DECIDER_DEFAULTS,
  betweenDancesBeats,
  createHall,
  createLibrary,
  createScriptDecider,
} from "@caller/choreo";
import type { FigureDefaultsOverride } from "@caller/contra";
import {
  ALL_DANCES,
  BECKET,
  PROPER,
  DEMO_DANCES,
  DUPLE_IMPROPER,
  callScript,
  contraDataEngine,
  createContraCyclePlanner,
  createContraRegistry,
  danceOwes,
} from "@caller/contra";
import type { HallWorld } from "@caller/hall";
import type { Medley, Tune } from "@caller/music";
import { medleys as musicMedleys } from "@caller/music";
import type { EngineChoice } from "./state/engineQuery.js";
import { DEFAULT_ENGINE } from "./state/engineQuery.js";

/**
 * The evening: every encoded dance, each two times through, looping for as
 * long as the page is open.
 *
 * The script decider does the work — it dances each dance, stops, runs the
 * whole between-dances interval (thanks, announcement, walk, ready) and loops
 * the programme — so the page only has to say which dances, in which order,
 * and read the timeline.
 */

/** How many times through each dance is danced before the next one. */
export const TIMES_THROUGH = 2;

/** One time through, in beats. Every encoded dance is four sixteen-beat phrases. */
export const CYCLE_BEATS = 64;

/**
 * The gap between two dances, in beats of the silent clock, and the five
 * stretches it is made of.
 *
 * Read off the decider's own options rather than written down again here: the
 * page's arithmetic and the decider's have to agree exactly or the tune drifts
 * against the dance, and the only way to keep two numbers equal is to have
 * one. The lengths themselves are `SCRIPT_DECIDER_DEFAULTS`' — 8 beats of
 * thanks, 16 of announcement, 8 of walking, 8 taking hands four in a ring
 * and 4 of potatoes, 44 in all, which at 112 bpm is about twenty-four seconds
 * between two dances.
 */
export const THANKS_BEATS = SCRIPT_DECIDER_DEFAULTS.thanksBeats;
export const ANNOUNCE_BEATS = SCRIPT_DECIDER_DEFAULTS.announceBeats;
export const WALK_BEATS = SCRIPT_DECIDER_DEFAULTS.lineUpBeats;
export const RING_BEATS = SCRIPT_DECIDER_DEFAULTS.ringBeats;
/**
 * The potatoes: the four beats the band counts the dance in over.
 *
 * Still `readyBeats` to the decider — it is the stretch where the hall is ready
 * and nothing is danced yet — but it is not silent any more, which is why the
 * page has its own name for it.
 */
export const POTATO_BEATS = SCRIPT_DECIDER_DEFAULTS.readyBeats;
export const BETWEEN_DANCES_BEATS = betweenDancesBeats(SCRIPT_DECIDER_DEFAULTS);

/** Beats one programme item takes: its times through plus the interval after it. */
export const ITEM_BEATS = TIMES_THROUGH * CYCLE_BEATS + BETWEEN_DANCES_BEATS;

/**
 * The "line-up" proper: the announcement, walk, hands-four and potatoes that
 * lead into a dance, with the thanks for whichever dance came before it left
 * out. This is what U4 starts a freshly chosen dance at — the whole of a real
 * interval except the stretch that only makes sense when there was a
 * previous dance to thank.
 */
export const LINEUP_BEATS = ANNOUNCE_BEATS + WALK_BEATS + RING_BEATS + POTATO_BEATS;

/**
 * The beat, within a fresh programme, at which item `announcerIndex`'s own
 * announcement begins — right where its thanks would end, if it had any.
 */
function announcementStartOf(announcerIndex: number): Beat {
  return announcerIndex * ITEM_BEATS + TIMES_THROUGH * CYCLE_BEATS + THANKS_BEATS;
}

/**
 * Where the programme should start when the dance at `danceIndex` (0-based,
 * within a programme of `danceCount` dances) is freshly chosen to dance — a
 * Dances-tab tap, `#/dance/<slug>`, or the reset control (U4): the beginning
 * of that dance's own line-up (its announcement), not its dancing beat 0, and
 * not the thanks that would normally open the interval, because there was no
 * dance before it in this fresh start (the user: "it should start with the
 * normal line up").
 *
 * The programme loops, so the item that announces `danceIndex` is the one
 * immediately before it in programme order — for `danceIndex` 0 that is the
 * *last* item, which is exactly what makes "the caller announces the dance
 * you just picked" true the moment you pick it.
 */
export function lineUpStartBeat(danceCount: number, danceIndex = 0): Beat {
  const announcer = (((danceIndex - 1) % danceCount) + danceCount) % danceCount;
  return announcementStartOf(announcer);
}

/**
 * Beats of **music** one programme item takes: the dancing beats, and no more.
 *
 * The gap between two dances carries no tune, which is the whole point. A dance
 * is two times through of 64 beats and the medley switches tune every 64; the
 * gap is {@link BETWEEN_DANCES_BEATS} = 44, which is not a whole number of
 * anything musical. If the tune kept looping through it, every dance switch
 * would put the music 44 beats out of phase with the dance, and two switches
 * would be more than a whole time through — the drift M9 measured on the page,
 * only worse. So the music runs on its own count of dancing beats, the player
 * stops at the end of the last time through, the whole interval runs on the
 * silent clock, and the next tune starts at **its own beat 0** exactly as the
 * next dance starts (F2's rule). `MUSIC_BEATS_PER_ITEM` is a whole number of
 * tune cycles, which is what makes that true for every dance rather than for
 * the first one.
 *
 * The one sound in the gap is B3's four potatoes, which the player schedules
 * *ahead* of the tune's own beat 0 rather than as part of it — so this number
 * stays the count of a tune's own beats and nothing about the arithmetic here
 * moves (see `@caller/music`'s `Player.play`).
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
  /** The beat within the dance's own sixty-four, or `null` between two dances. */
  danceBeat: Beat | null;
  /** True for the whole between-dances interval, from the thanks to the tune. */
  liningUp: boolean;
  /** Which stretch of the between-dances interval this is, or `null` while dancing. */
  between: BetweenDances | null;
  /** The dance that comes after this one. */
  next: Dance;
}

/** The five stretches of the between-dances interval, in the order they run. */
export type BetweenDances = "thanks" | "announcement" | "walk" | "hands-four" | "potatoes";

/** Which stretch of the interval a beat `into` a programme item falls in. */
export function betweenDancesAt(into: Beat): BetweenDances | null {
  const gap = into - TIMES_THROUGH * CYCLE_BEATS;
  if (gap < 0) return null;
  if (gap < THANKS_BEATS) return "thanks";
  if (gap < THANKS_BEATS + ANNOUNCE_BEATS) return "announcement";
  if (gap < THANKS_BEATS + ANNOUNCE_BEATS + WALK_BEATS) return "walk";
  if (gap < THANKS_BEATS + ANNOUNCE_BEATS + WALK_BEATS + RING_BEATS) return "hands-four";
  return "potatoes";
}

/**
 * Whether the band is playing at this beat of the evening.
 *
 * True while a tune sounds, and true for the four potatoes before a dance —
 * which is exactly the moment a real band picks its instruments back up. The
 * hall's furniture layer takes this as its `playing` option, so a band that is
 * not playing does not bow, strum, nod or slide along the keys (B3's R1).
 */
export const bandPlaying = (beat: Beat): boolean =>
  musicBeatOf(beat) !== null || betweenDancesAt(intoItem(beat)) === "potatoes";

/** How far into its own programme item a beat is. */
const intoItem = (beat: Beat): Beat => beat - Math.floor(beat / ITEM_BEATS) * ITEM_BEATS;

/** What the page says it is doing, under the card, between two dances. */
export function betweenDancesStatus(position: ProgramPosition): string {
  switch (position.between) {
    case "thanks":
      return `Thanks for ${position.dance.title}`;
    case "announcement":
      return `The caller announces ${position.next.title}`;
    case "walk":
      return `Lining up for ${position.next.title}`;
    case "hands-four":
      return `Hands four for ${position.next.title}`;
    case "potatoes":
      return `Potatoes for ${position.next.title}`;
    default:
      return `Time through ${String(position.timeThrough + 1)} of ${String(TIMES_THROUGH)}`;
  }
}

/**
 * The dances in programme order, rotated so `first` leads.
 *
 * Choosing a dance on the page jumps the programme to it, which is this
 * rotation plus a rebuilt decider; everything after it keeps the caller's
 * order, so the evening still runs through every dance.
 *
 * A **lab dance** (`DanceFile.status: "lab"`, M1) is not in the programme at
 * all — that is what the status means, and why it has no card on the Dances
 * tab — but `#/dance/<slug>` still has to dance it, because a milestone
 * encoding a hard dance wants to watch it in the hall before it ships. So a
 * `first` the programme does not hold, but the package does, is **put in front
 * of** the programme rather than rotated within it: the evening opens on the
 * lab dance and then runs the shipped ten as usual. Everything downstream —
 * `lineUpStartBeat(dances.length)`, `ITEM_BEATS`, `positionAt` — is written
 * over `dances.length` rather than over `DEMO_DANCES`, so a programme one
 * item longer needs nothing else to change.
 *
 * `dances` and `all` are arguments so the behaviour can be tested with
 * fixtures: no lab dance exists yet (`LAB_DANCES` is empty), and adding one to
 * make a test pass would put a half-encoded dance in the repository.
 */
export function danceOrder(
  first?: string,
  dances: readonly Dance[] = DEMO_DANCES,
  all: readonly Dance[] = ALL_DANCES,
): Dance[] {
  if (first === undefined) return [...dances];
  const at = dances.findIndex((d) => d.slug === first);
  if (at > 0) return [...dances.slice(at), ...dances.slice(0, at)];
  if (at === 0) return [...dances];
  const lab = all.find((d) => d.slug === first);
  // **A lab dance that owes a figure is left out of the evening.** M6 brings
  // the first lab dances that name a figure a later milestone owns — Whoosh's
  // circulate, A Rare Bird's shoulder round — and such a dance cannot be
  // planned at all: resolution throws on the first call it reaches, which would
  // take the Stage down rather than show anything. Its own page still holds the
  // record, the transcript and what it does not resolve into
  // (`routes/dances.tsx`), which is where somebody would be looking at it.
  if (lab === undefined || danceOwes(lab).length > 0) return [...dances];
  return [lab, ...dances];
}

/**
 * Whether this slug names a dance the programme does not hold but the package
 * does: a lab dance, which {@link danceOrder} puts in front of the evening.
 *
 * The Dances tab links one (`#/dance/<slug>`) without giving it a programme
 * card, and the dance page says which it is looking at.
 */
export const isLabDance = (
  slug: string,
  dances: readonly Dance[] = DEMO_DANCES,
  all: readonly Dance[] = ALL_DANCES,
): boolean => !dances.some((d) => d.slug === slug) && all.some((d) => d.slug === slug);

/**
 * The hall the demo ships: two lines, **eight couples and seven**.
 *
 * Longer lines rather than wider ones (P1, and the user's "increase the
 * number of dancers in the hall"). Two reasons the number is this one. A
 * becket dance on short lines is mostly waiting — on the old lines of five
 * and four, ten of the eighteen dancers waited out Butter's first time
 * through — and a waiting couple is one couple at each end whatever the line
 * holds, so the way to make waiting the exception is a longer line rather
 * than another one. And the world's **width** is fixed by the number of
 * lines (`SIDE_W * 2 + SET_PITCH * lines`), which is what a phone has to fit
 * at 1× (U1): two lines are 268 px and three are 372, so a third line is an
 * option (`?lines=3`) rather than the default. Only the world's height moves:
 * 282 px at five-and-four, 342 at eight-and-seven.
 *
 * Uneven on purpose. Duple improper works the line in minor sets of two
 * couples, so an odd line always has one couple over at an end — which is
 * exactly the waiting couple a contra dance has, and the case `wait-out`
 * exists for. Two odd lines and two even ones would each have the hall
 * waiting in lockstep; one of each keeps both cases on the page.
 */
export const DEMO_LINES: readonly number[] = [8, 7];

/**
 * The couples in each of `lines` lines, repeating {@link DEMO_LINES}.
 *
 * `?lines=3` on the hall URL asks for a third set, and three lines need a
 * third number. Cycling the default's own two — eight, seven, eight — keeps
 * the default exactly `DEMO_LINES` and keeps one odd line and one even
 * whatever the count.
 */
export const demoLines = (lines: number): number[] =>
  Array.from({ length: lines }, (_, i) => DEMO_LINES[i % DEMO_LINES.length]!);

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
 *
 * `figureOverrides` is a figure-defaults override's route into the Stage:
 * forwarded straight to `createContraRegistry`, so a dance that calls an
 * overridden figure dances it at those defaults rather than at its own shipped
 * ones. Nothing in the app drives it today — it is the registry's own seam, for
 * a caller comparing one figure's tuning against another's.
 *
 * `engine` is `?engine=new|old`'s route in, and it is **two halves, both of
 * which have to agree**. The new engine is the contra `CyclePlanner` *and* a
 * registry holding the five migrated figures as interpreted definitions:
 * `poseAt` resolves a figure by id in the **registry**, not in the planner's
 * emission, so planning against the data swing while the timeline sampled the
 * coded one would silently draw the wrong figure. `contraDataEngine()` builds
 * the consistent pair and `createContraCyclePlanner({ library })` is given that
 * pair's own library, so the planner is not rebuilding it at the top of every
 * time through. `old` is the plain coded registry with no planner at all, which
 * is `defaultCyclePlanner` — the path every golden before M3 was taken against.
 */
export function createDemoProgram(
  world: HallWorld,
  first?: string,
  seed = DEFAULT_SEED,
  figureOverrides: FigureDefaultsOverride = {},
  engine: EngineChoice = DEFAULT_ENGINE,
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
  const engineHalves =
    engine === "new"
      ? contraDataEngine([], figureOverrides)
      : { registry: createContraRegistry([], figureOverrides), library: undefined };
  const decider = createScriptDecider(
    program,
    engineHalves.registry,
    hall,
    // **Three formations since M7.** Chorus Jig is proper — larks in one line
    // and robins in the other, all the way through — and a library that does
    // not hold it refuses the dance by name at load.
    createLibrary(dances, [DUPLE_IMPROPER, BECKET, PROPER]),
    {
      // **The bubble follows the calling card** (M13, AC3): what the caller says
      // is the same computation the dance page prints, so the two can never
      // drift. The decider carries the events and knows nothing about why they
      // say what they say.
      callsFor: (dance, timeThrough) =>
        callScript(dance, timeThrough).map(({ offset, text, spokenBeats }) => ({
          offset,
          text,
          ...(spokenBeats === undefined ? {} : { beats: spokenBeats }),
        })),
      ...(engineHalves.library === undefined
        ? {}
        : { cycle: createContraCyclePlanner({ library: engineHalves.library }) }),
    },
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
 * encoded dance is 64 beats and every item is `TIMES_THROUGH` of them plus the
 * between-dances interval, so an item is `ITEM_BEATS` long and the programme
 * loops.
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
    between: betweenDancesAt(into),
    next: program.dances[(index + 1) % n]!,
  };
}
