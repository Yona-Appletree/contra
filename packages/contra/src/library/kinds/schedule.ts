import type { Angle, Beat, Vec2 } from "@caller/core";
import { angleDiff, angleOfVec, clamp01, dist, ramp, smooth } from "@caller/core";
import type { Side } from "@caller/choreo";
import type {
  FigurePlan,
  HandJoin,
  HoldWindow,
  LocalHand,
  Spot,
  Spots,
} from "../../figures/ContraFigure.js";
import {
  bearing,
  centreOf,
  joinedHands,
  midpoint,
  takeAndRelease,
} from "../../figures/ContraFigure.js";
import { handDown } from "../../pair/PairFrame.js";
import type { FigureRole, HoldSpec, ScheduleItem, ScheduleShape } from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalNumber } from "../expr.js";
import type { ShapeInput } from "../interpret.js";
import type { PassToken, Shoulder } from "../passList.js";
import {
  amountOfPassList,
  endsShort,
  legsOfAmount,
  printPassList,
  readPassList,
  WEAVE_LEGS,
} from "../passList.js";

/**
 * **The schedule**: a hey as the meetings it is made of, laid along a lane.
 *
 * ## What the kind is
 *
 * Every other shape kind says where a dancer's feet go. This one says **who you
 * meet, when, and by which shoulder**, and the feet come out of that. A hey for
 * four is seven meetings — the robins in the middle on count 2, everybody at the
 * lanes' edges on 4, the larks in the middle on 6, everybody at the edges again
 * on 8, and so on to 14 — and every hey a caller asks for is a variation on that
 * one list. Half a hey is its first three. A ricochet is one meeting you bounce
 * out of instead of passing through. A hey for three is the same list with one
 * dancer standing. Ending short is stopping **on** a meeting rather than walking
 * home from it. Q8: "schedule underneath, pass list as the shorthand that
 * expands to it".
 *
 * ## The lane, and its stations
 *
 * The lane runs along the axis the dancers are most spread on, which across a
 * contra set is the axis between the two **lines**; a call may name it outright
 * instead (`axis`). Its half-width is how far the dancers stand from the middle,
 * and the meetings happen at three kinds of place along it:
 *
 * - **the centre of the set**, where two dancers of one role pass;
 * - **the lanes' edges**, where the lines stand and all four pass at once, two
 *   pairs of them;
 * - **the loops beyond the ends**, where whoever was not in the last middle pass
 *   goes round and comes back.
 *
 * ## The curve that threads them, and why its side-step swings three times
 *
 * `u = U·cos ψ`, `v = ±passPx·sin 3ψ` — a dancer's place along the lane against
 * their step across it — with the four of them a quarter of a turn apart, which
 * is what makes them meet: two dancers half the weave apart are always on
 * opposite sides of it.
 *
 * The **three** is the whole figure and it is a fact about shoulders, not about
 * trigonometry. A hey alternates: right shoulders with the one you meet in the
 * middle and left with the one you meet at the side. So between the middle of
 * the set and the end of the lane a dancer has to change which side of the lane
 * they are keeping, and `sin 3ψ` is one full swing of the side-step over exactly
 * that quarter turn. It is `figures/hey.ts`'s own geometry (F4's), promoted from
 * a figure to a kind, and the pass points above fall out of it: at the centre
 * the two dancers are `2 × passPx` apart, at the edges `√2 × passPx`, and at the
 * loop the side-step is nothing at all.
 *
 * ## The ricochet
 *
 * A dancer who ricochets comes into the middle and goes back out **the way they
 * came, on the other side of the lane** — which is what stops it being a
 * collision: their phase reverses and the sign of their side-step turns over
 * with it, eased across the bounce so what they actually dance is a sweep across
 * the middle rather than a snap. On the Prowl's B2 is the proof: the two larks
 * bounce on count 14 and are back at the lanes' edges on 16, `√2 × passPx` from
 * the robins who arrive there the ordinary way.
 *
 * ## Honest ends
 *
 * A hey that finishes its last leg leaves each dancer on somebody's place —
 * their own after a whole one, the opposite dancer's after a half — and the
 * schedule finds out whose by phase rather than by distance, because the weave
 * passes nearer other places than the one it is going to. A hey that **ends
 * short** has no place to land on: it leaves you where the last meeting is, at
 * the lane's edge, turned to face the dancer you met. "Beside X, facing X."
 */
