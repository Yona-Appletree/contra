import type { Beat, Vec2 } from "@caller/core";
import type { Dance, DancerId, Timeline } from "@caller/choreo";
import { createHall, createTimeline, danceBeats, poseAt } from "@caller/choreo";
import type { CandidateFile, DanceOracles } from "@caller/contra";
import {
  CANDIDATE_BASES,
  CANDIDATE_DANCES,
  CLOSURE_PX,
  COLLISION_PX,
  LAB_RUN,
  candidateSlug,
  candidatesOf,
  createContraRegistry,
  danceAlone,
  danceBySlug,
  formationFor,
  linesFor,
  oraclesFor,
} from "@caller/contra";
import type { Person } from "@caller/hall";
import { TILE_MARGIN_PX } from "./galleryTiles.js";
import { createHallPeople } from "./hallFrame.js";

/**
 * **The dance lab's data** (M9h): one dance, its transcript's record and the
 * candidate readings beside it, each danced over a whole time through at the
 * same line length on the same clock.
 *
 * The seam lab (M3) is the shape this is built on — treatments side by side,
 * one clock, slowed, looped, strips underneath — with two differences, and both
 * of them are what the question needs. The treatments are **records** rather
 * than engines, because what is being chosen is the choreography; and the window
 * is a **whole time through** rather than a seam, because where a dance carries
 * its progression is a fact about the shape of the whole time through and is
 * only visible at the boundary, so the window runs on into the first beats of
 * the next one.
 *
 * Nothing here decides anything. Every number under a column comes from
 * `oraclesFor` on the contra planner — the same function `pnpm dance` prints —
 * and a reading that fails is shown failing.
 */

/**
 * How far past the end of the time through the window runs, in beats.
 *
 * The whole question is what happens **at** the boundary: the seating moves on
 * and the bodies are wherever the dance left them, so a window that stopped at
 * the last beat would stop exactly where the answer is. Eight beats is a phrase
 * of the next time through — long enough to see everybody arrive (or not) on
 * their new place and start the first figure from it.
 */
export const LEAD_ON_BEATS: Beat = 8;

/**
 * The line length the dance is animated at: **six couples**, for all five.
 *
 * "The length where the question shows" is the length where `progressed` is
 * worst, and measured on `main` six is that length, or joint-worst, for every
 * one of the five: Contrablend is 51.2250 px at six against 20.0000 at four and
 * five and 0.0000 at two and three, and Anna's Reel, Jeremy Corners, The Set
 * Monster and Fatal Attraction each read the same number at every checked
 * length. Six is also a real hall shape rather than a corner case — three minor
 * sets in duple improper, three in becket since FR-C2 — and it is the length the
 * brief names for the ones-only and corner dances.
 *
 * `?couples=n` opens any other checked length, and the pass/fail dots under
 * each column are every length whatever this one is, so nothing is hidden by
 * the choice.
 */
export const SHOWN_COUPLES = 6;

/** The dances the lab asks about: the five E6 is open on. */
export const DANCE_LAB_SLUGS: readonly string[] = CANDIDATE_BASES;

/** One column of the lab: the record itself, or one reading of it. */
export interface CandidateColumn {
  /** The id to pick, which is the dance's slug: `contrablend~rollaways`. */
  id: string;
  /** `A`, `B`, `C`, … in the order the columns are laid out. */
  letter: string;
  /** `true` for the first column, which is the record on disk unchanged. */
  isRecord: boolean;
  title: string;
  /** One line: what this reading assumes. */
  assumes: string;
  /** The words this reading is built on, quoted. */
  quotes?: string;
  /** Where the reading came from, when it came from ContraDB. */
  source?: { name: string; url: string };
  /** The clauses the reading writes, as `B1/1 progresses=true`. */
  clauses: readonly string[];
  dance: Dance;
}

/** One dance's whole page: the question, the columns, the lengths. */
export interface DanceLabSection {
  slug: string;
  title: string;
  author: string;
  formation: string;
  /** E6's own question for this dance. */
  question: string;
  /** What ContraDB says about this dance, or that it has no page for it. */
  contraDb: string;
  /** The length the columns are danced at. */
  couples: number;
  /** Every length this dance's formation is checked at. */
  lines: readonly number[];
  columns: readonly CandidateColumn[];
}

