/**
 * The evening: the one thing that is not per dancer (§5).
 *
 * A dance is **one time through**. The evening lays the floor once, runs the
 * dance `n` times against it, and owns `first-time` and `last-time`; the tree
 * and who stands where carry from one time to the next, so the couple that
 * went out at the top of time 2 is the couple waiting at the start of time 3.
 * It is a TypeScript runner and not syntax, on the user's ruling (*"cross
 * dance isn't really needed and may overcomplicate"*, 18:0x); the language for
 * an evening is future work.
 */
import type { Diagnostic } from "../diagnostics/Diagnostic.js";
import type { DanceRef } from "./buildTree.js";
import { buildTree, findDance } from "./buildTree.js";
import type { Program } from "./loadForEval.js";
import { positionsOf, runDance } from "./runDance.js";
import type { Snapshot, TimeResult } from "./timeline.js";
import type { Tree } from "./tree.js";
import type { Value } from "./value.js";
import { num } from "./value.js";

export interface EveningResult {
  dance: string;
  tree: Tree;
  times: TimeResult[];
  /** After setup, and after every commit of every time through. */
  snapshots: Snapshot[];
  diagnostics: Diagnostic[];
}

export interface EveningOptions {
  /** How many times through. */
  times?: number;
  /** The hall's facts, which arrive as the dance's parameters. */
  args?: Readonly<Record<string, Value>>;
  /** Stop after the first time that produced a diagnostic. */
  stopOnDiagnostic?: boolean;
  maxBeats?: number;
}

/**
 * Run a dance `times` times through. `args` are the hall's facts
 * (`{ "minor-sets": num(3) }`); a parameter the evening does not say takes
 * the declaration's default.
 */
export function runEvening(
  program: Program,
  dance: DanceRef,
  options: EveningOptions = {},
): EveningResult {
  const times = options.times ?? 1;
  const args = options.args ?? {};
  const built = buildTree(program, dance, args);
  const result: EveningResult = {
    dance: dance.decl.name,
    tree: built.tree,
    times: [],
    snapshots: [{ time: 0, beat: 0, at: "setup", positions: positionsOf(built.tree) }],
    diagnostics: [...built.diagnostics],
  };
  if (built.diagnostics.length > 0) return result;

  for (let time = 1; time <= times; time += 1) {
    const ran = runDance(program, built.tree, dance, args, {
      time,
      firstTime: time === 1,
      lastTime: time === times,
      ...(options.maxBeats === undefined ? {} : { maxBeats: options.maxBeats }),
    });
    result.times.push(ran);
    result.snapshots.push(...ran.snapshots);
    result.diagnostics.push(...ran.diagnostics);
    if (ran.diagnostics.length > 0 && options.stopOnDiagnostic !== false) break;
  }
  return result;
}

/** `runEvening` from a dance's name, for the CLI and the playground. */
export function runEveningNamed(
  program: Program,
  danceName: string,
  options: EveningOptions & { module?: string } = {},
): EveningResult | undefined {
  const dance = findDance(program, danceName, options.module);
  return dance === undefined ? undefined : runEvening(program, dance, options);
}

/** `{ "minor-sets": 3 }` as the values a dance's parameters want. */
export const hallFacts = (facts: Readonly<Record<string, number>>): Record<string, Value> =>
  Object.fromEntries(Object.entries(facts).map(([name, value]) => [name, num(value)]));
