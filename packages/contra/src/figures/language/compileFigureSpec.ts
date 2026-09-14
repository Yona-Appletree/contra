import type { Beat, Hand, Side } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  ContraFigure,
  FigurePlan,
  HandJoin,
  HoldWindow,
  LocalHand,
  PlanContext,
  Spot,
  Spots,
} from "../ContraFigure.js";
import { contraFigure, holdWindow, isHeld, joinedHands, takeAndRelease } from "../ContraFigure.js";
import { handDown } from "../../pair/PairFrame.js";
import { ringFor, ringWalk } from "../ring.js";
import type { ExprEnv } from "./expr.js";
import { evalAngle, evalNumber, evalPoint, evalStation } from "./expr.js";
import type { FigureSpec, HandSpec, Segment, SpecParams } from "./figureSpec.js";
import { trackFor } from "./figureSpec.js";

/**
 * A figure written as data, as the `ContraFigure` a coded one already is.
 *
 * This sits exactly where `contraFigure` sits — it *calls* `contraFigure` — so
 * a compiled figure slots into `createContraRegistry`'s `extra` array, into
 * `CONTRA_FIGURES`, and into every oracle with no adapter: the target type
 * already exists and every figure in the library exercises it.
 *
 * ### The passes
 *
 * A figure's hand joins read other dancers' **live** positions at the same
 * beat, so the interpreter cannot substitute a template. It runs in passes:
 *
 * 1. **Ends** — each station's last segment says where the figure leaves them.
 *    Ends read start places and the ring, never a live position.
 * 2. **Positions** — each station's track, at `t`, given the ends.
 * 3. **Hands** — each hand spec, at `t`, against the places pass 2 produced.
 *
 * This is the same two steps `ringHands(ctx, ring, (id) => placeAt(id, t), …)`
 * already takes by closure capture, made explicit and figure-independent.
 */
export function compileFigureSpec(spec: FigureSpec): ContraFigure<SpecParams> {
  return contraFigure<SpecParams>({
    id: spec.id,
    call: spec.call,
    lead: spec.lead,
    beats: spec.beats,
    // `from` last: a spec's own defaults are tuning numbers and must never
    // supply the places, which `chainCalls` threads in.
    defaults: { ...spec.defaults, from: {} },
    plan: (ctx, params) => planFromSpec(spec, ctx, params),
  });
}

/** One spec, planned for one group. */
function planFromSpec(spec: FigureSpec, ctx: PlanContext, params: SpecParams): FigurePlan {
  const ring = ringFor(ctx);
  const beats = params.beats;
  const env = (self: StationId, t: Beat): ExprEnv => ({ ctx, params, beats, self, t, ring });

  const lastSegment = (station: StationId): Segment => {
    const track = spec.tracks[trackFor(spec.tracks, ctx, station)]!;
    if (track.length !== 1) {
      throw new Error(
        `${spec.id}: a track has ${track.length} segments; M1 compiles exactly one (segment sequencing is M2's)`,
      );
    }
    return track[0]!;
  };

  // Pass 1 — where the figure leaves everybody.
  const ends: Spots = {};
  for (const id of ctx.ids) {
    const segment = lastSegment(id);
    const at = env(id, beats);
    ends[id] = { p: evalPoint(segment.end.p, at), facing: evalAngle(segment.end.facing, at) };
  }

  // Pass 2 — where one dancer is, mid figure.
  const placeAt = (station: StationId, t: Beat): Spot =>
    runSegment(lastSegment(station), { ...env(station, t), ends });

  // Pass 3 — what the hands do, against the places pass 2 produced.
  const handEnv = (station: StationId, t: Beat): ExprEnv => ({
    ...env(station, t),
    ends,
    live: (id) => placeAt(id, t),
  });

  const handsOf = (station: StationId, t: Beat): { L: LocalHand; R: LocalHand } => {
    const declared = spec.hands[trackFor(spec.hands, ctx, station)]!;
    const self = placeAt(station, t);
    return {
      L: oneHand(spec, declared.L, station, "L", self, handEnv(station, t)),
      R: oneHand(spec, declared.R, station, "R", self, handEnv(station, t)),
    };
  };

  return {
    ends,
    joinsAt: (t) => joinsFromSpec(spec, ctx, t, handEnv),
    at(station, t) {
      const self = placeAt(station, t);
      return { p: self.p, facing: self.facing, hands: handsOf(station, t) };
    },
  };
}