/**
 * E6's five questions, one per dance, in the director's own words — and what
 * ContraDB has to say, which for two of the five is a pilcrow against the
 * figure that carries the progression and for three of them is nothing.
 *
 * The questions are quoted rather than paraphrased because they are what the
 * user is being asked, and the ContraDB lines are here rather than in the data
 * package because they are page copy: the candidate files carry the reading and
 * its URL, and this says what the reader needs to know to weigh them.
 */
const ASKED: Record<string, { question: string; contraDb: string }> = {
  contrablend: {
    question:
      "The larks progress one place and the robins three. At which calls do the robins " +
      "actually travel their three places?",
    contraDb:
      "Not on ContraDB: Cary Ravitz's own page there lists ninety-one dances and Contrablend " +
      "is not among them. These three readings come from the Caller's Box transcript.",
  },
  "annas-reel": {
    question: "Everybody swaps sides. Where do you cross to the other line?",
    contraDb:
      "On ContraDB (dance 2207) with no pilcrow at all — and filed as becket, where this " +
      "record is duple improper with a swap-sides progression, which is the Caller's Box's own " +
      "“other; single, swap sides”. So ContraDB answers neither question here, and these three " +
      "readings come from the transcript.",
  },
  "jeremy-corners": {
    question: "Where do the ones end up in the twos' place?",
    contraDb:
      "ContraDB (dance 3242) puts its pilcrow on B2's neighbour swing — the last call of each " +
      "pass — which was not among the three readings the question offered. It leads the list, " +
      "and the other three are still here.",
  },
  "the-set-monster": {
    question: "It is a triple progression. Which calls carry the three places?",
    contraDb:
      "ContraDB (dance 2068) has three pilcrows, one for each place: the robins' pull-by right, " +
      "number two's pull-by left, and the star through with number four. That is the first " +
      "reading below, and it is the only one that takes the three places one at a time.",
  },
  "fatal-attraction": {
    question:
      "Does the promenade round the major set end you across from N2 — so the cast back is " +
      "where you already are — or does the cast back complete the move?",
    contraDb:
      "Not on ContraDB: the Fatal Attraction it holds (dance 1097) is a different dance of the " +
      "same name by Cary Ravitz, and Roger Auman's page there lists one dance, which is not " +
      "this one. These three readings come from the Caller's Box transcript.",
  },
};

/** The letters the columns are labelled with, in order. */
const LETTERS = "ABCDEFG";

/** One dance's section: the record first, then its readings in file order. */
export function danceLabSection(
  slug: string,
  couples = SHOWN_COUPLES,
): DanceLabSection | undefined {
  const record = danceBySlug(slug);
  if (record === undefined || !DANCE_LAB_SLUGS.includes(slug)) return undefined;
  const asked = ASKED[slug];
  const readings = candidatesOf(slug);
  const columns: CandidateColumn[] = [
    {
      id: slug,
      letter: LETTERS[0]!,
      isRecord: true,
      title: "As recorded",
      assumes:
        "Nothing carries it: the record is the transcript with no progression clause on any " +
        "call, so the set moves on at the boundary and the bodies stay where the last figure " +
        "left them.",
      clauses: [],
      dance: record,
    },
  ];
  readings.forEach((reading, i) => {
    const dance = CANDIDATE_DANCES.find((d) => d.slug === candidateSlug(reading.of, reading.id));
    if (dance === undefined) return;
    columns.push({
      id: dance.slug,
      letter: LETTERS[i + 1] ?? String(i + 1),
      isRecord: false,
      title: reading.title,
      assumes: reading.assumes,
      ...(reading.quotes === undefined ? {} : { quotes: reading.quotes }),
      ...(reading.source === undefined ? {} : { source: reading.source }),
      clauses: clausesOf(reading),
      dance,
    });
  });
  return {
    slug,
    title: record.title,
    author: record.author,
    formation: record.formation,
    question: asked?.question ?? "",
    contraDb: asked?.contraDb ?? "",
    couples,
    lines: linesFor(record),
    columns,
  };
}