export function planSchedule(
  shape: ScheduleShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  if (holds.length > 0) {
    throw new Error(`schedule: a hey's hands are its passes, not a declared hold (M5)`);
  }
  const plan = scheduleOf(shape, input);
  const { ctx } = input;

  const joinWindows = new Map<string, { window: HoldWindow; other: FigureRole; side: Side }[]>();
  for (const role of input.roles) {
    const mine: { window: HoldWindow; other: FigureRole; side: Side }[] = [];
    plan.items[role]?.forEach((item, i) => {
      if (item.mode !== "pull-by") return;
      const other = plan.meets[role]?.[i];
      if (other === undefined) return;
      const at = item.at ?? 0;
      mine.push({
        window: { takeFrom: at - 1, takeTo: at - 0.35, releaseFrom: at + 0.35, releaseTo: at + 1 },
        other,
        side: item.shoulder === "right" ? "R" : "L",
      });
    });
    joinWindows.set(role, mine);
  }

  return {
    ends: plan.ends,
    joinsAt(t) {
      const out: HandJoin[] = [];
      for (const role of input.roles) {
        for (const join of joinWindows.get(role) ?? []) {
          if (t < join.window.takeTo || t > join.window.releaseFrom) continue;
          if (role > join.other) continue;
          out.push({ a: role, aSide: join.side, b: join.other, bSide: join.side });
        }
      }
      return out;
    },
    at(role, t) {
      const self = plan.spotAt(role, t);
      const still = plan.standing.has(role);
      const hands: { L: LocalHand; R: LocalHand } = {
        L: handDown(self.p, self.facing, "L", t, still ? 0 : 1),
        R: handDown(self.p, self.facing, "R", t, still ? 0 : 1),
      };
      for (const join of joinWindows.get(role) ?? []) {
        if (t < join.window.takeFrom || t > join.window.releaseTo) continue;
        const theirs = plan.spotAt(join.other, t);
        const both = joinedHands(
          ctx,
          role,
          join.other,
          midpoint(self.p, theirs.p),
          plan.passDrop,
          0,
        );
        const mine = both[role];
        if (mine) hands[join.side] = takeAndRelease(self, join.side, t, mine, join.window);
      }
      return {
        p: self.p,
        facing: self.facing,
        hands,
        stepRate: still ? 0 : 1,
        amp: still ? 0 : 1,
      };
    },
  };
}

/** The lane a schedule is laid along. */
export interface Lane {
  /** The middle of the set, frame-local. */
  centre: Vec2;
  /** Which way the lane runs, frame-local degrees. */
  axis: Angle;
  /** How far the lines stand from the middle, px: the lane's own half-width. */
  half: number;
  /** How far the loops reach past the end of the lane, px. */
  reach: number;
}

/** One schedule, expanded and laid out: what the kind and its tests both read. */
export interface PlannedSchedule {
  lane: Lane;
  /** How many legs the weave is danced for, out of the whole turn's eight. */
  legs: number;
  /** Those legs as a fraction of the whole weave. */
  amount: number;
  /** Every figure-role's own list of meetings, in order. */
  items: Record<FigureRole, ScheduleItem[]>;
  /** Who each dancer actually meets at each item, read off the weave. */
  meets: Record<FigureRole, Array<FigureRole | undefined>>;
  /** The schedule's own list: what the record wrote, or what the geometry says. */
  passes: PassToken[];
  /** What the **geometry** writes, whatever the record called it. */
  derived: PassToken[];
  /** The pass list the call wrote, when it wrote one. */
  written?: PassToken[];
  /** Whoever is standing this hey out. */
  standing: ReadonlySet<FigureRole>;
  /** Where the hey leaves everybody. */
  ends: Spots;
  /** How far below shoulder height a pull by's joined hands sit, px. */
  passDrop: number;
  /** One dancer's place and facing `t` beats in, frame-local. */
  spotAt: (role: FigureRole, t: Beat) => Spot;
  /** Where one dancer is on the weave at a meeting's own beat, frame-local. */
  meetingPoint: (role: FigureRole, index: number) => Vec2;
}

