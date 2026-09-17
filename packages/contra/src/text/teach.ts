import type { Dance, PhraseName, TeachEdit } from "@caller/choreo";
import { concurrentCalls } from "@caller/choreo";
import type { WalkthroughCard, WalkthroughEntry } from "./walkthrough.js";

/**
 * **A caller's own edits to one dance's walkthrough** (vision §4, A10).
 *
 * Everything the app says about a dance is computed: the figure texts are the
 * language, the hints come from the planner's own honest ends, the calls come
 * from the forms and the record. Which is what makes a caller's correction a
 * problem — where would it live, when the sentence it corrects is generated
 * fresh every time the page is opened?
 *
 * **Not by editing the generated text.** The rule the whole milestone rests on
 * is that generated text is never written to disk (vision §4: "store only what a
 * human wrote"), because the moment it is, re-encoding a dance or fixing a
 * figure's words silently stops reaching the dances that were corrected. So a
 * caller's edit is an **overlay**: a paragraph before an entry, a paragraph
 * after it, or a replacement for its one mechanics line, keyed by where in the
 * record it goes rather than by what it currently says.
 *
 * The keys are the record's own words:
 *
 * | key | what it names |
 * | --- | --- |
 * | `A2/robins-chain` | the first `robins-chain` of phrase A2 |
 * | `B1/balance-ring/2` | the **second** `balance-ring` of phrase B1 |
 * | `A2/loop` | a concurrent branch, by its own figure name |
 * | `2A1/allemande` | a second pass's phrase, named as the record names it |
 * | `opening`, `wrap` | the two dance-level sentences |
 *
 * A key that names nothing **warns** rather than throwing: a dance is re-encoded
 * from time to time, and a stale key must not take it off the programme.
 */

/** The two keys that name a dance rather than one of its calls. */
export const DANCE_LEVEL_KEYS: readonly string[] = ["opening", "wrap"];

/**
 * What is wrong with one dance's `teach` block, one line per fault.
 *
 * Read off the record rather than off a rendered card, so a file can be checked
 * at load without dancing the dance.
 */
export function checkDanceTeach(dance: {
  slug: string;
  phrases: Dance["phrases"];
  teach?: Record<string, TeachEdit>;
}): string[] {
  const faults: string[] = [];
  const counts = figureCounts(dance.phrases);
  for (const [key, edit] of Object.entries(dance.teach ?? {})) {
    if (edit.before === undefined && edit.after === undefined && edit.replace === undefined) {
      faults.push(`${dance.slug}: teach "${key}" says nothing (before, after or replace)`);
    }
    if (DANCE_LEVEL_KEYS.includes(key)) continue;
    const { phrase, figure, nth } = readKey(key);
    if (phrase === undefined || figure === undefined) {
      faults.push(`${dance.slug}: teach "${key}" is not "<phrase>/<figure>" or "opening"/"wrap"`);
      continue;
    }
    if (!dance.phrases.some((each) => each.name === phrase)) {
      faults.push(`${dance.slug}: teach "${key}" names no phrase "${phrase}"`);
      continue;
    }
    const held = counts.get(`${phrase}/${figure}`) ?? 0;
    if (held === 0) {
      faults.push(`${dance.slug}: teach "${key}" names no "${figure}" in ${phrase}`);
      continue;
    }
    const want = nth === undefined ? 1 : Number(nth);
    if (!Number.isInteger(want) || want < 1 || want > held) {
      faults.push(
        `${dance.slug}: teach "${key}" names ${phrase}'s ${String(want)} "${figure}", ` +
          `and there ${held === 1 ? "is one" : `are ${String(held)}`}`,
      );
    }
  }
  return faults;
}

/**
 * One key, read apart.
 *
 * The figure is **everything between the phrase and an optional count**, because
 * a dance-local figure's id has a slash of its own (`fatal-attraction/go-forward`,
 * D10) and a key that named one would otherwise look like a key with three
 * segments and a figure of two letters.
 */
function readKey(key: string): { phrase?: string; figure?: string; nth?: string } {
  const parts = key.split("/");
  if (parts.length < 2) return {};
  const last = parts[parts.length - 1]!;
  const counted = parts.length > 2 && /^\d+$/.test(last);
  const figure = parts.slice(1, counted ? -1 : undefined).join("/");
  if (figure === "") return {};
  return { phrase: parts[0]!, figure, ...(counted ? { nth: last } : {}) };
}

/** How many of each figure each phrase holds, branches counted as their own. */
function figureCounts(phrases: Dance["phrases"]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    for (const written of phrase.figures) {
      for (const call of concurrentCalls(written)) {
        const key = `${phrase.name}/${call.figure}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * One walkthrough with a caller's own edits in place.
 *
 * Pure: the card in, a card out. Nothing here writes anything anywhere, which is
 * the whole point of the overlay.
 */
export function applyTeach(
  card: WalkthroughCard,
  teach: Record<string, TeachEdit> | undefined,
): WalkthroughCard {
  if (teach === undefined || Object.keys(teach).length === 0) return card;

  const opening = teach["opening"];
  const wrap = teach["wrap"];
  /** How many of each `<phrase>/<figure>` have been passed, so far. */
  const seen = new Map<string, number>();

  const entries = card.entries.map((entry) => {
    const edits = editsFor(entry, teach, seen);
    if (edits.length === 0) return entry;
    const mine = edits[0]!;
    return {
      ...entry,
      ...(mine.before === undefined ? {} : { before: mine.before }),
      ...(mine.after === undefined ? {} : { after: mine.after }),
      lines: entry.lines.map((line, i) => {
        const replace = edits[i]?.replace;
        return replace === undefined ? line : { ...line, line: replace };
      }),
    } satisfies WalkthroughEntry;
  });

  return {
    opening: {
      line: opening?.replace ?? card.opening.line,
      ...(card.opening.hint === undefined ? {} : { hint: card.opening.hint }),
    },
    entries,
    wrap: { ...card.wrap, text: wrap?.replace ?? card.wrap.text },
  };
}

/**
 * The edits for one entry, one per line: the call's own first, then each branch.
 *
 * A branch is keyed by **its own figure name** in the same phrase, which is what
 * makes "replace the loop's line and leave the allemande's" sayable at all.
 */
function editsFor(
  entry: WalkthroughEntry,
  teach: Record<string, TeachEdit>,
  seen: Map<string, number>,
): TeachEdit[] {
  const out: TeachEdit[] = [];
  let any = false;
  for (const line of entry.lines) {
    const base = `${String(entry.phrase)}/${line.figure}`;
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    const edit =
      teach[nth === 1 ? base : `${base}/${String(nth)}`] ?? teach[`${base}/${String(nth)}`];
    out.push(edit ?? {});
    if (edit !== undefined) any = true;
  }
  return any ? out : [];
}

/** The key one call of one phrase is written under; `nth` counts from one. */
export const teachKey = (phrase: PhraseName, figure: string, nth = 1): string =>
  nth === 1 ? `${String(phrase)}/${figure}` : `${String(phrase)}/${figure}/${String(nth)}`;
