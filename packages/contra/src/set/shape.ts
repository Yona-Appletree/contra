import type { Angle, Vec2 } from "@caller/core";
import { HOLD_SPACING_PX, addScaled, angleOf, dirOf, dist, norm } from "@caller/core";
import type { DancerId } from "@caller/choreo";
import type { Slot } from "./SetModel.js";

/**
 * **The set's current shape, as data with named places** (`vision.md` §"Set
 * state", M7).
 *
 * M1 left `SetModel.shape` as the string `"lines"` with a comment saying M7
 * would make it real. This is that: a shape is a **kind** plus, for every group
 * of dancers standing in it, the **order** they stand in and where that
 * arrangement sits. That is the smallest thing that answers the two questions
 * the corpus actually asks of a shape:
 *
 * - *"in a line of four, go down the hall (M1-W2-M2-W1)"* — a line of four is
 *   not four dancers near each other, it is four dancers **in an order**, and
 *   The Nice Combination restates the order for the way back (`W2-M1-W1-M2`)
 *   because turning as couples changed it.
 * - *"; form wave of four (men in center)"* — 730 corpus figure lines end by
 *   naming the shape they leave behind, some with no turn amount at all, so a
 *   shape has to be solvable **backwards** from its end (Q6).
 *
 * Everything here is plain data and pure geometry: no formation, no model, no
 * figure. {@link solveShape} takes spots and gives spots back, so one function
 * serves a definition's `ends`, the interpreter's target solver, and
 * `pnpm dance`'s own check that a call which named a shape really formed one.
 *
 * ## Two directions, not one
 *
 * A shape carries an **axis** (which way its own order runs) and a **facing**
 * (which way the shape as a whole points). They are genuinely different, and
 * The Nice Combination is the proof: its line of four goes *down* the hall and
 * then *up* it — two opposite facings — while both orders are written across the
 * hall the same way round, because a caller reads a line from one fixed side of
 * the room. Folding the two into one angle makes `up-the-hall`'s own order
 * parameter come out backwards.
 */

/** Which shape a set — or one group of it — is standing in. */
export type SetShapeKind = "lines" | "line-of-four" | "ring" | "wave" | "diamond";

/**
 * One group of dancers standing in a shape, in the shape's own order.
 *
 * The order is what a shape *is*, over and above where people are standing: a
 * line of four read the other way round is a different line of four.
 */
export interface ShapeGroup {
  /** The dancers, in the shape's own order. */
  order: readonly DancerId[];
  /** The shape's centre, world px. */
  centre: Vec2;
  /** Which way the shape's own order runs: from its first place to its last. */
  axis: Angle;
  /**
   * Which way the shape as a whole points, world degrees.
   *
   * A line of four's is the way the line travels and a wave's is the way its
   * first place looks; a ring's and a diamond's is unread, because everybody in
   * one of those faces its middle.
   */
  facing: Angle;
  /** How far apart adjacent places of the shape are, px. */
  spacing: number;
}

/** What shape a set is in, and who is standing where in it. */
export interface SetShape {
  kind: SetShapeKind;
  /** One entry per group standing in the shape; empty for `"lines"`. */
  groups: readonly ShapeGroup[];
}

/** The shape a set is in when nobody has formed anything: its own two lines. */
export const LINES_SHAPE: SetShape = { kind: "lines", groups: [] };

/**
 * Where a shape's own places sit, in the order the group names them.
 *
 * A line of four and a wave are the same arithmetic — `n` places in a row along
 * the axis — and differ only in which way the dancers on them look. A ring is
 * `n` places evenly round a circle from the axis; a diamond is a ring of four
 * read as two **points** (along the axis) and two **sides** (across it).
 */
export function placesOf(kind: SetShapeKind, group: ShapeGroup): Vec2[] {
  const n = group.order.length;
  if (n === 0 || kind === "lines") return [];
  if (kind === "ring") {
    const radius = ringRadius(n, group.spacing);
    return group.order.map((_, i) =>
      addScaled(group.centre, dirOf(group.axis + (360 * i) / n), radius),
    );
  }
  if (kind === "diamond") {
    // Point, side, point, side, round the diamond: so `diamond.point` is every
    // other place and the two lists come out of the one order.
    return group.order.map((_, i) =>
      addScaled(group.centre, dirOf(group.axis + 90 * i), group.spacing),
    );
  }
  const along = dirOf(group.axis);
  return group.order.map((_, i) =>
    addScaled(group.centre, along, (i - (n - 1) / 2) * group.spacing),
  );
}