/**
 * How far ahead on the weave a dancer looks to know which way they are facing.
 *
 * A quarter of a beat: near enough to be the tangent, far enough that the
 * difference is a direction and not floating-point noise. `figures/hey.ts`'s own
 * number, kept, because the facing has to come out the same to 0.1°.
 */
const LOOK_BEATS: Beat = 0.25;

/**
 * How near two dancers have to come to count as having met, as a multiple of
 * the side-step.
 *
 * Two dancers passing in the middle are `2 × passPx` apart and two at a lane's
 * edge `√2 × passPx`, while the nearest dancer who is *not* in the meeting is
 * round the end of the lane — `3.5 × passPx` away in the tightest minor set
 * either contra formation makes. `2.5` sits between the two with room either
 * side, and the figure's own test asserts both bounds rather than trusting it.
 */
const MET_WITHIN = 2.5;

/** A schedule, expanded against the dancers who are about to dance it. */
export function scheduleOf(shape: ScheduleShape, input: ShapeInput): PlannedSchedule {
  const { ctx, beats, roles } = input;
  const env = envFor(input, roles[0] ?? "", 0);
  const passPx = evalNumber(shape.passPx, env);
  const joinBeats = evalNumber(shape.joinBeats, env);
  const lane = laneOf(shape, input, env);
  const cos = Math.cos((lane.axis * Math.PI) / 180);
  const sin = Math.sin((lane.axis * Math.PI) / 180);
  /** A weave-local point as a frame-local one. */
  const toFrame = (q: Vec2): Vec2 => [
    lane.centre[0] + q[0] * cos - q[1] * sin,
    lane.centre[1] + q[0] * sin + q[1] * cos,
  ];
  /** A frame-local point in weave-local px. */
  const toWeave = (p: Vec2): Vec2 => {
    const x = p[0] - lane.centre[0];
    const y = p[1] - lane.centre[1];
    return [x * cos + y * sin, -x * sin + y * cos];
  };

  const params = input.params;
  const written = readPassList(params[shape.shorthand.passes]);
  const standing = standingOut(shape, input);

  // **Which role steps off into the middle, and by which shoulder.** The pass
  // list's own first token says both when there is one — `RR` is "the robins,
  // right shoulders" — so a record that writes the hey out does not also have to
  // set the two parameters; a record that writes neither gets the figure's own.
  const first = written?.[0];
  const startWord =
    first !== undefined && (first.who === "robins" || first.who === "larks")
      ? first.who === "robins"
        ? "robin"
        : "lark"
      : wordOf(params[shape.shorthand.start], shape.shorthand.start, ["robin", "lark"]);
  const byWord: Shoulder =
    first !== undefined
      ? first.by
      : (wordOf(params[shape.shorthand.by], shape.shorthand.by, ["right", "left"]) as Shoulder);

  const legs =
    written === undefined
      ? legsOfAmount(evalNumber({ param: shape.shorthand.amount }, env))
      : Math.max(1, Math.round(amountOfPassList(written) * WEAVE_LEGS));
  const amount = legs / WEAVE_LEGS;
  const short = written !== undefined && endsShort(written);

  // Mirroring the side-step mirrors the whole weave: by the left, every pass is
  // by the other shoulder.
  const V = byWord === "right" ? passPx : -passPx;
  const starting = startWord;

  /**
   * Where on the weave each dancer starts.
   *
   * A dancer at `ψ = 135°` or `−45°` walks into the middle and is there at count
   * 2; one at `45°` or `−135°` loops round the end first and follows them in.
   * Which end of the lane they stand at picks between the two, so the whole
   * assignment is: the side of the set they are on, and whether their role is
   * the one that steps off.
   */
  const phase: Record<FigureRole, number> = {};
  for (const role of roles) {
    const starts = ctx.role(role) === starting;
    const u = toWeave(ctx.spot(role).p)[0];
    phase[role] = u > 0 ? (starts ? -45 : 45) : starts ? 135 : -135;
  }

  /** The beat of the `i`th meeting, counting from one. */
  const beatOf = (i: number): Beat => (i * beats) / legs;

  // The ricochet, as a beat each bouncing dancer reverses on. A pass list may
  // mark it (`L!`) and a call may name it in the caller's own shorthand
  // (`robins@2`); both land here.
  const bounceAt: Record<FigureRole, Beat | undefined> = {};
  const marks = ricochets(written, params[shape.shorthand.ricochet], shape.shorthand.ricochet);
  for (const role of roles) {
    for (const mark of marks) {
      if (ctx.role(role) !== mark.role) continue;
      bounceAt[role] = beatOf(mark.pass);
    }
  }
  /**
   * How long a bouncing dancer spends turning round, and how long they take to
   * cross to the other side of the lane.
   *
   * **Both are needed and they are not the same window.** The turn is short —
   * half a leg — and eased in and out, so the dancer decelerates to a stop a
   * couple of px short of the middle and goes back rather than reversing at full
   * speed. The crossing is a whole leg, and it starts at the bounce rather than
   * straddling it: two dancers bouncing off each other are on opposite sides of
   * the lane and both of their side-steps turn over, so a window centred on the
   * bounce would put them both on the middle of the lane at the same instant,
   * at the same point, which is a collision and not a ricochet.
   */
  const bounceEase = beats / (2 * legs);
  const bounceCross = beats / legs;

  /**
   * How far round the weave a dancer has travelled `t` beats in, in beats.
   *
   * A bounce turns this round: it climbs to a peak at the bounce and comes back
   * down the other side, so the dancer retraces their own way along the lane.
   * The peak is smooth — the rate runs from `+1` through `0` to `−1` over the
   * ease — which is why they stop `0.375 × ease` beats short of the middle
   * rather than arriving at it with the speed still on.
   */
  const travelled = (role: FigureRole, t: Beat): Beat => {
    const tb = bounceAt[role];
    if (tb === undefined) return t;
    if (t <= tb - bounceEase) return t;
    if (t >= tb + bounceEase) return 2 * tb - t;
    const x = (t - (tb - bounceEase)) / (2 * bounceEase);
    // The integral of a rate that smoothsteps from +1 to −1: `x − 2∫smooth`.
    return tb - bounceEase + 2 * bounceEase * (x - 2 * (x ** 3 - x ** 4 / 2));
  };
  /** How far round the weave a dancer is `t` beats in, degrees. */
  const psi = (role: FigureRole, t: Beat): number =>
    phase[role]! - 360 * amount * (beats <= 0 ? 1 : travelled(role, t) / beats);
  /** Which side of the lane a dancer is keeping: `+1`, or turning over a bounce. */
  const flip = (role: FigureRole, t: Beat): number => {
    const tb = bounceAt[role];
    if (tb === undefined) return 1;
    return 1 - 2 * smooth(clamp01((t - tb) / bounceCross));
  };
  /** The weave itself, in weave-local px. */
  const weaveAt = (deg: number, side: number): Vec2 => {
    const rad = (deg * Math.PI) / 180;
    return [lane.reach * Math.cos(rad), side * V * Math.sin(3 * rad)];
  };
  /** Where a dancer is on the weave `t` beats in, weave-local. */
  const onWeave = (role: FigureRole, t: Beat): Vec2 => weaveAt(psi(role, t), flip(role, t));

  /**
   * Which way the weave is going `t` beats in, as a frame-local facing.
   *
   * A chord a quarter beat long rather than a derivative, and a raw `atan2`: it
   * wraps through ±180° like any other bearing, which is fine because everything
   * downstream reads it as a direction. What it must not do is be *lerped
   * toward* — see the turn each dancer keeps, below.
   */
  const travelAt = (role: FigureRole, t: Beat): Angle => {
    const on = onWeave(role, t);
    const ahead = onWeave(role, t + LOOK_BEATS);
    const step: Vec2 = [ahead[0] - on[0], ahead[1] - on[1]];
    return angleOfVec([step[0] * cos - step[1] * sin, step[0] * sin + step[1] * cos]);
  };

  /**
   * Whose place each dancer lands on: whoever stands where they end up on the
   * weave, **by phase** and not by distance.
   *
   * A whole hey is a whole turn of it, so that is themselves; half a hey is half
   * a turn, so it is the dancer who started opposite them. Distance would answer
   * differently and wrongly: the weave's own quarter point is 5.4 px from the
   * place *beside* the one it belongs to and 14.6 px from that one.
   */
  const landing: Record<FigureRole, FigureRole> = {};
  for (const role of roles) {
    const want = psi(role, beats);
    let best = role;
    let bestGap = Infinity;
    for (const other of roles) {
      const gap = Math.abs(wrapSigned(phase[other]! - want));
      if (gap < bestGap) {
        bestGap = gap;
        best = other;
      }
    }
    landing[role] = best;
  }

  /** How far each dancer's place is off the weave, at each end of the figure. */
  const offStart: Record<FigureRole, Vec2> = {};
  const offEnd: Record<FigureRole, Vec2> = {};
  for (const role of roles) {
    const place = toWeave(ctx.spot(role).p);
    const on = weaveAt(phase[role]!, 1);
    offStart[role] = [place[0] - on[0], place[1] - on[1]];
    if (short) {
      // Nothing to step off on to: the hey leaves you on the weave, where the
      // last meeting is.
      offEnd[role] = [0, 0];
    } else {
      const to = toWeave(ctx.spot(landing[role]!).p);
      const end = onWeave(role, beats);
      offEnd[role] = [to[0] - end[0], to[1] - end[1]];
    }
  }

  /** How far `t` is between `t0` and `t1`, clamped, with no easing. */
  const even = (t: Beat, t0: Beat, t1: Beat): number =>
    t1 <= t0 ? (t > t0 ? 1 : 0) : Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));

  /** Where a dancer is `t` beats in, frame-local, before the facing is decided. */
  const placeAt = (role: FigureRole, t: Beat): Vec2 => {
    const on = onWeave(role, t);
    // Step on to the weave over the first beats and off it at the end, so both
    // ends of the figure land exactly where the dance says they do. Evenly, not
    // eased: a smoothstep barely moves for the first half beat, and over that
    // half beat the weave's own side-step carries the dancer a px *past* their
    // own place before it brings them in, which is a lean nobody dances.
    const leaving = 1 - even(t, 0, joinBeats);
    const arriving = even(t, beats - joinBeats, beats);
    const from = offStart[role]!;
    const to = offEnd[role]!;
    return toFrame([
      on[0] + from[0] * leaving + to[0] * arriving,
      on[1] + from[1] * leaving + to[1] * arriving,
    ]);
  };

  // The meetings themselves: who is beside whom at each of the schedule's beats,
  // read off the weave. Everything the pass list says about a hey is checked
  // against this, and everything it leaves out is filled in from it.
  const meetIndex = (i: number): Record<FigureRole, FigureRole | undefined> => {
    const at = beatOf(i);
    const here: Record<FigureRole, Vec2> = {};
    for (const role of roles) here[role] = placeAt(role, at);
    const out: Record<FigureRole, FigureRole | undefined> = {};
    for (const role of roles) {
      if (standing.has(role)) continue;
      let best: FigureRole | undefined;
      let bestGap = MET_WITHIN * passPx;
      for (const other of roles) {
        if (other === role || standing.has(other)) continue;
        const gap = dist(here[role]!, here[other]!);
        if (gap < bestGap) {
          bestGap = gap;
          best = other;
        }
      }
      out[role] = best;
    }
    return out;
  };

  const meets: Record<FigureRole, Array<FigureRole | undefined>> = {};
  for (const role of roles) meets[role] = [];
  /** The pass list the **geometry** writes: what the dancers' own places say. */
  const derived: PassToken[] = [];
  for (let i = 1; i <= legs - (short ? 0 : 1); i++) {
    const at = beatOf(i);
    const found = meetIndex(i);
    for (const role of roles) meets[role]!.push(found[role]);
    // What the geometry itself would write for this meeting: who, and which
    // shoulder they keep, from where they are standing and which way they go.
    let token: PassToken | undefined;
    for (const role of roles) {
      const other = found[role];
      if (other === undefined || standing.has(role)) continue;
      const mine = placeAt(role, at);
      const theirs = placeAt(other, at);
      // Right shoulders is "the other one is on my right", which in this
      // coordinate system — y down, angles from +x toward +y — is a positive
      // turn from the way I am walking to the bearing between us.
      const by: Shoulder =
        angleDiff(travelAt(role, at), bearing(mine, theirs)) > 0 ? "right" : "left";
      // A meeting in the middle of the set is between two dancers of one role,
      // and the two who are not in it are round the ends of the lane with
      // nobody near them; a meeting at the lanes' edges involves all four, two
      // pairs at once, and either pair writes it the same way.
      token = { who: metWord(ctx, role, other), by };
      break;
    }
    const wrote = written?.[i - 1];
    derived.push({
      ...(token ?? { who: wrote?.who ?? "neighbor", by: wrote?.by ?? byWord }),
      ...(wrote?.ricochet === true ? { ricochet: true as const } : {}),
      ...(wrote?.short === true ? { short: true as const } : {}),
    });
  }

  /**
   * The schedule's own list: **what the record wrote**, where it wrote one.
   *
   * A record is the authority on what its dance calls a meeting — A Rare Bird's
   * sides meet N2 and N3, and no minor set of four can tell you that — while the
   * *geometry* is the authority on what actually happens, which is `derived`
   * above. Where both exist the figure's own test holds them to agreeing, which
   * is the only place the two can be checked against each other.
   */
  const passes: PassToken[] = derived.map((token, i) => written?.[i] ?? token);

  const asPullBy = params[shape.shorthand.hands] === true;
  const items: Record<FigureRole, ScheduleItem[]> = {};
  for (const role of roles) {
    const mine: ScheduleItem[] = [];
    passes.forEach((token, i) => {
      const at = beatOf(i + 1);
      if (standing.has(role)) {
        mine.push({ shoulder: token.by, mode: "stand", at });
        return;
      }
      const other = meets[role]![i];
      const inIt = involves(ctx, token, role);
      if (!inIt || other === undefined) {
        mine.push({
          shoulder: token.by,
          mode: inIt ? "pass" : "loop",
          at,
          ...(token.short === true ? { short: true as const } : {}),
        });
        return;
      }
      mine.push({
        // **What the meeting is named by**: the word the list wrote, or the one
        // the dancers' own places write. `plan.meets` is who it resolved to.
        meet: token.who,
        shoulder: token.by,
        mode: token.ricochet === true ? "bounce" : asPullBy ? "pull-by" : "pass",
        at,
        ...(token.short === true ? { short: true as const } : {}),
      });
    });
    items[role] = mine;
  }

  /**
   * How far each dancer's own facing is off the weave's, at each end.
   *
   * Held as a constant turn added to the weave's own direction rather than as
   * `angleLerp(place, travel, …)`: lerping *toward a moving angle* flips the way
   * round it goes at the instant the target passes the antipode of the place's
   * facing, and F3a's oracle caught that as 201 px/beat of hand speed inside
   * Butter's own hey.
   */
  const ends: Spots = {};
  for (const role of roles) {
    if (standing.has(role)) {
      ends[role] = ctx.spot(role);
      continue;
    }
    if (!short) {
      ends[role] = ctx.spot(landing[role]!);
      continue;
    }
    // Ending short: where the last meeting leaves you, turned to face whoever
    // you met there. "Beside X, facing X."
    const p = placeAt(role, beats);
    const met = meets[role]![meets[role]!.length - 1];
    const facing = met === undefined ? travelAt(role, beats) : bearing(p, placeAt(met, beats));
    ends[role] = { p, facing };
  }

  const turnIn: Record<FigureRole, number> = {};
  const turnOut: Record<FigureRole, number> = {};
  for (const role of roles) {
    if (standing.has(role)) continue;
    turnIn[role] = angleDiff(travelAt(role, 0), ctx.spot(role).facing);
    turnOut[role] = angleDiff(travelAt(role, beats), (ends[role] ?? ctx.spot(role)).facing);
  }

  const spotAt = (role: FigureRole, t: Beat): Spot => {
    if (standing.has(role)) return ctx.spot(role);
    return {
      p: placeAt(role, t),
      // Facing is the way the weave is going, plus the turn that takes it on to
      // the end facing — eased, because a body turning is the one thing in the
      // figure that should not start at full speed.
      facing:
        travelAt(role, t) +
        turnIn[role]! * (1 - ramp(t, 0, joinBeats)) +
        turnOut[role]! * ramp(t, beats - joinBeats, beats),
    };
  };

  return {
    lane,
    legs,
    amount,
    items,
    meets,
    passes,
    derived,
    ...(written === undefined ? {} : { written }),
    standing,
    ends,
    passDrop: evalNumber(shape.passDrop, env),
    spotAt,
    meetingPoint: (role, index) => placeAt(role, beatOf(index + 1)),
  };
}

