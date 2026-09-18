import type { Diagnostic } from "../diagnostics/Diagnostic.js";
import { diagnostic } from "../diagnostics/Diagnostic.js";
import type { Span } from "./ast.js";
import { UNITS } from "./ast.js";

/**
 * Tokens of the `.dance` language, draft 3.
 *
 * The lexer decides the casing rule, because casing is not a style here but a
 * grammar (the user: *"languages should opine about casing, formatting etc."*):
 * a `name` is kebab-case — `[a-z][a-z0-9-]*`, not ending in `-` — and a `cap`
 * is TitleCase — `[A-Z][A-Za-z0-9]*` — used for groups, types and enum
 * members, told apart by position. `minorSet`, `Minor-Set` and `minor_set` are
 * lex errors that say so (`L002`).
 *
 * `a-b` is one name and `a - b` is a subtraction: a hyphen inside a word
 * belongs to the word, and the operator needs its spaces. A number may carry a
 * unit glued on (`0.64m`, `90deg`); there are two units, and beats are a plain
 * count (notes D1). Newlines are whitespace. `//` runs to the end of the line
 * and is kept on the side, for a formatter that does not exist yet.
 *
 * Two things the language deliberately does not have get their own
 * complaints rather than a shrug: `$name`, round 2's sigil (`L007`), and the
 * dot (`L006`).
 */
export function tokenize(source: string, file: string): Lexed {
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  const at = (i: number): string => source[i] ?? "";
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const col = (): number => i - lineStart + 1;
  const span = (start: number, end: number): Span => ({ file, start, end });
  const push = (kind: TokenKind, text: string, start: number, startCol: number, extra?: Extra) => {
    tokens.push({ kind, text, start, end: i, line, col: startCol, ...extra });
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
        throw lexFailure("L003", "this string has no closing quote on its line", span(start, i), {
          suggestion: 'a string is one line: "Butter"',
        });
      }
      i += 1;
      push("string", source.slice(start + 1, i - 1), start, startCol);
      continue;
    }

    if (c === "$") {
      i += 1;
      while (i < source.length && isWordChar(at(i))) i += 1;
      const word = source.slice(start + 1, i);
      throw lexFailure(
        "L007",
        `"$${word}" has a sigil the language does not have`,
        span(start, i),
        {
          suggestion: `a relation is a member of a group and is read bare: write "${word || "partner"}"`,
        },
      );
    }

    if (isDigit(c)) {
      while (i < source.length && isDigit(at(i))) i += 1;
      // `0.5` is a decimal; `0..n` is a range, so a second dot ends the number.
      let float = false;
      if (at(i) === "." && isDigit(at(i + 1))) {
        float = true;
        i += 1;
        while (i < source.length && isDigit(at(i))) i += 1;
      }
      const digits = source.slice(start, i);
      const unitStart = i;
      while (i < source.length && isLower(at(i))) i += 1;
      const unit = source.slice(unitStart, i);
      if (unit !== "" && !UNITS.includes(unit)) {
        throw lexFailure("L005", `"${unit}" is not a unit`, span(unitStart, i), {
          suggestion: `the units are ${UNITS.map((u) => `"${u}"`).join(" and ")}; a count of beats has none`,
        });
      }
      push("number", digits, start, startCol, { unit, float });
      continue;
    }

    if (c === "_" && !isWordChar(at(i + 1))) {
      // A lone `_`: the wildcard of a pattern.
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
        throw lexFailure(
          "L002",
          `"${word}" is neither a name nor a TitleCase word`,
          span(start, i),
          {
            suggestion:
              "names are kebab-case (minor-set, do-si-do); groups, types and enum members are TitleCase (MinorSet, Robin)",
          },
        );
      }
      continue;
    }

    if (c === "." && !(at(i + 1) === ".")) {
      i += 1;
      throw lexFailure("L006", "this language has no dots", span(start, i), {
        suggestion:
          'a group\'s id is "id(MinorSet)", an anchor is "anchor(MinorSet, center)", another module\'s name is "becket::MajorSet"',
      });
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

    i += 1;
    throw lexFailure("L004", `"${c}" begins nothing this language reads`, span(start, i));
  }

  tokens.push({ kind: "end", text: "", start: i, end: i, line, col: col() });
  return { tokens, comments };
}

export type TokenKind = "name" | "cap" | "number" | "string" | "punct" | "end";

export interface Token {
  kind: TokenKind;
  /** The kebab name, the TitleCase word, the string without quotes, the digits, the punct itself. */
  text: string;
  /** For a number: `"m"`, `"deg"` or `""`. */
  unit?: string;
  /** For a number: whether it was written with a decimal point. */
  float?: boolean;
  start: number;
  end: number;
  /** 1-based. */
  line: number;
  /** 1-based, in characters. */
  col: number;
}

/** A `//` comment, kept out of the token stream. */
export interface Comment {
  /** Without the `//`, without the newline, trimmed. */
  text: string;
  start: number;
  end: number;
  line: number;
}

export interface Lexed {
  tokens: Token[];
  comments: Comment[];
}

type Extra = { unit: string; float: boolean };

/** A parse or lex error on its way out, carrying the diagnostic to report. */
export interface SyntaxFailure extends Error {
  name: "SyntaxFailure";
  diagnostic: Diagnostic;
}

export const isSyntaxFailure = (error: unknown): error is SyntaxFailure =>
  error instanceof Error && error.name === "SyntaxFailure";

/** Wrap a diagnostic as the exception the parser unwinds with. */
export const syntaxFailure = (d: Diagnostic): SyntaxFailure =>
  Object.assign(new Error(`${d.code}: ${d.message}`), {
    name: "SyntaxFailure" as const,
    diagnostic: d,
  });

const lexFailure = (
  code: string,
  message: string,
  span: Span,
  rest: { suggestion?: string } = {},
): SyntaxFailure => syntaxFailure(diagnostic(code, "parse", message, { span, ...rest }));

/** Three characters first, so `..=` is not `..` then `=`. */
const PUNCT3 = ["..="];
/** Two before one, so `<=` is not `<` then `=` and `::` is not `:` twice. */
const PUNCT2 = ["<=", ">=", "==", "!=", "..", "=>", "::"];
const PUNCT1 = "(){},;=:+-*/<>%_|!";

const isLower = (c: string): boolean => c >= "a" && c <= "z";
const isUpper = (c: string): boolean => c >= "A" && c <= "Z";
const isDigit = (c: string): boolean => c >= "0" && c <= "9";
const isWordChar = (c: string): boolean =>
  isLower(c) || isUpper(c) || isDigit(c) || c === "-" || c === "_";

/** `[a-z][a-z0-9-]*`, not ending in a hyphen. */
export const isKebab = (word: string): boolean =>
  /^[a-z][a-z0-9-]*$/.test(word) && !word.endsWith("-");

/** `[A-Z][A-Za-z0-9]*`. */
export const isTitle = (word: string): boolean => /^[A-Z][A-Za-z0-9]*$/.test(word);
