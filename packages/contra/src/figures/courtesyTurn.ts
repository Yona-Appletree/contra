import type { Angle, Beat, Vec2 } from "@caller/core";
import { angleDiff, dirOf, dist, mix, smooth } from "@caller/core";
import type { RoleName, RoleSet, StationId } from "@caller/choreo";
import type { Spot } from "./ContraFigure.js";
import { bearing, midpoint } from "./ContraFigure.js";

/**
 * The courtesy turn: the lark walks **backward** while the robin walks forward
 * round him, their left hands joined, his right hand on her back.
 *
 * The user: "the larks scoop them and walk backwards or they twirl them." Two
 * figures do this — `robins-chain` and `right-and-left-through` — and before F4
 * both of them drew it as the lark standing still (the chain) or sliding
 * sideways (right and left through). This is the one piece of choreography they
 * now share.
 *
 * **What a courtesy turn is, geometrically.** The couple turns *as a couple*:
 * the point between them is the pivot, the line between them — the couple's
 * axis — sweeps round it, and the two of them keep facing the way the axis
 * says. The lark is the inside of the turn, so he backs up; the robin is the
 * outside, so she walks forward. That is all one rotation, and the rotation's
 * direction is not a choice: it is whichever way puts the lark's feet behind
 * him, which is what {@link backwardArc} works out.
 *
 * **Where this is a model rather than a transcription.** In a hall, a
 * courtesy-turning couple stands a hand's width apart and turns a clean half
 * round. Here the two lines of a set are 32 px apart while a hold is 14
 * (AC3's numbers), so a couple *standing in the lines* is more than twice as
 * wide as a couple *turning*, and the pair has to open out from one to the
 * other as it turns. So the axis, the separation and the pivot all travel: the
 * couple comes together, turns, and opens out onto its two places. A chain,
 * where the robin arrives from the middle of the set, therefore turns through
 * less than a half — the honest consequence of the set being that wide — while
 * a right and left through, where both dancers are already standing in the
 * lines when the turn begins, turns the full half.
 */
export interface CourtesyTurn {
  /** Where the lark is `t` beats into the turn. */
  lark(t: Beat): Spot;
  /** Where the robin is `t` beats into the turn. */
  robin(t: Beat): Spot;
  /** How far the couple's axis sweeps, signed degrees. */
  sweep: number;
}

/** Where one dancer of the turning couple starts and ends. */
export interface TurnEnds {
  from: Spot;
  to: Spot;
}

/**
 * The couple's turn from one arrangement to the other, over `beats`.
 *
 * Both dancers are placed from the same three numbers — the pivot, the axis and
 * the separation — so the two of them are one turning couple at every instant
 * and their joined hands are one point by construction rather than by
 * agreement.
 */
