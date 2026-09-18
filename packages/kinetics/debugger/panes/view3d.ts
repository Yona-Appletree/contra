import type { DancerId } from "../../src/dialect/Dialect.js";
import { sampleAt } from "../../src/motion/Trajectory.js";
import type { Vec3 } from "../../src/motion/Vec3.js";
import {
  boxesAt,
  centroidOf,
  membershipAt,
  minorSetBoxes,
  minorSetIndex,
  padHull,
} from "../groups.js";
import { boundsOf, centreOf, project, type Camera } from "../project.js";
import {
  alphaOf,
  colourOf,
  el,
  linesOf,
  paneShell,
  setPoints,
  skinOf,
  type Pane,
  type View,
} from "../view.js";

const METRE_PX = 25;

/**
 * The angles that matter, as buttons (G2 round 3: *"the sliders aren't very
 * helpful … presets for common angles"*). `x` is across the set and `y` runs
 * down the hall (`project.ts`), so `side` looks across the two lines and
 * `along` looks down them.
 */
const ANGLES: readonly { name: string; yaw: number; pitch: number }[] = [
  { name: "top", yaw: 30, pitch: 89 },
  { name: "¾", yaw: 30, pitch: 35 },
  { name: "side", yaw: 90, pitch: 14 },
  { name: "along", yaw: 0, pitch: 14 },
  { name: "eye", yaw: 30, pitch: 8 },
];

/** The 3d pane, and the set it is turned to. */
export interface View3dPane extends Pane {
  setFocus(set: number | undefined): void;
}

/**
 * The bodies in three dimensions, drawn with an orthographic camera of our own
 * (DA13): a stick figure per dancer in their role colour, the hands as plates
 * turned the way their palms face, a nose tick along the head's yaw, and the
 * far dancer drawn first so the near one overlaps them.
 *
 * Dragged to turn; a button row for the angles that matter. Turned to one
 * minor set when the strip above picked one (M9): that set's dancers whole,
 * the next set either side a shade, anybody further off left out; `hall`
 * brings the whole line back.
 */
