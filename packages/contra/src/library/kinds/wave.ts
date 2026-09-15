import type { Beat, Side, Vec2 } from "@caller/core";
import { addScaled, angleLerp, angleOf, dirOf, lerp, ramp } from "@caller/core";
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
