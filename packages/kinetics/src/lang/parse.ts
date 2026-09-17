import type { Arg, CallStmt, Condition, SourceProgram, Span, Stmt } from "./ast.js";

/**
 * Read a program (DA6). Hand-written recursive descent over a hand-written
 * tokeniser; the language is small enough that a parser generator would be a
 * dependency and a build step in exchange for nothing.
 *
 * ```text
 * program   := statement*                         // separated by newlines or ";"
 * statement := name "=" "select" "(" word ")"     // a binding
 *            | name "(" [ arg { "," arg } ] ")"   // a call
 *            | "repeat" "(" number ")" block
 *            | ("if" | "when") "(" condition ")" block [ "else" block ]
 * condition  := name | "not" condition | "first-time" | "last-time"
 *            | name block                         // a definition
 * block     := "{" statement* "}"
 * arg       := word | number
 * name      := [a-z][a-z0-9-]*
 * ```
 *
 * `//` runs to the end of the line. A definition may be written after the
 * statement that calls it: the whole file is read before anything is compiled.
 * Statement separators are not required — every statement form is decided by
 * the token after its first name (`=`, `(` or `{`) — so a stray newline or
 * semicolon is never an error, and a missing one never changes the parse.
 *
 * Syntax errors throw a {@link ParseError} carrying the line and column; a
 * program that parses can still fail to compile (an unknown figure, a word
 * that is not a choice), and those are data, not exceptions.
 */
/** The bound name a condition tests, if it tests one. */
const boundNameOf = (condition: Condition): string =>
  condition.kind === "bound"
    ? condition.name
    : condition.kind === "not"
      ? boundNameOf(condition.of)
      : "";

export function parse(source: string): SourceProgram {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (ahead = 0): Token => tokens[Math.min(pos + ahead, tokens.length - 1)] as Token;
  const take = (): Token => {
    const token = peek();
    if (token.kind !== "end") pos += 1;
    return token;
  };
  const isPunct = (text: string, ahead = 0): boolean => {
    const token = peek(ahead);
    return token.kind === "punct" && token.text === text;
  };
  const fail = (token: Token, message: string): never => {
    throw parseError(message, token.line, token.col, token.start);
  };
  const expectPunct = (text: string, what: string): Token => {
    const token = peek();
    if (!isPunct(text)) fail(token, `expected "${text}" ${what}, found ${describe(token)}`);
    return take();
  };
  const expectName = (what: string): Token => {
    const token = peek();
    if (token.kind !== "name") fail(token, `expected ${what}, found ${describe(token)}`);
    return take();
  };
  const span = (first: Token, last: Token): Span => ({
    start: first.start,
    end: last.end,
    line: first.line,
  });

  const parseBlock = (what: string): Stmt[] => {
    expectPunct("{", what);
    const body: Stmt[] = [];
    while (!isPunct("}")) {
      if (peek().kind === "end") fail(peek(), `expected "}" to close ${what}`);
      body.push(parseStmt());
    }
    expectPunct("}", what);
    return body;
  };

  const parseArgs = (name: Token): { args: Arg[]; close: Token } => {
    expectPunct("(", `after "${name.text}"`);
    const args: Arg[] = [];
    while (!isPunct(")")) {
      const token = take();
      if (token.kind === "name") {
        args.push({ kind: "word", value: token.text, span: span(token, token) });
      } else if (token.kind === "number") {
        args.push({ kind: "number", value: Number(token.text), span: span(token, token) });
      } else if (token.kind === "string") {
        args.push({ kind: "string", value: token.text, span: span(token, token) });
      } else {
        fail(token, `expected an argument to "${name.text}", found ${describe(token)}`);
      }
      if (isPunct(",")) take();
      else break;
    }
    const close = expectPunct(")", `to close "${name.text}("`);
    return { args, close };
  };

  const parseCall = (name: Token): CallStmt => {
    const { args, close } = parseArgs(name);
    return { kind: "call", name: name.text, args, span: span(name, close) };
  };

  /** `name` | `not` condition | `first-time` | `last-time`. */
  const parseCondition = (): Condition => {
    const word = expectName("a condition: a bound name, first-time, last-time, or not …");
    if (word.text === "not") return { kind: "not", of: parseCondition() };
    if (word.text === "first-time") return { kind: "first-time" };
    if (word.text === "last-time") return { kind: "last-time" };
    return { kind: "bound", name: word.text };
  };

  const parseStmt = (): Stmt => {
    const first = peek();
    if (first.kind !== "name") fail(first, `expected a statement, found ${describe(first)}`);

    if (first.text === "repeat" && isPunct("(", 1)) {
      take();
      expectPunct("(", 'after "repeat"');
      const count = peek();
      if (count.kind !== "number") fail(count, `expected how many times, found ${describe(count)}`);
      take();
      const times = Number(count.text);
      if (!Number.isInteger(times)) fail(count, `repeat needs a whole number, not ${count.text}`);
      expectPunct(")", 'to close "repeat("');
      const body = parseBlock('"repeat"');
      return { kind: "repeat", times, body, span: { ...span(first, first), end: lastEnd() } };
    }

    if ((first.text === "if" || first.text === "when") && isPunct("(", 1)) {
      take();
      expectPunct("(", `after "${first.text}"`);
      const condition = parseCondition();
      expectPunct(")", `to close "${first.text}("`);
      const then = parseBlock(`"${first.text}"`);
      let otherwise: Stmt[] = [];
      if (peek().kind === "name" && peek().text === "else") {
        take();
        otherwise = parseBlock('"else"');
      }
      return {
        kind: "if",
        name: boundNameOf(condition),
        condition,
        then,
        else: otherwise,
        span: { ...span(first, first), end: lastEnd() },
      };
    }

    take();
    if (isPunct("=")) {
      take();
      const select = expectName(`"select" after "${first.text} ="`);
      if (select.text !== "select") {
        fail(select, `only "select" can bind a name, found "${select.text}"`);
      }
      expectPunct("(", 'after "select"');
      const selector = expectName("a selector word");
      const close = expectPunct(")", 'to close "select("');
      return {
        kind: "select",
        name: first.text,
        selector: selector.text,
        span: span(first, close),
      };
    }
    if (isPunct("(")) return parseCall(first);
    if (isPunct("{")) {
      const body = parseBlock(`"${first.text}"`);
      return {
        kind: "define",
        name: first.text,
        body,
        span: { ...span(first, first), end: lastEnd() },
      };
    }
    return fail(
      peek(),
      `expected "=", "(" or "{" after "${first.text}", found ${describe(peek())}`,
    );
  };

  /** The end of the token just consumed — a block's closing brace. */
  const lastEnd = (): number => (tokens[pos - 1] as Token | undefined)?.end ?? 0;

  const statements: Stmt[] = [];
  while (peek().kind !== "end") {
    if (isPunct("}")) fail(peek(), 'unexpected "}"');
    statements.push(parseStmt());
  }
  return { statements, source };
}