/**
 * The named places of one group standing in a shape, world px.
 *
 * `ring.centroid`, `line.end`, `diamond.point` — the three the brief names —
 * plus the handful the same shapes obviously also have. Each name answers a
 * **list**, because a shape's named places are rarely unique: a line of four has
 * two ends, a diamond two points, a ring one place per dancer.
 */
export function shapePlaces(kind: SetShapeKind, group: ShapeGroup): Record<string, Vec2[]> {
  const n = group.order.length;
  const places = placesOf(kind, group);
  const centre = [group.centre];
  if (kind === "lines") return {};
  if (kind === "ring") return { centroid: centre, centre, place: places };
  if (kind === "diamond") {
    return {
      centre,
      centroid: centre,
      point: places.filter((_, i) => i % 2 === 0),
      side: places.filter((_, i) => i % 2 === 1),
      place: places,
    };
  }
  return {
    centre,
    centroid: centre,
    end: n === 0 ? [] : [places[0]!, places[n - 1]!],
    inside: places.slice(1, Math.max(1, n - 1)),
    place: places,
  };
}

/**
 * The radius of a regular ring of `n` places whose neighbours are `spacing`
 * apart.
 *
 * `@caller/choreo`'s `ringOf` reads a ring off where the dancers already stand;
 * this is the other direction, which is what a **target** needs: four dancers
 * about to take hands in a ring have to end the same distance from each other as
 * any other joined-hand hold, so the radius falls out of the spacing rather than
 * out of where they happened to be.
 */
export const ringRadius = (n: number, spacing: number): number =>
  n < 2 ? 0 : spacing / (2 * Math.sin(Math.PI / n));

/**
 * **A shape stated as a target**: what a call writes when it names the shape it
 * forms rather than the amount it turns (Q6).
 *
 * Written in a dance record as `"form": { "shape": "wave", "lead": -1 }` and in
 * a definition as `ends: { target: … }`. Every field but `shape` is optional:
 * the whole point of Q6 is that a caller says "form a wave of four" and the
 * geometry is solved from where the dancers already are.
 */
export interface TargetShape {
  shape: SetShapeKind;
  /** Which way the shape's order runs; read off the dancers when left out. */
  axis?: Angle;
  /** Which way the shape points; read off the dancers when left out. */
  facing?: Angle;
  /** How far apart adjacent places sit; a joined-hand spacing when left out. */
  spacing?: number;
  /** For a wave: which of the two alternating facings the **first** place takes. */
  lead?: 1 | -1;
  /**
   * Whether the shape then settles on to the **formation's** own places.
   *
   * A figure may form a shape and be a gatherer at the same time, and "bend the
   * line" is both: it puts four dancers into a ring *and* puts that ring on the
   * four places the set already had, which is what stops a ring drifting a pixel
   * every time through. A line of four going down the hall forms a shape and
   * settles nothing, because down the hall is not a place the formation has.
   */
  settle?: boolean;
}

/** Where a dancer stands and which way they look, in whatever px the caller used. */
export interface ShapeSpot {
  p: Vec2;
  facing: Angle;
}

/** A target shape, solved: where each of the dancers named ends up. */
export interface ShapeSolution {
  kind: SetShapeKind;
  /** One per dancer, in the order they were given. */
  spots: readonly ShapeSpot[];
  centre: Vec2;
  axis: Angle;
  facing: Angle;
  spacing: number;
}

/**
 * **The target-shape solver** (Q6): the shape a call says it forms, solved from
 * where the dancers standing in it actually are.
 *
 * One rule for every shape, and it is the honest reading of what a caller means:
 * the shape sits **where the dancers already are** — its centre is their
 * centroid, its axis the way they are already strung out, its facing the way
 * they are already pointing — and only the **arrangement** is imposed. So "bend
 * the line" folds four dancers in a row into a ring about their own middle, and
 * "form a wave of four" straightens four who are nearly in a row into one,
 * neither of them moving the group anywhere.
 *
 * `from` is in the order the shape wants, which is the order parameter a
 * transcript writes out (`M1-W2-M2-W1`). Nothing here reorders anybody: which
 * dancer takes which place is the call's business and not the geometry's.
 */
