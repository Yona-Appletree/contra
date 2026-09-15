import type { Beat, Side, Vec2 } from "@caller/core";
import {
  HOLD_SPACING_PX,
  SHOULDER_WIDTH_PX,
  addScaled,
  angleLerp,
  angleOf,
  dirOf,
  dist,
  lerp,
  ramp,
} from "@caller/core";
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
import { alongSet, otherLine, slotOfRole, slotPoint } from "../../set/shape.js";
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
 * ## Why the hands are read off the floor and not off the slots (M7b)
 *
 * M7 wrote exactly that rule — the named hand to the slot one place along the
 * way you travel — and it is right only while nobody has moved. Whoosh's wave
 * comes after a grand right and left and three figures back, and the line it
 * balances is **not** standing on its own slots: at four couples the slots read
 * `c0/robin, c1/lark, c2/robin, c3/lark` down the line and the dancers read
 * `c1/lark, c0/robin, c3/lark, c2/robin`. So a wave takes the dancers **beside**
 * it — the line sorted along the set — and each dancer gives each of them
 * whichever hand is actually pointing at them.
 *
 * That leaves `facesIn` as the only thing the **long** wave is told from outside,
 * and the alternation falls out of it: a lark looking in and a robin looking out,
 * standing beside each other, have one hand each pointing at the other. Whoosh's
 * own `N1R` is then something the dance can be **measured** against rather than
 * something the figure is told — and it holds, at every line length, in
 * `library/figures/balance-wave.test.ts`. `shape.hand` is still the shape's, and
 * still read: the wave **across** the set (M8, `planWaveAcross` below) takes its
 * facings from it, because a row between the lines has no "in" to face.
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
  const rock = evalNumber(shape.rock, env);
  const closeBeats = evalNumber(shape.closeBeats, env);
  const drop = evalNumber(shape.handDrop, env);
  const facesIn = String(input.params[shape.facesIn] ?? "lark");
  const direction = waveDirectionOf(shape, input);

  /**
   * Where each dancer stands on the wave, and which way they look.
   *
   * **Where they already are** (M7b), not on their own home slot. A wave is what
   * a line of dancers is standing in, and Whoosh is what says so: its A1 leaves
   * every dancer one dancing place along the set from the slot they started the
   * time through on — a grand right and left out and three figures back — so
   * putting them on their slots to balance jumped every one of them a whole
   * place sideways in the one beat the wave closes over, and the hands went to
   * the dancer whose *slot* was beside them rather than the dancer who was.
   *
   * The slot is still what the shape is read on, because "in" is a fact about
   * the set — from my line toward the other one, which is `+x` on one line and
   * `−x` on the other, and no angle knows which.
   */
  const onWave: Spots = {};
  for (const role of roles) {
    const at = slotOfRole(slots, role);
    const mine = slotPoint(slots, at);
    const across = slotPoint(slots, { line: otherLine(at.line), position: at.position });
    const inward = angleOf(across[0] - mine[0], across[1] - mine[1]);
    const looksIn = ctx.role(role) === facesIn;
    onWave[role] = { p: ctx.spot(role).p, facing: looksIn ? inward : inward + 180 };
  }
  /**
   * **The wave is its own arrangement** (M7b), so its ends are `onWave` and not
   * `settleEnds(input, onWave)`.
   *
   * The target-shape solver lays a shape out in **the order it is given**, which
   * for a figure resolved in the lane is the cast's — lattice order along the
   * set. Run over a wave that is standing one place along from its own slots,
   * that puts every dancer back on the slot they are not standing on, which is
   * the thing this figure now exists not to do; and it takes the wave's facing
   * from the mean of the dancers' own, which for a row facing alternately in and
   * out is a mean of `0°` and `180°` and means nothing. Measured at four couples
   * it asked for hands **29.75 px** out of reach.
   *
   * Nothing is lost by leaving it out. The set's recorded shape is read off
   * where the figure really leaves people (`set/planCycle.ts`, `shapeFromEnds`)
   * and not off `settleEnds`, and this figure builds a wave by construction: the
   * line where it stands, looking alternately in and out.
   */
  const ends = onWave;

  /**
   * Who each dancer has by which hand: **the dancers standing beside them**, one
   * on each side, and the hand that really points at each.
   *
   * M7 read both the pair and the side off the lattice — the named hand to the
   * slot one place along the way you travel — and Whoosh is what disproves it.
   * Its A1 is a grand right and left out and three figures back, and it does not
   * leave the line on its own slots: at four couples the line reads
   * `c1/lark, c0/robin, c3/lark, c2/robin` while their slots read
   * `c0/robin, c1/lark, c2/robin, c3/lark`. Read off the lattice, `c1/lark`'s
   * "behind" is `c2/robin`, who is standing **three dancing places away and on
   * the same side of him as the other one**; read off the floor it is `c0/robin`
   * beside him, which is what a wave is. The old reading put every hand of the
   * wave 1.2 px out of the arm solver's reach — the shortfall of a hand reaching
   * across its own body — at every line length.
   *
   * So a wave holds hands **along itself**: sort the line along the set, take
   * the dancer on either side of you, and give each of them whichever of your
   * hands is pointing at them. Which hand that is follows from which way you are
   * looking, which is `facesIn`'s, so the alternation comes out of the shape
   * rather than being asserted on top of it. Whoosh's own `N1R` then holds as a
   * **measurement**: every pair of the wave who are each other's N1 takes right
   * hands, at every line length, which is what `balance-wave.test.ts` checks.
   */
  const reach = new Map<FigureRole, Partial<Record<Side, FigureRole>>>();
  /** Which of a dancer's own hands points at the dancer standing over there. */
  const sideToward = (role: FigureRole, other: FigureRole): Side => {
    const self = onWave[role]!;
    const theirs = onWave[other]!;
    const to = angleOf(theirs.p[0] - self.p[0], theirs.p[1] - self.p[1]);
    // Right is `facing + 90` in this coordinate system: with y down, a dancer
    // looking down the set (90°) has their right toward `−x`.
    return Math.cos(((to - (self.facing + 90)) * Math.PI) / 180) >= 0 ? "R" : "L";
  };
  // The line in the order it is standing in, along the set's own direction.
  const along = alongSet(slots);
  const inLine = [...roles].sort((a, b) => {
    const pa = onWave[a]!.p;
    const pb = onWave[b]!.p;
    return pa[0] * along[0] + pa[1] * along[1] - (pb[0] * along[0] + pb[1] * along[1]);
  });
  for (const role of roles) reach.set(role, {});
  for (let i = 0; i + 1 < inLine.length; i++) {
    const a = inLine[i]!;
    const b = inLine[i + 1]!;
    reach.get(a)![sideToward(a, b)] = b;
    reach.get(b)![sideToward(b, a)] = a;
  }

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const to = ends[role] ?? onWave[role] ?? start;
    const k = ramp(t, 0, closeBeats);
    const place = { p: lerp(start.p, to.p, k), facing: angleLerp(start.facing, to.facing, k) };
    return waveRocked(place, direction, rock, t);
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
        lean: waveLeanAt(direction, t),
        hands,
        amp: 0,
      };
    },
  };
}

