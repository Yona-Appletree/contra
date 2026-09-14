import type { Beat, Hand, Side, Vec2 } from "@caller/core";
import { FOREARM_PX } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import {
  bearing,
  contraFigure,
  holdWindow,
  isHeld,
  polar,
  takeAndRelease,
} from "./ContraFigure.js";
import { ringFor, ringShift, ringWalk } from "./ring.js";

/** {@link star}'s parameters. */
export interface StarParams extends ContraParams {
  /** Which hand goes in the middle. */
  hand: Side;
  /** How many places round, in quarters: 3 or 4 in most dances. */
  places: number;
  /** How far below shoulder height the hands sit, px. */
  holdDrop: number;
  /** How much higher the robins' hands sit than the larks', px. */
  stackPx: number;
  /**
   * The default, `"wrist"`, is the user's own hall: each dancer's giving hand
   * rests on the wrist of the dancer ahead of them round the star, not in a
   * pile at the centre. `"hands-across"` is today's shape — only the dancer
   * diagonally across, two joined points, robins' above larks' — which some
   * halls call for rarely.
   */
  hold: "wrist" | "hands-across";
}

export const IN_BEATS = 1.5;
export const OUT_BEATS = 1.5;

/**
 * How far back from the centre the wrist point sits, along the direction of
 * whoever is ahead: one forearm, which is what puts a hand on a wrist rather
 * than at the centre a fully reaching palm star would put it.
 */
export const WRIST_RADIUS_PX = FOREARM_PX;

/**
 * Star: walk it round, hand on the wrist of the dancer ahead of you.
 *
 * The user, who dances this hold every week:
 *
 * > "in our area the star is done by putting the hand on the wrist of the
 * > person in front of you. this also lets the arm stay slightly bent. doing
 * > all in a pile in the center (that's awkward). sometimes rarely we call for
 * > a hands-across star, where you grab only the person diagonally across"
 *
 * So the default hold is `"wrist"`: nobody's giving hand goes to the centre at
 * all. Each dancer reaches for a point {@link WRIST_RADIUS_PX} out from the
 * centre, in the direction of the dancer immediately ahead of them round the
 * ring — the spot their own reaching arm would occupy in a palm star, a
 * forearm short of actually getting there. Four dancers therefore put four
 * hands at four distinct points on a small ring, each arm a little bent, and
 * nothing shared at the middle. A four-person star's ring alternates role at
 * every place (`ringOrder`'s own geometry), so the dancer ahead of you is
 * always the other role and the wrist point never has to arbitrate between two
 * of the same one.
 *
 * `"hands-across"` is the other option, unchanged from what this figure always
 * drew: the two diagonal pairs each take one hand, both meeting at the centre,
 * the top role's hand held a little higher than the other's — which is where
 * two of the *same* role do meet (a duple improper four-star's diagonal pairs
 * are always two robins and two larks), and it is resolved by giving the
 * hold's height to the dancer's own role rather than to the specific pair:
 * every robin's hand sits at the same height as every other robin's, so a
 * robin-robin pair is trivially "joined" at one height and still reads above
 * the lark-lark pair beside it.
 */
export const star = contraFigure<StarParams>({
  id: "star",
  call: "STAR RIGHT",
  describe:
    "All four put the named hand on the wrist of the dancer ahead of them round the star, not in a pile in the middle — that keeps your arm slightly bent — and walk forward round the centre; right hand star goes one way and left hand star the other. Four places is once round, two is half way. Rarely, a caller asks for a hands-across star instead: you take hold only of the dancer diagonally across from you, one hand each, the robins' held a little higher than the larks'.",
  lead: 4,
  beats: 8,
  defaults: { from: {}, hand: "R", places: 4, holdDrop: 3, stackPx: 1.2, hold: "wrist" },

  plan(ctx: PlanContext, params: StarParams): FigurePlan {
    const ring = ringFor(ctx);
    const step = 360 / ring.order.length;
    // A right-hand star keeps the middle on the dancer's right, which turns the
    // ring the same way a circle left goes; a left-hand star turns back. The
    // same sign says which way round the ring "ahead" is for the wrist hold.
    const sign = params.hand === "R" ? 1 : -1;
    const faceOffset = sign * 90;
    const turn = sign * params.places * step;
    const beats = params.beats;
    const window = holdWindow(beats, IN_BEATS + 0.4, OUT_BEATS);
    const free: Side = params.hand === "R" ? "L" : "R";

    const ends: Spots = {};
    for (const id of ctx.ids) {
      const p = ctx.spot(ringShift(ring, id, sign * params.places)).p;
      ends[id] = { p, facing: bearing(ring.centre, p) + faceOffset };
    }

    const walk = { inBeats: IN_BEATS, outBeats: OUT_BEATS, turn, faceOffset };
    const placeAt = (id: StationId, t: Beat): Spot =>
      ringWalk(ring, id, ctx.spot(id), ends[id] ?? ctx.spot(id), t, beats, walk);

    // A dancer's own role decides how high their giving hand sits, in both
    // holds: the top role always a little higher, which is what keeps a
    // same-role pair (hands-across's two diagonals) at one height each and
    // still stacks the whole ring "robins above larks" (wrist) or "robins'
    // pair above larks'" (hands-across) without asking any pair to arbitrate.
    const roleDrop = (id: StationId): number =>
      ctx.role(id) === ctx.roleSet.top
        ? params.holdDrop - params.stackPx / 2
        : params.holdDrop + params.stackPx / 2;

    // hands-across: today's shape, unchanged — only the dancer diagonally
    // across, one hand each, both ends of a diagonal meeting at the centre.
    const n = ring.order.length;
    const acrossJoins: HandJoin[] = [];
    for (let k = 0; k < n / 2; k++) {
      const a = ring.order[k]!;
      const b = ring.order[(k + n / 2) % n]!;
      acrossJoins.push({ a, aSide: params.hand, b, bSide: params.hand });
    }
    const acrossHand = (id: StationId): Hand => ({ p: ring.centre, drop: roleDrop(id) });

    // wrist: the dancer immediately ahead of you round the ring, in the
    // direction the star actually turns, is the one whose wrist you take.
    const leaderOf = (id: StationId): StationId => ringShift(ring, id, sign);
    const wristPoint = (leaderId: StationId, t: Beat): Vec2 =>
      polar(ring.centre, bearing(ring.centre, placeAt(leaderId, t).p), WRIST_RADIUS_PX);
    const wristHand = (id: StationId, t: Beat): Hand => ({
      p: wristPoint(leaderOf(id), t),
      drop: roleDrop(id),
    });

    return {
      ends,
      // The wrist hold is not a shared floor point the way hands-across is —
      // only the giving dancer has a hand there, the leader's own hand is busy
      // on somebody else's wrist — so it has nothing to report as a `HandJoin`.
      joinsAt: (t) => (params.hold === "hands-across" && isHeld(window, t) ? acrossJoins : []),
      at(station, t) {
        const self = placeAt(station, t);
        const target = params.hold === "hands-across" ? acrossHand(station) : wristHand(station, t);
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            [params.hand]: takeAndRelease(self, params.hand, t, target, window),
            [free]: "down",
          } as { L: Hand | "down"; R: Hand | "down" },
        };
      },
    };
  },
});
