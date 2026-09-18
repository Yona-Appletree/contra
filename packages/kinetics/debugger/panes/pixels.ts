import type { ArmPair, PoseSample, Vec2 } from "@caller/core";
import { q256, q256Vec2 } from "@caller/core";
import type { DancerLayout, HandStack, Person } from "@caller/hall";
import { createPerson, drawArms, drawBody, drawHead } from "@caller/hall";
import type { DancerId } from "../../src/dialect/Dialect.js";
import { sampleAt } from "../../src/motion/Trajectory.js";
import type { Trajectory } from "../../src/motion/Trajectory.js";
import type { Vec3 } from "../../src/motion/Vec3.js";
import type { HandPlate } from "../../src/solver/solveBody.js";
import { boxesAt, membershipAt, minorSetAt, minorSetBoxes, padHull } from "../groups.js";
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
/**
 * Two screen pixels to a world pixel, always (G2: *"2x pixels is good … we're
 * generally oversizing the 16-bit renderings"*). The strip gets wider by
 * holding more floor, never by growing its pixels.
 */
const ZOOM = 2;

/** The pixels pane, and the set it is showing the 3d. */
export interface PixelsPane extends Pane {
  setFocus(set: number | undefined): void;
}

/**
 * The whole hall from above at 2×, painted one world pixel at a time and then
 * magnified — never drawn at a fraction of a pixel and smoothed (DA13, the
 * user's own taste: an integer-pixel render, positions quantised to 1/256 px
 * first). Every set, every dancer, the couples out, as wide as the column.
 *
 * The world runs the hall down `y` (`project.ts`); a strip across the top of
 * the screen wants it left to right, so the picture is the world turned a
 * quarter turn — a rotation, never a flip, so a right hand stays a right hand:
 * screen x is world y, screen y is world x read upward.
 *
 * Clothes are the role colour; the hands and the head are skin, two tones by
 * dancer; the **top** hand of a stacked hold is painted last, which is the
 * rendering contract's robin-on-top made visible. A click picks the minor set
 * under it for the 3d below (`onPick`), and the picked set wears a hairline.
 */