/**
 * **The pass list back out of the expanded schedule** — the other half of the
 * round trip the milestone is held to.
 *
 * It reads nothing but the per-role items: for each meeting in turn, the first
 * dancer who is *in* it says what it is called, which shoulder it is by, whether
 * they bounce out of it and whether the hey stops there. Everybody else is round
 * the end of the lane and has nothing to say about it, which is exactly why a
 * hey is written as one list and danced as four.
 */
export function passesOfSchedule(
  items: Readonly<Record<FigureRole, readonly ScheduleItem[]>>,
  ctx: ShapeInput["ctx"],
  roles: readonly FigureRole[],
): PassToken[] {
  const length = Math.max(0, ...roles.map((role) => items[role]?.length ?? 0));
  const out: PassToken[] = [];
  for (let i = 0; i < length; i++) {
    let token: PassToken | undefined;
    for (const role of roles) {
      const item = items[role]?.[i];
      if (!item || item.meet === undefined) continue;
      if (item.mode === "loop" || item.mode === "stand") continue;
      token = {
        who: roles.includes(item.meet) ? roleWord(ctx.role(item.meet)) : item.meet,
        by: item.shoulder,
        ...(item.mode === "bounce" ? { ricochet: true as const } : {}),
        ...(item.short === true ? { short: true as const } : {}),
      };
      break;
    }
    if (token === undefined) {
      throw new Error(`schedule: meeting ${String(i + 1)} is nobody's; the list cannot be written`);
    }
    out.push(token);
  }
  return out;
}

