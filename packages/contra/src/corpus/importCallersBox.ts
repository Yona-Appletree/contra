import type { ConcurrentContraCall, ContraCall, ContraPhrase } from "../figures/chain.js";
import type { DanceFile } from "../dances/loadDances.js";
import { normaliseTitle } from "./normaliseTitle.js";

/**
 * **One derived Caller's Box record into one dance record file** (M13).
 *
 * The input is `contra-data/derived/dances/<id>.json` exactly as
 * `docs/corpus-derived.md` §`derived/dances` defines it; the output is the file
 * shape `docs/dance-record.md` defines and `data/dances/*.json` is written in,
 * with every call the `custom` figure — so the dance loads, plans, keeps its
 * phrase arithmetic and prints the transcript's own words, without a figure
 * having been encoded for a single line of it.
 *
 * **Pure**: no `node:fs`, no clock, no randomness, same input to the same bytes.
 * `corpusData.ts` is what reads the records off disk, and it is Node-only and
 * deliberately not on this module's import path.
 *
 * ## The five rules
 *
 * 1. **A line is a call.** Every line of every phrase becomes
 *    `{ "figure": "custom", "beats": <the line's>, "params": { "text": <the
 *    line's> } }`, in order. Nothing is interpreted, translated or dropped.
 * 2. **Branches are `while`.** A concurrent line (`||`, or "while") keeps its
 *    first branch as the call and puts the rest in `while[]`. The planner
 *    requires a `while`'s branches to be over **disjoint** dancers (Q13), and
 *    two `custom` calls both selecting everybody are not — so each branch is
 *    given a `who`: the role its own text names where it names one, and
 *    otherwise `larks` for the first and `robins` for the second. It is a
 *    placeholder and it is recorded in `notes`: `custom` moves nobody, so the
 *    only thing `who` decides here is that the branches can be emitted at all.
 *    A **third** branch — thirteen lines in the whole corpus — has no third role
 *    to take, so its text is folded on to the second branch's.
 * 3. **A composite becomes its children**, when their counts sum to the
 *    parent's (`childrenBeatsMismatch: false`, and no child uncounted). The
 *    parent is the caller's own heading for them — *"Modified right and left
 *    through with neighbor:"* — so its text goes into `notes` rather than into a
 *    call, where it would spend beats the children have already spent. Where the
 *    counts **do not** sum, nothing is corrected: the parent is one call of its
 *    own stated count and the children are carried in `notes`.
 * 4. **An uncounted line is given a share of what is left.** `beats: null` is a
 *    line the site printed with no `(N)` — 785 of them are a range, `(1-8)`,
 *    which the derive step leaves in the text. The phrase's **declared length**
 *    (below) less the counted lines' own beats is shared equally between the
 *    uncounted lines of that phrase, **rounded down to whole beats with the
 *    remainder on the last** — so `13` over two lines is `6` and `7`, and the
 *    phrase still sums to what it declared. Nothing is left over and nothing is
 *    negative: where the counted lines already fill the phrase, every uncounted
 *    line is a zero-beat call, which `custom` is allowed to be.
 * 5. **A record whose formation is not one of ours is refused**, by returning
 *    `{ ok: false, reason: "formation: <FormationBase>" }` rather than a record.
 *    It is the only refusal, and it is 2,719 of the 12,000 records: triple
 *    minors, squares, circle mixers and four-facing-four, which the three contra
 *    formations this package builds cannot seat.
 *
 * ## The phrase's declared length
 *
 * `phraseStructure` is the Caller's Box's own `"4*8*2"` — *four phrases of eight
 * bars of two beats* — so a term `c*b*n` is `c` phrases of `b × n` beats, and
 * the terms of a `+` sum are read left to right (`"2*8*2 + 2*10*2"` is a crooked
 * dance: 16, 16, 20, 20). Where the terms name exactly as many phrases as the
 * record has, each phrase takes its own; where they all name one length, every
 * phrase takes that; anything else — `"unphrased"`, a structure that does not
 * count — falls back to **16 beats a phrase**, which 11,419 of the 12,000
 * records declare outright. Measured over the whole derived tree: 9,256 of the
 * 9,281 records with a formation we build already sum to their declared length
 * in every phrase, and the 25 that do not are crooked dances of one or two
 * videos each.
 *
 * ## What it never does
 *
 * It never throws on a `permission: "full"` record. Every shape the contract
 * admits — no phrases, no lines, every line uncounted, a branch of a branch, a
 * grandchild — has an answer here rather than an exception, because the caller
 * is a suite over 12,000 records and one bad record must not be a crash.
 */

