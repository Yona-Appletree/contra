import type { Beat } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraFigure, ContraParams, FigurePlan, HandJoin, Spots } from "./ContraFigure.js";
import { contraFigure, planContext } from "./ContraFigure.js";
import type { Pairing } from "./pairing.js";
import { NEIGHBORS, PARTNERS, pairsOf } from "./pairing.js";
import type { FigureDefinition } from "../library/FigureDefinition.js";
import { withDefaults } from "@caller/choreo";
import { DATA_DEFINITIONS, templateFigureOf } from "../library/figures/index.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { PROBE_FRAME, probeGroup } from "./testing.js";
import { interpretDefinition } from "../library/interpret.js";

/**
 * **A figure planned over the four stations of a hands-four.**
 *
 * The figure lab, the figure checks and the motion derivation all ask the same
 * thing of a figure: *run alone, on one minor set, and tell me where everybody
 * goes*. Until M11 the coded layer answered it — a `ContraFigure` is written
 * for four stations by construction — and a `FigureDefinition` did not have to,
 * because the definition's own twin was there to be measured.
 *
 * With the coded layer gone the definitions have to answer it themselves, and
 * half of them cannot on their own: a figure resolution mints **one instance
 * per pair** (`actors: "pairs"`, `anchor: "meet"`) is written for two roles and
 * refuses four by name. A whole dance is fine — `resolveCall` against a real
 * set mints the instances and casts them — but the lab is deliberately *not* a
 * dance: it runs one figure, from the formation's own places, so that what it
 * measures is the figure and not the dance around it.
 *
 * So this mints the instances a hands-four implies, which for a pair figure is
 * exactly what the `pairs` parameter already says: `"neighbors"` and
 * `"partners"` are two disjoint pairs of the four stations, and a written pair
 * list names its own. Each pair is planned in its own two-station context, and
 * the four plans are read back under the hands-four's own station ids — so a
 * caller sees one figure over `1L`, `1R`, `2L` and `2R`, which is what every
 * check, every known-wrong row and every committed motion number is written
 * against.
 *
 * A figure that needs more of the set than a minor set holds — a pull by along
 * the line, a circulate, a wave of four — is **not** answered here and is
 * `undefined`. That is the honest answer: the lab measures it in a dance.
 */
export function figureOnFour(id: string): ContraFigure<ContraParams> | undefined {
  const found = CACHE.get(id);
  if (found !== undefined) return found.figure;
  const figure = buildOnFour(id);
  CACHE.set(id, { figure });
  return figure;
}

/**
 * Memoised, because `chainCalls` asks this of every call of every dance record
 * at **load** time and the answer involves planning the figure once to find
 * out. The definitions are module constants, so the answer cannot change.
 */
const CACHE = new Map<string, { figure: ContraFigure<ContraParams> | undefined }>();

function buildOnFour(id: string): ContraFigure<ContraParams> | undefined {
  const def = DATA_DEFINITIONS.find((each) => each.id === id);
  if (def === undefined) return undefined;
  if (!mintsPerPair(def)) return templateFigureOf(id) as ContraFigure<ContraParams> | undefined;
  const inner = interpretDefinition(def) as unknown as ContraFigure<ContraParams>;
  const figure = contraFigure<ContraParams>({
    id: inner.id,
    call: inner.call,
    ...(inner.describe === undefined ? {} : { describe: inner.describe }),
    lead: inner.lead,
    beats: inner.beats,
    defaults: inner.defaults as Omit<ContraParams, "beats" | "carried">,
    plan: (ctx, params) => planPairs(def, inner, ctx, params),
  });
  // **Asked, not assumed.** A pair figure whose shape also reads the lattice
  // needs a real set whatever its actors say, and the honest answer for it is
  // the same as for a pull by: there is no figure-alone row.
  try {
    const group = probeGroup(DUPLE_IMPROPER, 4, PROBE_FRAME);
    figure.sample(group, group.stations[0]!.id, 0, withDefaults(figure, {}, figure.beats));
    return figure;
  } catch {
    return undefined;
  }
}

/** Whether resolution would mint one instance of this definition per pair. */
const mintsPerPair = (def: FigureDefinition): boolean =>
  def.actors === "pairs" && def.roles.length === 2;