/** How a contra role is written in a pass list. */
const roleWord = (role: string): string =>
  role === "robin" ? "robins" : role === "lark" ? "larks" : role;

/** The pass list this schedule is, as a dance record writes it. */
export const passListOf = (
  plan: PlannedSchedule,
  ctx: ShapeInput["ctx"],
  roles: readonly FigureRole[],
): string => printPassList(passesOfSchedule(plan.items, ctx, roles));

/** The environment a schedule's own numbers are read in. */
const envFor = (input: ShapeInput, self: FigureRole, t: Beat): ExprEnv => ({
  ctx: input.ctx,
  params: input.params,
  beats: input.beats,
  self,
  t,
  order: input.roles,
  anchor: input.anchor.centre,
});

/**
 * The lane: where the middle of the set is, which way the weave runs along it,
 * how wide it is and how far the loops reach past its ends.
 *
 * `"spread"` reads the axis off the dancers, which across a contra set is the
 * axis between the two lines and is what every hey in the corpus but the
 * diagonal ones wants. A becket line and a duple improper line disagree about
 * which of the frame's axes that is, and neither has to be written down.
 */
function laneOf(shape: ScheduleShape, input: ShapeInput, env: ExprEnv): Lane {
  const { ctx, roles } = input;
  const centre = centreOf(roles.map((role) => ctx.spot(role)));
  const spread = (axis: 0 | 1): number =>
    Math.max(...roles.map((role) => Math.abs(ctx.spot(role).p[axis] - centre[axis])));
  const word = String(input.params[shape.shorthand.axis] ?? "spread");
  if (word === "diagonal") {
    // The **diagonal hey** (M8): its four dancers are two from one minor set and
    // two from the next, so it is a call resolved in the lane, and M6's lane
    // frame is built for a line rather than for a diagonal. The parameter parses
    // — a record may write it today — and the figure says what is missing.
    throw new Error(`unsupported: a hey on a diagonal, which spans two minor sets (M8)`);
  }
  if (word !== "spread" && word !== "across" && word !== "along") {
    throw new Error(
      `"${shape.shorthand.axis}" is "${word}", which is not one of [spread, across, along, diagonal]`,
    );
  }
  // The frame's own axes: `x` across the set, `y` along it.
  const axis: Angle =
    word === "across" ? 0 : word === "along" ? 90 : spread(0) >= spread(1) ? 0 : 90;
  const half = word === "spread" ? Math.max(spread(0), spread(1)) : spread(axis === 0 ? 0 : 1);
  return { centre, axis, half, reach: half * evalNumber(shape.loopReach, env) };
}