/** One segment, evaluated to where it puts its dancer at `t`. */
function runSegment(segment: Segment, at: ExprEnv): Spot {
  switch (segment.kind) {
    case "ringWalk": {
      const places = evalNumber(segment.places, at);
      const step = 360 / at.ring.order.length;
      const end = at.ends?.[at.self];
      if (!end) throw new Error(`no end for station "${at.self}"`);
      return ringWalk(at.ring, at.self, at.ctx.spot(at.self), end, at.t, at.beats, {
        inBeats: evalNumber(segment.inBeats, at),
        outBeats: evalNumber(segment.outBeats, at),
        turn: places * step,
        faceOffset: evalAngle(segment.faceOffset, at),
      });
    }
  }
}

/** One hand of one dancer at `t`. */
function oneHand(
  spec: FigureSpec,
  declared: HandSpec,
  station: StationId,
  side: Side,
  self: Spot,
  at: ExprEnv,
): LocalHand {
  if (declared.hand === "down") {
    const swing = declared.swing === undefined ? 0 : evalNumber(declared.swing, at);
    return handDown(self.p, self.facing, side, at.t, swing);
  }
  if (declared.hand === "carried") {
    throw new Error(
      `${spec.id}: a "carried" hand needs the hold threaded between calls, which is M3's; nothing carries one in yet`,
    );
  }
  const join = resolveJoin(spec, declared, station, side, at);
  return takeAndRelease(self, side, at.t, join.mine, join.window);
}

/** A joined hand, resolved: who is holding whom, the hand itself, and its window. */
function resolveJoin(
  spec: FigureSpec,
  declared: Extract<HandSpec, { hand: "joined" }>,
  station: StationId,
  side: Side,
  at: ExprEnv,
): { join: HandJoin; mine: Hand; window: HoldWindow } {
  const a = evalStation(declared.a.station, at);
  const b = evalStation(declared.b.station, at);
  const isA = a === station && declared.a.side === side;
  const isB = b === station && declared.b.side === side;
  if (isA === isB) {
    throw new Error(
      `${spec.id}: station "${station}"'s ${side} hand joins ${a}.${declared.a.side} to ${b}.${declared.b.side}, which is not this hand`,
    );
  }
  const stackPx = declared.stackPx === undefined ? 0 : evalNumber(declared.stackPx, at);
  const both = joinedHands(
    at.ctx,
    a,
    b,
    evalPoint(declared.point, at),
    evalNumber(declared.drop, at),
    stackPx,
  );
  const mine = both[station];
  if (!mine) throw new Error(`${spec.id}: no joined hand for station "${station}"`);
  return {
    join: { a, aSide: declared.a.side, b, bSide: declared.b.side },
    mine,
    window: holdWindow(
      at.beats,
      evalNumber(declared.window.take, at),
      evalNumber(declared.window.release, at),
    ),
  };
}

/**
 * The hands held as one point at `t`, each join reported once.
 *
 * Both dancers of a join declare it — the ring's left hands and its right
 * hands are the same four joins seen from either side — so the same join comes
 * up twice and is reported once, in the stations' own order.
 */
function joinsFromSpec(
  spec: FigureSpec,
  ctx: PlanContext,
  t: Beat,
  handEnv: (station: StationId, t: Beat) => ExprEnv,
): HandJoin[] {
  const joins: HandJoin[] = [];
  const seen = new Set<string>();
  for (const station of ctx.ids) {
    const declared = spec.hands[trackFor(spec.hands, ctx, station)]!;
    for (const side of ["L", "R"] as const) {
      const hand = declared[side];
      if (hand.hand !== "joined") continue;
      const resolved = resolveJoin(spec, hand, station, side, handEnv(station, t));
      if (!isHeld(resolved.window, t)) continue;
      const key = [
        `${resolved.join.a}.${resolved.join.aSide}`,
        `${resolved.join.b}.${resolved.join.bSide}`,
      ]
        .sort()
        .join("/");
      if (seen.has(key)) continue;
      seen.add(key);
      joins.push(resolved.join);
    }
  }
  return joins;
}
