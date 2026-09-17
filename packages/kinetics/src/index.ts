// @caller/kinetics — engine 3: a compiler from a dance program to proved
// motion. Nothing imports this package (D11); see README.md.
export const KINETICS = "engine 3" as const;

// the language: source text → a per-dancer compiled sequence
export type {
  Arg,
  CallStmt,
  DefineStmt,
  IfStmt,
  RepeatStmt,
  SelectStmt,
  SourceProgram,
  Span,
  Stmt,
} from "./lang/ast.js";
export type { ParseError } from "./lang/parse.js";
export { isParseError, parse } from "./lang/parse.js";
export type { CompileError, CompiledCall, CompiledSequence } from "./lang/compile.js";
export { compile } from "./lang/compile.js";
export { FIXTURE_PROGRAM } from "./lang/fixture.js";

// the IR: a figure as timed constraints
export type {
  Arrangement,
  CastRule,
  Choice,
  Contract,
  FigureBeats,
  FigureIR,
  HoldRef,
  IntrinsicLine,
  IntrinsicOp,
  LookRule,
  LookTarget,
  NumberValue,
  OrbitSense,
  ParamSpec,
  Params,
  Role,
  Window,
} from "./ir/Figure.js";
export { beatsOf, defaultParams, resolveChoice, resolveNumber } from "./ir/Figure.js";
export type { Hand, HoldId } from "./ir/Hold.js";
export { HANDS, HOLD_IDS } from "./ir/Hold.js";
export { printFigure } from "./ir/print.js";

// the figures, as data
export type { FigureRegistry } from "./figures/registry.js";
export { FIGURES, figureNamed } from "./figures/registry.js";
export { allemande } from "./figures/allemande.js";
export { bow } from "./figures/bow.js";
export { doSiDo } from "./figures/doSiDo.js";

// the dialect: who is on the floor, and what a selector word means
export type { DancerId, DancerState, Dialect, DialectId, SetState } from "./dialect/Dialect.js";
export { unknownSelector } from "./dialect/Dialect.js";
export { PAIR, PAIR_SOLO } from "./dialect/pair/Pair.js";
