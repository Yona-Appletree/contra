import type { DancerId } from "../../src/dialect/Dialect.js";
import { sampleAt } from "../../src/motion/Trajectory.js";
import type { Vec3 } from "../../src/motion/Vec3.js";
import { boxesAt, membershipAt, padHull } from "../groups.js";
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
 * The bodies in three dimensions, drawn with an orthographic camera of our own
 * (DA13): a stick figure per dancer in their role colour, the hands as plates
 * turned the way their palms face, a nose tick along the head's yaw, and the
 * far dancer drawn first so the near one overlaps them.
 */
export function view3dPane(): Pane {
  const { section, head, body } = paneShell("3d");
  const canvas = el("canvas", "view3d");
  body.append(canvas);

  const yaw = slider(head, "yaw", -180, 180, 30);
  const pitch = slider(head, "pitch", 0, 90, 35);
  const boxesToggle = el("input", "toggle");
  boxesToggle.type = "checkbox";
  boxesToggle.checked = true;
  boxesToggle.title = "groups";
  const boxesLabel = el("label", "toggle-label", "groups ");
  boxesLabel.append(boxesToggle);
  head.append(boxesLabel);

  let view: View | undefined;
  let centre: Vec3 = { x: 0, y: 0, z: 20 };
  let radius = 40;
  let lines: number[] = [];
  let beat = 0;

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

    const cam: Camera = {
      yawDeg: Number(yaw.value),
      pitchDeg: Number(pitch.value),
      scale: Math.min(w, h) / (2 * radius * 1.1),
      centre,
      width: w,
      height: h,
    };
    const at = (p: Vec3): [number, number] => {
      const q = project(cam, p);
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
    context.strokeStyle = "#3c3128";
    context.lineWidth = 1;
    const from = Math.floor((centre.x - radius) / METRE_PX) * METRE_PX;
    const to = Math.ceil((centre.x + radius) / METRE_PX) * METRE_PX;
    const fromY = Math.floor((centre.y - radius) / METRE_PX) * METRE_PX;
    const toY = Math.ceil((centre.y + radius) / METRE_PX) * METRE_PX;
    for (let x = from; x <= to; x += METRE_PX) {
      line({ x, y: fromY, z: 0 }, { x, y: toY, z: 0 }, "#3c3128");
    }
    for (let y = fromY; y <= toY; y += METRE_PX) {
      line({ x: from, y, z: 0 }, { x: to, y, z: 0 }, "#3c3128");
    }

    // The two long lines, where the set stands.
    for (const x of lines) {
      line({ x, y: centre.y - radius, z: 0 }, { x, y: centre.y + radius, z: 0 }, "#5b4a3a", 1.2);
    }

    const { run, pick } = view;
    const picked = new Set(pick);

    // The groups at this seating, on the floor.
    if (boxesToggle.checked) {
      const membership = membershipAt(run, beat);
      const followed = pick.length === run.dialect.dancers.length ? [] : pick;
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
    const order: { dancer: DancerId; depth: number }[] = [];
    for (const dancer of run.dialect.dancers) {
      const hip = solved.trajectories[dancer]?.points.hip;
      const t = solved.trajectories[dancer];
      if (!hip || !t) continue;
      order.push({ dancer, depth: project(cam, hip[sampleAt(t, beat)]!).depth });
    }
    order.sort((a, b) => b.depth - a.depth);

    for (const { dancer } of order) {
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
      const alpha = alphaOf(run, dancer, picked, beat);
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
        dot(context, at(headPoint), skin, 5 * cam.scale);
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
        if (q) dot(context, at(q), colour, 2.5 * cam.scale);
      }
      context.globalAlpha = 1;
    }
  };

  yaw.addEventListener("input", draw);
  pitch.addEventListener("input", draw);
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

const slider = (
  head: HTMLElement,
  name: string,
  min: number,
  max: number,
  value: number,
): HTMLInputElement => {
  const input = el("input", "slider");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.title = name;
  head.append(input);
  return input;
};