/**
 * **Which way a wave balances** (FR-A2), in the caller's own words.
 *
 * The user: *"there are multiple ways to balance the wave. left first, right
 * first, left and back, right and back, forwards and back. often dances call
 * out which is which, sometimes not."* Those are the five, named for what a
 * caller says:
 *
 * - `forward` — forwards and back: a step the way you are looking and back to
 *   the line. What a card that says nothing means, so it is the default.
 * - `left` — left first: a step to your own left, then one to your own right.
 * - `right` — right first, the mirror of it.
 * - `left-and-back` — left, and back to where you were rather than on through.
 * - `right-and-back` — the same to the right.
 *
 * "Your own left" is the dancer's own, not the hall's, because that is how the
 * call is given — and in a wave, where the dancers beside you are looking the
 * other way, it is the only reading under which everybody is told the same
 * thing.
 */
export type WaveDirection = "forward" | "left" | "right" | "left-and-back" | "right-and-back";

/** The five, for a definition's parameter spec and for an error message. */
export const WAVE_DIRECTIONS: readonly WaveDirection[] = [
  "forward",
  "left",
  "right",
  "left-and-back",
  "right-and-back",
];

/**
 * **How far a wave's body may leave the line, px** (FR-A2).
 *
 * The user, on the first wave balance the Moves page drew: *"people don't move
 * past each other when balancing, that would break their arms. the move towards
 * and then back, but not past."* — and on the wave of four: *"same problem,
 * these people don't have shoulders."*
 *
 * Two dancers side by side in a wave are looking opposite ways, so a rock along
 * the facing **shears** the line: as I step out, the dancer whose hand I am
 * holding steps out the other way, and the two of us offset by twice the rock
 * while the joined hand stays between us. Past half a shoulder of that the two
 * bodies read as having slid past one another and the arms are being wrenched
 * along the line rather than held down it. So the shear is bounded by the
 * dancer's own width: at a quarter of {@link SHOULDER_WIDTH_PX} each, the two
 * offset by half a shoulder and the line still reads as a line.
 *
 * It is a bound and not the amount: every other balance in the library rocks
 * 1 px, and since FR-A2 the two waves do too, well inside it.
 */
export const WAVE_ROCK_CAP_PX = SHOULDER_WIDTH_PX / 4;

/**
 * **How far a dancer bows on their way in to a wave of four** (FR-A2): the most,
 * px, and the share of the walk it is taken from.
 *
 * Two dancers who have to change places to make the row would otherwise walk
 * through each other. A quarter of the walk, capped at three and a half px, is
 * enough to pass right shoulders on Anna's Reel's worst crossing and is nothing
 * at all for a dancer who is already standing where the row wants them.
 */
