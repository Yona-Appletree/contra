import { dirOf, leftOf, sub } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { Pairing } from "../../figures/pairing.js";
import { pairsOf } from "../../figures/pairing.js";
import { centreOf, type PlanContext } from "../../figures/ContraFigure.js";
import type { PairingRule } from "../FigureDefinition.js";

/**
 * **Who each dancer is dancing this figure with**, as data.
 *
 * A figure for the whole minor set still pairs people up, and the four rules
 * below are the four ways the library does it. Three of them are read off
 * **where people are standing** rather than out of the call, which is what lets
 * one figure pass a becket line across and a duple improper line along without
 * either being written down: the pass through pairs you with whoever is on the
 * other side of the set's own centre, right and left through with whoever is
 * straight in front of you, and long lines with the other dancer on your own
 * side. The fourth is the call's own `pairs` parameter.
 *
 * A pairing is **partial**: a rule may leave somebody out, and the figure is
 * what decides what they then do (stand still, usually). It is also symmetric
 * where the rule is — `pairsOf` names each pair once and this returns the map
 * both ways round — so a figure can ask any dancer for their partner.
 */
export function pairUp(
  rule: PairingRule,
  ctx: PlanContext,
  params: Readonly<Record<string, unknown>>,
): Record<StationId, StationId> {
  switch (rule.kind) {
    case "none":
      return {};
    case "opposite": {
      const axis = typeof rule.axis === "string" ? rule.axis : (params[rule.axis.param] as unknown);
      if (axis !== "across" && axis !== "along") {
        throw new Error(`a pass pairs across the set or along it, not ${JSON.stringify(axis)}`);
      }
      // Partial, for the reason {@link lineMates} is: a dancer with nobody on
      // the other side of the set stands, and the oracles say so.
      return facingPairs(ctx, axis, true);
    }
    case "ahead":
      return aheadPairs(ctx);
    case "lineMate":
      return lineMates(ctx);
    case "param":
      return fromParam(rule.param, ctx, params);
  }
}

/** The pairing a `pairs`-shaped parameter names, both ways round. */
function fromParam(
  param: string,
  ctx: PlanContext,
  params: Readonly<Record<string, unknown>>,
): Record<StationId, StationId> {
  const named = params[param];
  if (named === undefined) {
    throw new Error(`a pairing reads "${param}", which is not a parameter`);
  }
  const here = new Set(ctx.ids);
  const out: Record<StationId, StationId> = {};
  for (const [a, b] of pairsOf(named as Pairing)) {
    if (!here.has(a) || !here.has(b)) continue;
    out[a] = b;
    out[b] = a;
  }
  return out;
}

/**
 * The other dancer on your own side of the set: long lines' pairing.
 *
 * "Your own side" is which side of the group's centre you stand on, measured
 * across the set — the axis the lines lie either side of. Read off where people
 * are **standing**, deliberately and still: in Are You 'Most Done? the two
 * larks allemande across the set before the long lines, so the line a dancer is
 * in is not the line their station is in, and a long line is the line you are
 * standing in. (Reading it off the stations instead was tried in M8b and is
 * wrong for exactly that dance: it pairs a becket couple who are at that moment
 * on opposite sides of the set, and the hold then has no inside hands.)
 *
 * **The pairing is partial and now says so (M8b).** Until this milestone a
 * dancer with nobody on their side threw
 * `long lines: station "1L" has no line mate`, which is what turned Are You
 * 'Most Done?'s second time through into a stack trace at every line length of
 * five couples and up. It is the one place in the library where a dancer in the
 * wrong place was an exception and not a measurement (M8's own finding), and
 * what put them in the wrong place is a real fault of that dance — two dancers
 * settled on one floor point — which the collision oracle is built to report and
 * a stack trace is not. The header above already promises a partial pairing and
 * every other rule in this file keeps that promise; the figure stands the odd
 * dancer still.
 */
function lineMates(ctx: PlanContext): Record<StationId, StationId> {
  const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
  const across = (id: StationId): number => ctx.spot(id).p[0] - centre[0];
  const out: Record<StationId, StationId> = {};
  for (const id of ctx.ids) {
    const side = across(id);
    const mate = ctx.ids.find((other) => other !== id && across(other) * side > 0);
    if (mate !== undefined) out[id] = mate;
  }
  return out;
}

/**
 * Who each dancer passes: the dancer on the other side of the set (`'across'`)
 * or the one up or down the line (`'along'`), by which way they lie from each
 * other on the floor.
 */
export function facingPairs(
  ctx: PlanContext,
  direction: "across" | "along",
  partial = false,
): Record<StationId, StationId> {
  const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
  const axis = direction === "across" ? 0 : 1;
  const other = axis === 0 ? 1 : 0;
  const out: Record<StationId, StationId> = {};
  for (const id of ctx.ids) {
    const self = ctx.spot(id).p;
    let best: StationId | undefined;
    let bestGap = Infinity;
    for (const candidate of ctx.ids) {
      if (candidate === id) continue;
      const p = ctx.spot(candidate).p;
      // Opposite along the chosen axis, and as close as possible on the other.
      if ((p[axis] - centre[axis]) * (self[axis] - centre[axis]) >= 0) continue;
      const gap = Math.abs(p[other] - self[other]);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    // **A pairing may leave somebody out** (`kinds/pairing.ts`'s own promise,
    // and M8b's ruling on the line mates): two dancers a call names who are not
    // on opposite sides of the set are not a pass, and standing them still is a
    // measurement the collision and coverage oracles can report where a stack
    // trace is not. Jeremy Corners' second pass is where it was measured — the
    // neighbour swing that ends its first pass leaves the twos side by side on
    // one line at four couples and up, so "twos pass through across" names a
    // pair with nobody across. The **coded** figure keeps the throw, because it
    // is handed the whole hands-four and a hands-four always has an opposite.
    if (best === undefined) {
      if (partial) continue;
      throw new Error(`pass-through: nobody opposite "${id}"`);
    }
    out[id] = best;
  }
  return out;
}

/**
 * Who is straight in front of each dancer: the one they would walk into.
 *
 * `facingPairs` asks which way the set lies; this asks which way the *dancers*
 * are looking, which is what a caller means by "pass the one you are facing".
 * In duple improper the ones face the twos along the line, so `1L`'s is `2R`,
 * 20 px straight ahead of him; in becket everyone faces across, so it is the
 * dancer opposite. Nobody behind you counts, however near.
 */
export function aheadPairs(ctx: PlanContext): Record<StationId, StationId> {
  const out: Record<StationId, StationId> = {};
  for (const id of ctx.ids) {
    const self = ctx.spot(id);
    const ahead = dirOf(self.facing);
    const beside = leftOf(self.facing);
    let best: StationId | undefined;
    let bestOff = Infinity;
    for (const candidate of ctx.ids) {
      if (candidate === id) continue;
      const to = sub(ctx.spot(candidate).p, self.p);
      if (to[0] * ahead[0] + to[1] * ahead[1] <= 0) continue;
      const off = Math.abs(to[0] * beside[0] + to[1] * beside[1]);
      if (off < bestOff) {
        bestOff = off;
        best = candidate;
      }
    }
    if (best === undefined) throw new Error(`nobody in front of "${id}"`);
    out[id] = best;
  }
  return out;
}