/** A derived record's own `formation` block. */
export interface DerivedFormation {
  /** `FormationBase`, verbatim. */
  base: string;
  /** `FormationDetail`, verbatim. */
  detail: string;
  /** Our formation id — `duple-improper`, `becket`, `proper` — or `null`. */
  id: string | null;
}

/** One line of one phrase of a derived record. */
export interface DerivedLine {
  /** The string exactly as the site sent it, indentation and count included. */
  raw?: string;
  /** The leading `(N)`, or `null` when there is none or it is a range. */
  beats: number | null;
  /** `raw` with the count and the surrounding space removed. */
  text: string;
  head?: string;
  relations?: readonly string[];
  fractions?: readonly string[];
  passes?: readonly string[];
  /** Two or more, for a line split on `||` or "while". A branch has no `beats`. */
  branches?: readonly DerivedLine[];
  /** The indented lines under this one. */
  children?: readonly DerivedLine[];
  /** True when the children's beats do not sum to this line's own `(N)`. */
  childrenBeatsMismatch?: boolean;
}

/** One phrase of a derived record. */
export interface DerivedPhrase {
  name: string;
  /** The sum of the top-level lines' beats; `null` if any of them is `null`. */
  beats: number | null;
  lines: readonly DerivedLine[];
}

/** A normalised Caller's Box record: `derived/dances/<id>.json`. */
export interface DerivedDance {
  source: string;
  id: string;
  url: string;
  fetchedAt?: string;
  permission: string;
  status?: string;
  title: string;
  authors: readonly string[];
  otherNames?: readonly string[];
  formation: DerivedFormation;
  progression?: string;
  direction?: string;
  mixer?: boolean;
  /** The Caller's Box's own `"4*8*2"`. */
  phraseStructure: string;
  videos?: number;
  appearances?: number;
  callingNotes?: readonly string[];
  phrases: readonly DerivedPhrase[];
  flags?: Readonly<Record<string, number>>;
}

/**
 * What {@link importCallersBox} answers: a record, or the reason there is none.
 *
 * A discriminated union rather than `DanceFile | undefined`, because the one
 * refusal is a fact about the source worth printing — the suite's own summary
 * counts formations it cannot seat, and "2,719 records are triple minors and
 * squares" is a different report from "2,719 records failed".
 */
export type ImportResult =
  | { ok: true; dance: DanceFile }
  | {
      ok: false;
      /** `"formation: Triple Minor - Improper"`: the field, then the value. */
      reason: string;
    };

/** The figure every imported call names. */
export const IMPORT_FIGURE = "custom";

/** What a phrase is worth when `phraseStructure` does not say. */
export const DEFAULT_PHRASE_BEATS = 16;

/** One derived Caller's Box record as a dance record file. @see importCallersBox */
export function importCallersBox(record: DerivedDance): ImportResult {
  const formation = record.formation.id;
  if (formation === null || formation === "") {
    return { ok: false, reason: `formation: ${record.formation.base}` };
  }

  const notes: string[] = [];
  const lengths = phraseLengths(record.phraseStructure, record.phrases.length);
  const phrases: ContraPhrase[] = record.phrases.map((phrase, at) =>
    importPhrase(phrase, lengths[at] ?? DEFAULT_PHRASE_BEATS, notes),
  );

  return {
    ok: true,
    dance: {
      slug: slugOf(record),
      title: normaliseTitle(record.title),
      author: record.authors.join(" and "),
      formation,
      status: "lab",
      notes: noteOf(record, notes),
      source: {
        callersBoxId: Number(record.id),
        url: record.url,
        permission: record.permission,
        transcript: transcriptOf(record),
      },
      phrases,
    },
  };
}

