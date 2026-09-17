import type { FigureIR } from "../ir/Figure.js";
import { allemande } from "./allemande.js";
import { bow } from "./bow.js";
import { doSiDo } from "./doSiDo.js";
import { balance } from "./balance.js";
import { circle } from "./circle.js";
import { longLines } from "./longLines.js";
import { shift } from "./shift.js";
import { swing } from "./swing.js";

/**
 * Every figure the compiler knows, by the name a call uses. A figure's `id`
 * is its key: `figureNamed` is the only lookup, so a program that says a word
 * this table has not got is a compile error with the call's span, never a
 * silent stand.
 *
 * The pair's three, and Butter's at floor level (shift, circle, swing, long
 * lines, balance; the chain and the hey follow) — more data, not more code.
 */
export const FIGURES: FigureRegistry = {
  [bow.id]: bow,
  [doSiDo.id]: doSiDo,
  [allemande.id]: allemande,
  [shift.id]: shift,
  [circle.id]: circle,
  [swing.id]: swing,
  [longLines.id]: longLines,
  [balance.id]: balance,
};

/** The figures a compile is run against. */
export type FigureRegistry = Readonly<Record<string, FigureIR>>;

/** The figure a call names, or `undefined` when the registry has not got it. */
export const figureNamed = (registry: FigureRegistry, name: string): FigureIR | undefined =>
  Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;
