import type { Beat, Hand } from "@caller/core";
import type { Side } from "@caller/choreo";
import type { FigurePlan, HandJoin, PlanContext, Spots } from "../../figures/ContraFigure.js";
import { planContext } from "../../figures/ContraFigure.js";
import type { FigureRole, FigureShape, HoldSpec, SequenceShape } from "../FigureDefinition.js";
import { joinKey, type ShapeInput } from "../interpret.js";

/**
 * **A sequence**: several shapes in a row, one figure.
 *
 * The user, who calls these: "that's really one move, most of the time. very
 * occasionally does a caller call 'balance your partner' and then 2 beats later
 * 'swing your partner.' its almost always 'balance and swing your partner'."
 *
 * Dancing it as two figures is what put a seam in the middle of it, and the
 * seam is what the arms disappeared into. So a sequence threads three things
 * between its parts, and all three are rules the engine already has for a call
 * boundary, applied *inside* one figure:
 *
 * 1. **Ends become starts.** Each part is planned from where the part before it
 *    left everybody, and anchored where *it* begins — which is what makes the
 *    turn half of a balance and swing turn about the closed-up pair rather than
 *    about where they stood before the rock.
 * 2. **Holds carry.** A hold the part before was still holding at its last
 *    beat, which this part holds through its middle, is neither let go nor
 *    retaken. That is `carryHolds`' own question, asked of two parts instead of
 *    two calls, and it is why the lark's left in the robin's right is one floor
 *    point from the moment the balance takes it until the pair opens out.
 * 3. **Hands are handed on.** A hand that was somewhere other than the hip —
 *    the balance's *second* hold, which belongs on the back and the shoulder
 *    for the turn — starts the next part from where the last one left it,
 *    rather than dropping to the hip and coming back up.
 *
 * The figure's own carried holds go to the ends: whatever the figure before
 * handed in is the first part's, and whatever the figure after takes over is
 * the last part's.
 */

/** The interpreter's own dispatch, handed in so a sequence may contain any kind. */
export type PlanPart = (
  shape: FigureShape,
  holds: readonly HoldSpec[],
  input: ShapeInput,
) => FigurePlan;

/** One part of a sequence, planned, and where it sits in the figure. */
interface PlannedPart {
  plan: FigurePlan;
  start: Beat;
  beats: Beat;
}

/** One sequence, planned. */
export function planSequence(
  shape: SequenceShape,
  input: ShapeInput,
  planPart: PlanPart,
): FigurePlan {
  const shares = sharesOf(shape, input);

  // Pass one: every part on its own, so that each can be asked what it is
  // holding at its last beat and what the next one holds through its middle.
  const dry = run(
    shape,
    input,
    planPart,
    shares,
    () => new Set<string>(),
    () => new Set<string>(),
  );
  const across: Array<Set<string>> = shape.parts.map(() => new Set<string>());
  for (let i = 1; i < shape.parts.length; i++) {
    const held = keysOf(dry[i - 1]!.plan.joinsAt(dry[i - 1]!.beats));
    const wanted = keysOf(dry[i]!.plan.joinsAt(dry[i]!.beats / 2));
    across[i] = new Set([...held].filter((key) => wanted.has(key)));
  }

  // Pass two: the same parts, told what crosses each of their boundaries.
  const parts = run(
    shape,
    input,
    planPart,
    shares,
    (i) => (i === 0 ? new Set(input.joinedIn) : across[i]!),
    (i) => (i === shape.parts.length - 1 ? new Set(input.joinedOut) : new Set(across[i + 1] ?? [])),
  );

  const last = parts[parts.length - 1];
  if (!last) throw new Error(`a sequence needs at least one part`);

  const partAt = (t: Beat): PlannedPart => {
    for (const part of parts) {
      if (t < part.start + part.beats) return part;
    }
    return last;
  };

  return {
    ends: last.plan.ends,
    joinsAt: (t) => {
      const part = partAt(t);
      return part.plan.joinsAt(t - part.start);
    },
    at: (role, t) => {
      const part = partAt(t);
      return part.plan.at(role, t - part.start);
    },
  };
}

/** Every part, threaded: ends to starts, hands handed on, carries as asked. */
function run(
  shape: SequenceShape,
  input: ShapeInput,
  planPart: PlanPart,
  shares: readonly Beat[],
  joinedIn: (index: number) => Set<string>,
  joinedOut: (index: number) => Set<string>,
): PlannedPart[] {
  const parts: PlannedPart[] = [];
  let from: Spots | undefined;
  let start: Beat = 0;
  for (let i = 0; i < shape.parts.length; i++) {
    const part = shape.parts[i]!;
    const beats = shares[i]!;
    const before = parts[i - 1];
    const ctx: PlanContext =
      from === undefined
        ? input.ctx
        : planContext(input.ctx.stations, input.ctx.roleSet, input.ctx.spacing, from);
    const handsIn =
      before === undefined
        ? input.handsIn
        : (role: FigureRole, side: Side): Hand | undefined => {
            const hand = before.plan.at(role, before.beats).hands[side];
            return hand === "down" ? undefined : hand;
          };
    const partInput: ShapeInput = {
      ...input,
      ctx,
      beats,
      anchor: input.anchorOf(ctx),
      // Only the last part settles the figure: the rock in the middle of a
      // balance and swing ends where it rocked, and the turn is what gathers.
      gathers: i === shape.parts.length - 1 && input.gathers,
      joinedIn: joinedIn(i),
      joinedOut: joinedOut(i),
      ...(handsIn === undefined ? {} : { handsIn }),
    };
    parts.push({ plan: planPart(part.shape, part.holds, partInput), start, beats });
    from = parts[i]!.plan.ends;
    start += beats;
  }
  return parts;
}

/** How many beats each part gets; one `"rest"` takes whatever is left. */
function sharesOf(shape: SequenceShape, input: ShapeInput): Beat[] {
  const shares: Array<Beat | undefined> = [];
  let given = 0;
  for (const part of shape.parts) {
    if (part.beats === "rest") {
      shares.push(undefined);
      continue;
    }
    const beats = beatsOf(part.beats, input);
    shares.push(beats);
    given += beats;
  }
  const rest = shares.filter((share) => share === undefined).length;
  if (rest > 1) throw new Error(`a sequence may have one "rest" part, not ${rest}`);
  const left = input.beats - given;
  return shares.map((share) => share ?? left);
}

/**
 * A part's own beat share, capped at half the figure.
 *
 * A balance and swing called in twelve beats is a four-beat rock and an
 * eight-beat turn; called in six it is a three-beat rock and a three-beat turn,
 * not a four-beat rock and a two-beat turn. The cap is what the coded figure
 * does and what keeps a short count from eating the figure it is the run-up to.
 */
function beatsOf(expr: SequenceShape["parts"][number]["beats"], input: ShapeInput): Beat {
  if (expr === "rest") throw new Error(`"rest" is not a number`);
  if (typeof expr === "number") return Math.min(expr, input.beats / 2);
  if (!("param" in expr)) throw new Error(`a part's beats must be a number or a parameter`);
  const value = input.params[expr.param];
  if (typeof value !== "number") {
    throw new Error(`parameter "${expr.param}" is ${JSON.stringify(value)}, not a number of beats`);
  }
  return Math.min(value, input.beats / 2);
}

/** A list of joins as the keys `carried` compares them by. */
const keysOf = (joins: readonly HandJoin[]): Set<string> =>
  new Set(joins.map((j) => joinKey(j.a, j.aSide, j.b, j.bSide)));