export function courtesyTurn(lark: TurnEnds, robin: TurnEnds, beats: Beat): CourtesyTurn {
  const axisFrom = bearing(lark.from.p, robin.from.p);
  const axisTo = bearing(lark.to.p, robin.to.p);
  const sepFrom = dist(lark.from.p, robin.from.p);
  const sepTo = dist(lark.to.p, robin.to.p);
  const pivotFrom = midpoint(lark.from.p, robin.from.p);
  const pivotTo = midpoint(lark.to.p, robin.to.p);

  // Which way the axis sweeps: the way that takes the lark backward. His offset
  // from the pivot is `−(sep/2)·dir(axis)`, so a turn of `+dθ` moves him by
  // `−(sep/2)·perp(dir(axis))`; if that is in front of him, the couple turns the
  // other way round.
  const spin = dirOf(axisFrom);
  const push: Vec2 = [(sepFrom / 2) * spin[1], (-sepFrom / 2) * spin[0]];
  const sweep = backwardSweep(angleDiff(axisFrom, axisTo), push, lark.from.facing);

  // His body turns the same way his feet go: whichever arc onto his end facing
  // leaves the ground he covers behind him.
  const larkTurn = backwardArc(
    angleDiff(lark.from.facing, lark.to.facing),
    [lark.to.p[0] - lark.from.p[0], lark.to.p[1] - lark.from.p[1]],
    lark.from.facing,
  );
  // She is the one being turned, so her body follows the couple round: the arc
  // onto her end facing that runs the same way the axis does.
  const robinTurn = sameWayArc(angleDiff(robin.from.facing, robin.to.facing), sweep);

  const at = (t: Beat, side: -1 | 1, turn: number, start: Spot): Spot => {
    const k = smooth(beats <= 0 ? 1 : t / beats);
    const axis = dirOf(axisFrom + sweep * k);
    const half = (mix(sepFrom, sepTo, k) / 2) * side;
    const pivot: Vec2 = [mix(pivotFrom[0], pivotTo[0], k), mix(pivotFrom[1], pivotTo[1], k)];
    return {
      p: [pivot[0] + axis[0] * half, pivot[1] + axis[1] * half],
      facing: start.facing + turn * k,
    };
  };

  return {
    sweep,
    lark: (t) => at(t, -1, larkTurn, lark.from),
    robin: (t) => at(t, 1, robinTurn, robin.from),
  };
}

/**
 * `arc`, or the way round the other way, whichever sweeps the couple so that
 * `push` — how the lark moves per degree of sweep — is behind him.
 *
 * `angleDiff` hands back `+180` for a half turn either way, so a right and left
 * through, whose couple turns a clean half, is decided here and nowhere else.
 */
export function backwardSweep(arc: number, push: Vec2, facing: Angle): number {
  const d = dirOf(facing);
  const ahead = push[0] * d[0] + push[1] * d[1];
  // A lark who is looking straight at the robin he is about to turn — which is
  // every lark at the moment of a chain's take — is pushed neither forward nor
  // backward by the sweep, whichever way it goes, so the question this asks
  // does not arise and the couple turns the short way.
  const still = 1e-6 * Math.hypot(push[0], push[1]);
  if (Math.abs(ahead) <= still || arc === 0) return arc;
  const want = ahead > 0 ? -1 : 1;
  return Math.sign(arc) === want ? arc : theOtherWay(arc);
}

/**
 * `arc`, or the way round the other way, so that a dancer who covers `move`
 * while turning it is walking backward — judged half way round, which is where
 * `walksBackward` reads the facing and where a turning dancer's facing is the
 * one the whole arc is about.
 */
export function backwardArc(arc: number, move: Vec2, facing: Angle): number {
  const other = theOtherWay(arc);
  const forward = (a: number): number => {
    const d = dirOf(facing + a / 2);
    return move[0] * d[0] + move[1] * d[1];
  };
  return forward(arc) <= forward(other) ? arc : other;
}

/** The same turn, round the other way. */
const theOtherWay = (arc: number): number => (arc > 0 ? arc - 360 : arc + 360);

/**
 * Which of a couple backs up and which walks forward, as `[lark, robin]`.
 *
 * The robin is the role set's top role — the one whose hand stacks on top —
 * which is the only thing in `@caller/choreo` that tells two roles apart, so a
 * courtesy turn asks it rather than knowing the word "lark". A pair of the same
 * role turns with the first of them backing up.
 */
export function larkAndRobin(
  ctx: { role(station: StationId): RoleName; roleSet: RoleSet },
  pair: readonly [StationId, StationId],
): [StationId, StationId] {
  const [a, b] = pair;
  return ctx.role(a) === ctx.roleSet.top && ctx.role(b) !== ctx.roleSet.top ? [b, a] : [a, b];
}

/** `arc`, or the way round the other way, so that it runs the same way as `like`. */
function sameWayArc(arc: number, like: number): number {
  if (like === 0 || arc === 0) return arc;
  return Math.sign(arc) === Math.sign(like) ? arc : theOtherWay(arc);
}