export function pixelsPane(onPick: (set: number | undefined) => void): PixelsPane {
  const { section, head, body } = paneShell("pixels");
  const canvas = el("canvas", "pixels");
  body.append(canvas);
  const boxesToggle = el("input", "toggle");
  boxesToggle.type = "checkbox";
  boxesToggle.checked = false;
  boxesToggle.title = "groups";
  const boxesLabel = el("label", "toggle-label", "groups ");
  boxesLabel.append(boxesToggle);
  const wireToggle = el("input", "toggle");
  wireToggle.type = "checkbox";
  wireToggle.title = "the wireframe, for reading the graphs against";
  const wireLabel = el("label", "toggle-label", "wire ");
  wireLabel.append(wireToggle);
  const tag = el("span", "zoom-tag", "2×");
  head.append(tag, boxesLabel, wireLabel);

  let view: View | undefined;
  let beat = 0;
  /** The world window: `x` across the set, `y` down the hall. */
  let origin = { x: 0, y: 0 };
  /** The world window's extent: `w` across the set, `h` down the hall. */
  let size = { w: 80, h: 80 };
  /** Where the hall's middle is, so the strip is centred on it whatever its width. */
  let centreY = 0;
  let lines: number[] = [];
  let focus: number | undefined;
  /** One person per dancer, from a seed, so the same dancer is the same person every run. */
  let persons = new Map<DancerId, Person>();

  const draw = (): void => {
    const context = canvas.getContext("2d");
    if (!context || !view) return;
    // As much of the hall as the column holds, at 2×: the hall runs along the screen.
    size.h = Math.max(Math.floor(body.clientWidth / ZOOM), 24);
    origin.y = Math.round(centreY - size.h / 2);
    canvas.width = size.h;
    canvas.height = size.w;
    canvas.style.width = `${size.h * ZOOM}px`;
    canvas.style.height = `${size.w * ZOOM}px`;

    const style = getComputedStyle(document.documentElement);
    // On black (R9): the hall's own backdrop, so the dancers are the light.
    const floor = style.getPropertyValue("--floor").trim() || "#0c0a09";
    const grid = style.getPropertyValue("--floor-grid").trim() || "#1c1815";
    const accent = style.getPropertyValue("--accent").trim() || "#e7b96b";
    context.fillStyle = floor;
    context.fillRect(0, 0, size.h, size.w);

    const px = (x: number, y: number, colour: string): void => {
      const ix = Math.round(q256(x)) - origin.x;
      const iy = Math.round(q256(y)) - origin.y;
      if (ix < 0 || iy < 0 || ix >= size.w || iy >= size.h) return;
      context.fillStyle = colour;
      context.fillRect(iy, size.w - 1 - ix, 1, 1);
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
    const outline = (pts: readonly [number, number][], colour: string): void => {
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length] as [number, number];
        line({ x: a[0], y: a[1], z: 0 }, { x: b[0], y: b[1], z: 0 }, colour);
      });
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

    // The groups everybody is in at this seating, as boxes on the floor (P5):
    // the followed dancer's own brighter than the rest.
    if (boxesToggle.checked) {
      const membership = membershipAt(run, beat);
      const followed = pick.length === (run.dialect?.dancers.length ?? 0) ? [] : pick;
      for (const box of membership === undefined ? [] : boxesAt(run, membership, followed)) {
        outline(padHull(box.hullPx, 4), mix(box.colour, floor, box.mine ? 0.75 : 0.3));
      }
    }
    // The set the 3d is turned to, in a hairline.
    if (focus !== undefined) {
      const box = minorSetBoxes(run, beat)[focus];
      if (box) outline(padHull(box.hullPx, 7), mix(accent, floor, 0.45));
    }

    const solved = run.solved;
    if (!solved) return;

    const order: { dancer: DancerId; y: number }[] = [];
    for (const dancer of run.dialect?.dancers ?? []) {
      const t = solved.trajectories[dancer];
      const hip = t?.points.hip?.[sampleAt(t, beat)];
      if (hip) order.push({ dancer, y: -hip.x });
    }
    // Up the screen is further away — world +x, after the quarter turn — so
    // the far dancer is painted first and the near one overlaps them.
    order.sort((a, b) => a.y - b.y);

    if (!wireToggle.checked) {
      drawPeople(context, order, picked);
      return;
    }

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

  /**
   * The app's own people (R9, P6): every dancer laid out from the solver's
   * points and drawn with `@caller/hall`'s passes — bodies, then arms, then
   * heads, far to near — on a four-times supersampled layer that is then
   * downsampled onto the world canvas, exactly as the hall's renderer does,
   * so the pane looks like the Stage at the same world resolution.
   */
  const SUPERSAMPLE = 4;
  const drawPeople = (
    context: CanvasRenderingContext2D,
    order: readonly { dancer: DancerId; y: number }[],
    picked: ReadonlySet<DancerId>,
  ): void => {
    if (!view?.run.solved) return;
    const { run } = view;
    const solved = run.solved as NonNullable<typeof run.solved>;
    const layer = new OffscreenCanvas(size.h * SUPERSAMPLE, size.w * SUPERSAMPLE);
    const g = layer.getContext("2d");
    if (!g) return;
    // The quarter turn: screen x from world y, screen y from world x upward.
    g.setTransform(
      0,
      -SUPERSAMPLE,
      SUPERSAMPLE,
      0,
      -origin.y * SUPERSAMPLE,
      (size.w + origin.x) * SUPERSAMPLE,
    );
    g.lineCap = "round";

    const layouts: {
      layout: DancerLayout;
      stack: { L: HandStack; R: HandStack };
      alpha: number;
    }[] = [];
    for (const { dancer } of order) {
      const t = solved.trajectories[dancer];
      const person = persons.get(dancer);
      if (!t || !person) continue;
      const i = sampleAt(t, beat);
      const layout = layoutOf(person, t, i);
      if (!layout) continue;
      const stackOf = (hand: "left" | "right"): HandStack => {
        const plate = solved.hands[dancer]?.[hand]?.[i];
        if (!plate || plate.contact === "free") return "free";
        return plate.onTop ? "top" : "bottom";
      };
      layouts.push({
        layout,
        stack: { L: stackOf("left"), R: stackOf("right") },
        alpha: alphaOf(run, dancer, picked, beat),
      });
    }
    const opts = { outline: true, shadow: true, skirts: false, snap: q256Vec2 };
    for (const { layout, alpha } of layouts) {
      g.globalAlpha = alpha;
      drawBody(g, layout, opts);
    }
    for (const { layout, stack, alpha } of layouts) {
      g.globalAlpha = alpha;
      drawArms(g, layout, { ...opts, stack });
    }
    for (const { layout, alpha } of layouts) {
      g.globalAlpha = alpha;
      drawHead(g, layout, opts);
    }
    g.globalAlpha = 1;
    context.imageSmoothingEnabled = true;
    context.drawImage(layer, 0, 0, size.h, size.w);
  };

  canvas.addEventListener("click", (event) => {
    if (!view) return;
    const rect = canvas.getBoundingClientRect();
    const y = origin.y + (event.clientX - rect.left) / ZOOM;
    const x = origin.x + size.w - 1 - (event.clientY - rect.top) / ZOOM;
    const set = minorSetAt(view.run, beat, x, y);
    onPick(set === focus ? undefined : set);
  });

  new ResizeObserver(draw).observe(body);
  boxesToggle.addEventListener("change", draw);
  wireToggle.addEventListener("change", draw);

  return {
    el: section,
    setRun(next) {
      view = next;
      lines = linesOf(next.run);
      const dialect = next.run.dialect;
      persons = new Map(
        (dialect?.dancers ?? []).map((id, seed) => [
          id,
          createPerson({
            id,
            role: dialect?.roleOf(id) ?? "lark",
            seed: seed + 1,
            roleShirts: true,
          }),
        ]),
      );
      const b = boundsOf(setPoints(next.run), 24);
      centreY = (b.min.y + b.max.y) / 2;
      origin = { x: Math.floor(b.min.x), y: Math.round(centreY - size.h / 2) };
      size = { w: Math.max(Math.ceil(b.max.x) - origin.x, 24), h: size.h };
      canvas.dataset.zoom = String(ZOOM);
      draw();
    },
    setBeat(next) {
      beat = next;
      draw();
    },
    setFocus(set) {
      focus = set;
      draw();
    },
  };
}

