import type { Beat, Hand, PoseSample, Vec2 } from "@caller/core";
import { bodyPoint, dirOf, leftOf } from "@caller/core";
import type { BlitCtx2D } from "../floor/drawFloor.js";
import type { DrawOptions } from "../person/drawPerson.js";
import { drawArms, drawBody, drawHead } from "../person/drawPerson.js";
import { layoutDancer } from "../person/layoutDancer.js";
import type { Ctx2D } from "../renderer/Ctx2D.js";
import { OUTLINE_COLOUR, ell, seg } from "../renderer/Ctx2D.js";
import { SUPERSAMPLE } from "../renderer/Renderer.js";
import type { HallPerson, HallWorld, PropKind } from "../world/layoutHall.js";

const TAU = Math.PI * 2;

/**
 * How far most things in the band move on the beat. The band is alive but not
 * dancing: a bow, a strum, a nod and a lean, one px each, on the same sine the
 * dancers' quiet motion uses. The pianist's hands move on their own, larger
 * constant ({@link PIANO_HAND_MOTION_PX}) — sliding along the keys is the
 * whole of what says they are playing, where the others have an instrument
 * shape to carry some of it.
 */
export const BAND_MOTION_PX = 1;

/** What {@link drawFurniture} takes beyond the hall and the beat. */
export interface FurnitureOptions {
  /**
   * Draw skirts on the band, the caller and the sitters who have one. Default
   * false, and true only where the dancers' own skirts are drawn — the Stage.
   * These people are painted into the floor layer rather than the dancer layer,
   * so the renderer's own `skirts` option cannot reach them.
   */
  skirts?: boolean;
  /**
   * Whether a tune is sounding. Default true.
   *
   * Everything in this layer that moves moves **on the beat** — the fiddler's
   * bow, the guitarist's strumming hand, the bass player's rock, the pianist's
   * hands on the keys, a sitter's tapping foot — and a band that goes on bowing
   * through a silent interval is a band miming (B3's ruling: "the band does not
   * move when it is not playing"). `false` holds every one of those at its rest
   * value; the people, their instruments and their positions are unchanged, so
   * the only difference on the canvas is that nothing twitches.
   */
  playing?: boolean;
}

/** How far below shoulder height an instrument is held. */
const INSTRUMENT_DROP_PX = 14;

/** Forward and lateral offsets of a hand on an instrument, body-local. */
const INSTRUMENT_FORWARD_PX = 2.5;
const INSTRUMENT_LATERAL_PX = 2.5;

/**
 * How far forward of the pianist's body the keyboard sits — far enough that
 * both hands land on the keys `layoutHall.ts` draws (H1's ruling: "the piano
 * player isn't touching the keyboard, looks silly"), close enough that the
 * arm stays inside its 15 px reach at every point in the hands' motion.
 */
const PIANO_HAND_FORWARD_PX = 4.5;

/** How far apart the pianist's two hands sit on the keyboard, either side of centre. */
const PIANO_HAND_LATERAL_PX = 1.2;

/**
 * How far each hand slides along the keys on the beat. Nothing in this world
 * bounces vertically (AGENTS.md's rendering contract), so the "lift and drop"
 * of playing reads as motion along the keyboard instead of off the canvas —
 * the two hands a quarter beat out of phase, so one leads while the other
 * lags rather than both sliding together.
 */
const PIANO_HAND_MOTION_PX = 1.2;

/** How far below shoulder height the pianist's hands sit on the keys. */
const PIANO_HAND_DROP_PX = 12;

/**
 * A sitter who is not playing rests their hands on their knees: forward of the
 * body, in against the hips, and at very nearly arm's length, so the elbows
 * tuck down beside the ribs instead of winging out to the sides. This is gate
 * G1's resting-arm ruling applied to M4's sitters — "you can't see much arm
 * when someone is just standing there", and no more of one when they are
 * sitting.
 */
const SITTER_HAND_FORWARD_PX = 3.5;
const SITTER_HAND_LATERAL_PX = 3;
const SITTER_HAND_DROP_PX = 13.5;

const FIDDLE_BODY = "#8a4a22";
const FIDDLE_BOW = "#d9c08a";
const GUITAR_BODY = "#b07a3a";
const GUITAR_NECK = "#5a3418";
const GUITAR_HOLE = "#1a1410";
const BASS_BODY = "#5a3418";
const BASS_NECK = "#3a2010";
const MIC_POST = "#2a2422";
const MIC_HEAD = "#4a4442";