export function solveShape(
  target: TargetShape,
  from: readonly ShapeSpot[],
  spacing: number = HOLD_SPACING_PX,
): ShapeSolution {
  const kind = target.shape;
  const centre = centroid(from.map((s) => s.p));
  // **How far apart is how far apart they already are.** The same rule as the
  // axis and the facing: a target shape imposes an *arrangement* and moves the
  // group nowhere, so a wave of four standing a dancing place apart down the set
  // stays a dancing place apart rather than closing up to a hold. A call that
  // means to change the spacing says so.
  const step = target.spacing ?? gapOf(from) ?? spacing;
  const axis = target.axis ?? defaultAxis(kind, from, centre);
  const facing = target.facing ?? defaultFacing(from);
  const group: ShapeGroup = {
    order: from.map((_, i) => `#${String(i)}`),
    centre,
    axis,
    facing,
    spacing: step,
  };
  const places = placesOf(kind, group);
  const lead = target.lead ?? 1;
  const spots: ShapeSpot[] =
    kind === "lines"
      ? from.map((s) => ({ ...s }))
      : places.map((p, i) => ({
          p,
          facing:
            kind === "ring" || kind === "diamond"
              ? angleOf(centre[0] - p[0], centre[1] - p[1])
              : kind === "wave"
                ? facing + (i % 2 === 0 ? 0 : 180) * lead
                : facing,
        }));
  return { kind, spots, centre, axis, facing, spacing: step };
}

/**
 * Which way a shape's order runs when the call did not say.
 *
 * A row — a line of four, a wave — runs the way its dancers are already strung
 * out, first to last. A ring or a diamond takes its phase from where its first
 * dancer already stands, which is `ringOf`'s own rule and is what keeps "bend
 * the line" from spinning the four round on their way into the circle.
 */
function defaultAxis(kind: SetShapeKind, from: readonly ShapeSpot[], centre: Vec2): Angle {
  if (from.length < 2) return 0;
  const first = from[0]!.p;
  if (kind === "ring" || kind === "diamond") {
    if (dist(centre, first) < 1e-9) return 0;
    const phase = angleOf(first[0] - centre[0], first[1] - centre[1]);
    const half = bendingPhase(from, centre, phase);
    return phase + half;
  }
  const last = from[from.length - 1]!.p;
  if (dist(first, last) < 1e-9) return 0;
  return angleOf(last[0] - first[0], last[1] - first[1]);
}

/**
 * How far apart consecutive dancers of a shape's own order already stand, or
 * `undefined` when there is no answer.
 *
 * Read in the shape's order rather than by nearest neighbour, so a row gives the
 * gap along the row and a ring given in ring order gives the gap round the ring.
 */
function gapOf(from: readonly ShapeSpot[]): number | undefined {
  if (from.length < 2) return undefined;
  let total = 0;
  for (let i = 0; i + 1 < from.length; i++) total += dist(from[i]!.p, from[i + 1]!.p);
  const mean = total / (from.length - 1);
  return mean < 1e-9 ? undefined : mean;
}

/**
 * **Bending a line into a ring turns it half a place**, and which way is the way
 * the dancers are looking.
 *
 * Without this a ring solved from a row comes out as a diamond — the dancer at
 * one end of the line ends at one point of it and everybody is equidistant from
 * every place the formation has, which is a tie the settling cannot break. With
 * it, bending a line of four is the figure a caller means: the two ends walk
 * **forward** and the two middles back up, and the ring lands square on the set.
 *
 * It is a fact about the shape change rather than about any dance, which is why
 * it lives here and not in a definition: a ring solved from four dancers who are
 * *not* in a row (they are already round something) gets no half place, because
 * there is no line to bend.
 */
function bendingPhase(from: readonly ShapeSpot[], centre: Vec2, phase: Angle): number {
  const n = from.length;
  if (n < 3) return 0;
  const along = dirOf(
    angleOf(from[n - 1]!.p[0] - from[0]!.p[0], from[n - 1]!.p[1] - from[0]!.p[1]),
  );
  const across = [along[1], -along[0]] as const;
  let spread = 0;
  let length = 0;
  for (const spot of from) {
    const dx = spot.p[0] - centre[0];
    const dy = spot.p[1] - centre[1];
    spread = Math.max(spread, Math.abs(dx * across[0] + dy * across[1]));
    length = Math.max(length, Math.abs(dx * along[0] + dy * along[1]));
  }
  // In a row, and not merely a squashed ring: the spread across the line is a
  // small fraction of its length.
  if (length < 1e-9 || spread > length / 4) return 0;
  const half = 180 / n;
  // Turn the first dancer toward the way they are facing.
  const tangent = phase + 90;
  const toward = Math.cos(((from[0]!.facing - tangent) * Math.PI) / 180);
  return toward >= 0 ? half : -half;
}