/** The four stations, planned two at a time, read back as one plan. */
function planPairs(
  def: FigureDefinition,
  inner: ContraFigure<ContraParams>,
  ctx: Parameters<ContraFigure<ContraParams>["plan"]>[0],
  params: ContraParams,
): FigurePlan {
  const pairs = pairsOnFour(inner.id, (params as { pairs?: Pairing }).pairs ?? "neighbors").filter(
    ([a, b]) => ctx.ids.includes(a) && ctx.ids.includes(b),
  );
  if (pairs.length === 0) throw new Error(`"${inner.id}": no pair of [${ctx.ids.join(", ")}]`);

  // **The instance's stations are the figure's own roles**, which is what
  // resolution mints: a `Group` per instance whose station ids are the
  // figure-role names, each carrying the cast dancer's current spot. So each
  // pair is re-presented under the definition's two role names, and the plan is
  // read back out under the hands-four's ids.
  const planned = pairs.map((pair) => {
    const roles = castPair(def, pair, ctx);
    const stations = pair.map((id, i) => {
      const station = ctx.stations.find((each) => each.id === id);
      if (station === undefined) throw new Error(`"${inner.id}": no station "${id}"`);
      return { ...station, id: roles[i]! };
    });
    const start: Spots = {};
    pair.forEach((id, i) => {
      start[roles[i]!] = ctx.spot(id);
    });
    const sub = planContext(stations, ctx.roleSet, ctx.spacing, start);
    const plan = inner.plan(sub, params);
    const byStation: Record<StationId, StationId> = {};
    const byRole: Record<StationId, StationId> = {};
    pair.forEach((id, i) => {
      byStation[id] = roles[i]!;
      byRole[roles[i]!] = id;
    });
    return { ids: pair, byStation, byRole, plan };
  });

  const ends: Spots = {};
  for (const { ids, byStation, plan } of planned) {
    for (const id of ids) {
      const end = plan.ends[byStation[id]!];
      if (end !== undefined) ends[id] = end;
    }
  }

  return {
    at(station, t) {
      const here = planned.find((each) => each.byStation[station] !== undefined);
      if (here === undefined) throw new Error(`"${inner.id}": "${station}" is in no pair`);
      return here.plan.at(here.byStation[station]!, t);
    },
    ends,
    // **Read back under the hands-four's ids**, joins included. An instance
    // holds hands between its own figure-roles — "the lark's right in the
    // robin's left" — and every reader out here (the seam checks, the chain's
    // carried holds, the renderer's one shared floor point) knows the four
    // stations by their hands-four names.
    joinsAt(t: Beat): HandJoin[] {
      return planned.flatMap(({ byRole, plan }) =>
        plan.joinsAt(t).map((join) => ({
          ...join,
          a: byRole[join.a] ?? join.a,
          b: byRole[join.b] ?? join.b,
        })),
      );
    },
  };
}

/**
 * The pairs of a hands-four a `pairs` word names, or a named refusal.
 *
 * `pairsOf` answers the two words a minor set has a table for and hands back
 * anything else unchanged, because a relation is the **set's** question and
 * `set/relations.ts` is what answers it. A hands-four has no lattice under it,
 * so a call that names one — "allemande N4", "roll away your shadow" — cannot
 * be planned here at all, and says so rather than failing later with
 * `pairsOf(...).filter is not a function`.
 *
 * `N1` is the exception, and it is not really one: neighbour one **is** the
 * neighbour a minor set holds, so it names the same two pairs the word does.
 */
function pairsOnFour(id: string, pairing: Pairing): readonly (readonly [StationId, StationId])[] {
  const pairs = pairsOf(pairing);
  if (Array.isArray(pairs)) return pairs as readonly (readonly [StationId, StationId])[];
  const word = String(pairing).trim().toLowerCase();
  if (word === "n1" || word === "neighbor" || word === "neighbour") return NEIGHBORS;
  if (word === "partner") return PARTNERS;
  throw new Error(
    `"${id}": "${String(pairing)}" is a relation only a set can resolve, not a pairing of a hands-four`,
  );
}

/**
 * Which of the definition's two roles each of a pair's two stations dances.
 *
 * `set/resolve.ts`'s own rule, narrowed to a pair: role names go by the
 * dancers' roles where the two differ, and by the order the pairing named them
 * where they do not (Q10, a same-role figure) or where the definition's roles
 * are not role names at all (`["a", "b"]`).
 */
function castPair(
  def: FigureDefinition,
  pair: readonly [StationId, StationId],
  ctx: Parameters<ContraFigure<ContraParams>["plan"]>[0],
): readonly [string, string] {
  const roles = def.roles as readonly [string, string];
  const byRole = roles.every((role) => role === "lark" || role === "robin");
  if (!byRole) return roles;
  const dancers = pair.map((id) => ctx.role(id));
  if (new Set(dancers).size < dancers.length) return roles;
  return [dancers[0]!, dancers[1]!] as readonly [string, string];
}
