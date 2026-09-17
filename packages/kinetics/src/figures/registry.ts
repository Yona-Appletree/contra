import type { FigureIR } from "../ir/Figure.js";
import { allemande } from "./allemande.js";
import { bow } from "./bow.js";
import { doSiDo } from "./doSiDo.js";

/**
 * Every figure the compiler knows, by the name a call uses. A figure's `id`
 * is its key: `figureNamed` is the only lookup, so a program that says a word
 * this table has not got is a compile error with the call's span, never a
 * silent stand.
 *
 * Three tonight. Butter needs the rest (shift, circle, swing, long lines,
 * chain, hey, balance) and they arrive as more data, not more code.
 */
export const FIGURES: FigureRegistry = {
  [bow.id]: bow,
  [doSiDo.id]: doSiDo,
  [allemande.id]: allemande,
};

/** The figures a compile is run against. */
export type FigureRegistry = Readonly<Record<string, FigureIR>>;

/** The figure a call names, or `undefined` when the registry has not got it. */
export const figureNamed = (registry: FigureRegistry, name: string): FigureIR | undefined =>
  Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;