/** One phrase: its lines flattened to calls, then its uncounted lines filled in. */
function importPhrase(phrase: DerivedPhrase, declared: number, notes: string[]): ContraPhrase {
  const lines = phrase.lines.flatMap((line) => expand(line, phrase.name, notes));
  const calls = lines.map((line) => callOf(line, phrase.name, notes));
  shareOut(calls, lines, declared);
  return { name: phrase.name, figures: calls };
}

/**
 * **A composite line, resolved into the lines that become calls** (rule 3).
 *
 * Recursive, because a grandchild is a child of a child (three dances write
 * one) and the rule is the same one level down. A parent whose children do not
 * add up keeps its own count and its children go to `notes` — nothing is
 * corrected, which is the derived contract's own rule about
 * `childrenBeatsMismatch` carried forward.
 */
function expand(line: DerivedLine, phrase: string, notes: string[]): DerivedLine[] {
  const children = line.children ?? [];
  if (children.length === 0) return [line];
  const sums =
    line.childrenBeatsMismatch !== true &&
    children.every((child) => child.beats !== null) &&
    children.reduce((total, child) => total + (child.beats ?? 0), 0) === line.beats;
  if (!sums) {
    notes.push(
      `${phrase}: "${line.text}" is written over ${String(children.length)} indented lines ` +
        `whose counts do not sum to its own, so it is one call of ${String(line.beats ?? 0)}: ` +
        children.map((child) => `"${child.text}"`).join(", "),
    );
    return [{ ...line, children: undefined }];
  }
  notes.push(
    `${phrase}: "${line.text}" is the heading for the ${String(children.length)} calls under it`,
  );
  return children.flatMap((child) => expand(child, phrase, notes));
}

/** One line as a `custom` call, with its branches beside it (rules 1 and 2). */
function callOf(line: DerivedLine, phrase: string, notes: string[]): ContraCall {
  const branches = line.branches ?? [];
  const beats = line.beats ?? 0;
  if (branches.length < 2) return custom(beats, line.text);

  // **Two branches at most**, because two is how many disjoint roles there are.
  const heads = [branches[0]!, branches[1]!];
  const rest = branches.slice(2);
  const texts = heads.map((branch) => branch.text);
  if (rest.length > 0) {
    texts[1] = [texts[1], ...rest.map((branch) => branch.text)].join(" || ");
    notes.push(
      `${phrase}: "${line.text}" runs ${String(branches.length)} calls at once; ` +
        `the library can hold two, so the last ${String(rest.length + 1)} are written as one`,
    );
  }
  const who = whoOf(texts);
  notes.push(
    `${phrase}: "${line.text}" is concurrent; its branches are given ` +
      `"${who[0]}" and "${who[1]}" so they are over disjoint dancers — a placeholder, ` +
      `not a reading of the call`,
  );
  const beside: ConcurrentContraCall = {
    figure: IMPORT_FIGURE,
    who: who[1],
    params: { text: texts[1]! },
  };
  return { ...custom(beats, texts[0]!), who: who[0], while: [beside] };
}

/** One plain `custom` call. */
const custom = (beats: number, text: string): ContraCall => ({
  figure: IMPORT_FIGURE,
  beats,
  params: { text },
});

/**
 * Which role each of two concurrent branches is given.
 *
 * The branch's own words where they name a role — *"Men walk forward || Women
 * fall back"* is 1,188 of the 2,815 concurrent lines — and the positional
 * `larks`/`robins` otherwise. Two branches that name the **same** role fall back
 * to the positional answer too, because the point of the `who` is only that the
 * two are disjoint.
 */
function whoOf(texts: readonly string[]): [string, string] {
  const named = texts.map(roleIn);
  if (named[0] !== undefined && named[1] !== undefined && named[0] !== named[1]) {
    return [named[0], named[1]];
  }
  return ["larks", "robins"];
}

/** The role a branch's text opens on, in this repository's own two words. */
function roleIn(text: string): string | undefined {
  const word = /^\s*(?:\[[^\]]*\]\s*)?([a-z]+)/i.exec(text)?.[1]?.toLowerCase();
  if (word === undefined) return undefined;
  if (LARK_WORDS.includes(word)) return "larks";
  if (ROBIN_WORDS.includes(word)) return "robins";
  return undefined;
}

