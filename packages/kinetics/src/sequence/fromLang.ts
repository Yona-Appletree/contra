import type { EveningResult, Move, MoveArg, Node, Snapshot, Tree } from "@caller/lang";
import { placesUnder, shortPath } from "@caller/lang";
import type { DancerId, DancerState, Dialect } from "../dialect/Dialect.js";
import { langDialect, mirrorX, posePx } from "../dialect/langDialect.js";
import type { FigureRegistry } from "../figures/registry.js";
import { figureNamed } from "../figures/registry.js";
import type { FigureIR, ParamSpec, Role } from "../ir/Figure.js";
import { defaultParams } from "../ir/Figure.js";
import type { RunError } from "../pipeline.js";
import type { CompiledCall, CompiledSequence, Membership } from "./CompiledSequence.js";
import { membership } from "./CompiledSequence.js";

/**
 * The join (notes D1): an evening the dance language ran, as the compiled
 * sequence the scheduler has always taken.
 *
 * The language owns the text, the tree, the beats and who stands where. This
 * reads five things out of it and nothing else — the dancers, the seatings at
 * every commit, each dancer's moves in order, what each move's arguments
 * point at, and where the move was written — and turns them into calls on
 * figures. It never parses anything: a `Role` argument arrives as
 * `{ t: "dancer", id }` and a group argument as the node it names (D3), so
 * the cast is read rather than guessed.
 *
 * Two things it will not do quietly. A move whose `ir` no figure answers to
 * is a diagnostic at the move's span and a **stand** for its beats (D5) —
 * Butter's chain and hey, until M2. And a figure that wants a dancer or a
 * group the move never mentions is a diagnostic too, because a figure that
 * silently stands is a dance that silently goes missing.
 */
export function sequenceFromEvening(
  evening: EveningResult,
  registry: FigureRegistry,
): { sequence: CompiledSequence; dialect: Dialect; errors: RunError[] } {
  const errors: RunError[] = [];
  const dialect = langDialect(evening.tree);
  const nodeAt = pathIndex(evening.tree);

  // A complaint about a **call** is about the text, not about each of the
  // ninety-six copies of it a hall of sixteen dances seven times through.
  // The first one carries the dancer and the beat; the rest become a count,
  // so Butter's chain and its hey are two lines and not a hundred and
  // sixty-eight (D5).
  const seen = new Map<string, { error: RunError; calls: number }>();
  const report = (error: RunError): void => {
    const key = `${error.kind ?? ""}@${error.span?.file ?? ""}:${String(error.span?.start)}:${error.message}`;
    const already = seen.get(key);
    if (already === undefined) {
      seen.set(key, { error, calls: 1 });
      errors.push(error);
      return;
    }
    already.calls += 1;
    already.error.message = `${error.message} (${String(already.calls)} calls)`;
  };

  // The evening's beat line (D6): the times run one after another, each as
  // long as its own dancers' cursors reached.
  const offsets: number[] = [];
  let at = 0;
  for (const time of evening.times) {
    offsets.push(at);
    at += time.length;
  }
  const offsetOfTime = (time: number): number => offsets[time - 1] ?? 0;

  const seatings = seatingsOf(evening.snapshots, offsetOfTime, fullPathOf(evening.tree));
  const memberships = seatings.map((seating) => seating.membership);

  /** The last seating settled strictly before a call ends (D6). */
  const seatingFor = (end: number): number => {
    let index = 0;
    for (let i = 0; i < seatings.length; i += 1) {
      if ((seatings[i] as Seating).beat < end) index = i;
      else break;
    }
    return index;
  };

  const perDancer: Record<DancerId, CompiledCall[]> = {};
  for (const id of dialect.dancers) perDancer[id] = [];
  const roles = new Set(dialect.dancers.map((id) => dialect.roleOf(id)));

  for (const time of evening.times) {
    const offset = offsetOfTime(time.time);
    for (const move of time.moves) {
      const calls = perDancer[move.dancer];
      if (calls === undefined) continue;
      calls.push(
        callOf(move, {
          beat: offset,
          registry,
          nodeAt,
          seatings,
          seating: seatingFor(offset + move.start + move.beats),
          id: calls.length,
          roles,
          report,
        }),
      );
    }
  }
  for (const calls of Object.values(perDancer)) {
    calls.sort((a, b) => a.start - b.start);
    calls.forEach((call, index) => {
      (call as { id: number }).id = index;
    });
  }

  const sequence: CompiledSequence = {
    dialect: evening.tree.roots[0]?.kind ?? "floor",
    perDancer,
    memberships,
  };
  const title = evening.times[0]?.cards[0]?.text;
  if (title !== undefined) sequence.title = title;

  for (const d of evening.diagnostics) {
    errors.push({
      stage: "run",
      kind: d.code,
      message: `${d.code}: ${d.message}`,
      ...(d.span === undefined ? {} : { span: d.span }),
      ...(d.beat === undefined ? {} : { beat: d.beat }),
      ...(d.dancers[0] === undefined ? {} : { dancer: d.dancers[0] }),
    });
  }

  return { sequence, dialect, errors };
}