/** Whoever stands this hey out: a hey for three's idle role. */
function standingOut(shape: ScheduleShape, input: ShapeInput): ReadonlySet<FigureRole> {
  const many = input.params[shape.shorthand.for];
  if (many === undefined || many === null || Number(many) >= input.roles.length) {
    return new Set<FigureRole>();
  }
  const named = input.params[shape.shorthand.idle];
  const out = new Set<FigureRole>();
  const wanted = input.roles.length - Number(many);
  if (typeof named === "string" && input.roles.includes(named)) {
    out.add(named);
  }
  // A hey "for three" with nobody named stands the last of the cast out, which
  // is the only answer a figure can give on its own; a dance that means a
  // particular dancer names them.
  for (let i = input.roles.length - 1; i >= 0 && out.size < wanted; i--) {
    out.add(input.roles[i]!);
  }
  return out;
}

/** Whether a token's `who` names this dancer. */
function involves(ctx: ShapeInput["ctx"], token: PassToken, role: FigureRole): boolean {
  if (token.who === "robins") return ctx.role(role) === "robin";
  if (token.who === "larks") return ctx.role(role) === "lark";
  // A relation names a pass at the lanes' edges, and both pairs make it at once.
  return true;
}

/**
 * How a meeting between these two is written: the role word when they share a
 * role, and otherwise the relation the minor set's own naming says they are.
 *
 * `1L` and `1R` are one couple and `2L` and `2R` the other — the hands-four
 * template's own two — so partners are the pair whose station ids agree about
 * the couple and neighbours are the pair who do not. Which of the two a hey
 * passes at the lanes' edges is a fact about the **formation**: in becket a
 * couple stands side by side on one line and meets neighbours at the edges,
 * and in duple improper a couple stands across the set and meets partners.
 * Neither is written into the figure; both come out of where people stand.
 */