/**
 * Which way a shape points when the call did not say: the circular mean of the
 * facings its dancers already have.
 *
 * Meaningless for a wave, whose dancers face opposite ways on purpose — which is
 * why a wave's `facing` is the way its **first** place looks and a call that
 * cares says so.
 */
const defaultFacing = (from: readonly ShapeSpot[]): Angle =>
  from.length === 0 ? 0 : meanAngle(from.map((s) => s.facing));

/**
 * **How far a turn has to go to land on a target shape** — Q6's other half.
 *
 * A call that names a shape and omits the amount is asking for this: the turn,
 * in whole turns, that takes `from` on to `to` about `centre` going the way
 * `sign` says, rounded on to the grid a caller actually calls in (halves, by
 * default, because contra turns are called in halves and quarters).
 *
 * A call that names **both** is checked against it and a mismatch is a
 * `pnpm dance` warning rather than an error: the caller's word wins, because a
 * caller who says "once and a half" has danced it and the shape clause is a
 * description of where that leaves you.
 */
export function turnsToTarget(
  from: Vec2,
  to: Vec2,
  centre: Vec2,
  sign: 1 | -1 = 1,
  quantum = 0.5,
): number {
  const a = angleOf(from[0] - centre[0], from[1] - centre[1]);
  const b = angleOf(to[0] - centre[0], to[1] - centre[1]);
  let sweep = (b - a) * sign;
  while (sweep < 0) sweep += 360;
  while (sweep >= 360) sweep -= 360;
  return Math.round(sweep / 360 / quantum) * quantum;
}

/**
 * How far the dancers are from really standing in the shape a call said it
 * formed, px — the number `pnpm dance` warns on.
 *
 * The shape is solved from **where they actually ended**, so this is not "did
 * the figure do as it was told" (it always did) but "is the arrangement the call
 * named the arrangement they are in". A figure that ends in a line of four when
 * the call said a wave reports the gap between the two.
 */
export function shapeMiss(
  target: TargetShape,
  ended: readonly ShapeSpot[],
  spacing?: number,
): number {
  if (ended.length === 0) return 0;
  const solved = solveShape(target, ended, spacing);
  let worst = 0;
  ended.forEach((spot, i) => {
    const want = solved.spots[i];
    if (want) worst = Math.max(worst, dist(spot.p, want.p));
  });
  return worst;
}

/**
 * **The shape some dancers are really standing in**, read off where a figure
 * left them.
 *
 * What `planCycle` records on the model after a figure that says it forms a
 * shape: not the figure's *claim* but the arrangement its ends actually make, so
 * the set's shape is a measurement like everything else in the hub. The order is
 * read from the geometry too — along the line for a row, round the circle for a
 * ring — which is what makes "the dancer beside me in the line" answerable
 * afterwards by anybody who asks.
 */
export function shapeFromEnds(
  kind: SetShapeKind,
  ended: readonly { dancer: DancerId; p: Vec2; facing: Angle }[],
): ShapeGroup {
  const centre = centroid(ended.map((e) => e.p));
  if (kind === "ring" || kind === "diamond") {
    const round = [...ended].sort(
      (a, b) =>
        angleOf(a.p[0] - centre[0], a.p[1] - centre[1]) -
        angleOf(b.p[0] - centre[0], b.p[1] - centre[1]),
    );
    const first = round[0];
    return {
      order: round.map((e) => e.dancer),
      centre,
      axis: first === undefined ? 0 : angleOf(first.p[0] - centre[0], first.p[1] - centre[1]),
      facing: meanAngle(round.map((e) => e.facing)),
      spacing: meanGap(
        round.map((e) => e.p),
        true,
      ),
    };
  }
  // A row: the axis runs between the two dancers furthest apart, and the order
  // is their projection on to it.
  let axis = 0;
  let worst = -1;
  for (let i = 0; i < ended.length; i++) {
    for (let j = i + 1; j < ended.length; j++) {
      const gap = dist(ended[i]!.p, ended[j]!.p);
      if (gap > worst) {
        worst = gap;
        axis = angleOf(ended[j]!.p[0] - ended[i]!.p[0], ended[j]!.p[1] - ended[i]!.p[1]);
      }
    }
  }
  const along = dirOf(axis);
  const row = [...ended].sort(
    (a, b) =>
      (a.p[0] - centre[0]) * along[0] +
      (a.p[1] - centre[1]) * along[1] -
      ((b.p[0] - centre[0]) * along[0] + (b.p[1] - centre[1]) * along[1]),
  );
  return {
    order: row.map((e) => e.dancer),
    centre,
    axis,
    facing: row[0]?.facing ?? 0,
    spacing: meanGap(
      row.map((e) => e.p),
      false,
    ),
  };
}

