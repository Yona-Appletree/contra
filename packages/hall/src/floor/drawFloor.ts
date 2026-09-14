import { mulberry32 } from "../appearance/mulberry32.js";
import { shade } from "../appearance/shade.js";
import type { Ctx2D } from "../renderer/Ctx2D.js";
import { circ } from "../renderer/Ctx2D.js";
import type { HallWorld } from "../world/layoutHall.js";

/**
 * A context that can also blit a prepared layer. The floor is painted once per
 * layout and theme and then stamped, which `Ctx2D` alone cannot express.
 * A real canvas context of either kind satisfies it.
 */
export interface BlitCtx2D extends Ctx2D {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  drawImage(image: OffscreenCanvas, dx: number, dy: number): void;
  drawImage(image: OffscreenCanvas, dx: number, dy: number, dw: number, dh: number): void;
}

/** The three halls the spike settled: a grange, a school gym, an evening hall. */
export type HallTheme = "grange" | "gym" | "night";

/** Every colour one hall is painted in. Ported from the hall spike's `HALLS`. */
export interface HallPalette {
  /** The wall band seen from above, and the darker inward face of it. */
  wall: string;
  wallTop: string;
  wallIn: string;
  /** The two board colours, the seam between boards, and the knots in them. */
  floorA: string;
  floorB: string;
  seam: string;
  knot: string;
  /** The stage deck, its lip, its front face and the curtain along the back. */
  stageA: string;
  stageB: string;
  stageLip: string;
  stageFront: string;
  curtain: string;
  curtainD: string;
  /** Window glass in the side walls. */
  glass: string;
  /** Outside the hall: seen through the doorway. */
  out: string;
  /** Painted court lines, gym only. */
  court?: string;
  /** Warm pools of lamplight on the floor, night only. */
  lamps?: boolean;
}

export const HALL_THEMES: Readonly<Record<HallTheme, HallPalette>> = Object.freeze({
  grange: {
    wall: "#5a4636",
    wallTop: "#75604c",
    wallIn: "#3d2d22",
    floorA: "#c9a06a",
    floorB: "#c2985f",
    seam: "#a77f4e",
    knot: "#9a7043",
    stageA: "#8a6238",
    stageB: "#7e5832",
    stageLip: "#a57a4a",
    stageFront: "#4a3221",
    curtain: "#7a2430",
    curtainD: "#5a1a24",
    glass: "#9fbad0",
    out: "#0c0a09",
  },
  gym: {
    wall: "#6c7a86",
    wallTop: "#8592a0",
    wallIn: "#4d5964",
    floorA: "#dccb9f",
    floorB: "#d6c599",
    seam: "#c9b88c",
    knot: "#c9b88c",
    stageA: "#8a6238",
    stageB: "#7e5832",
    stageLip: "#a57a4a",
    stageFront: "#4a3221",
    curtain: "#2c4a7a",
    curtainD: "#1e3556",
    glass: "#b8cad8",
    out: "#0c0a09",
    court: "#c48a5a",
  },
  night: {
    wall: "#2e2520",
    wallTop: "#3d312a",
    wallIn: "#1e1714",
    floorA: "#8f6a3f",
    floorB: "#866337",
    seam: "#6e4f2c",
    knot: "#5f4325",
    stageA: "#5e4326",
    stageB: "#553c22",
    stageLip: "#6b4c2c",
    stageFront: "#2e2014",
    curtain: "#4a1620",
    curtainD: "#35101a",
    glass: "#3a4a60",
    out: "#050403",
    lamps: true,
  },
});

/** Height of one run of floor boards, and how often a board seam falls. */
const BOARD_H = 5;
const BOARD_SEAM_PITCH = 37;

/** Colours of the things standing on the floor, shared by every theme. */
const CHAIR_SEAT = "#7a5232";
const CHAIR_BACK = "#5a3a22";
const CHAIR_LEG = "#3a2416";
const TABLE_CLOTH = "#e8e2d6";
const TABLE_EDGE = "#c9c0b0";
const TABLE_URN = "#4c7fc9";
const TABLE_CUP = "#ffffff";
const PIANO_BODY = "#3a2416";
const PIANO_DARK = "#2a1a10";
const PIANO_KEYS = "#efe6d0";
const SPEAKER = "#1a1614";
const SPEAKER_CONE = "#3a3230";

/**
 * Paint the hall itself into the floor layer: the boards, the walls seen from
 * above with their inward faces, the stage and its curtain, the piano, the
 * chairs down both sides and the snack table.
 *
 * Cached per layout and theme — none of it moves — and stamped from the cache
 * on every later call, so the furniture on top of it can be redrawn each frame
 * for a few hundred microseconds.
 *
 * Drawn in world coordinates: the origin is the centre of the world canvas, as
 * it is for dancers.
 */