/** What a reading writes, one line a clause: `B1/1 · progresses = true`. */
function clausesOf(reading: CandidateFile): string[] {
  const out: string[] = [];
  if (reading.progression !== undefined) {
    out.push(`the record's progression becomes ${JSON.stringify(reading.progression)}`);
  }
  for (const patch of reading.patch) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(patch.params ?? {})) {
      parts.push(value === null ? `${key} removed` : `${key} = ${JSON.stringify(value)}`);
    }
    if (patch.who !== undefined) parts.push(`who = ${JSON.stringify(patch.who)}`);
    out.push(`${patch.at} · ${parts.join(", ")}`);
  }
  return out;
}

/** One column, danced: the timeline the page animates and the world to draw it on. */
export interface DanceCandidateTile {
  id: string;
  /** The looping window: one whole time through plus {@link LEAD_ON_BEATS}. */
  window: { start: Beat; beats: Beat };
  /** Beats into the window where the time through ends and the next begins. */
  boundaryAt: Beat;
  timeline: Timeline;
  people: Map<DancerId, Person>;
  world: { w: number; h: number };
  /**
   * The world point the canvas's own centre is, which every pose is drawn
   * relative to.
   *
   * A tile of a **figure** needs none of this: a hands-four is built around its
   * own middle, so the world is symmetric about the origin and the renderer,
   * which has no offset of its own, draws it in the middle. A whole **line** is
   * not: `danceAlone` seats the set with the first couple's place on the origin
   * and the rest of the line running down +y, so six couples reach a hundred px
   * one way and nothing the other, and a symmetric world would be twice as tall
   * as it needs to be with the dancers all in the bottom half. Measured: 236 px
   * of world for 136 px of dancing. So the tile carries the middle of what it
   * actually drew and the canvas subtracts it.
   */
  origin: Vec2;
  /** Every floor point this column's dancers touched over the window. */
  box: { x0: number; x1: number; y0: number; y1: number };
  /** What went wrong, for a reading that cannot be planned at this length. */
  error?: string;
}

/** How often a tile's world is sampled while it is being sized, in beats. */
const BOUNDS_STEP = 0.25;

/**
 * One column's timeline: the whole line at `couples`, one time through and the
 * first beats of the next.
 *
 * The same run `pnpm dance` measures — `danceAlone` on the contra planner with
 * the interpreted figures — so the picture and the numbers under it are the same
 * dance. A reading that cannot be planned at this length comes back as an
 * `error` rather than throwing: the page has three other columns to draw, and
 * "this reading does not plan at six couples" is an answer.
 */
