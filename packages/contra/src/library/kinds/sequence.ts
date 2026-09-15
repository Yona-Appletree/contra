import type { Beat, Hand } from "@caller/core";
import type { Side } from "@caller/choreo";
import type { FigurePlan, HandJoin, PlanContext, Spots } from "../../figures/ContraFigure.js";
import { centreOf, planContext } from "../../figures/ContraFigure.js";
import type { Pairing } from "../../figures/pairing.js";
import { pairsOf } from "../../figures/pairing.js";
import type {
  FigureRole,
  FigureShape,
  HoldSpec,
  PartCasts,
  SequenceShape,
} from "../FigureDefinition.js";
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

/** One cast of one part: the dancers, and the plan they dance. */
interface PlannedCast {
  roles: readonly FigureRole[];
  plan: FigurePlan;
}

/** One part of a sequence, planned, and where it sits in the figure. */
interface PlannedPart {
  /** One per cast: contra corners' corner turns are two pairs at once (M7). */
  casts: readonly PlannedCast[];
  start: Beat;
  beats: Beat;
  /** Where everybody no cast of this part named is standing while it runs (M7). */
  idle: Spots;
}

/** The cast of a part this role dances in, or `undefined` when they are idle. */
const castOf = (part: PlannedPart, role: FigureRole): PlannedCast | undefined =>
  part.casts.find((cast) => cast.roles.includes(role));

/** Every end a part's casts produced, merged. */
const endsOfPart = (part: PlannedPart): Spots =>
  part.casts.reduce<Spots>((all, cast) => ({ ...all, ...cast.plan.ends }), {});

/** Every hand a part's casts are holding at `t`. */
const joinsOfPart = (part: PlannedPart, t: Beat): HandJoin[] =>
  part.casts.flatMap((cast) => cast.plan.joinsAt(t));

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
    const held = keysOf(joinsOfPart(dry[i - 1]!, dry[i - 1]!.beats));
    const wanted = keysOf(joinsOfPart(dry[i]!, dry[i]!.beats / 2));
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
    // A part that leaves somebody out still has to say where they are: the
    // figure's ends are the last part's, over everybody it danced, and the
    // standing pose for everybody it did not.
    ends: { ...last.idle, ...endsOfPart(last) },
    joinsAt: (t) => {
      const part = partAt(t);
      return joinsOfPart(part, t - part.start);
    },
    at: (role, t) => {
      const part = partAt(t);
      const cast = castOf(part, role);
      if (cast) return cast.plan.at(role, t - part.start);
      const here = part.idle[role] ?? input.ctx.spot(role);
      // **Idle inside the figure** (M7): standing where the part before left
      // you, hands down, nothing moving. Not a hold-place instance — you are in
      // this figure and about to be turned by it — and not an event of your own,
      // so the timeline's shape is unchanged.
      return {
        p: here.p,
        facing: here.facing,
        hands: { L: "down", R: "down" },
        stepRate: 0,
        amp: 0,
      };
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
  /** Where **everybody** is standing as this part begins, danced or not. */
  let standing: Spots = { ...input.ctx.start };
  let start: Beat = 0;
  for (let i = 0; i < shape.parts.length; i++) {
    const part = shape.parts[i]!;
    const beats = shares[i]!;
    const before = parts[i - 1];
    const casts = castsOf(part.casts, input) ?? [input.roles];
    const named = new Set(casts.flat());
    for (const role of named) {
      if (!input.roles.includes(role)) {
        throw new Error(
          `a sequence part names "${role}", who is not in this figure ` +
            `(cast: ${input.roles.join(", ")})`,
        );
      }
    }
    // **Two casts of one part have to clear each other** (FR-B1), exactly as two
    // instances of one call do. Turn contra corners is what measured it: its two
    // corner turns run over the same four beats about the *same* point — the two
    // diagonals of a square cross in the middle — and at full radius the two
    // pairs finish on one floor point (Chorus Jig, beat 45.25, `c1/lark ~
    // c2/robin`, 0.000 px at four couples and up). Which pairs are beside you is
    // a fact about the part and not about the shape, so the part hands it over
    // the same way resolution hands an instance `params.nearby`.
    const centres = casts.map((roles) =>
      centreOf(roles.map((role) => standing[role] ?? input.ctx.spot(role))),
    );
    const planned: PlannedCast[] = [];
    for (const [at, roles] of casts.entries()) {
      // A part that names its own casts is planned over **only** those
      // stations, so its shape casts the right number of dancers — an orbit for
      // two really is an orbit for two, even when the figure round it has four.
      const stations = input.ctx.stations.filter((s) => roles.includes(s.id));
      const whole = stations.length === input.ctx.stations.length;
      const ctx: PlanContext =
        before === undefined && whole
          ? input.ctx
          : planContext(stations, input.ctx.roleSet, input.ctx.spacing, standing);
      const handsIn =
        before === undefined
          ? input.handsIn
          : (role: FigureRole, side: Side): Hand | undefined => {
              const was = castOf(before, role);
              if (!was) return undefined;
              const hand = was.plan.at(role, before.beats).hands[side];
              return hand === "down" ? undefined : hand;
            };
      const isLast = i === shape.parts.length - 1;
      const partInput: ShapeInput = {
        ...input,
        ctx,
        beats,
        roles,
        anchor: input.anchorOf(ctx),
        nearby: [...input.nearby, ...centres.filter((_, i) => i !== at)],
        // Only the last part settles the figure: the rock in the middle of a
        // balance and swing ends where it rocked, and the turn is what gathers.
        gathers: isLast && input.gathers,
        joinedIn: joinedIn(i),
        joinedOut: joinedOut(i),
        ...(handsIn === undefined ? {} : { handsIn }),
      };
      // **And only the last part forms the figure's shape** (M9), for the same
      // reason and with a second one of its own: a diamond is four dancers and
      // a part is planned over whoever its casts named, so a target imposed part
      // by part would arrange the two who moved into a shape the four of them
      // are supposed to end in. `diamond`'s cast is what found it.
      if (!isLast) delete partInput.target;
      planned.push({ roles, plan: planPart(part.shape, part.holds, partInput) });
    }
    const idle: Spots = {};
    for (const role of input.roles) {
      if (!named.has(role)) idle[role] = standing[role] ?? input.ctx.spot(role);
    }
    const here: PlannedPart = { casts: planned, start, beats, idle };
    parts.push(here);
    standing = { ...standing, ...endsOfPart(here) };
    start += beats;
  }
  return parts;
}

