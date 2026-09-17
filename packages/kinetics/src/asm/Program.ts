import type { DancerId } from "../dialect/Dialect.js";
import type { Slot } from "./Instruction.js";

/** One dancer's whole assembly, slots in time order. */
export interface Program {
  dancer: DancerId;
  slots: readonly Slot[];
}

export const slotAt = (program: Program, beat: number, half: 0 | 1): Slot | undefined =>
  program.slots.find((s) => s.beat === beat && s.half === half);

/** The slots of one beat, on-beat first. */
export const slotsOfBeat = (program: Program, beat: number): Slot[] =>
  program.slots.filter((s) => s.beat === beat);

/** The last beat any slot mentions, plus one. */
export const programEnd = (program: Program): number =>
  program.slots.reduce((end, s) => Math.max(end, s.beat + 1), 0);
