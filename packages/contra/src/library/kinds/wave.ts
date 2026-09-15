import type { Beat, Side, Vec2 } from "@caller/core";
import { HOLD_SPACING_PX, addScaled, angleLerp, angleOf, dirOf, lerp, ramp } from "@caller/core";
import type {
  FigurePlan,
  HandJoin,
  HoldWindow,
  LocalHand,
  Spot,
  Spots,
} from "../../figures/ContraFigure.js";
import { joinedHands, midpoint, takeAndRelease } from "../../figures/ContraFigure.js";
import { BALANCE_BACK_RATIO, BALANCE_LEAN_CAP, balanceRock } from "../../pair/balance.js";
import { otherLine, slotOfRole, slotPoint } from "../../set/shape.js";
import type { SlotView } from "../../set/shape.js";
import type { FigureRole, HoldSpec, WaveShape } from "../FigureDefinition.js";
import type { ExprEnv } from "../expr.js";
import { evalNumber, evalSide } from "../expr.js";
import { joinKey, type ShapeInput } from "../interpret.js";
import { idleHandAt } from "./holds.js";
import { settleEnds } from "./places.js";

/**
 * **The wave, and its balance** (M7, handed over from M6).
 *
 * A long wave is a whole line of the set holding hands along itself, everybody
 * facing alternately in and out, and Whoosh's *"balance long wave (N1R, men face
 * in)"* is the acceptance case. M6 left it unwritten and said exactly what was
 * missing: *"a wave-hold rule inside the shape kind — the named hand to the lane
 * neighbour you are facing, the other hand to the one behind you"*.
 *
 * ## Why the rule is written on slots and not on cast order
 *
 * "N1R" means *the right hand to the neighbour one place along the way I am
 * travelling*, and the two halves of a line travel opposite ways: the dancer on
 * my left is my N1 and the dancer on my right is my N0, or the other way round,
 * depending on which of us I am. Cast order runs up the set for everybody, so it
 * cannot tell the two apart. The slot can, because a slot carries the dancer's
 * own `travel` — which is the whole reason `params.slots` exists (M7's answer to
 * M6's missing expression node).
 *
 * ## Which way "in" is
 *
 * Also a slot question, and also one no angle could answer: **in** is from my
 * own line toward the other one, which is `+x` for one line and `−x` for the
 * other. The wave reads it off the lattice — the point of my own slot against
 * the point of the slot straight across from me — so "men face in" comes out
 * right on both lines with nothing written down about either.
 */
