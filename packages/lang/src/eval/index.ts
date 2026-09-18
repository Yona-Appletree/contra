/**
 * The evaluator: the two passes, the evening that repeats one of them, and the
 * two text dumps a test and the CLI read.
 *
 * ```ts
 * const program = loadDanceDir("packages/lang/dances");
 * const dance = findDance(program, "butter");
 * const evening = runEvening(program, dance, { times: 7, args: hallFacts({ "minor-sets": 3 }) });
 * console.log(printTree(evening.tree));
 * console.log(printTimeline(evening));
 * ```
 */
export { buildTree, findDance } from "./buildTree.js";
export type { BuildResult, DanceRef } from "./buildTree.js";

export { contractKinds, positionsOf, runDance } from "./runDance.js";
export type { RunOptions } from "./runDance.js";

export { hallFacts, runEvening, runEveningNamed } from "./runEvening.js";
export type { EveningOptions, EveningResult } from "./runEvening.js";

export { loadDanceDir, loadForEval, findFn, findGroup, findEnum, PRELUDE } from "./loadForEval.js";
export type { Module, Program } from "./loadForEval.js";

export { printTree } from "./printTree.js";
export { printTime, printTimeline } from "./printTimeline.js";

export type {
  CardRecord,
  EventRecord,
  Move,
  MoveArg,
  MoveRef,
  Position,
  Snapshot,
  TimeResult,
} from "./timeline.js";

export { ancestorOfKind, kindsOf, nodesOfKind, placesUnder, shortPath } from "./tree.js";
export type { Dancer, Node, Tree } from "./tree.js";

export { compose, facing, originFrame, showFrame } from "./frame.js";
export type { Frame } from "./frame.js";

export { num, showValue } from "./value.js";
export type { Value } from "./value.js";