export function view3dPane(onHall: () => void): View3dPane {
  const { section, head, body } = paneShell("3d");
  const canvas = el("canvas", "view3d");
  body.append(canvas);

  const who = el("span", "who");
  const presets = el("span", "presets");
  const cam = { yaw: 30, pitch: 35 };
  const angleButtons = ANGLES.map((angle) => {
    const button = el("button", "preset", angle.name);
    button.addEventListener("click", () => {
      cam.yaw = angle.yaw;
      cam.pitch = angle.pitch;
      draw();
    });
    presets.append(button);
    return { button, angle };
  });
  const hallButton = el("button", "preset hall", "hall");
  hallButton.addEventListener("click", onHall);
  presets.append(hallButton);
  const boxesToggle = el("input", "toggle");
  boxesToggle.type = "checkbox";
  boxesToggle.checked = false;
  boxesToggle.title = "groups";
  const boxesLabel = el("label", "toggle-label", "groups ");
  boxesLabel.append(boxesToggle);
  head.append(who, presets, boxesLabel);

  let view: View | undefined;
  let centre: Vec3 = { x: 0, y: 0, z: 20 };
  let radius = 40;
  let lines: number[] = [];
  let beat = 0;
  let focus: number | undefined;

  // Drag to turn: yaw with the pointer's x, pitch with its y, never under the floor.
  let drag: { x: number; y: number; yaw: number; pitch: number } | undefined;
  canvas.addEventListener("pointerdown", (event) => {
    drag = { x: event.clientX, y: event.clientY, yaw: cam.yaw, pitch: cam.pitch };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    cam.yaw = drag.yaw + (event.clientX - drag.x) * 0.4;
    cam.pitch = Math.max(4, Math.min(89, drag.pitch + (event.clientY - drag.y) * 0.4));
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    drag = undefined;
  });

  /** Where the camera looks and how far it sees: the set in focus, else the whole line. */
  const frame = (): { centre: Vec3; radius: number; dim: ReadonlySet<DancerId> } => {
    const none = new Set<DancerId>();
    if (!view || focus === undefined) return { centre, radius, dim: none };
    const { run } = view;
    const box = minorSetBoxes(run, beat)[focus];
    const membership = membershipAt(run, beat);
    if (!box || !membership) return { centre, radius, dim: none };
    const [x, y] = centroidOf(box.hullPx);
    const dim = new Set<DancerId>();
    for (const dancer of run.dialect?.dancers ?? []) {
      if (minorSetIndex(run, membership, dancer) !== focus) dim.add(dancer);
    }
    return { centre: { x, y, z: 20 }, radius: 36, dim };
  };

  const draw = (): void => {
    const context = canvas.getContext("2d");
    if (!context || !view) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(body.clientWidth - 2, 80);
    const h = Math.max(body.clientHeight - 2, 80);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, w, h);

    const look = frame();
    const camera: Camera = {
      yawDeg: cam.yaw,
      pitchDeg: cam.pitch,
      scale: Math.min(w, h) / (2 * look.radius * 1.1),
      centre: look.centre,
      width: w,
      height: h,
    };
    for (const { button, angle } of angleButtons) {
      button.classList.toggle("on", angle.yaw === cam.yaw && angle.pitch === cam.pitch);
    }
    hallButton.hidden = focus === undefined;
    const at = (p: Vec3): [number, number] => {
      const q = project(camera, p);
      return [q.x, q.y];
    };
    const line = (a: Vec3, b: Vec3, colour: string, width = 1): void => {
      context.strokeStyle = colour;
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(...at(a));
      context.lineTo(...at(b));
      context.stroke();
    };

    // The floor, a metre at a time.
    const reach = look.radius * (focus === undefined ? 1 : 2.2);
    const from = Math.floor((look.centre.x - reach) / METRE_PX) * METRE_PX;
    const to = Math.ceil((look.centre.x + reach) / METRE_PX) * METRE_PX;
    const fromY = Math.floor((look.centre.y - reach) / METRE_PX) * METRE_PX;
    const toY = Math.ceil((look.centre.y + reach) / METRE_PX) * METRE_PX;
    for (let x = from; x <= to; x += METRE_PX) {
      line({ x, y: fromY, z: 0 }, { x, y: toY, z: 0 }, "#3c3128");
    }
    for (let y = fromY; y <= toY; y += METRE_PX) {
      line({ x: from, y, z: 0 }, { x: to, y, z: 0 }, "#3c3128");
    }

    // The two long lines, where the set stands.
    for (const x of lines) {
      line({ x, y: fromY, z: 0 }, { x, y: toY, z: 0 }, "#5b4a3a", 1.2);
    }

    const { run, pick } = view;
    const picked = new Set(pick);

    // The groups at this seating, on the floor.
    if (boxesToggle.checked) {
      const membership = membershipAt(run, beat);
      const followed = pick.length === (run.dialect?.dancers.length ?? 0) ? [] : pick;
      for (const box of membership === undefined ? [] : boxesAt(run, membership, followed)) {
        const pts = padHull(box.hullPx, 4);
        context.globalAlpha = box.mine ? 0.9 : 0.35;
        pts.forEach((a, i) => {
          const b = pts[(i + 1) % pts.length] as [number, number];
          line(
            { x: a[0], y: a[1], z: 0 },
            { x: b[0], y: b[1], z: 0 },
            box.colour,
            box.mine ? 1.4 : 1,
          );
        });
      }
      context.globalAlpha = 1;
    }

    const solved = run.solved;
    if (!solved) return;
    const order: { dancer: DancerId; depth: number; far: boolean }[] = [];
    for (const dancer of run.dialect?.dancers ?? []) {
      const hip = solved.trajectories[dancer]?.points.hip;
      const t = solved.trajectories[dancer];
      if (!hip || !t) continue;
      const p = hip[sampleAt(t, beat)];
      if (!p) continue;
      // Beyond the next set either side, a dimmed body is only clutter.
      const far =
        focus !== undefined &&
        look.dim.has(dancer) &&
        Math.hypot(p.x - look.centre.x, p.y - look.centre.y) > look.radius * 2.4;
      order.push({ dancer, depth: project(camera, p).depth, far });
    }
    order.sort((a, b) => b.depth - a.depth);

    for (const { dancer, far } of order) {
      if (far) continue;
      const t = solved.trajectories[dancer];
      if (!t) continue;
      const i = sampleAt(t, beat);
      const p = (name: string): Vec3 | undefined =>
        (t.points as Record<string, readonly Vec3[] | undefined>)[name]?.[i];
      const hip = p("hip");
      const sl = p("shoulderL");
      const sr = p("shoulderR");
      if (!hip || !sl || !sr) continue;
      const neck: Vec3 = { x: (sl.x + sr.x) / 2, y: (sl.y + sr.y) / 2, z: (sl.z + sr.z) / 2 };
      const colour = colourOf(run, dancer);
      const skin = skinOf(run, dancer);
      const alpha = alphaOf(run, dancer, picked, beat) * (look.dim.has(dancer) ? 0.3 : 1);
      context.globalAlpha = alpha;

      const bones: [Vec3 | undefined, Vec3 | undefined][] = [
        [hip, neck],
        [sl, sr],
        [sl, p("elbowL")],
        [p("elbowL"), p("handL")],
        [sr, p("elbowR")],
        [p("elbowR"), p("handR")],
        [hip, p("footL")],
        [hip, p("footR")],
        [neck, p("head")],
      ];
      for (const [a, b] of bones) if (a && b) line(a, b, colour, 1.6);

      // The nose, along the torso's yaw plus the head's own.
      const headPoint = p("head");
      const facing = t.channels.facing?.[i] ?? 0;
      const headYaw = t.channels.headYaw?.[i] ?? 0;
      if (headPoint) {
        const a = ((facing + headYaw) * Math.PI) / 180;
        line(
          headPoint,
          { x: headPoint.x + 3 * Math.cos(a), y: headPoint.y + 3 * Math.sin(a), z: headPoint.z },
          skin,
          1.4,
        );
        dot(context, at(headPoint), skin, 5 * camera.scale);
      }

      for (const hand of ["left", "right"] as const) {
        const plate = solved.hands[dancer]?.[hand]?.[i];
        if (!plate) continue;
        const [u, v] = basis(plate.normal);
        const s = 1.6;
        const corners: Vec3[] = [
          add(plate.p, add(scale(u, s), scale(v, s))),
          add(plate.p, add(scale(u, -s), scale(v, s))),
          add(plate.p, add(scale(u, -s), scale(v, -s))),
          add(plate.p, add(scale(u, s), scale(v, -s))),
        ];
        context.fillStyle = skin;
        context.globalAlpha = alpha * (plate.contact === "free" ? 0.55 : 1);
        context.beginPath();
        corners.forEach((c, k) => {
          if (k === 0) context.moveTo(...at(c));
          else context.lineTo(...at(c));
        });
        context.closePath();
        context.fill();
        context.globalAlpha = alpha;
      }

      for (const name of ["footL", "footR", "hip"]) {
        const q = p(name);
        if (q) dot(context, at(q), colour, 2.5 * camera.scale);
      }
      context.globalAlpha = 1;
    }
  };

  boxesToggle.addEventListener("change", draw);
  new ResizeObserver(draw).observe(body);

  return {
    el: section,
    setRun(next) {
      view = next;
      lines = linesOf(next.run);
      const b = boundsOf(setPoints(next.run), 14);
      b.max.z = Math.max(b.max.z, 45);
      centre = centreOf(b);
      radius = Math.max(
        Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y) / 2,
        (b.max.z - b.min.z) / 2,
        10,
      );
      draw();
    },
    setBeat(next) {
      beat = next;
      draw();
    },
    setFocus(set) {
      focus = set;
      who.textContent = set === undefined ? "the hall" : `set ${String(set + 1)}`;
      draw();
    },
  };
}

const dot = (
  context: CanvasRenderingContext2D,
  [x, y]: [number, number],
  colour: string,
  size: number,
): void => {
  context.fillStyle = colour;
  context.beginPath();
  context.arc(x, y, size / 2, 0, Math.PI * 2);
  context.fill();
};

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z);
  return l < 1e-9 ? { x: 1, y: 0, z: 0 } : scale(a, 1 / l);
};

/** Two unit vectors spanning the plane a plate's normal is normal to. */
const basis = (normal: Vec3): [Vec3, Vec3] => {
  const n = unit(normal);
  const up: Vec3 = Math.abs(n.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const u = unit(cross(n, up));
  return [u, unit(cross(n, u))];
};
