import type { AnyFigureDef, FigureRegistry } from "@caller/choreo";
import { WALK_TO_STATION, createFigureRegistry } from "@caller/choreo";
import type { ContraFigure } from "./ContraFigure.js";
import { allemande } from "./allemande.js";
import { balance, balanceRing } from "./balance.js";
import { balanceAndSwing } from "./balance-and-swing.js";
import { californiaTwirl } from "./california-twirl.js";
import { circle } from "./circle.js";
import { diamond } from "./diamond.js";
import { doSiDo } from "./do-si-do.js";
import { downTheHall } from "./down-the-hall.js";
import { hey } from "./hey.js";
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
  "down-the-hall": downTheHall,
  circle,
  star,
  petronella,
  diamond,
  "california-twirl": californiaTwirl,
  "right-and-left-through": rightAndLeftThrough,
  "robins-chain": robinsChain,
  "pass-through": passThrough,
  "roll-away": rollAway,
  "slide-left": slideLeft,
  hey,
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
 * A registry holding every contra figure, plus the two the engine supplies.
 *
 * Every id in it has been checked against its own `id` field, so a typo in the
 * table above is a test failure rather than a dance that cannot be danced.
 */
export function createContraRegistry(extra: readonly AnyFigureDef[] = []): FigureRegistry {
  return createFigureRegistry([
    ...contraFigureList(),
    waitOut as AnyFigureDef,
    WALK_TO_STATION as AnyFigureDef,
    ...extra,
  ]);
}

/** The contra figure with this id, or `undefined` if the engine supplied it. */
export const contraFigureOf = (id: string): ContraFigure | undefined =>
  (CONTRA_FIGURES as Record<string, ContraFigure>)[id];