/** What the Caller's Box calls a lark. `docs/dance-record.md`: `M` is the larks. */
const LARK_WORDS: readonly string[] = ["men", "man", "gents", "gent", "gentlemen", "larks", "lark"];
/** And a robin. `W` is the robins. */
const ROBIN_WORDS: readonly string[] = [
  "women",
  "woman",
  "ladies",
  "lady",
  "ladles",
  "robins",
  "robin",
];

/**
 * **Rule 4**: the uncounted lines of one phrase share what the counted ones
 * leave of its declared length, rounded down, the remainder on the last.
 *
 * In place, because the calls are already built and only their `beats` is in
 * question. A phrase with nothing uncounted is left exactly as the transcript
 * wrote it — this never moves a count the site printed.
 */
function shareOut(calls: ContraCall[], lines: readonly DerivedLine[], declared: number): void {
  const uncounted: number[] = [];
  let counted = 0;
  for (const [at, line] of lines.entries()) {
    if (line.beats === null) uncounted.push(at);
    else counted += line.beats;
  }
  if (uncounted.length === 0) return;
  const rest = Math.max(0, declared - counted);
  const share = Math.floor(rest / uncounted.length);
  for (const at of uncounted) calls[at]!.beats = share;
  calls[uncounted[uncounted.length - 1]!]!.beats = rest - share * (uncounted.length - 1);
}

/**
 * **How long each phrase declares itself to be**, read off `phraseStructure`.
 *
 * @see importCallersBox for the rule and the measurement behind the fallback.
 */
export function phraseLengths(structure: string, phrases: number): number[] {
  const out: number[] = [];
  for (const [, count, bars, beats] of structure.matchAll(/(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/g)) {
    const length = Number(bars) * Number(beats);
    for (let i = 0; i < Number(count); i++) out.push(length);
  }
  if (out.length === phrases) return out;
  const first = out[0];
  if (first !== undefined && out.every((length) => length === first)) {
    return Array.from({ length: phrases }, () => first);
  }
  return Array.from({ length: phrases }, () => DEFAULT_PHRASE_BEATS);
}

/**
 * **The transcript, rebuilt from the raw lines**, phrase by phrase, so that a
 * reader can check the record against the page without leaving the file — which
 * is what `docs/dance-record.md` asks `source.transcript` for.
 *
 * One output line per phrase: the phrase's name, two spaces, then every raw line
 * of it in order, two spaces apart. `raw` is the string exactly as the site sent
 * it, count and all, so a child keeps the five leading spaces that made it a
 * child and the indentation still reads. A line the derive step gave no `raw` —
 * nothing in the contract does, but a hand-written record might — falls back to
 * its `text`.
 */
export function transcriptOf(record: DerivedDance): string {
  return record.phrases
    .map((phrase) => [phrase.name, ...phrase.lines.flatMap(rawLines)].join("  "))
    .join("\n");
}

/** One line's own `raw`, then its children's, in the order the site printed them. */
function rawLines(line: DerivedLine): string[] {
  return [line.raw ?? line.text, ...(line.children ?? []).flatMap(rawLines)];
}

/** The record's `notes`: where it came from, then everything the import decided. */
function noteOf(record: DerivedDance, notes: readonly string[]): string {
  const head =
    `The Caller's Box ${record.id}, permission: ${record.permission}. ` +
    `Imported from the derived corpus and **not encoded**: every call is \`custom\`, ` +
    `which stands still and prints the transcript's own line.`;
  const calling = (record.callingNotes ?? []).filter((each) => each.trim() !== "");
  return [head, ...calling.map((each) => `Calling note: ${each}`), ...notes].join(" ");
}

/**
 * The record's slug: its title, kebabed.
 *
 * Not the id, because a slug is what a reader types (`pnpm dance butter`) and
 * what a local figure's id would carry; and the id is in `source.callersBoxId`
 * and in `notes` either way. A title with nothing left after kebabing — there
 * are none in the derived tree, but the contract does not forbid one — falls
 * back to the id.
 */
export function slugOf(record: DerivedDance): string {
  const kebab = normaliseTitle(record.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return kebab === "" ? `callers-box-${record.id}` : kebab;
}