/**
 * One dancer's solved points as the hall draws a person: the hip as the body
 * centre, the feet body-local, both arms in the hall's three dimensions
 * (heights relative to the shoulder), the head along the torso's yaw plus the
 * neck's. The lean is degrees in the solver and px in the hall; a torso of
 * ten px leaning θ puts its top sin θ × 10 px forward.
 */
const TORSO_PX = 10;
const layoutOf = (person: Person, t: Trajectory, i: number): DancerLayout | undefined => {
  const p = (name: string): Vec3 | undefined =>
    (t.points as Record<string, readonly Vec3[] | undefined>)[name]?.[i];
  const hip = p("hip");
  const sl = p("shoulderL");
  const sr = p("shoulderR");
  const el3 = p("elbowL");
  const er3 = p("elbowR");
  const hl = p("handL");
  const hr = p("handR");
  const fl = p("footL");
  const fr = p("footR");
  if (!hip || !sl || !sr || !el3 || !er3 || !hl || !hr || !fl || !fr) return undefined;
  const facing = t.channels.facing?.[i] ?? 0;
  const headYaw = t.channels.headYaw?.[i] ?? 0;
  const leanDeg = t.channels.lean?.[i] ?? 0;
  const rad = (facing * Math.PI) / 180;
  const fwd: Vec2 = [Math.cos(rad), Math.sin(rad)];
  const right: Vec2 = [-Math.sin(rad), Math.cos(rad)];
  const local = (q: Vec3): Vec2 => [
    (q.x - hip.x) * fwd[0] + (q.y - hip.y) * fwd[1],
    (q.x - hip.x) * right[0] + (q.y - hip.y) * right[1],
  ];
  const arm = (s: Vec3, e: Vec3, h: Vec3): ArmPair[0] => ({
    shoulder: [s.x, s.y],
    elbow: [e.x, e.y],
    hand: [h.x, h.y],
    short: 0,
    elbowZ: e.z - s.z,
    handZ: h.z - s.z,
    reach: Math.hypot(h.x - s.x, h.y - s.y),
  });
  const arms: ArmPair = [arm(sl, el3, hl), arm(sr, er3, hr)];
  const hands = {
    L: { p: [hl.x, hl.y] as Vec2, drop: sl.z - hl.z },
    R: { p: [hr.x, hr.y] as Vec2, drop: sr.z - hr.z },
  };
  const pose: PoseSample = {
    p: [hip.x, hip.y],
    facing,
    look: facing + headYaw,
    lean: Math.sin((leanDeg * Math.PI) / 180) * TORSO_PX,
    hands,
    stepRate: 1,
    buzz: false,
    flare: 0,
    amp: 0,
    feet: { L: local(fl), R: local(fr) },
  };
  return {
    person,
    pose,
    p: [hip.x, hip.y],
    torsoAngle: facing,
    sway: 0,
    feet: { L: local(fl), R: local(fr) },
    headAngle: facing + headYaw,
    hands,
    arms,
  };
};

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
