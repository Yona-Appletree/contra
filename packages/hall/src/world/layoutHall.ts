import type { Angle, Vec2 } from "@caller/core";
import { HOLD_SPACING_PX, LINE_OFFSET_PX } from "@caller/core";
import { mulberry32 } from "../appearance/mulberry32.js";
import type { Person } from "../person/Person.js";
import { createPerson } from "../person/Person.js";
import type { World } from "../renderer/World.js";

/**
 * What a hall is asked for: how many lines of dancers, and how long each is.
 *
 * `couplesPerLine` has one entry per line, so `{ lines: 2, couplesPerLine:
 * [5, 4] }` is the demo's hall — two lines, five couples and four.
 */
export interface HallLayout {
  lines: number;
  couplesPerLine: number[];
  /** Integer display zoom for the world this produces. Default 1. */
  zoom?: number;
  /** Seed for the band, the caller and the sitters. Default {@link DEFAULT_HALL_SEED}. */
  seed?: number;
}

/** The band, the caller and the sitters are the same hall every time by default. */
export const DEFAULT_HALL_SEED = 42;

/** Width of the strip outside the outermost line: wall, chairs, room to stand. */
export const SIDE_W = 30;

/** Distance between the centre lines of two adjacent sets. */
export const SET_PITCH = 104;

/** Distance down a line between one couple and the next. */
export const COUPLE_PITCH_PX = 20;

/**
 * How far apart the two lines of a set stand, across the set. A pair holding
 * two hands is {@link HOLD_SPACING_PX} apart and the lines stand
 * {@link LINE_OFFSET_PX} further apart than that (plan AC3).
 */
export const LINES_APART_PX = HOLD_SPACING_PX + LINE_OFFSET_PX;

/** Thickness of the hall's inward-facing walls, all four sides. */
export const WALL_PX = 8;

/** Depth of the stage, from the back wall to the stage lip. */
export const STAGE_DEPTH_PX = 58;

/** Gap between the stage lip and the top of the dance floor. */
export const STAGE_TO_FLOOR_PX = 5;

/** Gap between the top of the dance floor and the first couple's position. */
export const FLOOR_TO_FIRST_COUPLE_PX = 40;

/** Floor left below the last couple, for the wait-out spot and the table. */
export const FLOOR_TAIL_PX = 62;

/** Which instrument a band member plays. */
export type BandInstrument = "fiddle" | "guitar" | "bass" | "piano";

/** A prop drawn beside the person holding it. */
export type PropKind = BandInstrument | "mic";

/** One line of dancers: where its couples stand. */
export interface SetGeometry {
  /** Which line this is, left to right from 0. */
  index: number;
  /** World x of the line's centre — the two lines of dancers straddle it. */
  cx: number;
  /** World y of the first couple in the line. */
  top: number;
  /** How many couples are in it. */
  couples: number;
  /** Where couple `m` stands, counting from the top of the line. */
  centre(m: number): Vec2;
}

/** Somebody in the hall who is not dancing: a musician, the caller, a sitter. */
export interface HallPerson {
  person: Person;
  /** Where they stand or sit, world coordinates. */
  p: Vec2;
  facing: Angle;
  /** What they are holding, if anything. */
  prop?: PropKind;
  /** Which instrument, for the beat-driven motion. */
  instrument?: BandInstrument;
  /** A sitter who taps their foot along with the tune. */
  taps?: boolean;
  /** Sitting down: drawn with the feet tucked under. */
  seated?: boolean;
}

/** The stage across the top of the hall, in world coordinates. */
export interface StageGeometry {
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  /** Where the upright piano stands, drawn into the floor. */
  piano: { x: number; y: number; w: number; h: number };
}

/** The snack table down one side. */
export interface TableGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A whole hall: the world to draw it in and where everything in it stands.
 *
 * Every coordinate is a world coordinate — the origin is the centre of the
 * world canvas, as it is for dancers — so a set centre can be handed straight
 * to a figure and a prop can be handed straight to the floor.
 */
export interface HallWorld {
  world: World;
  layout: HallLayout;
  sets: SetGeometry[];
  stage: StageGeometry;
  /** Where the caller stands, at the front of the stage. */
  caller: Vec2;
  /** The four-piece band, the caller and the sitters, in that order. */
  band: HallPerson[];
  callerPerson: HallPerson;
  sideLines: HallPerson[];
  chairs: Vec2[];
  table: TableGeometry;
  /** World y of the top and bottom edges of the dance floor. */
  floorTop: number;
  floorBottom: number;
  wall: number;
}

/**
 * Lay out a hall: its world size, where each line of dancers stands, and where
 * the stage, the band, the caller, the chairs and the table are.
 *
 * The width is fixed by the number of lines — `SIDE_W * 2 + SET_PITCH * lines`
 * — and the height by the longest line, so a hall is the same shape every time
 * it is asked for and nothing has to reflow when a dance starts.
 */
