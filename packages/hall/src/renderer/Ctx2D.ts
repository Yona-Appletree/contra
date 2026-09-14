/**
 * The part of a 2D canvas context the body drawing uses.
 *
 * Both `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D` are
 * structurally assignable to this, which is the point: the dancer layer is
 * drawn on an `OffscreenCanvas` and the same functions have to work when a
 * story or a test hands over a plain on-screen context. Declaring the members
 * we use also keeps the overloaded DOM signatures out of a union type.
 */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  globalAlpha: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

export const TAU = Math.PI * 2;

/** The near-black the spikes outline every body part with. */
export const OUTLINE_COLOUR = "#1b1410";

/** Filled ellipse, optionally outlined first so the outline sits underneath. */
export function ell(
  g: Ctx2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
  outline = false,
): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (outline) {
    g.lineWidth = 1.3;
    g.strokeStyle = OUTLINE_COLOUR;
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
}

/** {@link ell} with equal radii. */
export function circ(
  g: Ctx2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  outline = false,
): void {
  ell(g, x, y, r, r, 0, fill, outline);
}

/** Round-capped line segment: an arm bone. */
export function seg(
  g: Ctx2D,
  a: readonly [number, number],
  b: readonly [number, number],
  w: number,
  colour: string,
): void {
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.lineWidth = w;
  g.strokeStyle = colour;
  g.lineCap = "round";
  g.stroke();
}
