import type { FigureIR } from "../ir/Figure.js";
import { allemande } from "./allemande.js";
import { bow } from "./bow.js";
import { doSiDo } from "./doSiDo.js";
import { balance } from "./balance.js";
import { chain } from "./chain.js";
import { circle } from "./circle.js";
import { balanceWave } from "./balanceWave.js";
import { formWave } from "./formWave.js";
import { hey } from "./hey.js";
import { longLines } from "./longLines.js";
import { madRobin } from "./madRobin.js";
import { shift } from "./shift.js";
import { shoulderRound } from "./shoulderRound.js";
import { singleFilePromenade } from "./singleFilePromenade.js";
import { stand } from "./stand.js";
import { swing } from "./swing.js";
import { waitOut } from "./waitOut.js";

/**
 * Every figure the compiler knows, by the name a call uses. A figure's `id`
 * is its key: `figureNamed` is the only lookup, so a program that says a word
 * this table has not got is a compile error with the call's span, never a
 * silent stand.
 *
 * The pair's three, Butter whole (shift, circle, swing, long lines, chain,
 * hey, balance) and Robins on a Wire's (mad robin, form-wave, balance-wave,
 * single-file promenade, shoulder round, stand) — more data, not more code.
 */
export const FIGURES: FigureRegistry = {
  [bow.id]: bow,
  [doSiDo.id]: doSiDo,
  [allemande.id]: allemande,
  [shift.id]: shift,
  [circle.id]: circle,
  [swing.id]: swing,
  [longLines.id]: longLines,
  [chain.id]: chain,
  [hey.id]: hey,
  [balance.id]: balance,
  [waitOut.id]: waitOut,
  [madRobin.id]: madRobin,
  [formWave.id]: formWave,
  [balanceWave.id]: balanceWave,
  [singleFilePromenade.id]: singleFilePromenade,
  [shoulderRound.id]: shoulderRound,
  [stand.id]: stand,
};

/** The figures a compile is run against. */
export type FigureRegistry = Readonly<Record<string, FigureIR>>;

/** The figure a call names, or `undefined` when the registry has not got it. */
export const figureNamed = (registry: FigureRegistry, name: string): FigureIR | undefined =>
  Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;