export function layoutHall(layout: HallLayout): HallWorld {
  const { lines, couplesPerLine } = layout;
  if (!Number.isInteger(lines) || lines < 1) {
    throw new Error(`hall: a hall has at least one line, got ${lines}`);
  }
  if (couplesPerLine.length !== lines) {
    throw new Error(
      `hall: ${lines} lines need ${lines} entries in couplesPerLine, got ${couplesPerLine.length}`,
    );
  }
  if (couplesPerLine.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error(`hall: every line has at least one couple, got [${couplesPerLine.join(", ")}]`);
  }

  const w = SIDE_W * 2 + SET_PITCH * lines;
  const stageTop = WALL_PX;
  const stageBottom = stageTop + STAGE_DEPTH_PX;
  const floorTop = stageBottom + STAGE_TO_FLOOR_PX;
  const setTop = floorTop + FLOOR_TO_FIRST_COUPLE_PX;
  const longest = Math.max(...couplesPerLine);
  const floorBottom = setTop + longest * COUPLE_PITCH_PX + FLOOR_TAIL_PX;
  // Even, so that a world coordinate of 0 lands on a pixel boundary in both axes.
  const h = even(floorBottom + WALL_PX);

  const world: World = { w, h, zoom: layout.zoom ?? 1 };
  // Spike coordinates have their origin at the top-left corner; world
  // coordinates have it in the middle. Everything below is converted once.
  const cx = (sx: number): number => sx - w / 2;
  const cy = (sy: number): number => sy - h / 2;

  const stageX0 = Math.max(WALL_PX + 22, Math.round(w * 0.14));
  const stageX1 = w - stageX0;
  const stage: StageGeometry = {
    top: cy(stageTop),
    bottom: cy(stageBottom),
    x0: cx(stageX0),
    x1: cx(stageX1),
    // `stageTop + 15`, not `+ 8`: the pianist's hands have to reach the keys
    // (H1's ruling), and the old gap of 8 px between the keyboard and the
    // bench left them hanging in the air in front of it. 15 brings the near
    // edge to 1 px off the bench, close enough that both hands reach the
    // keys without the arm ever exceeding its 15 px reach.
    piano: { x: cx(stageX1 - 38), y: cy(stageTop + 15), w: 34, h: 18 },
  };

  const sets: SetGeometry[] = couplesPerLine.map((couples, index) => {
    const centreX = cx(SIDE_W + SET_PITCH * index + SET_PITCH / 2);
    const top = cy(setTop);
    return {
      index,
      cx: centreX,
      top,
      couples,
      centre: (m: number): Vec2 => [centreX, top + m * COUPLE_PITCH_PX],
    };
  });

  const rng = mulberry32(layout.seed ?? DEFAULT_HALL_SEED);
  let sequence = 0;
  function who(role: string, p: Vec2, facing: Angle, extra: Partial<HallPerson> = {}): HallPerson {
    sequence += 1;
    return {
      person: createPerson({
        id: `${role}-${sequence}`,
        role,
        seed: Math.floor(rng() * 0x7fffffff),
      }),
      p,
      facing,
      ...extra,
    };
  }

  // The band takes the right of the stage and the caller the left, because the
  // caller's bubble hangs above their head and would otherwise sit on top of
  // the fiddler for the whole of every call.
  const stageWidth = stageX1 - stageX0;
  const onStage = (fraction: number): number => cx(Math.round(stageX0 + stageWidth * fraction));
  const band: HallPerson[] = [
    who("band", [onStage(0.43), cy(stageTop + 34)], 90, {
      prop: "fiddle",
      instrument: "fiddle",
    }),
    who("band", [onStage(0.57), cy(stageTop + 30)], 90, {
      prop: "bass",
      instrument: "bass",
    }),
    who("band", [onStage(0.72), cy(stageTop + 36)], 90, {
      prop: "guitar",
      instrument: "guitar",
    }),
    who("band", [onStage(0.89), cy(stageTop + 34)], 270, {
      instrument: "piano",
      seated: true,
    }),
  ];

  const callerP: Vec2 = [onStage(0.14), cy(stageBottom - 4)];
  const callerPerson = who("caller", callerP, 90, { prop: "mic" });

  const chairs: Vec2[] = [];
  const sideLines: HallPerson[] = [];
  for (let y = floorTop + 30; y < floorBottom - 40; y += 20) {
    chairs.push([cx(WALL_PX + 4), cy(y)]);
    if (rng() < 0.55) {
      sideLines.push(
        who("sitter", [cx(WALL_PX + 8), cy(y + 6)], 0, { seated: true, taps: rng() < 0.5 }),
      );
    }
  }
  for (let y = floorTop + 30; y < floorBottom - 40; y += 20) {
    chairs.push([cx(w - WALL_PX - 12), cy(y)]);
    if (rng() < 0.45) {
      sideLines.push(
        who("sitter", [cx(w - WALL_PX - 8), cy(y + 6)], 180, { seated: true, taps: rng() < 0.5 }),
      );
    }
  }

  const table: TableGeometry = {
    x: cx(w - WALL_PX - 46),
    y: cy(floorBottom - 20),
    w: 34,
    h: 13,
  };
  sideLines.push(who("sitter", [table.x - 8, table.y - 2], 60));
  sideLines.push(who("sitter", [table.x - 20, table.y + 2], 20));

  return {
    world,
    layout,
    sets,
    stage,
    caller: callerP,
    band,
    callerPerson,
    sideLines,
    chairs,
    table,
    floorTop: cy(floorTop),
    floorBottom: cy(floorBottom),
    wall: WALL_PX,
  };
}

const even = (n: number): number => (n % 2 === 0 ? n : n + 1);
