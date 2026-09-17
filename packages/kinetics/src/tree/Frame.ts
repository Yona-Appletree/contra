/**
 * A frame is an origin and a direction, in metres and degrees, on the
 * engine's own axes: x across the screen, y down it, a facing of 0 = +x
 * turning toward +y (a dancer's right is `facing + 90°`). Everything in the
 * tree is a frame with a job — a place is a frame a dancer can occupy, an
 * anchor is one nobody occupies, a group's frame is where its children were
 * laid out from.
 */
export interface Frame {
  x: number;
  y: number;
  facing: number;
}

export const IDENTITY: Frame = { x: 0, y: 0, facing: 0 };

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** `local`, expressed in the frame `parent` sits in. */
export function compose(parent: Frame, local: Frame): Frame {
  const c = Math.cos(rad(parent.facing));
  const s = Math.sin(rad(parent.facing));
  return {
    x: parent.x + local.x * c - local.y * s,
    y: parent.y + local.x * s + local.y * c,
    facing: norm(parent.facing + local.facing),
  };
}

/** Degrees folded into [0, 360). */
export const norm = (deg: number): number => ((deg % 360) + 360) % 360;

/** The transforms a `group` or `place` is placed with. */
export type Op =
  | { op: "translate"; x: number; y: number }
  | { op: "rotate"; deg: number }
  | { op: "mirror"; axis: "x" | "y" };

/**
 * One op applied to a frame. A mirror is the one op that is not a rigid
 * motion: it reflects the origin and turns the direction the other way
 * (`mirror(x)` sends a facing θ to 180 − θ, `mirror(y)` to −θ), which is
 * what makes a reverse becket one word.
 */
export function apply(op: Op, f: Frame): Frame {
  switch (op.op) {
    case "translate":
      return { x: f.x + op.x, y: f.y + op.y, facing: f.facing };
    case "rotate": {
      const c = Math.cos(rad(op.deg));
      const s = Math.sin(rad(op.deg));
      return { x: f.x * c - f.y * s, y: f.x * s + f.y * c, facing: norm(f.facing + op.deg) };
    }
    case "mirror":
      return op.axis === "x"
        ? { x: -f.x, y: f.y, facing: norm(180 - f.facing) }
        : { x: f.x, y: -f.y, facing: norm(-f.facing) };
  }
}

/**
 * `at translate(…) rotate(…)` is OpenSCAD's order: the rightmost op is
 * applied first, so "at x = 1 m, rotated 90°" rotates the child about its own
 * origin and then moves it — the reading a person has of the words.
 */
export const applyAll = (ops: readonly Op[], f: Frame): Frame =>
  [...ops].reverse().reduce((frame, op) => apply(op, frame), f);

/** Two frames the same, to a millimetre and a tenth of a degree. */
export const sameFrame = (a: Frame, b: Frame): boolean =>
  Math.abs(a.x - b.x) < 1e-3 &&
  Math.abs(a.y - b.y) < 1e-3 &&
  Math.abs(norm(a.facing - b.facing + 180) - 180) < 0.1;

export const distance = (a: Frame, b: Frame): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The unit vector a facing points along. */
export const unit = (facing: number): { x: number; y: number } => ({
  x: Math.cos(rad(facing)),
  y: Math.sin(rad(facing)),
});

/** The facing that points along a vector. */
export const facingOf = (x: number, y: number): number => norm((Math.atan2(y, x) * 180) / Math.PI);

/** Round to the millimetre, so a rotated frame prints as the number a person wrote. */
export const tidy = (f: Frame): Frame => ({
  x: Math.round(f.x * 1000) / 1000 + 0,
  y: Math.round(f.y * 1000) / 1000 + 0,
  facing: Math.round(norm(f.facing) * 10) / 10 + 0,
});
