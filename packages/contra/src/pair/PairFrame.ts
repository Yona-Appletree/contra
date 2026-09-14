import type { Angle, Beat, Hand, Side, Vec2 } from "@caller/core";
import {
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  addScaled,
  angleOf,
  bodyPoint,
  dirOf,
  leftOf,
} from "@caller/core";

/**
 * The two contra roles. `@caller/core` never names them; `@caller/hall`'s
 * `CONTRA_ROLE_SET` says which one stacks on top (the robin).
 */
export type PairRole = "lark" | "robin";

/** Both roles, lark first. */
export const PAIR_ROLES: readonly PairRole[] = ["lark", "robin"];

/** The other role. */
export const partnerOf = (role: PairRole): PairRole => (role === "lark" ? "robin" : "lark");

/**
 * The minimal two-dancer frame a pair figure runs in: a centre, an axis, and
 * the hold spacing. This is M5's stand-in for a formation — M7's choreo engine
 * replaces the type and M8 re-hosts the figures on it, so nothing here knows
 * about lines, sets, minor sets or progression.
 *
 * `axis` is the direction from the centre toward the **lark's** place, so the
 * lark stands at `centre + dirOf(axis) * spacing / 2` facing `axis + 180`, and
 * the robin stands opposite facing `axis`.
 */
export interface PairFrame {
  /** Floor point half way between the two dancers, world px. */
  centre: Vec2;
  /** Degrees from the centre toward the lark's place. */
  axis: Angle;
  /** Chest-to-chest spacing of a two-hand hold, world px. */
  spacing: number;
}

/** A pair centred on the origin with the lark to the left, as the spike drew it. */
export const DEFAULT_PAIR_FRAME: PairFrame = {
  centre: [0, 0],
  axis: 180,
  spacing: HOLD_SPACING_PX,
};

/** Where one dancer stands and which way they face. */
export interface PairPlace {
  p: Vec2;
  facing: Angle;
}

/** Normalise an angle to `[0, 360)`. */
export const norm360 = (a: Angle): Angle => ((a % 360) + 360) % 360;

/** Direction from the centre toward `role`'s place. */
export const placeAngle = (frame: PairFrame, role: PairRole): Angle =>
  norm360(frame.axis + (role === "lark" ? 0 : 180));

/**
 * Where `role` stands at `spacing` apart, facing the partner. The default
 * spacing is the frame's, i.e. the hold spacing.
 */
export function pairPlace(frame: PairFrame, role: PairRole, spacing = frame.spacing): PairPlace {
  const a = placeAngle(frame, role);
  return {
    p: addScaled(frame.centre, dirOf(a), spacing / 2),
    facing: norm360(a + 180),
  };
}

/**
 * Where `role` stands in the lines: {@link LINE_OFFSET_PX} further apart than a
 * hold, the AC3 number.
 */
export const pairLinePlace = (frame: PairFrame, role: PairRole): PairPlace =>
  pairPlace(frame, role, frame.spacing + LINE_OFFSET_PX);

/** Which way `role` looks when watching the partner. */
export const lookAtPartner = (self: Vec2, partner: Vec2): Angle =>
  norm360(angleOf(partner[0] - self[0], partner[1] - self[1]));

/**
 * A hand that is not placed by the figure: out to the side and down, swinging
 * with the step.
 *
 * These four numbers are `@caller/hall`'s `HAND_HANG_*`, which came from the
 * same two-dancers spike. A figure needs them because every take and release is
 * animated and the animation has to start somewhere; `@caller/contra` cannot
 * import `@caller/hall`, so they are restated here. Keeping them in step is a
 * known duplication — see `packages/contra/README.md`.
 */
export const HAND_DOWN_DROP_PX = 14;
export const HAND_DOWN_LATERAL_PX = 6.2;
export const HAND_DOWN_FORWARD_PX = 0.4;
export const HAND_DOWN_SWING_PX = 0.8;

/**
 * The hand of a dancer at `p` facing `facing`, hanging at the dancer's side.
 *
 * `beat` is the figure's **own** beat, not the absolute one: a figure's step
 * phase is measured from its own start. Because every figure starts on a whole
 * beat and the phase has period 1 (or 1/2 for a buzz), that is the same number
 * the renderer's quiet motion uses.
 */
export function handDown(p: Vec2, facing: Angle, side: Side, beat: Beat, amp: number): Hand {
  const sign = side === "L" ? -1 : 1;
  const forward =
    HAND_DOWN_FORWARD_PX + sign * HAND_DOWN_SWING_PX * amp * Math.sin(Math.PI * 2 * beat);
  return {
    p: bodyPoint(p, facing, forward, sign * HAND_DOWN_LATERAL_PX),
    drop: HAND_DOWN_DROP_PX,
  };
}

/** Where a two-hand hold puts the joined hands, sideways from the centre. */
export const HOLD_LATERAL_PX = 4.5;

/** How far below shoulder height a two-hand hold sits. */
export const HOLD_DROP_PX = 5;

/** The two joined points of a two-hand hold. */
export interface TwoHandHold {
  /** The lark's left hand, which is also the robin's right. */
  a: Hand;
  /** The lark's right hand, which is also the robin's left. */
  b: Hand;
  /** Unit vector to the lark's left, the direction the hold spreads along. */
  across: Vec2;
}

/**
 * A two-hand hold as **one pair of floor points**, computed once from the
 * frame and handed to both dancers, which is what makes joined hands a single
 * shared point rather than two that happen to agree (plan AC2).
 */
export function twoHandHold(
  frame: PairFrame,
  lateral = HOLD_LATERAL_PX,
  drop = HOLD_DROP_PX,
): TwoHandHold {
  const across = leftOf(norm360(frame.axis + 180));
  return {
    a: { p: addScaled(frame.centre, across, lateral), drop },
    b: { p: addScaled(frame.centre, across, -lateral), drop },
    across,
  };
}

/** How far below shoulder height the inside hands of a ballroom swing rest. */
export const INSIDE_DROP_PX = 7;

/**
 * Where the inside hands of a ballroom swing end up when the swing opens out:
 * a shared point just behind the pair's centre, relative to the way they are
 * about to face. The allemande picks the same point up, which is what closes
 * the seam between them.
 */
export const insideHand = (frame: PairFrame, facing: Angle): Hand => ({
  p: bodyPoint(frame.centre, facing, -1, 0),
  drop: INSIDE_DROP_PX,
});

/** The joined hand of a single-hand turn: the pair's centre, held high. */
export const CENTRE_DROP_PX = 2;

/** The shared floor point of an allemande, computed once from the frame. */
export const centreHand = (frame: PairFrame): Hand => ({
  p: frame.centre,
  drop: CENTRE_DROP_PX,
});