export function danceCandidateTile(dance: Dance, couples: number): DanceCandidateTile {
  const beats = danceBeats(dance);
  const window = { start: 0, beats: beats + LEAD_ON_BEATS };
  const hall = createHall(formationFor(dance), [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
  const people = createHallPeople(hall);
  const empty = {
    id: dance.slug,
    window,
    boundaryAt: beats,
    people,
    world: { w: 64, h: 64 },
    origin: [0, 0] as Vec2,
    box: { x0: 0, x1: 0, y0: 0, y1: 0 },
  };
  let timeline: Timeline;
  try {
    timeline = danceAlone(dance, couples, beats * 2, {}, LAB_RUN).timeline();
  } catch (error) {
    return { ...empty, timeline: emptyTimeline(), error: String(error) };
  }
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const dancer of people.keys()) {
    for (let t = 0; t <= window.beats; t += BOUNDS_STEP) {
      const [x, y] = poseAt(timeline, dancer, window.start + Math.min(t, window.beats)).p;
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
    }
  }
  if (!Number.isFinite(box.x0)) return { ...empty, timeline };
  return { ...empty, timeline, box, ...framed(box) };
}

/** The world and the origin a bounding box asks for: its middle, plus the margin. */
function framed(box: DanceCandidateTile["box"]): {
  world: { w: number; h: number };
  origin: Vec2;
} {
  return {
    world: {
      w: Math.max(64, 2 * Math.ceil((box.x1 - box.x0) / 2 + TILE_MARGIN_PX)),
      h: Math.max(64, 2 * Math.ceil((box.y1 - box.y0) / 2 + TILE_MARGIN_PX)),
    },
    origin: [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2],
  };
}

/**
 * Every column of one dance, on **one world and one origin**.
 *
 * The seam lab does the same thing for the same reason: a reader is comparing
 * two pictures, and a picture drawn at its own scale on its own frame is not
 * comparable with one beside it. A reading that scatters the set wider than the
 * record does would otherwise be drawn smaller and centred on somewhere else,
 * which reads as "the dance moved" when what moved is the camera.
 */
export function danceCandidateTiles(section: DanceLabSection): DanceCandidateTile[] {
  const tiles = section.columns.map((column) => danceCandidateTile(column.dance, section.couples));
  const drawn = tiles.filter((tile) => tile.error === undefined);
  if (drawn.length === 0) return tiles;
  const box = {
    x0: Math.min(...drawn.map((t) => t.box.x0)),
    x1: Math.max(...drawn.map((t) => t.box.x1)),
    y0: Math.min(...drawn.map((t) => t.box.y0)),
    y1: Math.max(...drawn.map((t) => t.box.y1)),
  };
  return tiles.map((tile) => ({ ...tile, ...framed(box) }));
}

/**
 * A timeline with nobody in it, for a column that did not plan.
 *
 * The tile still carries one so the type stays honest — `error` is what the page
 * reads, and it draws no canvas for a column that has one.
 */
const emptyTimeline = (): Timeline => createTimeline(createContraRegistry([], {}));

/** One column's oracles at one length, or what went wrong reading them. */
export interface CandidateMeasure {
  couples: number;
  oracles?: DanceOracles;
  error?: string;
  /** Whether closure, reach, collision and coverage all passed. */
  ok: boolean;
}

/**
 * One column's oracles at one line length, measured exactly as `pnpm dance`
 * measures them, and never thrown.
 *
 * Two times through, which is what the lab runs: a dance's own boundary is
 * inside that window, and the boundary is the question.
 */
export function measureCandidate(dance: Dance, couples: number): CandidateMeasure {
  try {
    const oracles = oraclesFor(dance, couples, danceBeats(dance) * 2, {}, LAB_RUN);
    return { couples, oracles, ok: passes(oracles) };
  } catch (error) {
    return { couples, error: String(error), ok: false };
  }
}

/** Whether a measurement is green on all four gated oracles. */
export const passes = (o: DanceOracles): boolean =>
  o.closurePx < CLOSURE_PX &&
  o.maxShort === 0 &&
  o.minDistancePx > COLLISION_PX &&
  o.coverage.length === 0;

/** One number under a column, with whether it is over its bound. */
export interface CandidateNumber {
  label: string;
  value: string;
  over: boolean;
  detail: string;
}

/**
 * The four numbers a reader needs under a column, in the order `pnpm dance`
 * prints them, plus `progressed` — which is the one E6 is actually about.
 */
export function candidateNumbers(o: DanceOracles): CandidateNumber[] {
  return [
    {
      label: "closure",
      value: `${o.closurePx.toFixed(4)} px`,
      over: o.closurePx >= CLOSURE_PX,
      detail: `AC5: the worst position error at any figure seam. Passes under ${String(CLOSURE_PX)} px.`,
    },
    {
      label: "progressed",
      value: `${o.progressedPx.toFixed(4)} px`,
      over: o.progressedPx >= CLOSURE_PX,
      detail:
        "How far the worst dancer is from the place one progression of the formation gives " +
        "them at the end of the first time through. This is E6's own number: zero means the " +
        "dancing carried everybody to the new place.",
    },
    {
      label: "reach",
      value: `${o.maxShort.toFixed(4)} px short`,
      over: o.maxShort > 0,
      detail: "AC1: the worst a joined pair of hands came up short of an arm's reach.",
    },
    {
      label: "collision",
      value: Number.isFinite(o.minDistancePx) ? `${o.minDistancePx.toFixed(3)} px` : "—",
      over: o.minDistancePx <= COLLISION_PX,
      detail: `AC6: the closest two torso centres ever came. Passes over ${String(COLLISION_PX)} px.`,
    },
  ];
}