// ---------------------------------------------------------------------------
// One move
// ---------------------------------------------------------------------------

interface CallContext {
  /** Where this time through starts on the evening's beat line. */
  beat: number;
  registry: FigureRegistry;
  nodeAt: ReadonlyMap<string, Node>;
  seatings: readonly Seating[];
  seating: number;
  id: number;
  /** The roles anybody on the floor dances, as the dialect names them. */
  roles: ReadonlySet<string>;
  report: (error: RunError) => void;
}

function callOf(move: Move, ctx: CallContext): CompiledCall {
  const start = ctx.beat + move.start;
  const end = start + move.beats;
  const seating = ctx.seatings[ctx.seating];
  const found = figureNamed(ctx.registry, move.ir);
  const figure = found ?? standing(move.beats);
  if (found === undefined) {
    ctx.report({
      stage: "compile",
      kind: "NoFigure",
      message: `no figure for "${move.ir}": the move stands for ${String(move.beats)} beats`,
      span: move.span,
      dancer: move.dancer,
      beat: start,
    });
  }

  const byName = new Map(move.args.map((arg) => [arg.name, arg]));
  const params: Record<string, string | number> = { ...defaultParams(figure) };
  const cast: Record<Role, DancerId | undefined> = {
    self: move.dancer,
    partner: undefined,
    left: undefined,
    opposite: undefined,
    right: undefined,
  };
  let group: readonly DancerId[] | undefined;

  for (const spec of figure.params) {
    if (spec.kind === "dancer") {
      const arg = referring(move.args, byName.get(spec.name));
      if (arg === undefined) {
        ctx.report(noCast(move, figure, spec, start, "a dancer"));
        continue;
      }
      if (arg.ref?.t === "dancer") cast.partner = arg.ref.id;
      continue;
    }
    if (spec.kind === "group") {
      const arg = referring(move.args, byName.get(spec.name));
      const node = arg?.ref?.t === "node" ? ctx.nodeAt.get(arg.ref.path) : undefined;
      if (node === undefined) {
        ctx.report(noCast(move, figure, spec, start, "a group"));
        continue;
      }
      group = ringOf(node, move.dancer, seating?.membership);
      if (group === undefined) {
        const empty = placesUnder(node).filter(
          (place) => seating?.membership.dancerOf.get(place.path) === undefined,
        );
        ctx.report({
          stage: "compile",
          kind: "NoRing",
          message:
            `"${move.ir}" has no ring for ${figure.id}'s "${spec.name}": ` +
            (empty.length > 0
              ? `${node.label} has ${String(empty.length)} empty place${empty.length === 1 ? "" : "s"} at this beat`
              : `${move.dancer} is not in ${node.label}`) +
            `; the move stands for ${String(move.beats)} beats`,
          span: move.span,
          dancer: move.dancer,
          beat: start,
        });
      }
      continue;
    }
    const arg = byName.get(spec.name);
    if (arg === undefined) continue;
    const value = valueOf(spec, arg, move, start, ctx.report);
    if (value === undefined) continue;
    // A role word nobody on the floor dances: the figure's windows for that
    // role would name no-one and everybody would stand, silently (D16 says
    // the figure never spells a role, so this is where the word is checked).
    if (spec.kind === "role" && typeof value === "string" && !ctx.roles.has(value)) {
      ctx.report({
        stage: "compile",
        kind: "BadParam",
        message: `"${arg.value}" is not a role anybody dances, for ${move.ir}'s ${spec.name}: ${[...ctx.roles].sort().join(" | ")}`,
        span: move.span,
        dancer: move.dancer,
        beat: start,
      });
      continue;
    }
    params[spec.name] = value;
  }

  // The ring's neighbours, in its own order from `self`: the second is the one
  // you would circle left into, the third is across, the fourth is the other
  // side. A figure reads them by name and never counts.
  if (group !== undefined) {
    cast.left = group[1];
    cast.opposite = group[2];
    cast.right = group[3];
  }

  // A figure danced two at a time may still name the ring's places directly;
  // M3's long wave balances with whoever is to each side of it.
  if (!figure.params.some((spec) => spec.kind === "group")) {
    for (const role of RING_ROLES) {
      const ref = byName.get(role)?.ref;
      if (ref?.t === "dancer") cast[role] = ref.id;
    }
  }

  const call: CompiledCall = {
    id: ctx.id,
    figure,
    params,
    beats: move.beats,
    start,
    end,
    path: move.ir,
    span: move.span,
    cast,
    seatAfter: seating?.seatOf.get(move.dancer) ?? { p: [0, 0], facing: 0 },
    bindings: Object.fromEntries(move.args.map((arg) => [arg.name, arg.value])),
    membership: ctx.seating,
  };
  if (group !== undefined) call.group = group;
  return call;
}