export function planWave(
  shape: WaveShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
): FigurePlan {
  if (holds.length > 0) {
    throw new Error(`wave: a wave's hands are the shape's own, not a hold list (M7)`);
  }
  if (shape.axis === "across") return planWaveAcross(shape, input);
  const { ctx, roles } = input;
  const slots = input.slots;
  if (!slots) {
    throw new Error(
      `a wave is a shape of the **set** — which line, which way along — and this call was not ` +
        `resolved against one, so there is no lattice to read it off`,
    );
  }
  const env = envFor(input, roles[0]!, 0);
  const hand = evalSide(shape.hand, env);
  const rock = evalNumber(shape.rock, env);
  const closeBeats = evalNumber(shape.closeBeats, env);
  const drop = evalNumber(shape.handDrop, env);
  const facesIn = String(input.params[shape.facesIn] ?? "lark");

  /** Where each dancer stands on the wave, and which way they look. */
  const onWave: Spots = {};
  for (const role of roles) {
    const at = slotOfRole(slots, role);
    const mine = slotPoint(slots, at);
    const across = slotPoint(slots, { line: otherLine(at.line), position: at.position });
    const inward = angleOf(across[0] - mine[0], across[1] - mine[1]);
    const looksIn = ctx.role(role) === facesIn;
    onWave[role] = { p: mine, facing: looksIn ? inward : inward + 180 };
  }
  const ends = settleEnds(input, onWave);

  /**
   * Who each dancer has by which hand: the named hand to the dancer one place
   * along the way they travel, the other hand to the one behind them.
   */
  const reach = new Map<FigureRole, Partial<Record<Side, FigureRole>>>();
  const bySlot = new Map<string, FigureRole>();
  for (const role of roles) {
    const at = slotOfRole(slots, role);
    bySlot.set(`${String(at.line)}/${String(at.position)}`, role);
  }
  for (const role of roles) {
    const at = slotOfRole(slots, role);
    const ahead = bySlot.get(`${String(at.line)}/${String(at.position + at.travel)}`);
    const behind = bySlot.get(`${String(at.line)}/${String(at.position - at.travel)}`);
    const mine: Partial<Record<Side, FigureRole>> = {};
    if (ahead !== undefined) mine[hand] = ahead;
    if (behind !== undefined) mine[hand === "L" ? "R" : "L"] = behind;
    reach.set(role, mine);
  }

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const to = onWave[role] ?? start;
    const k = ramp(t, 0, closeBeats);
    const place = { p: lerp(start.p, to.p, k), facing: angleLerp(start.facing, to.facing, k) };
    const f = balanceRock(t);
    const off = rock * f * (f > 0 ? 1 : BALANCE_BACK_RATIO);
    return { p: addScaled(place.p, dirOf(place.facing), off), facing: place.facing };
  };

  const held: HandJoin[] = [];
  for (const role of roles) {
    for (const [side, other] of Object.entries(reach.get(role) ?? {})) {
      // Once each: the dancer earlier in the cast order reports the join.
      if (role > other) continue;
      const theirs = Object.entries(reach.get(other) ?? {}).find(([, who]) => who === role)?.[0];
      if (theirs === undefined) continue;
      held.push({ a: role, aSide: side as Side, b: other, bSide: theirs as Side });
    }
  }

  // The hands go up as the wave closes and come down as it opens, exactly as a
  // balance's do: a hand that was at its side and is suddenly out at arm's
  // length has moved 200 px a beat, which is three times the library's own
  // bound and was what the lab caught the first time this figure ran.
  //
  // A hand the figure before was already holding keeps it: `joinedIn` is what
  // says so, and the window of no length is `takeAndRelease`'s own signal for
  // "this one crosses the boundary".
  const window: HoldWindow = {
    takeFrom: 0,
    takeTo: closeBeats,
    releaseFrom: input.beats - closeBeats,
    releaseTo: input.beats,
  };
  const windowFor = (role: FigureRole, side: Side, other: FigureRole, theirs: Side): HoldWindow => {
    const key = joinKey(role, side, other, theirs);
    return {
      takeFrom: input.joinedIn.has(key) ? 0 : window.takeFrom,
      takeTo: input.joinedIn.has(key) ? 0 : window.takeTo,
      releaseFrom: input.joinedOut.has(key) ? 0 : window.releaseFrom,
      releaseTo: input.joinedOut.has(key) ? 0 : window.releaseTo,
    };
  };

  return {
    ends,
    joinsAt: (t) => (t >= closeBeats ? held : []),
    at(role, t) {
      const self = placeAt(role, t);
      const at = envFor(input, role, t);
      const hands: { L: LocalHand; R: LocalHand } = {
        L: idleHandAt(shape.idleHands, self, "L", t, at),
        R: idleHandAt(shape.idleHands, self, "R", t, at),
      };
      for (const [side, other] of Object.entries(reach.get(role) ?? {})) {
        const point: Vec2 = midpoint(self.p, placeAt(other, t).p);
        const both = joinedHands(ctx, role, other, point, drop, 0);
        const mine = both[role];
        const theirs = Object.entries(reach.get(other) ?? {}).find(([, who]) => who === role)?.[0];
        if (mine && theirs !== undefined) {
          hands[side as Side] = takeAndRelease(
            self,
            side as Side,
            t,
            mine,
            windowFor(role, side as Side, other, theirs as Side),
          );
        }
      }
      return {
        p: self.p,
        facing: self.facing,
        lean: Math.max(-BALANCE_LEAN_CAP, Math.min(BALANCE_LEAN_CAP, balanceRock(t))),
        hands,
        amp: 0,
      };
    },
  };
}

/** The lattice this wave is read on, for a caller that wants to check it. */
export const waveSlots = (input: ShapeInput): SlotView | undefined => input.slots;

const envFor = (input: ShapeInput, self: FigureRole, t: Beat): ExprEnv => ({
  ctx: input.ctx,
  params: input.params,
  beats: input.beats,
  self,
  t,
  order: input.roles,
  anchor: input.anchor.centre,
  ...(input.slots === undefined ? {} : { slots: input.slots }),
});

