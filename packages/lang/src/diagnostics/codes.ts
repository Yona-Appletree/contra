/**
 * Every diagnostic code of the dance language, with the one-line explanation
 * `pnpm lang check --explain` prints. Codes are stable: a test that pins a
 * code is pinning a **kind** of complaint, not a message, so the wording may
 * improve without breaking anything.
 *
 * The bands (notes D7): `L001–L009` parse, `L010–` check, `L100–` run.
 * P1 fills the parse band; P2 and P3 fill the other two.
 */
export const CODES: Readonly<Record<string, { title: string; explain: string }>> = {
  L001: {
    title: "syntax",
    explain: "The text does not parse. The caret marks what was read where something else was due.",
  },
  L002: {
    title: "casing",
    explain:
      "Casing is grammar here. A name is kebab-case (`minor-set`); a type, a group and an enum member are TitleCase (`MinorSet`). `minorSet` and `minor_set` are neither.",
  },
  L003: {
    title: "unterminated string",
    explain: "A string ran to the end of its line without a closing quote. Strings do not wrap.",
  },
  L004: {
    title: "stray character",
    explain: "A character that begins nothing the language can read.",
  },
  L005: {
    title: "unknown unit",
    explain:
      "A number carries a unit the language does not have. There are two: `m` for a length and `deg` for an angle. Beats are a plain count (`beats = 8`).",
  },
  L006: {
    title: "no dots",
    explain:
      "The language has no dot syntax. A group's id is `id(MinorSet)`, an anchor is `anchor(MinorSet, center)`, an enum member of another module is `becket::OutTop`.",
  },
  L007: {
    title: "no sigil",
    explain:
      "`$name` was round 2's spelling. A relation is now a member of a group declaration and is read bare: `partner`, `neighbor`, `shadow`.",
  },
  L008: {
    title: "retired keyword",
    explain:
      "A keyword from an earlier reading of the language. A node is a `group`, a move or a dance is a `fn`, and a relation is a member of a group.",
  },
  L009: {
    title: "unclosed",
    explain:
      "A bracket, a brace or a block was opened and the file ended before it closed. The caret marks where it opened.",
  },
};

/** The explanation line for a code, or a stub when the code is not one of ours. */
export const explain = (code: string): string =>
  CODES[code]?.explain ?? `${code} is not a code this language issues.`;
