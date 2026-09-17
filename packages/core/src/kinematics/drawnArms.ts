import type { Vec2 } from "../geometry/Vec2.js";
import type { Angle } from "../geometry/Angle.js";
import { bodyPoint, dirOf, leftOf, rightOf } from "../geometry/Angle.js";
import { mix, smooth } from "../geometry/smooth.js";
import type { Beat } from "../time/Clock.js";
import type { Arm3dSolution } from "./Arm.js";
import { POLE_OUTWARD, solveArm3d } from "./Arm.js";
import type { Hand, PoseSample, Side } from "./PoseSample.js";
import { shouldersAt } from "./shoulders.js";

/**
 * The resting-arm model and the arm points that actually get drawn.
 *
 * A figure says where a hand is when it places one and `'down'` when it does
 * not, so "where is the arm" is only half answered by the pose: the other half
 * is this file — where a hanging hand hangs, and which way the elbow bows.
 * It lives in `core` rather than in the renderer because three different
 * callers need the same answer. The renderer draws it; `@caller/contra` starts
 * every take and every release from it, and cannot import the renderer; and
 * the motion oracle has to measure the elbow the renderer draws, because an
 * elbow that crosses the body is what reads as a jump even when the hand
 * barely moves.
 *
 * The numbers came from the two-dancers spike and were retuned at gate G1, so
 * a standing dancer is a torso, a head and almost no arm.
 */

/**
 * How far below the shoulder a hand hangs when the figure does not place it.
 *
 * A resting arm is very nearly straight — a real one is 60 cm from shoulder to
 * hand and hangs about that far down — so this sits just inside the contract's
 * 15 px reach. The 0.5 px of slack is what bends the elbow; the less of it
 * there is, the less arm there is to see from above, which is gate G1's
 * ruling ("you can't see much arm when someone is just standing there").
 */
export const HAND_HANG_DROP_PX = 14.5;

/**
 * How far out to the side a hanging hand sits, and how far forward it rests.
 *
 * The lateral number is the torso ellipse's own half-width, so the hand hangs
 * beside the hip rather than out past it — 0.1 px outside the shoulder point,
 * which is as close to straight down as the body allows.
 */
export const HAND_HANG_LATERAL_PX = 5.6;
export const HAND_HANG_FORWARD_PX = 0.4;

/**
 * How far a hanging hand swings forward and back with the step. Scaled down
 * with the rest of the hang (gate G1) so the swing stays inside the resting
 * silhouette instead of reaching past the hip.
 */
export const HAND_HANG_SWING_PX = 0.6;

/**
 * How far the hand has to be from the shoulder, on the floor, before the elbow
 * bows outward again. Inside this the hand is hanging under the shoulder and
 * the elbow tucks back instead of winging out.
 */
export const ELBOW_TUCK_PLANAR_PX = 4;

/** How far below the shoulder a hand has to be for the tuck to reach full strength. */
export const ELBOW_TUCK_DROP_PX = 6;

/** How far outward of straight back a fully tucked elbow splays, in degrees. */
export const ELBOW_TUCK_SPLAY_DEG = 15;

/**
 * How much of the pole is allowed to point the way the **arm** already points,
 * as a fraction of the amount that would cancel the elbow's downward bow.
 *
 * {@link solveArm3d} puts the elbow off the shoulder-hand line in the direction
 * of the pole, made perpendicular to that line. The pole points down and
 * outward; an arm that points down and outward *at the same angle* is parallel
 * to it, almost nothing survives the projection, and the elbow's direction
 * round the arm is then undefined — it flips through 180° as the hand crosses
 * that angle, which swings the elbow several px in one 1/32-beat step. With
 * `POLE_OUTWARD` at 0.55 the crossing is at 61° below horizontal, squarely
 * inside the arc a reaching arm sweeps through, and F3a measured what it costs:
 * `long-lines` moving an elbow at 334 px/beat while its hand did 21, and an
 * elbow bound "derived" from an ordinary take that came out at an unusable 750
 * px/beat because the take crosses the same angle.
 *
 * So the along-arm part of the pole is held to half of what would cancel: at
 * least half the elbow's downward bow always survives, the direction is never
 * near-singular, and — because the cap does nothing at all when the pole is
 * already clear of the arm — every hand outside that wedge draws exactly as it
 * did before.
 */
export const ELBOW_POLE_ALONG_FRACTION = 0.5;

/**
 * How far out the hand has to be, on the floor, for that cap to be at full
 * strength.
 *
 * Under the shoulder there is nothing for the along-arm part to cancel: the arm
 * is vertical, so *every* floor direction is already perpendicular to it and
 * the pole's floor direction is the whole of the answer. Capping it there would
 * leave nothing, which is its own singularity — and the direction it would be
 * capped along, the hand's own tiny offset from the shoulder, reverses as the
 * hand swings under it. So the cap fades in as the hand leaves the hip, and is
 * at full strength well before the wedge it exists to prevent.
 */
