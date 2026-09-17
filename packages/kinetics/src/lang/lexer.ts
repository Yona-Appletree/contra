/**
 * Tokens of the `.dance` language (P1 of the dance-language plan).
 *
 * The lexer decides the language's casing rule, because casing is not a
 * style here but a grammar (the user: *"languages should opine about casing,
 * formatting etc."*): a `name` is kebab-case — `[a-z][a-z0-9-]*`, not ending
 * in `-` — and a `cap` is TitleCase — `[A-Z][A-Za-z0-9]*` — used for types
 * and enum members and told apart by position. `minorSet`, `Minor-Set` and
 * `minor_set` are lex errors that say so. `$name` is one token, the only
 * sigil (the one-sigil rule, notes Q… R3).
 *
 * `a-b` is one name and `a - b` is a subtraction: a hyphen inside a word
 * belongs to the word, and the operator needs the spaces. A number may carry
 * a unit glued on (`0.6m`, `60cm`); the parser says which units exist.
 * Newlines are whitespace. `//` runs to the end of the line and is kept as a
 * comment token on the side, for the formatter.
 */
export type TokenKind = "name" | "cap" | "dyn" | "number" | "string" | "punct" | "end";

export interface Token {
  kind: TokenKind;
  /** The name without its `$`, the string without its quotes, the number's digits, the punct itself. */
  text: string;
  /** For a number: its unit, or "" when it has none. */
  unit?: string;
  start: number;
  end: number;
  /** 1-based. */
  line: number;
  /** 1-based, in characters. */
  col: number;
}

/** A `//` comment, kept out of the token stream for the formatter. */
export interface Comment {
  /** Without the `//` and without the trailing newline; leading space trimmed. */
  text: string;
  start: number;
  end: number;
  line: number;
}

/** A syntax error, with the place to put the caret. */
export interface SyntaxError extends Error {
  name: "SyntaxError";
  line: number;
  col: number;
  offset: number;
}

export const isSyntaxError = (error: unknown): error is SyntaxError =>
  error instanceof Error && error.name === "SyntaxError";

export const syntaxError = (
  message: string,
  line: number,
  col: number,
  offset: number,
): SyntaxError =>
  Object.assign(new Error(`${message} (line ${String(line)}, column ${String(col)})`), {
    name: "SyntaxError" as const,
    line,
    col,
    offset,
  });

/** Two-character operators first, so `<=` is not `<` then `=`. */
const PUNCT3 = ["..="];
const PUNCT2 = ["<=", ">=", "==", "!=", "..", "=>"];
const PUNCT1 = "(){},;=.:+-*/<>%_";

const isLower = (c: string): boolean => c >= "a" && c <= "z";
const isUpper = (c: string): boolean => c >= "A" && c <= "Z";
const isDigit = (c: string): boolean => c >= "0" && c <= "9";
const isWordChar = (c: string): boolean =>
  isLower(c) || isUpper(c) || isDigit(c) || c === "-" || c === "_";

export interface Lexed {
  tokens: Token[];
  comments: Comment[];
}

export function tokenize(source: string): Lexed {
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  const at = (i: number): string => source[i] ?? "";
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const col = (): number => i - lineStart + 1;
  const push = (kind: TokenKind, text: string, start: number, startCol: number, unit?: string) => {
    const token: Token = { kind, text, start, end: i, line, col: startCol };
    if (unit !== undefined) token.unit = unit;
    tokens.push(token);
  };

  while (i < source.length) {
    const c = at(i);
    if (c === "\n") {
      i += 1;
      line += 1;
      lineStart = i;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i += 1;
      continue;
    }
    const start = i;
    const startCol = col();
    if (c === "/" && at(i + 1) === "/") {
      while (i < source.length && at(i) !== "\n") i += 1;
      comments.push({ text: source.slice(start + 2, i).trim(), start, end: i, line });
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < source.length && at(i) !== '"' && at(i) !== "\n") i += 1;
      if (at(i) !== '"') {
        throw syntaxError("a string has no closing quote on its line", line, startCol, start);
      }
      i += 1;
      push("string", source.slice(start + 1, i - 1), start, startCol);
      continue;
    }
    if (c === "$") {
      i += 1;
      const wordStart = i;
      while (i < source.length && isWordChar(at(i))) i += 1;
      const word = source.slice(wordStart, i);
      if (word === "" || !isKebab(word)) {
        throw syntaxError(
          `"$${word}" is not a variable: $ is followed by a kebab-case name`,
          line,
          startCol,
          start,
        );
      }
      push("dyn", word, start, startCol);
      continue;
    }
    if (isDigit(c)) {
      while (i < source.length && isDigit(at(i))) i += 1;
      // `0.5` is a decimal; `0..n` is a range.
      if (at(i) === "." && isDigit(at(i + 1))) {
        i += 1;
        while (i < source.length && isDigit(at(i))) i += 1;
      }
      const digits = source.slice(start, i);
      const unitStart = i;
      while (i < source.length && isLower(at(i))) i += 1;
      push("number", digits, start, startCol, source.slice(unitStart, i));
      continue;
    }
    if (c === "_" && !isWordChar(at(i + 1))) {
      // A lone `_`: the wildcard of a match.
      i += 1;
      push("punct", "_", start, startCol);
      continue;
    }
    if (isLower(c) || isUpper(c) || c === "_") {
      while (i < source.length && isWordChar(at(i))) i += 1;
      const word = source.slice(start, i);
      if (isKebab(word)) push("name", word, start, startCol);
      else if (isTitle(word)) push("cap", word, start, startCol);
      else {
        throw syntaxError(
          `"${word}" is neither a name nor a type: names are kebab-case (minor-set), types and enum members TitleCase (MinorSet)`,
          line,
          startCol,
          start,
        );
      }
      continue;
    }
    const three = source.slice(i, i + 3);
    if (PUNCT3.includes(three)) {
      i += 3;
      push("punct", three, start, startCol);
      continue;
    }
    const two = source.slice(i, i + 2);
    if (PUNCT2.includes(two)) {
      i += 2;
      push("punct", two, start, startCol);
      continue;
    }
    if (PUNCT1.includes(c)) {
      i += 1;
      push("punct", c, start, startCol);
      continue;
    }
    throw syntaxError(`unexpected character "${c}"`, line, startCol, start);
  }
  tokens.push({ kind: "end", text: "", start: i, end: i, line, col: col() });
  return { tokens, comments };
}

/** `[a-z][a-z0-9-]*`, not ending in a hyphen. */
export const isKebab = (word: string): boolean =>
  /^[a-z][a-z0-9-]*$/.test(word) && !word.endsWith("-");

/** `[A-Z][A-Za-z0-9]*`. */
export const isTitle = (word: string): boolean => /^[A-Z][A-Za-z0-9]*$/.test(word);