/**
 * Draw everybody in the hall who is not dancing: the four-piece band on the
 * stage, the caller at the mic, and the sitters along the side lines and by the
 * snack table — each with whatever they are holding.
 *
 * Drawn over the floor, into the same layer, in world coordinates. Sorted up
 * the screen, so somebody further back is behind somebody in front.
 *
 * Like the dancers, the people here are drawn on a supersampled layer and
 * downsampled, so the band and the dance floor are the same kind of pixels.
 */
export function drawFurniture(
  g: BlitCtx2D,
  hall: HallWorld,
  beat: Beat,
  opts: FurnitureOptions = {},
): void {
  const people: HallPerson[] = [...hall.band, hall.callerPerson, ...hall.sideLines];
  const layer = superLayer(hall);
  const draw: DrawOptions = { skirts: opts.skirts ?? false };
  const playing = opts.playing ?? true;

  if (layer === null) {
    withWorldOrigin(g, hall, 1, () => paintPeople(g, people, beat, draw, playing));
    return;
  }

  const { canvas, ctx } = layer;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  withWorldOrigin(ctx, hall, SUPERSAMPLE, () => paintPeople(ctx, people, beat, draw, playing));

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(canvas, 0, 0, hall.world.w, hall.world.h);
  g.restore();
}

/** Throw the supersample layer away. For a story that resizes the hall. */
export function clearFurnitureLayer(): void {
  shared = null;
}

let shared: { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null = null;

function superLayer(hall: HallWorld): typeof shared {
  if (typeof OffscreenCanvas === "undefined") return null;
  const w = hall.world.w * SUPERSAMPLE;
  const h = hall.world.h * SUPERSAMPLE;
  if (shared === null || shared.canvas.width !== w || shared.canvas.height !== h) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    shared = { canvas, ctx };
  }
  return shared;
}

function withWorldOrigin(g: Ctx2D, hall: HallWorld, scale: number, paint: () => void): void {
  g.save();
  g.setTransform(scale, 0, 0, scale, (scale * hall.world.w) / 2, (scale * hall.world.h) / 2);
  paint();
  g.restore();
}

function paintPeople(
  g: Ctx2D,
  people: readonly HallPerson[],
  beat: Beat,
  draw: DrawOptions,
  playing: boolean,
): void {
  const sorted = [...people].sort((a, b) => a.p[1] - b.p[1]);
  for (const who of sorted) {
    const pose = posture(who, beat, playing);
    const layout = layoutDancer({ person: who.person, pose }, beat);
    drawBody(g, layout, draw);
    drawArms(g, layout, draw);
    drawHead(g, layout, draw);
    if (who.prop !== undefined) drawProp(g, who.prop, who.p, who.facing, beat, playing);
  }
}

/**
 * What one non-dancer is doing at this beat: where their hands are, and the
 * bow, strum, nod, lean or keyboard slide that says they are playing.
 *
 * `playing` false — the between-dances interval, when no tune is sounding —
 * holds every beat-driven term at zero. The hands stay on their instrument and
 * the pianist's stay on the keys; what stops is the motion, which is the whole
 * of what says anybody is playing.
 */
