import { q256 } from "@caller/core";
import type { DancerId } from "../../src/dialect/Dialect.js";
import { sampleAt } from "../../src/motion/Trajectory.js";
import type { Vec3 } from "../../src/motion/Vec3.js";
import type { HandPlate } from "../../src/solver/solveBody.js";
import { boundsOf } from "../project.js";
import {
  alphaOf,
  colourOf,
  el,
  linesOf,
  mix,
  paneShell,
  setPoints,
  skinOf,
  type Pane,
  type View,
} from "../view.js";

const METRE_PX = 25;
/** Six screen pixels to a world pixel for a short set, four for a long one — never a fraction of one. */
const zoomFor = (couples: number): number => (couples <= 3 ? 6 : 4);

/**
 * The floor from above, painted one world pixel at a time and then magnified
 * — never drawn at a fraction of a pixel and smoothed (DA13, the user's own
 * taste: an integer-pixel render, positions quantised to 1/256 px first).
 *
 * Clothes are the role colour; the hands and the head are skin, two tones by
 * dancer; the **top** hand of a stacked hold is painted last, which is the
 * rendering contract's robin-on-top made visible.
 */
export function pixelsPane(): Pane {
  const { section, body } = paneShell("pixels");
  const canvas = el("canvas", "pixels");
  body.append(canvas);

  let view: View | undefined;
  let beat = 0;
  let origin = { x: 0, y: 0 };
  let size = { w: 80, h: 80 };
  let zoom = 6;
  let lines: number[] = [];

  const draw = (): void => {
    const context = canvas.getContext("2d");
    if (!context || !view) return;
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.style.width = `${size.w * zoom}px`;
    canvas.style.height = `${size.h * zoom}px`;

    const style = getComputedStyle(document.documentElement);
    // On black (R9): the hall's own backdrop, so the dancers are the light.
    const floor = style.getPropertyValue("--floor").trim() || "#0c0a09";
    const grid = style.getPropertyValue("--floor-grid").trim() || "#1c1815";
    context.fillStyle = floor;
    context.fillRect(0, 0, size.w, size.h);

    const px = (x: number, y: number, colour: string): void => {
      const ix = Math.round(q256(x)) - origin.x;
      const iy = Math.round(q256(y)) - origin.y;
      if (ix < 0 || iy < 0 || ix >= size.w || iy >= size.h) return;
      context.fillStyle = colour;
      context.fillRect(ix, iy, 1, 1);
    };
    const line = (a: Vec3, b: Vec3, colour: string): void => {
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        px(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, colour);
      }
    };
    const block = (p: Vec3, w: number, colour: string): void => {
      const half = (w - 1) / 2;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) px(p.x + dx, p.y + dy, colour);
      }
    };

    // The hall's own floorboards: one metre a square.
    for (let x = Math.ceil(origin.x / METRE_PX) * METRE_PX; x < origin.x + size.w; x += METRE_PX) {
      for (let y = origin.y; y < origin.y + size.h; y++) px(x, y, grid);
    }
    for (let y = Math.ceil(origin.y / METRE_PX) * METRE_PX; y < origin.y + size.h; y += METRE_PX) {
      for (let x = origin.x; x < origin.x + size.w; x++) px(x, y, grid);
    }

    // The two long lines, a shade off the floor: a guide, not a thing on it.
    const guide = mix(floor, "#ffffff", 0.86);
    for (const x of lines) {
      for (let y = origin.y; y < origin.y + size.h; y++) px(x, y, guide);
    }

    const { run, pick } = view;
    const picked = new Set(pick);
    const solved = run.solved;
    if (!solved) return;

    const order: { dancer: DancerId; y: number }[] = [];
    for (const dancer of run.dialect.dancers) {
      const t = solved.trajectories[dancer];
      const hip = t?.points.hip?.[sampleAt(t, beat)];
      if (hip) order.push({ dancer, y: hip.y });
    }
    // Up the screen is further away: paint the far dancer first.
    order.sort((a, b) => a.y - b.y);

    const onTop: { plate: HandPlate; colour: string }[] = [];
    for (const { dancer } of order) {
      const t = solved.trajectories[dancer];
      if (!t) continue;
      const i = sampleAt(t, beat);
      const p = (name: string): Vec3 | undefined =>
        (t.points as Record<string, readonly Vec3[] | undefined>)[name]?.[i];
      const sl = p("shoulderL");
      const sr = p("shoulderR");
      const headPoint = p("head");
      if (!sl || !sr || !headPoint) continue;
      const alpha = alphaOf(run, dancer, picked, beat);
      const clothes = mix(colourOf(run, dancer), floor, alpha);
      const skin = mix(skinOf(run, dancer), floor, alpha);

      for (const foot of ["footL", "footR"]) {
        const f = p(foot);
        if (f) block(f, 2, clothes);
      }
      line(sl, sr, clothes);
      for (const [shoulder, elbow, hand] of [
        [sl, p("elbowL"), p("handL")],
        [sr, p("elbowR"), p("handR")],
      ] as const) {
        if (elbow) line(shoulder, elbow, skin);
        if (elbow && hand) line(elbow, hand, skin);
      }
      block(headPoint, 3, skin);
      const a = (((t.channels.facing?.[i] ?? 0) + (t.channels.headYaw?.[i] ?? 0)) * Math.PI) / 180;
      px(headPoint.x + 2 * Math.cos(a), headPoint.y + 2 * Math.sin(a), clothes);

      for (const hand of ["left", "right"] as const) {
        const plate = solved.hands[dancer]?.[hand]?.[i];
        if (!plate) continue;
        if (plate.onTop) onTop.push({ plate, colour: skin });
        else plate2x2(px, plate, skin);
      }
    }
    for (const { plate, colour } of onTop) plate2x2(px, plate, colour);
  };

  new ResizeObserver(draw).observe(body);

  return {
    el: section,
    setRun(next) {
      view = next;
      lines = linesOf(next.run);
      zoom = zoomFor(next.run.dialect.dancers.length / 2);
      const b = boundsOf(setPoints(next.run), 24);
      origin = { x: Math.floor(b.min.x), y: Math.floor(b.min.y) };
      size = {
        w: Math.max(Math.ceil(b.max.x) - origin.x, 24),
        h: Math.max(Math.ceil(b.max.y) - origin.y, 24),
      };
      draw();
    },
    setBeat(next) {
      beat = next;
      draw();
    },
  };
}

/** A hand is two pixels by two, its top-left at the plate's own rounded point. */
const plate2x2 = (
  px: (x: number, y: number, colour: string) => void,
  plate: HandPlate,
  colour: string,
): void => {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) px(plate.p.x + dx, plate.p.y + dy, colour);
  }
};
