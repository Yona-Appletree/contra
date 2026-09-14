import type { Vec2 } from "@caller/core";
import { q256Vec2 } from "@caller/core";
import type { DancerLayout } from "../person/layoutDancer.js";
import { layoutDancer } from "../person/layoutDancer.js";
import { drawArms, drawBody, drawHead } from "../person/drawPerson.js";
import type { Trails, TrailUpdate } from "../trails/Trails.js";
import { createTrails } from "../trails/Trails.js";
import type { Frame } from "./Frame.js";
import { sceneOrder } from "./sceneOrder.js";
import type { World } from "./World.js";
import { BACKDROP_COLOUR, DEFAULT_WORLD, assertWorld } from "./World.js";

/** The default supersample factor for the dancer layer. */
export const SUPERSAMPLE = 4;

export interface RendererOptions {
  /** Dancer-layer supersample factor. Default {@link SUPERSAMPLE}. */
  supersample?: number;
  /**
   * Downsample the dancer layer smoothly. True is the look both spikes settled
   * on. False thresholds alpha at 50% and snaps every drawn point to a whole
   * px instead — the hard-edged sprite look, kept because gate G1 may want to
   * see it again.
   */
  aa?: boolean;
  /** The world to start in. Default {@link DEFAULT_WORLD}. */
  world?: World;
  /** Draw the near-black outline around every body part. Default true. */
  outline?: boolean;
  /** Draw the shadow under each torso. Default true. */
  shadow?: boolean;
  /**
   * Draw skirts on the dancers whose seed gave them one. **Default false** —
   * the Stage sets it true and every other surface leaves it. See
   * `DrawOptions.skirts` for the ruling behind that.
   */
  skirts?: boolean;
}

/**
 * Turns frames into pixels. The whole look lives here: a low-resolution world
 * canvas blitted to the display canvas at an integer zoom with smoothing off,
 * and the dancers drawn on a 4× supersampled layer and downsampled onto it, so
 * bodies keep smooth edges and smooth motion without the world grid softening.
 */
export interface Renderer {
  /** Draw one frame. Synchronous and pure: the same frame gives the same pixels. */
  render(frame: Frame): void;
  /** Move to a new world size or zoom. Reallocates every layer and clears the trails. */
  resize(world: World): void;
  /** Wipe the floor trails. Between dances, never within one. */
  clearTrails(): void;
  /** The world currently being drawn. */
  readonly world: World;
  /**
   * The persistent layers, in composite order under the dancers.
   *
   * `floor` is left empty here and is M4's to paint — walls, boards, the stage.
   * `trails` is where everybody has been. `people` is the downsampled dancer
   * layer, replaced every frame.
   */
  readonly layers: { floor: OffscreenCanvas; trails: OffscreenCanvas; people: OffscreenCanvas };
}