export function posture(who: HallPerson, beat: Beat, playing = true): PoseSample {
  const sn = playing ? Math.sin(TAU * beat) : 0;
  const bow = BAND_MOTION_PX * sn;
  const seated = who.seated === true;

  const held = (forward: number, lateral: number, drop = INSTRUMENT_DROP_PX): Hand => ({
    p: bodyPoint(who.p, who.facing, forward, lateral),
    drop,
  });

  let hands: PoseSample["hands"] = { L: "down", R: "down" };
  let lean = 0;

  switch (who.instrument) {
    case "fiddle":
      // The bow arm saws across the body; the fingering hand stays put.
      hands = {
        L: held(INSTRUMENT_FORWARD_PX, -INSTRUMENT_LATERAL_PX),
        R: held(INSTRUMENT_FORWARD_PX + bow, INSTRUMENT_LATERAL_PX + bow),
      };
      break;
    case "guitar":
      hands = {
        L: held(INSTRUMENT_FORWARD_PX, -INSTRUMENT_LATERAL_PX),
        R: held(INSTRUMENT_FORWARD_PX, INSTRUMENT_LATERAL_PX + bow),
      };
      break;
    case "bass":
      // A nod, not a strum: the whole torso rocks a px forward and back.
      hands = {
        L: held(INSTRUMENT_FORWARD_PX, -INSTRUMENT_LATERAL_PX - 1),
        R: held(INSTRUMENT_FORWARD_PX - 1, INSTRUMENT_LATERAL_PX),
      };
      lean = 2 * BAND_MOTION_PX * sn;
      break;
    case "piano": {
      // Both hands rest on the keys and slide a couple of px along them, a
      // quarter beat apart, so they alternate rather than moving as one.
      const csn = playing ? Math.sin(TAU * beat + Math.PI / 2) : 0;
      hands = {
        L: held(
          PIANO_HAND_FORWARD_PX,
          -PIANO_HAND_LATERAL_PX + PIANO_HAND_MOTION_PX * sn,
          PIANO_HAND_DROP_PX,
        ),
        R: held(
          PIANO_HAND_FORWARD_PX,
          PIANO_HAND_LATERAL_PX + PIANO_HAND_MOTION_PX * csn,
          PIANO_HAND_DROP_PX,
        ),
      };
      lean = 2 * BAND_MOTION_PX * sn;
      break;
    }
    default:
      if (who.prop === "mic") {
        // The caller holds the mic in front of them with one hand.
        hands = { L: "down", R: held(INSTRUMENT_FORWARD_PX + 1, 1) };
      } else if (seated) {
        const rest = (lateral: number): Hand => ({
          p: bodyPoint(who.p, who.facing, SITTER_HAND_FORWARD_PX, lateral),
          drop: SITTER_HAND_DROP_PX,
        });
        hands = {
          L: rest(-SITTER_HAND_LATERAL_PX),
          R: rest(SITTER_HAND_LATERAL_PX),
        };
      }
      break;
  }

  return {
    p: who.p,
    facing: who.facing,
    look: who.facing,
    lean,
    hands,
    stepRate: 1,
    buzz: false,
    flare: 0,
    // Nobody here is dancing, so nothing swings but what this function says.
    amp: 0,
    ...(seated ? { feet: tuckedFeet(who.taps === true && playing ? sn : 0) } : {}),
  };
}

/** A sitter's feet, tucked under the chair, one of them tapping the beat. */
function tuckedFeet(tap: number): { L: Vec2; R: Vec2 } {
  return {
    L: [1.5, -1.8],
    R: [1.5 + BAND_MOTION_PX * tap, 1.8],
  };
}

/**
 * Draw an instrument or a mic beside the person holding it, seen from above.
 *
 * The hall spike drew its props for the front view that gate 2 rejected, so
 * these are the same four objects redrawn as they look from the ceiling.
 *
 * `playing` false stills the one part of a prop that moves — the fiddle bow —
 * for the same reason {@link posture} stills the hands that hold it.
 */
export function drawProp(
  g: Ctx2D,
  kind: PropKind,
  p: Vec2,
  facing: number,
  beat: Beat,
  playing = true,
): void {
  const forward = dirOf(facing);
  const left = leftOf(facing);
  const sn = playing ? Math.sin(TAU * beat) : 0;

  switch (kind) {
    case "fiddle": {
      // Tucked under the chin, pointing out over the left shoulder.
      const root = bodyPoint(p, facing, 2.5, -2);
      const tip = bodyPoint(p, facing, 5.5, -6.5);
      seg(g, root, tip, 2.6, OUTLINE_COLOUR);
      seg(g, root, tip, 1.6, FIDDLE_BODY);
      // The bow crosses the strings and saws a px back and forth.
      const bowA = bodyPoint(p, facing, 4 + sn, -6.5);
      const bowB = bodyPoint(p, facing, 4 + sn, 0.5);
      seg(g, bowA, bowB, 1, FIDDLE_BOW);
      break;
    }
    case "guitar": {
      const body = bodyPoint(p, facing, 4, 1);
      const neck = bodyPoint(p, facing, 4.5, -6.5);
      seg(g, body, neck, 1.8, GUITAR_NECK);
      ell(g, body[0], body[1], 3.4, 2.6, angleOf(left), GUITAR_BODY, true);
      ell(g, body[0], body[1], 0.9, 0.9, 0, GUITAR_HOLE);
      break;
    }
    case "bass": {
      // A big body standing on the floor at the player's right.
      const body = bodyPoint(p, facing, 3.5, 4.5);
      const scroll = bodyPoint(p, facing, 1, 11);
      seg(g, body, scroll, 1.6, BASS_NECK);
      ell(g, body[0], body[1], 4.6, 3.4, angleOf(forward), BASS_BODY, true);
      break;
    }
    case "mic": {
      const stand = bodyPoint(p, facing, 5.5, 0);
      ell(g, stand[0], stand[1], 2.2, 2.2, 0, MIC_POST, true);
      ell(g, stand[0], stand[1], 1.1, 1.1, 0, MIC_HEAD);
      break;
    }
    case "piano":
      // The piano is part of the hall, not a hand prop: drawFloor draws it.
      break;
  }
}

const angleOf = (v: Vec2): number => Math.atan2(v[1], v[0]);