/** A syntax error, with the place to put the caret. */
export interface ParseError extends Error {
  name: "ParseError";
  /** 1-based. */
  line: number;
  /** 1-based, in characters. */
  col: number;
  /** Offset into the source. */
  offset: number;
}

export const isParseError = (error: unknown): error is ParseError =>
  error instanceof Error && error.name === "ParseError";

const parseError = (message: string, line: number, col: number, offset: number): ParseError =>
  Object.assign(new Error(`${message} (line ${line}, column ${col})`), {
    name: "ParseError" as const,
    line,
    col,
    offset,
  });

interface Token {
  kind: "name" | "number" | "string" | "punct" | "end";
  text: string;
  start: number;
  end: number;
  line: number;
  col: number;
}

const PUNCT = "(){},;=";

const describe = (token: Token): string =>
  token.kind === "end" ? "the end of the program" : `"${token.text}"`;

const isNameStart = (c: string): boolean => c >= "a" && c <= "z";
const isNameChar = (c: string): boolean => isNameStart(c) || (c >= "0" && c <= "9") || c === "-";
const isDigit = (c: string): boolean => c >= "0" && c <= "9";

/**
 * Words, numbers and punctuation. Newlines and `;` are skipped: they separate
 * statements for a reader, and the grammar does not need them. Numbers are
 * unsigned — no figure takes a negative argument, and `a-1` is one name.
 */
const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  const at = (i: number): string => source[i] ?? "";
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const col = (): number => i - lineStart + 1;

  while (i < source.length) {
    const c = at(i);
    if (c === "\n") {
      i += 1;
      line += 1;
      lineStart = i;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === ";") {
      i += 1;
      continue;
    }
    if (c === '"') {
      // A quoted string, to the next quote on the same line: a hey's pass list.
      const start = i;
      const startCol = col();
      i += 1;
      while (i < source.length && at(i) !== '"' && at(i) !== "\n") i += 1;
      if (at(i) !== '"') {
        throw parseError(
          `a string opened at line ${line}, column ${startCol} has no closing quote`,
          line,
          startCol,
          start,
        );
      }
      tokens.push({
        kind: "string",
        text: source.slice(start + 1, i),
        start,
        end: i + 1,
        line,
        col: startCol,
      });
      i += 1;
      continue;
    }
    if (c === "/" && at(i + 1) === "/") {
      while (i < source.length && at(i) !== "\n") i += 1;
      continue;
    }
    const start = i;
    const startCol = col();
    if (isNameStart(c)) {
      while (i < source.length && isNameChar(at(i))) i += 1;
      tokens.push({
        kind: "name",
        text: source.slice(start, i),
        start,
        end: i,
        line,
        col: startCol,
      });
      continue;
    }
    if (isDigit(c)) {
      while (i < source.length && isDigit(at(i))) i += 1;
      if (at(i) === "." && isDigit(at(i + 1))) {
        i += 1;
        while (i < source.length && isDigit(at(i))) i += 1;
      }
      tokens.push({
        kind: "number",
        text: source.slice(start, i),
        start,
        end: i,
        line,
        col: startCol,
      });
      continue;
    }
    if (PUNCT.includes(c)) {
      i += 1;
      tokens.push({ kind: "punct", text: c, start, end: i, line, col: startCol });
      continue;
    }
    throw parseError(`unexpected character "${c}"`, line, startCol, start);
  }
  tokens.push({ kind: "end", text: "", start: i, end: i, line, col: col() });
  return tokens;
};
