import type { AnyFigureDef, FigureRegistry } from "@caller/choreo";
import { WALK_TO_STATION, createFigureRegistry } from "@caller/choreo";
import type { ContraFigure } from "./ContraFigure.js";
import { allemande } from "./allemande.js";
import { balance, balanceRing } from "./balance.js";
import { balanceAndSwing } from "./balance-and-swing.js";
import { californiaTwirl } from "./california-twirl.js";
import { circle } from "./circle.js";
import { doSiDo } from "./do-si-do.js";
import { longLines } from "./long-lines.js";
import { passThrough } from "./pass-through.js";
import { petronella } from "./petronella.js";
import { rightAndLeftThrough } from "./right-and-left-through.js";
import { robinsChain } from "./robins-chain.js";
import { rollAway } from "./roll-away.js";
import { slideLeft } from "./slide-left.js";
import { star } from "./star.js";
import { swing } from "./swing.js";
import { waitOut } from "./wait-out.js";
import { dataOnlyFigures } from "../library/figures/index.js";

/**
 * Every contra figure, by id, in the order the README's table lists them.
 *
 * `wait-out` and `walk-to-station` are in the registry rather than this table:
 * the decider needs both whether a dance calls them or not — one for the couple
 * with nobody to dance with, one for the dancers a `who` leaves out — and
 * neither is a figure a dance calls. `wait-out` is the contra wrapper in
 * `wait-out.ts`, which reads the crossing off the formation.
 */
export const CONTRA_FIGURES = {
  balance,
  "balance-ring": balanceRing,
  swing,
  "balance-and-swing": balanceAndSwing,
  allemande,
  "do-si-do": doSiDo,
  "long-lines": longLines,
  circle,
  star,
  petronella,
  "california-twirl": californiaTwirl,
  "right-and-left-through": rightAndLeftThrough,
  "robins-chain": robinsChain,
  "pass-through": passThrough,
  "roll-away": rollAway,
  "slide-left": slideLeft,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as const satisfies Record<string, ContraFigure<any>>;

/** The id of one of {@link CONTRA_FIGURES}. */
export type ContraFigureId = keyof typeof CONTRA_FIGURES;

/** Every contra figure id, in the README's order. */
export const CONTRA_FIGURE_IDS: readonly ContraFigureId[] = Object.keys(
  CONTRA_FIGURES,
) as ContraFigureId[];

/** The figures as a plain list, for a registry or a table. */
export const contraFigureList = (): AnyFigureDef[] =>
  CONTRA_FIGURE_IDS.map((id) => CONTRA_FIGURES[id] as AnyFigureDef);

/**
 * A figure id to a partial override of its tuning defaults — `?chain=` is the
 * first user of this, picking one of `robins-chain`'s four courtesy-turn
 * candidates for the whole page. `withDefaults` already merges a call's own
 * `params` over a figure's `defaults`; this is the same merge, done once at
 * registry build time instead of per call, so every consumer of the registry
 * (a gallery tile, a seam, the decider) picks the override up with no further
 * plumbing.
 */
export type FigureDefaultsOverride = Readonly<Record<string, object>>;

/**
 * A registry holding every contra figure, plus the two the engine supplies.
 *
 * Every id in it has been checked against its own `id` field, so a typo in the
 * table above is a test failure rather than a dance that cannot be danced.
 *
 * **A figure that exists only as data is in it too** (M5). `CONTRA_FIGURES`
 * above is the *coded* layer and it is shrinking: the hey is a
 * `FigureDefinition` now and M6's pull-by and grand right and left never had a
 * coded form at all. `poseAt` resolves a figure **by id in the registry**, so a
 * figure the registry does not hold is a figure nothing can draw — Butter's own
 * hey included, on the old planner as much as the new one. So the library's
 * data-only definitions are interpreted and seeded here, before `extra`, and a
 * caller that passes `contraDataFigures()` still replaces them (same ids, later
 * wins).
 *
 * `overrides` replaces a figure's own tuning defaults with `{ ...defaults,
 * ...override }` before it goes in the registry; a figure not named in
 * `overrides` is unchanged. See {@link FigureDefaultsOverride}. Note that it
 * reaches the coded figures only — a data figure arrives past the merge, which
 * is M4's own finding and goes when the coded layer does (M11).
 */
export function createContraRegistry(
  extra: readonly AnyFigureDef[] = [],
  overrides: FigureDefaultsOverride = {},
): FigureRegistry {
  const figures = contraFigureList().map((def) => {
    const override = overrides[def.id];
    return override === undefined ? def : { ...def, defaults: { ...def.defaults, ...override } };
  });
  return createFigureRegistry([
    ...figures,
    waitOut as AnyFigureDef,
    WALK_TO_STATION as AnyFigureDef,
    ...dataOnlyFigures(),
    ...extra,
  ]);
}

/** The contra figure with this id, or `undefined` if the engine supplied it. */
export const contraFigureOf = (id: string): ContraFigure | undefined =>
  (CONTRA_FIGURES as Record<string, ContraFigure>)[id];
