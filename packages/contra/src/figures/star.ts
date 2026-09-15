import type { Beat, Hand, Side, Vec2 } from "@caller/core";
import { shouldersAt } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import { bearing, contraFigure, holdWindow, isHeld, takeAndRelease } from "./ContraFigure.js";
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
 * **How far down the arm of the dancer ahead the grip sits**, as a fraction of
 * it: `0` is their giving shoulder and `1` is their own hand.
 *
 * The user, on the Moves page (FR-A1):
 *
 * > "almost right, but you put your hand on the wrist, not the shoulder, of the
 * > person in front of you."
 *
 * They were reading the picture exactly right. The old point was a fixed
 * `FOREARM_PX` — 7.5 px — out from the ring's centre along the bearing of the
 * dancer ahead, and a four-person star's ring is 12 px across, which puts every
 * dancer's giving shoulder **6.51 px** from that same centre on that same
 * bearing. The hand landed 0.99 px outside the next dancer's shoulder: on it.
 *
 * {@link wristPoint} replaces the radius with a fraction of their arm, which is
 * what the sentence actually says, and the fraction is the one dial the figure
 * has. **It cannot be taken all the way to the wrist, and the reason is
 * measured rather than argued.** Solve the chain — my hand `t` of the way from
 * their shoulder to their hand, their hand `t` of the way to the next one's,
 * all the way round a ring of `n` — and the hands land on a ring of radius
 * `s(1−t)/|1 − t·e^{iφ}|`, which for a four-star (`s = 6.51`, `φ = 90°`) is
 * 4.4 px at `t = 0.3`, 2.9 px at `t = 0.5` and **1.0 px at `t = 0.8`**, where a
 * wrist really is. A true wrist chain in a 12 px ring *is* the pile in the
 * middle the user calls awkward — the two sentences cannot both hold while the
 * ring is that tight, and the ring's radius is `ringOf`'s footprint clamp,
 * which is the circle's and not this figure's.
 *
 * So `0.5` — half way down their forearm, as near the wrist as the star's own
 * ring allows without collapsing the four hands into one point. It puts the
 * grip 2.91 px from the centre, 4.1 px from the next dancer's shoulder and 4.1
 * px from their hand, with the giver's own arm at 48% of its reach: bent, as
 * the user asks, and nowhere near their shoulder.
 */
export const WRIST_ALONG = 0.5;

/**
 * **The wrist of the dancer ahead**: {@link WRIST_ALONG} of the way from their
 * giving shoulder to their own hand, solved in closed form.
 *
 * Their hand is not known when this runs — it is this same point, one place
 * round — so the chain is solved rather than sampled. Writing the grip as a
 * complex number `z` about the ring's centre, and the next dancer's hand as the
 * same `z` turned by the angle `φ` between two places:
 *
 * ```
 * z = (1 − t)·S + t·z·e^{iφ}   ⟹   z = (1 − t)·S / (1 − t·e^{iφ})
 * ```
 *
 * where `S` is their giving shoulder relative to the centre. At `t = 0` that is
 * their shoulder exactly and at `t → 1` it is the centre, so the fraction is a
 * dial from "on their shoulder" to "in a pile in the middle" and every value
 * between is a real point on a real arm.
 */
export function wristPoint(
  centre: Vec2,
  me: Vec2,
  aheadShoulder: Vec2,
  ahead: Vec2,
  along: number,
): Vec2 {
  const phi = ((bearing(centre, ahead) - bearing(centre, me)) * Math.PI) / 180;
  const nx = (1 - along) * (aheadShoulder[0] - centre[0]);
  const ny = (1 - along) * (aheadShoulder[1] - centre[1]);
  const dx = 1 - along * Math.cos(phi);
  const dy = -along * Math.sin(phi);
  const den = dx * dx + dy * dy;
  if (den === 0) return centre;
  return [centre[0] + (nx * dx + ny * dy) / den, centre[1] + (ny * dx - nx * dy) / den];
}

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
 * all. Each dancer reaches for a point {@link WRIST_ALONG} of the way down the
 * giving arm of the dancer immediately ahead of them round the ring — see
 * {@link wristPoint} for the chain that solves, and {@link WRIST_ALONG} for why
 * the fraction stops where it does. Four dancers therefore put four hands at
 * four distinct points on a small ring, each arm a little bent, and nothing
 * shared at the middle. A four-person star's ring alternates role at
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
    // direction the star actually turns, is the one whose wrist you take —
    // {@link WRIST_ALONG} of the way down their giving arm.
    const leaderOf = (id: StationId): StationId => ringShift(ring, id, sign);
    const wristHand = (id: StationId, t: Beat): Hand => {
      const leader = placeAt(leaderOf(id), t);
      return {
        p: wristPoint(
          ring.centre,
          placeAt(id, t).p,
          shouldersAt(leader.p, leader.facing)[params.hand],
          leader.p,
          WRIST_ALONG,
        ),
        drop: roleDrop(id),
      };
    };

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