/**
 * **The wave of four across the set** (M8): four dancers in a row *between* the
 * lines, looking along the set.
 *
 * Anna's Reel's A1 — *"(4) Balance wave of four (NL,WR)"* — and the shape M7
 * stopped at rather than guess. It is not the long wave with a different angle:
 * a long wave's hands go to the dancer one place along **your own line** and its
 * dancers look across the set, and this one's hands go to the dancer beside you
 * **in the row** and its dancers look along it. Different hands, different
 * facings, different dancers in the figure.
 *
 * ## The hand rule, stated
 *
 * Two dancers stand in the middle and two on the ends, and the corpus writes the
 * wave as two tokens: `(NL,WR)` is "the robins' **right** hands in the middle,
 * your **neighbour's left** on the end". So the record says two things — which
 * role is in the middle, and which hand that middle pair joins — and everything
 * else follows, because **a wave alternates**: the hand you have free at the
 * middle is the hand you give at the end, so the ends' hand is the other one and
 * the record need not repeat it.
 *
 * Who stands where is read off where they already are rather than written down:
 * each dancer keeps the **side** of the set they are on, the two of the middle
 * role come to the middle and the other two take the ends. Anna's Reel's robins
 * arrive there by allemanding once and a half in the centre, which is exactly
 * where the wave wants them.
 *
 * ## Which way each dancer looks, derived rather than chosen
 *
 * A dancer's right hand points 90° clockwise of their facing (the library's own
 * convention, `loop`'s `SPIN`). So "my hand `h` is joined with the dancer on my
 * `d` side" fixes my facing: `d − 90` if `h` is the right hand and `d + 90` if it
 * is the left. Every one of the four is fixed that way, and the four answers
 * agree — which is the check that the hand rule above is a wave at all, and is
 * asserted in `wave.test.ts` rather than assumed.
 */
