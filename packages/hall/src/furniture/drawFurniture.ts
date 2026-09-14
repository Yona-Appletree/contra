import type { Beat, Hand, PoseSample, Vec2 } from "@caller/core";
import { bodyPoint, dirOf, leftOf } from "@caller/core";
import type { BlitCtx2D } from "../floor/drawFloor.js";
import { drawArms, drawBody, drawHead } from "../person/drawPerson.js";
import { layoutDancer } from "../person/layoutDancer.js";
import type { Ctx2D } from "../renderer/Ctx2D.js";
import { OUTLINE_COLOUR, ell, seg } from "../renderer/Ctx2D.js";
import { SUPERSAMPLE } from "../renderer/Renderer.js";
import type { HallPerson, HallWorld, PropKind } from "../world/layoutHall.js";

const TAU = Math.PI * 2;

/**
 * How far anything in the band moves on the beat. The band is alive but not
 * dancing: a bow, a strum, a nod and a lean, one px each, on the same sine the
 * dancers' quiet motion uses.
 */
export const BAND_MOTION_PX = 1;

/** How far below shoulder height an instrument is held. */
const INSTRUMENT_DROP_PX = 8;

/** Forward and lateral offsets of a hand on an instrument, body-local. */
const INSTRUMENT_FORWARD_PX = 3;
const INSTRUMENT_LATERAL_PX = 3;

/** A sitter's hands rest on their knees. */
const SITTING_DROP_PX = 10;

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
export function drawFurniture(g: BlitCtx2D, hall: HallWorld, beat: Beat): void {
  const people: HallPerson[] = [...hall.band, hall.callerPerson, ...hall.sideLines];
  const layer = superLayer(hall);

  if (layer === null) {
    withWorldOrigin(g, hall, 1, () => paintPeople(g, people, beat));
    return;
  }

  const { canvas, ctx } = layer;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  withWorldOrigin(ctx, hall, SUPERSAMPLE, () => paintPeople(ctx, people, beat));

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

function paintPeople(g: Ctx2D, people: readonly HallPerson[], beat: Beat): void {
  const sorted = [...people].sort((a, b) => a.p[1] - b.p[1]);
  for (const who of sorted) {
    const pose = posture(who, beat);
    const layout = layoutDancer({ person: who.person, pose }, beat);
    drawBody(g, layout);
    drawArms(g, layout);
    drawHead(g, layout);
    if (who.prop !== undefined) drawProp(g, who.prop, who.p, who.facing, beat);
  }
}

/**
 * What one non-dancer is doing at this beat: where their hands are, and the
 * one px of bow, strum, nod or lean that says they are playing.
 */
export function posture(who: HallPerson, beat: Beat): PoseSample {
  const sn = Math.sin(TAU * beat);
  const bow = BAND_MOTION_PX * sn;
  const seated = who.seated === true;
  const drop = seated ? SITTING_DROP_PX : INSTRUMENT_DROP_PX;

  const held = (forward: number, lateral: number): Hand => ({
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
    case "piano":
      hands = {
        L: held(INSTRUMENT_FORWARD_PX + 1, -INSTRUMENT_LATERAL_PX),
        R: held(INSTRUMENT_FORWARD_PX + 1, INSTRUMENT_LATERAL_PX),
      };
      lean = 2 * BAND_MOTION_PX * sn;
      break;
    default:
      if (who.prop === "mic") {
        // The caller holds the mic in front of them with one hand.
        hands = { L: "down", R: held(INSTRUMENT_FORWARD_PX + 1, 1) };
      } else if (seated) {
        hands = {
          L: held(1, -4),
          R: held(1, 4),
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
    ...(seated ? { feet: tuckedFeet(who.taps === true ? sn : 0) } : {}),
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
 */
export function drawProp(g: Ctx2D, kind: PropKind, p: Vec2, facing: number, beat: Beat): void {
  const forward = dirOf(facing);
  const left = leftOf(facing);
  const sn = Math.sin(TAU * beat);

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