export const WAVE_CLOSE_BOW_PX = 3.5;
export const WAVE_CLOSE_BOW_SHARE = 0.25;

/**
 * **A wave's balance goes out and comes back to the line, never through it**
 * (FR-A2): *"the move towards and then back, but not past"*.
 *
 * {@link balanceRock} is a rock for a pair facing each other, where the second
 * half is a step **away** from the other dancer and is the other half of the
 * move. In a wave there is nobody in front of you to step away from: carrying
 * on past the line puts your body through the line of joined hands and out the
 * far side of the dancers beside you, which is the thing the user is looking at
 * when he says their arms would break. So the two-sided directions keep both
 * halves — one is genuinely left and the other genuinely right — and the
 * "and back" directions keep only the first, which lands the step on the 1 and
 * the return on the 3 exactly as the whole rock does, and leaves the dancer
 * standing in the wave the figure after it starts from.
 */
function waveRockAt(direction: WaveDirection, t: Beat): number {
  const f = balanceRock(t);
  if (direction === "left" || direction === "right") {
    return f > 0 ? f : f * BALANCE_BACK_RATIO;
  }
  return Math.max(f, 0);
}

/** Which way off a dancer's facing the balance travels. */
const waveRockBearing = (direction: WaveDirection, facing: number): number => {
  if (direction === "forward") return facing;
  return direction.startsWith("left") ? facing - 90 : facing + 90;
};

/** A dancer's place, moved off the line by the balance it is dancing. */
function waveRocked(place: Spot, direction: WaveDirection, rock: number, t: Beat): Spot {
  const amount = Math.min(rock, WAVE_ROCK_CAP_PX) * waveRockAt(direction, t);
  return {
    p: addScaled(place.p, dirOf(waveRockBearing(direction, place.facing)), amount),
    facing: place.facing,
  };
}

/**
 * How much the torso pitches with the balance.
 *
 * Forwards only: a dancer stepping to their own left does not lean forward to
 * do it, and a wave that never goes behind the line never leans back either.
 */
function waveLeanAt(direction: WaveDirection, t: Beat): number {
  if (direction !== "forward") return 0;
  return Math.min(BALANCE_LEAN_CAP, Math.max(0, balanceRock(t)));
}

/** The direction a wave shape's call asked for, checked against the five. */
function waveDirectionOf(shape: WaveShape, input: ShapeInput): WaveDirection {
  if (shape.direction === undefined) return "forward";
  const asked = input.params[shape.direction];
  if (asked === undefined) return "forward";
  const word = String(asked);
  if (!WAVE_DIRECTIONS.includes(word as WaveDirection)) {
    throw new Error(`a wave balances one of [${WAVE_DIRECTIONS.join(", ")}], not "${word}"`);
  }
  return word as WaveDirection;
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
  const direction = waveDirectionOf(shape, input);

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

  /**
   * **Coming in to the row, nobody walks through anybody** (FR-A2).
   *
   * Anna's Reel's A1 is a robins' allemande once and a half in the middle of the
   * set and then this wave, and the allemande leaves the two of them on the
   * **opposite** sides to the ones the lattice gives them — so the two who come
   * to the middle of the row have to change places to get there, and read off
   * the straight line between the two points they walk through each other.
   * Measured at four, five and six couples, `c2/robin ~ c3/robin` came within
   * **2.143 px** at beat 8.625; the balance's own amplitude is nothing to do with
   * it (a smaller rock reads *closer*, 1.698 px, because the old oversized shear
   * was pushing them apart as they crossed).
   *
   * What a dancer does instead is what a dancer always does: bow to their own
   * left, so two who meet pass right shoulders. The bow is a quarter of the way
   * each dancer has to travel, capped, so somebody already standing on their
   * place walks straight there and only somebody crossing the set bows at all.
   */
  const bowOf = (role: FigureRole): number => {
    const to = onWave[role];
    if (to === undefined) return 0;
    return Math.min(WAVE_CLOSE_BOW_PX, dist(ctx.spot(role).p, to.p) * WAVE_CLOSE_BOW_SHARE);
  };
  const bows: Record<FigureRole, number> = {};
  for (const role of row) bows[role] = bowOf(role);

  const placeAt = (role: FigureRole, t: Beat): Spot => {
    const start = ctx.spot(role);
    const to = onWave[role] ?? start;
    const k = ramp(t, 0, closeBeats);
    const facing = angleLerp(start.facing, to.facing, k);
    const bow = (bows[role] ?? 0) * Math.sin(Math.PI * k);
    const place = {
      p: addScaled(lerp(start.p, to.p, k), dirOf(facing - 90), bow),
      facing,
    };
    return waveRocked(place, direction, rock, t);
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
        lean: waveLeanAt(direction, t),
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