function planWaveAcross(shape: WaveShape, input: ShapeInput): FigurePlan {
  const { ctx, roles } = input;
  const slots = input.slots;
  if (!slots) {
    throw new Error(
      `a wave of four across the set is a shape of the **set** — which line is which — and this ` +
        `call was not resolved against one, so there is no lattice to read it off`,
    );
  }
  if (roles.length !== 4) {
    throw new Error(`a wave of four is four dancers, not [${roles.join(", ")}]`);
  }
  const env = envFor(input, roles[0]!, 0);
  const hand = evalSide(shape.hand, env);
  const ends: Side = hand === "L" ? "R" : "L";
  const rock = evalNumber(shape.rock, env);
  const closeBeats = evalNumber(shape.closeBeats, env);
  const drop = evalNumber(shape.handDrop, env);
  const middleRole = String(input.params[shape.centre ?? "centre"] ?? "robin");

  // **The row runs from one line of the set to the other.** Read off the
  // lattice rather than off the dancers, so that four who are standing anywhere
  // near their places form the same row: `slots.origin` is the point of position
  // zero on each line, and the vector between the two is "across the set".
  const acrossVec: Vec2 = [
    slots.origin[1][0] - slots.origin[0][0],
    slots.origin[1][1] - slots.origin[0][1],
  ];
  const across = angleOf(acrossVec[0], acrossVec[1]);
  const dir = dirOf(across);
  const spacing = evalNumber(shape.spacing ?? HOLD_SPACING_PX, env);

  // **The row is centred on the minor set's own middle**, read off the lattice
  // rather than off the dancers: a wave of four is a place in the set, and
  // reading it off wherever the figure before happened to leave people makes the
  // row creep a pixel every time through.
  const centre = centreOf(roles.map((role) => slotPoint(slots, slotOfRole(slots, role))));

  /**
   * **Which side of the row each dancer takes is their own line of the set**,
   * not where they happen to be standing.
   *
   * The same authority the long wave reads, and for a stronger reason here: the
   * figure before a wave of four is an allemande in the middle of the set, and a
   * gatherer settles its two dancers on the nearest two places that suit — which
   * in Anna's Reel's second pass is **both larks on one line**, because the dance
   * swaps sides. Read off the spots, the row then has two dancers on one side of
   * the middle and none on the other and cannot be built at all; read off the
   * lattice it is always one dancer of each role on each line, because a minor
   * set is two consecutive places and the lines alternate roles along the set.
   */
  const online = (line: 0 | 1, middle: boolean): FigureRole => {
    const found = roles.find(
      (role) => slotOfRole(slots, role).line === line && (ctx.role(role) === middleRole) === middle,
    );
    if (found === undefined) {
      throw new Error(
        `a wave of four with the ${middleRole}s in the middle wants one ${middleRole} and one ` +
          `other on each line of the set, and line ${String(line)} has no ` +
          `${middle ? middleRole : `dancer who is not a ${middleRole}`}`,
      );
    }
    return found;
  };
  /** The row, outside in: end, middle, middle, end. */
  const row: FigureRole[] = [online(0, false), online(0, true), online(1, true), online(1, false)];

  // The hands, by position in the row: the ends' hand outside, the named hand in
  // the middle. Everybody's other hand hangs.
  const joinHand = (i: number): Side => (i === 1 ? hand : ends);
  /**
   * Which way the dancer at `i` looks.
   *
   * Derived, not chosen: the dancer at position 0 gives hand `ends` to the
   * dancer at 1, who is toward `+across`, and a right hand points 90° clockwise
   * of the facing — so the facing is `across − 90` for a right hand and
   * `across + 90` for a left. A wave alternates from there.
   */
  const lead = ends === "R" ? across - 90 : across + 90;
  const faceAt = (i: number): number => lead + (i % 2 === 0 ? 0 : 180);

  const onWave: Spots = {};
  row.forEach((role, i) => {
    onWave[role] = { p: addScaled(centre, dir, (i - 1.5) * spacing), facing: faceAt(i) };
  });
  const endsAt = settleEnds(input, onWave, row);

  /** Who each dancer has by which hand. */
  const reach = new Map<FigureRole, Partial<Record<Side, FigureRole>>>();
  for (const role of row) reach.set(role, {});
  for (let i = 0; i + 1 < row.length; i++) {
    const side = joinHand(i);
    reach.get(row[i]!)![side] = row[i + 1]!;
    reach.get(row[i + 1]!)![side] = row[i]!;
  }

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const to = onWave[role] ?? start;
    const k = ramp(t, 0, closeBeats);
    const place = { p: lerp(start.p, to.p, k), facing: angleLerp(start.facing, to.facing, k) };
    const f = balanceRock(t);
    const off = rock * f * (f > 0 ? 1 : BALANCE_BACK_RATIO);
    return { p: addScaled(place.p, dirOf(place.facing), off), facing: place.facing };
  };

  const held: HandJoin[] = [];
  for (let i = 0; i + 1 < row.length; i++) {
    const side = joinHand(i);
    held.push({ a: row[i]!, aSide: side, b: row[i + 1]!, bSide: side });
  }

  const window: HoldWindow = {
    takeFrom: 0,
    takeTo: closeBeats,
    releaseFrom: input.beats - closeBeats,
    releaseTo: input.beats,
  };
  const windowFor = (role: FigureRole, side: Side, other: FigureRole): HoldWindow => {
    const key = joinKey(role, side, other, side);
    return {
      takeFrom: input.joinedIn.has(key) ? 0 : window.takeFrom,
      takeTo: input.joinedIn.has(key) ? 0 : window.takeTo,
      releaseFrom: input.joinedOut.has(key) ? 0 : window.releaseFrom,
      releaseTo: input.joinedOut.has(key) ? 0 : window.releaseTo,
    };
  };

  return {
    ends: endsAt,
    joinsAt: (t) => (t >= closeBeats ? held : []),
    at(role, t) {
      const self = placeAt(role, t);
      const at = envFor(input, role, t);
      const hands: { L: LocalHand; R: LocalHand } = {
        L: idleHandAt(shape.idleHands, self, "L", t, at),
        R: idleHandAt(shape.idleHands, self, "R", t, at),
      };
      for (const [side, other] of Object.entries(reach.get(role) ?? {})) {
        const point: Vec2 = midpoint(self.p, placeAt(other, t).p);
        const both = joinedHands(ctx, role, other, point, drop, 0);
        const mine = both[role];
        if (mine) {
          hands[side as Side] = takeAndRelease(
            self,
            side as Side,
            t,
            mine,
            windowFor(role, side as Side, other),
          );
        }
      }
      return {
        p: self.p,
        facing: self.facing,
        lean: Math.max(-BALANCE_LEAN_CAP, Math.min(BALANCE_LEAN_CAP, balanceRock(t))),
        hands,
        amp: 0,
      };
    },
  };
}

/** The middle of some points. */
function centreOf(points: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}
