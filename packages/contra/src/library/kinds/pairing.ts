import type { StationId } from "@caller/choreo";
import { aheadPairs, facingPairs } from "../../figures/pass-through.js";
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
      return facingPairs(ctx, axis);
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
 * across the set — the axis the lines lie either side of.
 */
function lineMates(ctx: PlanContext): Record<StationId, StationId> {
  const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
  const across = (id: StationId): number => ctx.spot(id).p[0] - centre[0];
  const out: Record<StationId, StationId> = {};
  for (const id of ctx.ids) {
    const side = across(id);
    const mate = ctx.ids.find((other) => other !== id && across(other) * side > 0);
    if (mate === undefined) throw new Error(`long lines: station "${id}" has no line mate`);
    out[id] = mate;
  }
  return out;
}