export const ELBOW_POLE_ALONG_PLANAR_PX = 2;

/** Left and right, in that order. */
export type ArmPair = readonly [left: Arm3dSolution, right: Arm3dSolution];

/**
 * One dancer's arms, resolved into the points a renderer draws: both
 * shoulders, both hands with a hanging one filled in, and both arms in three
 * dimensions (elbow, hand, `elbowZ`, `handZ`, and the `short` an out-of-reach
 * hand was pulled back by).
 */
export interface DrawnArms {
  /** Shoulder points, on the torso angle given. */
  shoulders: { L: Vec2; R: Vec2 };
  /** The hands actually used: the figure's, or the hanging one. */
  hands: { L: Hand; R: Hand };
  /** Whether each hand is hanging rather than placed by the figure. */
  hanging: { L: boolean; R: boolean };
  arms: ArmPair;
}

/**
 * Where a hand hangs when the figure says `'down'`: out to the side at
 * {@link HAND_HANG_LATERAL_PX}, swinging with the step. Ported from the
 * two-dancers spike's `hang`.
 */
export function hangingHand(p: Vec2, facing: Angle, side: Side, beat: Beat, amp: number): Hand {
  const sign = side === "L" ? -1 : 1;
  const forward =
    HAND_HANG_FORWARD_PX + sign * HAND_HANG_SWING_PX * amp * Math.sin(Math.PI * 2 * beat);
  return { p: bodyPoint(p, facing, forward, sign * HAND_HANG_LATERAL_PX), drop: HAND_HANG_DROP_PX };
}

/**
 * The floor-plane part of the elbow pole for one arm.
 *
 * {@link solveArm3d} points the pole down and outward, which is right for an
 * arm that is reaching: the elbow drops and bows away from the body. It is
 * wrong for an arm that hangs, because a near-vertical arm cancels the pole's
 * downward part entirely and the outward part is then the whole of it — the
 * elbow swings out to the side and the dancer stands there with their elbows
 * winged, about 3 px wider each side than their shoulders. That is gate G1's
 * "a bit outstretched at rest still".
 *
 * So: the nearer the hand is to hanging straight under the shoulder, the more
 * the pole swings from outward to backward, which is where a resting elbow
 * actually sits. It is a function of the hand's geometry, not of whether the
 * figure said `'down'`, so a hand a figure places at the dancer's side draws
 * the same as one the renderer hangs there.
 *
 * Then the part of that direction that points the way the arm already points is
 * capped, so the pole can never line up with the arm and leave the elbow's
 * direction round it undefined — see {@link ELBOW_POLE_ALONG_FRACTION}. Outside
 * that wedge the cap does nothing and the pole is exactly what it always was.
 */
export function elbowPole(shoulder: Vec2, hand: Hand, side: Side, facing: Angle): Vec2 {
  const outward = side === "L" ? leftOf(facing) : rightOf(facing);
  const dx = hand.p[0] - shoulder[0];
  const dy = hand.p[1] - shoulder[1];
  const planar = Math.hypot(dx, dy);
  let px = outward[0];
  let py = outward[1];
  const hang = hangFraction(planar, hand.drop);
  if (hang > 0) {
    // Hung: the part of the pole that points **across** the arm goes, and what
    // is left points along it. The pole is then in the arm's own vertical plane
    // and so is the elbow. What is left is not shortened — the cap below is
    // what holds it short of the amount that would cancel the elbow's bow, and
    // so keeps the elbow under the shoulder-hand line rather than out past it.
    //
    // Taking the across-part away rather than swinging the pole round to the
    // arm is what keeps this continuous: the arm's floor direction is an axis,
    // not an arrow — a pole along it and one against it leave the elbow in the
    // same place — and only this form gives the same answer for both.
    const ux = dx / planar;
    const uy = dy / planar;
    const along = px * ux + py * uy;
    px = mix(px, along * ux, hang);
    py = mix(py, along * uy, hang);
  }
  const tuck = (1 - smooth(planar / ELBOW_TUCK_PLANAR_PX)) * smooth(hand.drop / ELBOW_TUCK_DROP_PX);
  if (tuck > 0) {
    // Straight back, splayed a little to this dancer's own side.
    const splay = side === "L" ? ELBOW_TUCK_SPLAY_DEG : -ELBOW_TUCK_SPLAY_DEG;
    const back = dirOf(facing + 180 + splay);
    px = mix(px, back[0], tuck);
    py = mix(py, back[1], tuck);
  }
  return capAlongArm(px, py, dx, dy, planar, hand.drop);
}

