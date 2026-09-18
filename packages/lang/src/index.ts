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

export { diagnostic } from "./diagnostics/Diagnostic.js";
export type { Diagnostic, Fact, Source, Stage } from "./diagnostics/Diagnostic.js";
export { CODES, explain } from "./diagnostics/codes.js";
export { renderText, renderJson, lineAt } from "./diagnostics/render.js";
