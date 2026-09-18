/**
 * `@caller/lang` — the dance language, draft 3.
 *
 * P1 is syntax: a lexer, a parser and the tree they build, with every node
 * spanned and every complaint a {@link Diagnostic}. P2 adds the checker and
 * P3 the evaluator; both hang off {@link parseFile}'s tree.
 */
export { parseFile, moduleNameOf } from "./syntax/parser.js";
export type { ParseResult } from "./syntax/parser.js";

export { tokenize, isKebab, isTitle, isSyntaxFailure, syntaxFailure } from "./syntax/lexer.js";
export type { Comment, Lexed, SyntaxFailure, Token, TokenKind } from "./syntax/lexer.js";

export * from "./syntax/ast.js";

export { check, checkProgram } from "./check/check.js";
export type { CheckResult } from "./check/check.js";
export type {
  Binding,
  CalleeBinding,
  CursorRead,
  EnumInfo,
  FnInfo,
  GroupInfo,
  IdValue,
  KindBinding,
  PathShape,
  PathStep,
  Resolution,
} from "./check/resolution.js";

export { loadProgram, loadTexts, PRELUDE } from "./load.js";
export type { LoadOptions, Module, ModuleFinder, Program } from "./load.js";

/**
 * P3, the evaluator: `setup` once for nobody, then the script once per dancer,
 * and an evening that repeats one time through. Its own light module index
 * (`eval/loadForEval.ts`) is separate from {@link loadProgram} until the two
 * are converged, so its `Program` is exported from `./eval/index.js` rather
 * than from here.
 */
export {
  buildTree,
  contractKinds,
  findDance,
  hallFacts,
  loadDanceDir,
  loadForEval,
  positionsOf,
  printTime,
  printTimeline,
  printTree,
  runDance,
  runEvening,
  runEveningNamed,
} from "./eval/index.js";
export type {
  BuildResult,
  CardRecord,
  Dancer,
  DanceRef,
  EventRecord,
  EveningOptions,
  EveningResult,
  Frame,
  Move,
  MoveArg,
  Node,
  Position,
  RunOptions,
  Snapshot,
  TimeResult,
  Tree,
  Value,
} from "./eval/index.js";

export { diagnostic } from "./diagnostics/Diagnostic.js";
export type { Diagnostic, Fact, Source, Stage } from "./diagnostics/Diagnostic.js";
export { CODES, explain } from "./diagnostics/codes.js";
export { renderText, renderJson, lineAt } from "./diagnostics/render.js";