function metWord(ctx: ShapeInput["ctx"], self: FigureRole, other: FigureRole): string {
  if (ctx.role(self) === ctx.role(other)) {
    return ctx.role(self) === "robin" ? "robins" : "larks";
  }
  const mine = coupleOf(self);
  const theirs = coupleOf(other);
  if (mine === undefined || theirs === undefined) return "neighbor";
  return mine === theirs ? "partner" : "neighbor";
}

/** Which couple of the hands-four a station id belongs to, if it says. */
const coupleOf = (role: FigureRole): string | undefined => /^(\d+)[LR]$/.exec(role)?.[1];

/** One ricochet: which contra role bounces, and on which pass of the list. */
interface Ricochet {
  role: string;
  /** Counting from one, as a caller counts passes. */
  pass: number;
}

/**
 * Every ricochet this call asks for: the pass list's own marks, and the
 * caller's shorthand.
 *
 * `ricochet: "robins@2"` is the vision's own spelling — a role-scoped modifier
 * on one pass, which leaves the other role's list untouched. A dance whose hey
 * also ends short writes the pass list out instead, because "stop here" is
 * something only the list can say.
 */
function ricochets(
  written: readonly PassToken[] | undefined,
  shorthand: unknown,
  name: string,
): Ricochet[] {
  const out: Ricochet[] = [];
  written?.forEach((token, i) => {
    if (token.ricochet !== true) return;
    const role = token.who === "robins" ? "robin" : token.who === "larks" ? "lark" : undefined;
    if (role === undefined) {
      throw new Error(`a ricochet is a role's, and "${token.who}" is a relation`);
    }
    out.push({ role, pass: i + 1 });
  });
  if (shorthand === undefined || shorthand === null || shorthand === "") return out;
  if (typeof shorthand !== "string") {
    throw new Error(`"${name}" is ${JSON.stringify(shorthand)}, not a ricochet like "robins@2"`);
  }
  const found = /^(robins|larks)@(\d+)$/.exec(shorthand.trim());
  if (!found) {
    throw new Error(`"${name}" is "${shorthand}", and a ricochet is written "robins@2"`);
  }
  out.push({ role: found[1] === "robins" ? "robin" : "lark", pass: Number(found[2]) });
  return out;
}

/** One of a small set of words a parameter is allowed to be. */
function wordOf(value: unknown, name: string, allowed: readonly string[]): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(
      `"${name}" is ${JSON.stringify(value)}, which is not one of [${allowed.join(", ")}]`,
    );
  }
  return value;
}

/** `a` wrapped into `(-180, 180]` degrees. */
const wrapSigned = (a: number): number => {
  const wrapped = ((a % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
};