export function createRenderer(canvas: HTMLCanvasElement, opts: RendererOptions = {}): Renderer {
  const supersample = opts.supersample ?? SUPERSAMPLE;
  const aa = opts.aa ?? true;
  const drawOpts = {
    outline: opts.outline ?? true,
    shadow: opts.shadow ?? true,
    skirts: opts.skirts ?? false,
    snap: aa ? q256Vec2 : roundVec2,
  };

  let world = assertWorld(opts.world ?? DEFAULT_WORLD);
  let floor = new OffscreenCanvas(world.w, world.h);
  let people = new OffscreenCanvas(world.w, world.h);
  let peopleCtx = context(people);
  let superCanvas = new OffscreenCanvas(world.w * supersample, world.h * supersample);
  let superCtx = context(superCanvas);
  const trails: Trails = createTrails(world);
  let display = displayContext(canvas);

  applyCanvasSize();

  function applyCanvasSize(): void {
    canvas.width = world.w * world.zoom;
    canvas.height = world.h * world.zoom;
    canvas.style.width = `${world.w * world.zoom}px`;
    canvas.style.height = `${world.h * world.zoom}px`;
    canvas.style.imageRendering = "pixelated";
    display = displayContext(canvas);
  }

  function renderDancerLayer(frame: Frame): void {
    const layouts: DancerLayout[] = frame.people.map((d) =>
      layoutDancer(d, frame.beat, drawOpts.snap),
    );
    const order = sceneOrder(
      layouts.map((l) => ({
        id: l.person.id,
        role: l.person.role,
        p: l.p,
        hands: l.hands,
      })),
      frame.roleSet,
    );

    superCtx.setTransform(1, 0, 0, 1, 0, 0);
    superCtx.clearRect(0, 0, superCanvas.width, superCanvas.height);
    // World coordinates: origin at the centre of the world, one unit per world px.
    superCtx.setTransform(
      supersample,
      0,
      0,
      supersample,
      (supersample * world.w) / 2,
      (supersample * world.h) / 2,
    );

    for (const i of order.bodies) {
      const layout = layouts[i];
      if (layout !== undefined) drawBody(superCtx, layout, drawOpts);
    }
    for (const i of order.arms) {
      const layout = layouts[i];
      const stack = order.stacks[i];
      if (layout !== undefined && stack !== undefined) {
        drawArms(superCtx, layout, { ...drawOpts, stack });
      }
    }
    for (const i of order.bodies) {
      const layout = layouts[i];
      if (layout !== undefined) drawHead(superCtx, layout, drawOpts);
    }

    peopleCtx.setTransform(1, 0, 0, 1, 0, 0);
    peopleCtx.clearRect(0, 0, world.w, world.h);
    peopleCtx.imageSmoothingEnabled = aa;
    peopleCtx.imageSmoothingQuality = "high";
    peopleCtx.drawImage(superCanvas, 0, 0, world.w, world.h);
    if (!aa) {
      // Hard edges: a downsampled pixel is either on the sprite or off it.
      const image = peopleCtx.getImageData(0, 0, world.w, world.h);
      const d = image.data;
      for (let i = 3; i < d.length; i += 4) d[i] = (d[i] ?? 0) >= 128 ? 255 : 0;
      peopleCtx.putImageData(image, 0, 0);
    }
  }

  function addTrails(frame: Frame): void {
    const updates: TrailUpdate[] = frame.people.map((d) => ({
      id: d.person.id,
      colour: d.person.appearance.trailColour,
      points: d.trail ?? [q256Vec2(d.pose.p)],
    }));
    trails.add(updates);
  }

  return {
    get world() {
      return world;
    },
    get layers() {
      return { floor, trails: trails.layer, people };
    },
    render(frame) {
      addTrails(frame);
      renderDancerLayer(frame);

      display.imageSmoothingEnabled = false;
      display.setTransform(1, 0, 0, 1, 0, 0);
      display.fillStyle = BACKDROP_COLOUR;
      display.fillRect(0, 0, canvas.width, canvas.height);
      const z = world.zoom;
      for (const layer of [floor, trails.layer, people]) {
        display.drawImage(layer, 0, 0, world.w, world.h, 0, 0, world.w * z, world.h * z);
      }
    },
    resize(next) {
      world = assertWorld(next);
      floor = new OffscreenCanvas(world.w, world.h);
      people = new OffscreenCanvas(world.w, world.h);
      peopleCtx = context(people);
      superCanvas = new OffscreenCanvas(world.w * supersample, world.h * supersample);
      superCtx = context(superCanvas);
      trails.resize(world);
      applyCanvasSize();
    },
    clearTrails() {
      trails.clear();
    },
  };
}

const roundVec2 = (v: Vec2): Vec2 => [Math.round(v[0]), Math.round(v[1])];

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const g = canvas.getContext("2d", { willReadFrequently: false });
  if (g === null) throw new Error("hall: no 2D context for an offscreen layer");
  return g;
}

function displayContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext("2d", { alpha: false });
  if (g === null) throw new Error("hall: no 2D context for the display canvas");
  return g;
}