/**
 * **Who dances this part** (M9): the list written out, the list a parameter
 * names, or the one of several written lists a parameter's own word picks.
 *
 * A pairing parameter is read exactly the way `kinds/pairing.ts` reads one, by
 * `pairsOf`, so `"neighbors"` means the same thing inside a sequence part as it
 * does in a `path`'s pairing — and a pair whose two stations this instance does
 * not hold is dropped rather than throwing, because a part is entitled to name
 * somebody the call left out and the dancers who are here still dance.
 * `undefined` is the old answer: everybody, as one cast.
 */
function castsOf(
  casts: PartCasts | undefined,
  input: ShapeInput,
): readonly (readonly FigureRole[])[] | undefined {
  if (casts === undefined) return undefined;
  if (Array.isArray(casts)) return casts as readonly (readonly FigureRole[])[];
  // `Array.isArray` does not narrow a **readonly** array out of a union, so the
  // rule is named here rather than asserted at each of its two fields.
  const rule = casts as Exclude<PartCasts, readonly (readonly FigureRole[])[]>;
  const here = new Set(input.roles);
  if ("select" in rule) {
    const word = input.params[rule.select];
    if (typeof word !== "string") {
      throw new Error(
        `a sequence part chooses its casts on "${rule.select}", which is ` +
          `${JSON.stringify(word)} and not one of ${Object.keys(rule.cases).join(", ")}`,
      );
    }
    const chosen = rule.cases[word];
    if (chosen === undefined) {
      throw new Error(
        `"${rule.select}" is "${word}", which is not one of ` +
          `${Object.keys(rule.cases).join(", ")}`,
      );
    }
    return chosen;
  }
  const named = input.params[rule.param];
  if (named === undefined) {
    throw new Error(`a sequence part's casts read "${rule.param}", which is not a parameter`);
  }
  return pairsOf(named as Pairing)
    .filter(([a, b]) => here.has(a) && here.has(b))
    .map(([a, b]) => [a, b]);
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
  // **A share of the figure's own count** (M9): equal parts stay equal at every
  // count the card gives the figure, which a written number cannot do.
  if ("share" in expr) return input.beats * expr.share;
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