/** The mean distance between neighbours of a row, or round a ring. */
function meanGap(points: readonly Vec2[], round: boolean): number {
  const n = points.length;
  if (n < 2) return 0;
  let total = 0;
  const gaps = round ? n : n - 1;
  for (let i = 0; i < gaps; i++) total += dist(points[i]!, points[(i + 1) % n]!);
  return total / gaps;
}

/** The centre of some points. */
export function centroid(points: readonly Vec2[]): Vec2 {
  if (points.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

/** The circular mean of some angles, degrees. */
function meanAngle(angles: readonly Angle[]): Angle {
  let x = 0;
  let y = 0;
  for (const a of angles) {
    const r = (a * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return angles[0] ?? 0;
  return angleOf(x, y);
}

/**
 * **The lattice, as a figure can read it**: enough of a formation's slot
 * geometry, in one instance's own frame, for a definition to name a *place on
 * the set* rather than a place in its own little shape.
 *
 * M6's `circulate` is what this exists for, and M6's report says precisely why
 * it could not be written: *"the lark ends across the set and one place along,
 * the robin one place along her own line… the expression calculus has no
 * `PointExpr` for a slot, and in a lane instance the roles are the dancers' own
 * slot names, so a definition cannot name the dancer whose place it is walking
 * to. Every way of faking it is wrong for one of the two lines, because 'across
 * the set' is `+x` for one line and `−x` for the other and no expression can see
 * which."* With this, `{ point: "slot", line: "other", along: 1 }` is one
 * sentence that is right for both lines.
 *
 * It is plain data because it rides in `params` beside `homes` and `nearby`, and
 * plain data is enough: every contra formation's `homeAt` is **affine** in the
 * position, so two origins and one step vector are the whole of the geometry.
 */
export interface SlotView {
  /** The frame-local point of position `0` on each line, by `Slot.line`. */
  origin: readonly [Vec2, Vec2];
  /** How far one `Slot.position` moves a dancer, frame-local px. */
  step: Vec2;
  /** The home facing on each line for each travel, keyed `"<line>/<travel>"`. */
  facing: Readonly<Record<string, Angle>>;
  /** Which slot each figure-role stands on, and which way they travel. */
  at: Readonly<Record<string, { line: 0 | 1; position: number; travel: 1 | -1 }>>;
}

/** Where a slot's home is, in the frame the {@link SlotView} was built in. */
export const slotPoint = (view: SlotView, slot: Slot): Vec2 =>
  addScaled(view.origin[slot.line], view.step, slot.position);

/** Which way a dancer travelling `travel` faces at home on `line`. */
export const slotFacing = (view: SlotView, line: 0 | 1, travel: 1 | -1): Angle =>
  view.facing[`${String(line)}/${String(travel)}`] ?? 0;

/** The unit vector one position along the set points in, frame-local. */
export const alongSet = (view: SlotView): Vec2 => norm(view.step);

/** A role's own slot, or a clear error naming the roles the view has. */
export function slotOfRole(
  view: SlotView,
  role: string,
): { line: 0 | 1; position: number; travel: 1 | -1 } {
  const at = view.at[role];
  if (!at) {
    throw new Error(
      `no slot for "${role}" (have: ${Object.keys(view.at).join(", ")}) — ` +
        `a figure that names a slot has to be resolved against a set`,
    );
  }
  return at;
}

/** The other line of the set from this one. */
export const otherLine = (line: 0 | 1): 0 | 1 => (line === 1 ? 0 : 1);

/** Which group of a shape a dancer is standing in, or `undefined`. */
export const shapeGroupOf = (shape: SetShape, dancer: DancerId): ShapeGroup | undefined =>
  shape.groups.find((group) => group.order.includes(dancer));

/** Whether two shapes are the same shape with the same people in the same order. */
export function sameShape(a: SetShape, b: SetShape): boolean {
  if (a.kind !== b.kind || a.groups.length !== b.groups.length) return false;
  return a.groups.every((group, i) => {
    const other = b.groups[i]!;
    return (
      group.order.length === other.order.length &&
      group.order.every((id, j) => id === other.order[j])
    );
  });
}