export function drawFloor(g: BlitCtx2D, hall: HallWorld, theme: HallTheme = "grange"): void {
  const cached = cachedFloor(hall, theme);
  if (cached === null) {
    withWorldOrigin(g, hall, () => paintFloor(g, hall, theme));
    return;
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(cached, 0, 0);
  g.restore();
}

/** Throw the floor cache away. For a story or a test that changes a palette. */
export function clearFloorCache(): void {
  cache.clear();
}

const cache = new Map<string, OffscreenCanvas>();

function cachedFloor(hall: HallWorld, theme: HallTheme): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const { w, h } = hall.world;
  const key = `${w}x${h}|${theme}|${hall.layout.couplesPerLine.join(",")}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  withWorldOrigin(ctx, hall, () => paintFloor(ctx, hall, theme));
  cache.set(key, canvas);
  return canvas;
}

/** Run `paint` with world coordinates: origin at the centre of the canvas. */
function withWorldOrigin(g: Ctx2D, hall: HallWorld, paint: () => void): void {
  g.save();
  g.setTransform(1, 0, 0, 1, hall.world.w / 2, hall.world.h / 2);
  paint();
  g.restore();
}

function paintFloor(g: Ctx2D, hall: HallWorld, theme: HallTheme): void {
  const c = HALL_THEMES[theme];
  const { w, h } = hall.world;
  const left = -w / 2;
  const top = -h / 2;
  const right = left + w;

  g.globalAlpha = 1;
  g.fillStyle = c.out;
  g.fillRect(left, top, w, h);

  // The boards: runs of five px, a seam line under each run, and board joints
  // staggered across the hall with the odd knot in them.
  const rng = mulberry32(7);
  for (let i = 0; i * BOARD_H < h; i++) {
    const y = top + i * BOARD_H;
    g.fillStyle = i % 2 === 0 ? c.floorB : c.floorA;
    g.fillRect(left, y, w, BOARD_H);
    if (theme !== "gym") {
      const offset = (i * 13) % BOARD_SEAM_PITCH;
      for (let x = left + offset; x < right; x += BOARD_SEAM_PITCH) {
        g.fillStyle = c.seam;
        g.fillRect(x, y, 1, BOARD_H);
        if (rng() < 0.15) {
          g.fillStyle = c.knot;
          g.fillRect(x + Math.floor(rng() * 30), y + 2, 2, 1);
        }
      }
      g.fillStyle = c.seam;
      g.fillRect(left, y + BOARD_H - 1, w, 1);
    }
  }

  if (c.court !== undefined) {
    paintCourtLines(g, hall, c.court);
  }
  if (c.lamps === true) {
    paintLamplight(g, hall);
  }

  paintWalls(g, hall, c);
  paintStage(g, hall, c);

  for (const [x, y] of hall.chairs) {
    // A chair from above: the back against the wall, the seat, two front legs.
    const facingRight = x < 0;
    g.fillStyle = CHAIR_BACK;
    g.fillRect(facingRight ? x : x + 7, y, 1, 8);
    g.fillStyle = CHAIR_SEAT;
    g.fillRect(facingRight ? x + 1 : x, y + 1, 7, 6);
    g.fillStyle = CHAIR_LEG;
    g.fillRect(facingRight ? x + 7 : x, y + 1, 1, 1);
    g.fillRect(facingRight ? x + 7 : x, y + 6, 1, 1);
  }

  const t = hall.table;
  g.fillStyle = TABLE_CLOTH;
  g.fillRect(t.x, t.y, t.w, t.h - 3);
  g.fillStyle = TABLE_EDGE;
  g.fillRect(t.x, t.y + t.h - 3, t.w, 3);
  g.fillStyle = TABLE_URN;
  g.fillRect(t.x + 3, t.y + 2, 5, 6);
  g.fillStyle = TABLE_CUP;
  for (let i = 0; i < 6; i++) g.fillRect(t.x + 12 + i * 3, t.y + 3 + (i % 2), 2, 2);

  g.globalAlpha = 1;
}

function paintWalls(g: Ctx2D, hall: HallWorld, c: HallPalette): void {
  const { w, h } = hall.world;
  const left = -w / 2;
  const top = -h / 2;
  const wall = hall.wall;

  // The wall tops, seen from directly above, with the darker inward face just
  // inside them: the LttP trick that makes a flat top-down room read as walls.
  g.fillStyle = c.wallTop;
  g.fillRect(left, top, w, wall);
  g.fillRect(left, top + h - wall, w, wall);
  g.fillRect(left, top, wall, h);
  g.fillRect(left + w - wall, top, wall, h);

  g.fillStyle = c.wallIn;
  g.fillRect(left + wall, top + wall, w - 2 * wall, 3);
  g.fillRect(left + wall, top + h - wall - 3, w - 2 * wall, 3);
  g.fillRect(left + wall, top + wall, 3, h - 2 * wall);
  g.fillRect(left + w - wall - 3, top + wall, 3, h - 2 * wall);

  g.fillStyle = c.wall;
  g.fillRect(left, top, wall, wall);
  g.fillRect(left + w - wall, top, wall, wall);
  g.fillRect(left, top + h - wall, wall, wall);
  g.fillRect(left + w - wall, top + h - wall, wall, wall);

  g.fillStyle = shade(c.wallTop, 1.15);
  g.fillRect(left, top, w, 1);
  g.fillRect(left, top, 1, h);

  // Windows down both side walls.
  for (let y = hall.floorTop + 14; y < hall.floorBottom - 24; y += 48) {
    g.fillStyle = c.glass;
    g.fillRect(left + 2, y, wall - 4, 14);
    g.fillRect(left + w - wall + 2, y, wall - 4, 14);
    g.fillStyle = c.wallIn;
    g.fillRect(left + 2, y + 7, wall - 4, 1);
    g.fillRect(left + w - wall + 2, y + 7, wall - 4, 1);
  }

  // The door at the bottom of the hall.
  g.fillStyle = c.out;
  g.fillRect(-14, top + h - wall, 28, wall);
  g.fillStyle = c.wallIn;
  g.fillRect(-15, top + h - wall, 1, wall);
  g.fillRect(14, top + h - wall, 1, wall);
}

function paintStage(g: Ctx2D, hall: HallWorld, c: HallPalette): void {
  const s = hall.stage;
  const width = s.x1 - s.x0;
  const depth = s.bottom - s.top;

  for (let x = s.x0; x < s.x1; x += 6) {
    g.fillStyle = Math.round((x - s.x0) / 6) % 2 === 0 ? c.stageB : c.stageA;
    g.fillRect(x, s.top, 6, depth);
  }
  g.fillStyle = c.stageLip;
  g.fillRect(s.x0, s.bottom, width, 1);
  g.fillStyle = c.stageFront;
  g.fillRect(s.x0, s.bottom + 1, width, 4);
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(s.x0, s.bottom + 5, width, 3);

  // The curtain hangs along the back wall of the stage.
  for (let x = s.x0; x < s.x1; x += 4) {
    g.fillStyle = Math.round((x - s.x0) / 4) % 2 === 0 ? c.curtainD : c.curtain;
    g.fillRect(x, s.top, 4, 7);
  }

  // Steps down off the left end of the stage.
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i % 2 === 0 ? c.stageB : c.stageA;
    g.fillRect(s.x0 - 10 + i * 3, s.bottom + 2 - i * 2, 10 - i * 3 + 3, 3);
  }

  // Two speakers on the floor at the corners of the stage.
  g.fillStyle = SPEAKER;
  g.fillRect(s.x0 + 3, s.bottom + 7, 9, 12);
  g.fillRect(s.x1 - 12, s.bottom + 7, 9, 12);
  g.fillStyle = SPEAKER_CONE;
  g.fillRect(s.x0 + 6, s.bottom + 10, 3, 3);
  g.fillRect(s.x1 - 9, s.bottom + 10, 3, 3);

  // The upright piano, seen from above: a dark body with the keys facing out.
  const p = s.piano;
  g.fillStyle = PIANO_BODY;
  g.fillRect(p.x, p.y, p.w, p.h - 2);
  g.fillStyle = PIANO_DARK;
  g.fillRect(p.x, p.y + p.h - 2, p.w, 2);
  g.fillStyle = PIANO_KEYS;
  g.fillRect(p.x + 2, p.y + p.h - 5, p.w - 4, 3);
  for (let x = p.x + 4; x < p.x + p.w - 4; x += 3) {
    g.fillStyle = PIANO_DARK;
    g.fillRect(x, p.y + p.h - 5, 1, 2);
  }
  g.fillStyle = CHAIR_LEG;
  g.fillRect(p.x + 8, p.y + p.h + 10, 18, 3);
}

function paintCourtLines(g: Ctx2D, hall: HallWorld, court: string): void {
  const { w } = hall.world;
  const left = -w / 2 + hall.wall + 20;
  const width = w - 2 * hall.wall - 40;
  const top = hall.floorTop + 20;
  const height = hall.floorBottom - hall.floorTop - 40;
  g.globalAlpha = 0.5;
  g.fillStyle = court;
  g.fillRect(left, top, width, 2);
  g.fillRect(left, top + height - 2, width, 2);
  g.fillRect(left, top, 2, height);
  g.fillRect(left + width - 2, top, 2, height);
  g.beginPath();
  g.arc(0, top + height / 2, 30, 0, Math.PI * 2);
  g.lineWidth = 2;
  g.strokeStyle = court;
  g.stroke();
  g.globalAlpha = 1;
}

/**
 * Pools of warm lamplight on the floor. The spike used a radial gradient;
 * nested translucent circles keep it inside the pixel budget and inside
 * {@link Ctx2D}.
 */
function paintLamplight(g: Ctx2D, hall: HallWorld): void {
  const mid = (hall.floorTop + hall.floorBottom) / 2;
  const { w } = hall.world;
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + w * (0.25 + 0.25 * i);
    for (let ring = 7; ring >= 1; ring--) {
      g.globalAlpha = 0.035;
      circ(g, x, mid, ring * 18, "#ffdc96");
    }
  }
  g.globalAlpha = 1;
}