/**
 * How much of the sideways pole an arm that **hangs from its hand** gives up:
 * none while it reaches, all of it once the hand is well below the shoulder.
 *
 * The sideways pole answers one question — which side does the elbow bow to —
 * and that question only exists for an arm that **reaches**. An arm hanging from
 * a hand below it has its answer already: the elbow hangs under the shoulder and
 * the forearm goes on out to the hand, which is how anybody holding hands in a
 * ring stands. An overhead view can see nothing of that except the one thing the
 * sideways pole does to it, which is push the elbow out of the arm's own
 * vertical plane — and that is the whole of what the elbow draws.
 *
 * The gate is the **tuck's own two questions, asked the other way round**: while
 * the hand is below the shoulder the pole is never winged out to the side — with
 * the hand *under* the dancer, inside {@link ELBOW_TUCK_PLANAR_PX}, it is the
 * tuck, swung back behind them; with the hand *out* past that, it is hung. The
 * drop runs from {@link ELBOW_TUCK_DROP_PX}, where the tuck reaches full
 * strength, to twice it, which is as far down as a hand ever goes without
 * hanging. Every reach and every take is above that and is untouched, to the last
 * decimal place.
 *
 * **The band is wide on purpose.** The oracle measures the elbow the renderer
 * draws, so a rule that changes over a couple of px of drop moves the elbow
 * while the hand's floor point stands still, which is precisely what
 * `elbowPerHand` is there to catch. Six px of drop is a swing's whole open-out
 * — the elbow crosses it at about 4 px/beat, and the worst `elbowPerHand` in
 * the programme goes **down**, from 8.39× to 7.78× on the swing.
 *
 * **A ring of joined hands is what this is for** (FR-D2b). Everybody's hands
 * hang from their neighbours' (`ringHangDrop`, FR-A2) — measured on the circle,
 * 4.4 px out and 13.5 px down, a 72° hang — and the hand sits a little *inside*
 * the shoulder, toward the middle of the ring. With the sideways pole the elbow
 * swings 1.7–3.1 px **out** of the ring: eight spikes round a ring of four,
 * which is the "weird pollen" the user has been asking about. Hung, the elbow
 * lands within 0.4 px of straight under its own shoulder, with no offset at all
 * out of the arm's vertical plane, and the ring draws round.
 */
function hangFraction(planar: number, drop: number): number {
  if (drop <= ELBOW_TUCK_DROP_PX || planar <= 0) return 0;
  return smooth(planar / ELBOW_TUCK_PLANAR_PX) * smooth(drop / ELBOW_TUCK_DROP_PX - 1);
}

/**
 * The pole, with the part of it pointing the way the arm already points capped
 * so it cannot cancel the elbow's downward bow.
 *
 * The cancelling amount is exactly `planar / drop`: an arm `planar` px out and
 * `drop` px down is parallel to a pole `planar / drop` out and 1 down. A pole
 * pointing the *opposite* way to the arm adds to the bow and is never capped.
 */
function capAlongArm(
  px: number,
  py: number,
  dx: number,
  dy: number,
  planar: number,
  drop: number,
): Vec2 {
  if (planar < 1e-9 || drop <= 0) return [px * POLE_OUTWARD, py * POLE_OUTWARD];
  const ux = dx / planar;
  const uy = dy / planar;
  const along = px * ux + py * uy;
  const limit = (ELBOW_POLE_ALONG_FRACTION * planar) / (drop * POLE_OUTWARD);
  if (along <= limit) return [px * POLE_OUTWARD, py * POLE_OUTWARD];
  const shave = (along - limit) * smooth(planar / ELBOW_POLE_ALONG_PLANAR_PX);
  return [(px - shave * ux) * POLE_OUTWARD, (py - shave * uy) * POLE_OUTWARD];
}

/**
 * One pose resolved into the arm points that get drawn.
 *
 * `p` and `torsoAngle` are separate arguments because the renderer quantises
 * the body position before it solves anything, and hangs the arms off the
 * *swaying* torso while a hanging hand is placed on the plain facing. Left to
 * default they are the pose's own, which is the figure's answer rather than
 * the renderer's — that is what the motion oracle measures, so a dancer's
 * quiet sway does not read as motion the figure asked for.
 */
export function drawnArms(
  pose: PoseSample,
  beat: Beat,
  p: Vec2 = pose.p,
  torsoAngle: Angle = pose.facing,
): DrawnArms {
  const hands = {
    L: resolveHand(pose, p, "L", beat),
    R: resolveHand(pose, p, "R", beat),
  };
  const shoulders = shouldersAt(p, torsoAngle);
  return {
    shoulders,
    hands,
    hanging: { L: pose.hands.L === "down", R: pose.hands.R === "down" },
    arms: [
      solveArm3d(
        shoulders.L,
        hands.L,
        "L",
        torsoAngle,
        elbowPole(shoulders.L, hands.L, "L", torsoAngle),
      ),
      solveArm3d(
        shoulders.R,
        hands.R,
        "R",
        torsoAngle,
        elbowPole(shoulders.R, hands.R, "R", torsoAngle),
      ),
    ],
  };
}

/** The figure's hand, or the hanging one when it left the hand `'down'`. */
export function resolveHand(pose: PoseSample, p: Vec2, side: Side, beat: Beat): Hand {
  const h = pose.hands[side];
  return h === "down" ? hangingHand(p, pose.facing, side, beat, pose.amp) : h;
}
