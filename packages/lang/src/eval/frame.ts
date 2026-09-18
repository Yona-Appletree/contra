/**
 * Where a node of the tree stands: a rigid frame in the hall, in millimetres
 * and whole degrees.
 *
 * The tree is built by nesting frames, OpenSCAD's way: a prefix modifier is a
 * local frame, the modifiers of one statement compose right to left (the one
 * nearest the statement first), and the result composes into the frame of the
 * node being built. `translate` is therefore in the **parent's** axes, not the
 * hall's — which is what `for i in 0..4 { rotate(90 * i) translate(y = -1.5m)
 * Couple(i + 1); }` means in `square.dance`, and the only reading that puts
 * four couples round a square rather than four couples in one spot.
 *
 * `+y` runs **down the hall**: the hall's top is at negative `y`, the minor
 * sets are laid at increasing `y`, and a couple travelling `+1` in set id
 * travels along `+y` and leaves at the bottom. Headings are measured
 * **counter-clockwise from +y**, so a node at heading 0 faces down the hall,
 * its own `+x` is to its right and its own `+y` is in front of it. (A picture
 * of the hall wants the top at the top, so the playground's floor pane draws
 * the whole thing turned through 180° — a rotation, so left stays left.)
 *
 * Lengths compute in `f64` and are stored as integer millimetres (notes D6);
 * every distance in the fixtures is a whole millimetre, so nothing is lost on
 * the way down the tree.
 */
export interface Frame {
  /** Millimetres to the right of the hall's origin, looking down the hall. */
  x: number;
  /** Millimetres down the hall from the hall's origin; the top is negative. */
  y: number;
  /** Degrees counter-clockwise from "down the hall", in `[0, 360)`. */
  heading: number;
  /** Whether an odd number of `mirror`s got here: the frame's `x` is flipped. */
  mirrored: boolean;
}

/** The hall's own frame: the origin, facing down the hall. */
export const originFrame: Frame = { x: 0, y: 0, heading: 0, mirrored: false };

/** A frame from parts, rounded the way a stored frame is rounded. */
export const frame = (x = 0, y = 0, heading = 0, mirrored = false): Frame => ({
  x: Math.round(x),
  y: Math.round(y),
  heading: normalizeHeading(heading),
  mirrored,
});

/** Degrees into `[0, 360)`, rounded to the whole degree a fact is stored in. */
export function normalizeHeading(deg: number): number {
  const whole = Math.round(deg);
  return ((whole % 360) + 360) % 360;
}

/**
 * `parent ∘ local` — where a child placed at `local` inside `parent` stands in
 * the hall. Mirroring flips the child's `x` and the sense of its rotation, so
 * a mirrored branch of the tree reads as its reflection all the way down.
 */
export function compose(parent: Frame, local: Frame): Frame {
  const rad = (parent.heading * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = (parent.mirrored ? -1 : 1) * local.x;
  return frame(
    parent.x + lx * cos - local.y * sin,
    parent.y + lx * sin + local.y * cos,
    parent.mirrored ? parent.heading - local.heading : parent.heading + local.heading,
    parent.mirrored !== local.mirrored,
  );
}

/** The local frame of `translate(x = …, y = …)`, in millimetres. */
export const translation = (x: number, y: number): Frame => frame(x, y, 0, false);

/** The local frame of `rotate(deg)`. */
export const rotation = (deg: number): Frame => frame(0, 0, deg, false);

/**
 * The local frame of `mirror(X)` or `mirror(Y)`. `mirror(X)` negates the
 * frame's own `x` (a left-right flip); `mirror(Y)` negates its `y`, which is
 * the same flip turned round.
 */
export const reflection = (axis: "X" | "Y"): Frame =>
  axis === "X" ? frame(0, 0, 0, true) : frame(0, 0, 180, true);

/** Where the frame is facing, as a unit vector in the hall's axes. */
export function facing(f: Frame): { x: number; y: number } {
  const rad = (f.heading * Math.PI) / 180;
  return { x: -Math.sin(rad), y: Math.cos(rad) };
}

/** `x=0.640 y=-1.600 h=180` — a frame as a fact, in metres, for a dump. */
export function showFrame(f: Frame): string {
  const metres = (mm: number): string => (mm / 1000).toFixed(3);
  return `x=${metres(f.x)} y=${metres(f.y)} h=${String(f.heading)}${f.mirrored ? " mirrored" : ""}`;
}