const RING_ROLES = ["left", "opposite", "right"] as const;

/** The argument that names somebody or somewhere: the one asked for, else the first that does. */
function referring(args: readonly MoveArg[], named: MoveArg | undefined): MoveArg | undefined {
  if (named?.ref !== undefined) return named;
  return args.find((arg) => arg.ref?.t === "dancer") ?? args.find((arg) => arg.ref !== undefined);
}

/** A figure that wants somebody the move never mentions: a diagnostic, then a stand. */
const noCast = (
  move: Move,
  figure: FigureIR,
  spec: ParamSpec,
  beat: number,
  wanted: string,
): RunError => ({
  stage: "compile",
  kind: "NoCast",
  message:
    `"${move.ir}" wants ${wanted} for ${figure.id}'s "${spec.name}", and the move names none: ` +
    `the move stands for ${String(move.beats)} beats`,
  span: move.span,
  dancer: move.dancer,
  beat,
});

/** One plain parameter, from the text the language printed for it. */
function valueOf(
  spec: ParamSpec,
  arg: MoveArg,
  move: Move,
  beat: number,
  report: (error: RunError) => void,
): string | number | undefined {
  const complain = (message: string): undefined => {
    report({
      stage: "compile",
      kind: "BadParam",
      message,
      span: move.span,
      dancer: move.dancer,
      beat,
    });
    return undefined;
  };
  if (spec.kind === "enum" || spec.kind === "role") {
    const word = kebab(arg.value);
    if (spec.kind === "enum" && spec.choices !== undefined && !spec.choices.includes(word))
      return complain(
        `"${arg.value}" is not a ${spec.name} for ${move.ir}: ${spec.choices.join(" | ")}`,
      );
    return word;
  }
  if (spec.kind === "string") return arg.value.replace(/^"|"$/g, "");
  const number = Number(arg.value);
  if (!Number.isFinite(number))
    return complain(`${move.ir}'s ${spec.name} is a number, and the move said "${arg.value}"`);
  return number;
}

