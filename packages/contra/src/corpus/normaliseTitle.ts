const LEADING_NUMBER_RE = /^\s*\d+\.\s*/;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Strips a leading "N. " program-order prefix baked into some Portland
 * spreadsheet titles (e.g. "2. Sorry, Erik"), so the same dance programmed
 * at different positions in a night's list still counts as one title.
 */
function stripLeadingNumber(value: string): string {
  return value.replace(LEADING_NUMBER_RE, "");
}

/**
 * Normalises a raw dance title for display: strips a leading program-order
 * number, trims the ends, and collapses internal whitespace runs to a
 * single space. Case is left untouched — callers pick the most-common exact
 * spelling across instances for themselves (see `titleKey`).
 *
 * Deliberately narrow, per m00-corpus.md's deliverable text (trim, collapse
 * whitespace, case). It does not unify near-duplicate spellings — curly vs
 * straight apostrophes, "(var)"/"var." tags, a leading "The", ambiguous
 * punctuation — that corpus-analysis.md section 1 catalogued as a separate,
 * real but minority issue (~12-15% of the raw distinct-title count). Two
 * titles that differ only in one of those ways are intentionally kept
 * distinct here; see normaliseTitle.test.ts for the named examples.
 */
export function normaliseTitle(raw: string): string {
  return collapseWhitespace(stripLeadingNumber(raw));
}

/**
 * A case-insensitive grouping key for a normalised title: same scope as
 * `normaliseTitle`, lowercased so "Butter" and "BUTTER" group together.
 */
export function titleKey(raw: string): string {
  return normaliseTitle(raw).toLowerCase();
}