/**
 * The dancers of a group **in ring order clockwise from `me`**: sorted by
 * bearing from the middle of them and rotated to start at the asking dancer,
 * so the second is the one they would circle left into and the third is
 * across. A ring with an empty place is nobody: a ring of three is not a
 * hands four.
 */
function ringOf(
  node: Node,
  me: DancerId,
  seating: Membership | undefined,
): readonly DancerId[] | undefined {
  if (seating === undefined) return undefined;
  const places = placesUnder(node);
  if (places.length === 0) return undefined;
  const seated: { id: DancerId; x: number; y: number }[] = [];
  for (const place of places) {
    const id = seating.dancerOf.get(place.path);
    if (id === undefined) return undefined;
    // Bearings are taken in the engine's frame, not the language's: the two
    // have opposite handedness (`langDialect.ts`), and "clockwise" is exactly
    // the thing a reflection reverses.
    seated.push({ id, x: mirrorX(place.frame.x), y: place.frame.y });
  }
  if (!seated.some((s) => s.id === me)) return undefined;
  const cx = seated.reduce((sum, s) => sum + s.x, 0) / seated.length;
  const cy = seated.reduce((sum, s) => sum + s.y, 0) / seated.length;
  const clockwise = [...seated].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  const first = clockwise.findIndex((s) => s.id === me);
  return clockwise.map(
    (_, i) => (clockwise[(first + i) % clockwise.length] as { id: DancerId }).id,
  );
}

/**
 * What a move with no figure does: nothing, for its beats. Not the registry's
 * business — the registry is the list of figures that exist — so it is made
 * here, once per call, beside the diagnostic that says why.
 */
const standing = (beats: number): FigureIR => ({
  id: "standing",
  params: [],
  beats: { nominal: beats, min: 0 },
  pre: { arrangement: [], holds: [] },
  post: { arrangement: [], holds: [] },
  windows: [{ kind: "stand" }],
  look: [{ role: "self", at: "ahead" }],
  elide: "wait",
  casts: {},
});

// ---------------------------------------------------------------------------
// The seatings
// ---------------------------------------------------------------------------

/** One commit's worth of floor: when it settled, who was where, and their seats. */
interface Seating {
  /** On the evening's beat line. */
  beat: number;
  membership: Membership;
  seatOf: ReadonlyMap<DancerId, DancerState>;
}

function seatingsOf(
  snapshots: readonly Snapshot[],
  offsetOfTime: (time: number) => number,
  fullPath: ReadonlyMap<string, string>,
): Seating[] {
  return snapshots.map((snapshot) => ({
    beat: snapshot.at === "setup" ? 0 : offsetOfTime(snapshot.time) + snapshot.beat,
    membership: membership(
      snapshot.positions.map((p) => [fullPath.get(p.place) ?? p.place, p.dancer] as const),
    ),
    seatOf: new Map(
      snapshot.positions.map((p) => [
        p.dancer,
        posePx({ x: p.x, y: p.y, heading: p.heading, mirrored: false }),
      ]),
    ),
  }));
}

const pathIndex = (tree: Tree): Map<string, Node> =>
  new Map(tree.nodes.map((node) => [node.path, node]));

/**
 * A snapshot names a place the way an event prints it — the root dropped —
 * and a node knows its whole path. One map, once, so a seating and a tree
 * node are looked up by the same string everywhere below this file.
 */
const fullPathOf = (tree: Tree): Map<string, string> =>
  new Map(tree.places.map((place) => [shortPath(place), place.path]));

/** `ReverseBecket` → `reverse-becket`: an enum member as the figure IR spells its choices. */
export const kebab = (member: string): string =>
  member.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
