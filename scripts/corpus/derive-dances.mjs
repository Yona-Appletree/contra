#!/usr/bin/env node
// Normalises the raw Caller's Box cache into `derived/dances/<id>.json`, the
// shape `docs/corpus-derived.md` specifies — one file per raw record whose
// `phrases` array is non-empty. Nothing is fetched here and nothing else
// under the data root is read or written: the input is
// `corpus-raw/callers-box/<id>.json`, the output is `derived/dances/<id>.json`,
// and that is all.
//
// The whole point is that a figure stops being an opaque string. Every line
// keeps its `raw` exactly as the site sent it, and gains the pieces a later
// step can query: the beat count, the text without it, the relation words,
// the fractions, a hey's pass list, the branches of a concurrent line, the
// children of a composite one, and a provisional two-word `head`. Nothing is
// corrected — where the source disagrees with itself (children whose beats do
// not sum to their parent's) the disagreement is recorded, not resolved.
//
// Output is deterministic: the same cache produces byte-identical files, and
// the bytes are what prettier would write, so a record copied into the public
// repository as a fixture survives `pnpm format` untouched.
//
// Usage:
//   node scripts/corpus/derive-dances.mjs
//   node scripts/corpus/derive-dances.mjs --data ../contra-data
//   node scripts/corpus/derive-dances.mjs --only 10320,6500
//   node scripts/corpus/derive-dances.mjs --report
//
// The data root is `--data <path>`, else $CONTRA_DATA, else `../contra-data`
// beside the repository.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

const SOURCE = "callers-box";
const DANCE_URL_BASE = "https://www.ibiblio.org/contradance/thecallersbox/dance.php";

// The Caller's Box leaves PhraseStructure empty for the ordinary contra
// shape, so an empty field is not missing data — it is this.
const DEFAULT_PHRASE_STRUCTURE = "4*8*2";

// docs/corpus-derived.md's table. Anything else is null on purpose: a
// formation we have not modelled should read as "not one of ours", never as a
// guess.
const FORMATION_IDS = new Map([
  ["Duple Minor - Improper", "duple-improper"],
  ["Duple Minor - Becket", "becket"],
  ["Duple Minor - Proper", "proper"],
]);

/** The canonical page for a Caller's Box id (the JSON export's `request` field names the export). */
export function danceUrl(id) {
  return `${DANCE_URL_BASE}?id=${id}`;
}

/** FormationBase → our formation id, or null when it is not one we model. */
export function formationId(base) {
  return FORMATION_IDS.get(base) ?? null;
}

// ---------------------------------------------------------------------------
// Line pieces
// ---------------------------------------------------------------------------

// The relation shorthand from the Caller's Box Brief glossary. The family
// letters take an optional (possibly negative) index — N2 is the next
// neighbor, N0 and N-1 the previous ones, S-1 a shadow behind you — so they
// are matched by shape rather than by a closed list, which is what the cache
// actually holds (N0..N4, P0..P5, S1, S2, S-1, C1..C3 all occur). The fixed
// tokens have no index. Matching is case-sensitive: `S` is a shadow, `s` is
// the end of a word.
const RELATION_CORE = "(?:1CC|2CC|1C|2C|SRN|TB|ON|O|[NPSC]-?\\d*)";
const RELATION_SHORTHAND = new RegExp(`(?<![A-Za-z0-9-])${RELATION_CORE}(?![A-Za-z0-9-])`, "g");
const RELATION_SHORTHAND_WHOLE = new RegExp(`^${RELATION_CORE}$`);

// The words the Caller's Box writes out in full, and the shorthand each one
// means. Matched case-insensitively — a line begins with a capital.
const RELATION_WORDS = [
  ["same-role", "SRN"],
  ["trail buddies", "TB"],
  ["trail buddy", "TB"],
  ["neighbors", "N"],
  ["neighbor", "N"],
  ["partners", "P"],
  ["partner", "P"],
  ["shadows", "S"],
  ["shadow", "S"],
  ["corners", "C1"],
  ["corner", "C1"],
  ["opposites", "O"],
  ["opposite", "O"],
  ["ones", "1"],
  ["twos", "2"],
];

const RELATION_WORD_MATCHERS = RELATION_WORDS.map(([word, relation]) => [
  new RegExp(`(?<![A-Za-z-])${word}(?![A-Za-z])`, "gi"),
  relation,
]);

// A hey's pass list: two or more `;`-separated tokens inside one pair of
// parentheses, each a hand (`WR`, `NL`, `N2L`) with an optional `~` marking a
// pass that carries into the next phrase. The stem is optional, because a hey
// for six or eight names who only the first pass is with and then writes the
// hands alone — `(NR;L;R;L;R;L)`, `(R;L;R)`. A bare hand contributes a pass
// but no relation: there is no one in `L` to name.
const PASS_TOKEN = "[A-Z0-9-]*[RL]~?";
const PASS_LIST = new RegExp(`\\((${PASS_TOKEN}(?:;${PASS_TOKEN})+)\\)`);

// `3/4`, `1 & 1/2`, and the three unicode fractions — recorded as written,
// because "1 & 1/2" and "1.5" are not the same call. The long form is first
// in the alternation so it wins at the position where both could match.
const FRACTIONS = /\d+ & \d+\/\d+|\d+\/\d+|[½¼¾]/g;

// A leading `(N)` is the line's beat count. `(1-8)` and the like are beat
// *ranges*, not counts — the line stays uncounted and keeps the range in its
// text, because throwing the range away would lose the only timing it has.
const LEADING_COUNT = /^\((\d+)\)\s*/;

/**
 * Removes parenthesised spans, counting depth so a nested one
 * (`(to a wave of four (PR,WL))`) leaves no stray bracket behind. Square
 * brackets are treated the same way: the Caller's Box uses them for the same
 * kind of aside (`[Ends] Partner swing`).
 */
export function stripParenthesised(text) {
  let depth = 0;
  let out = "";
  for (const char of text) {
    if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      if (depth > 0) depth -= 1;
      if (depth === 0) out += " ";
    } else if (depth === 0) {
      out += char;
    }
  }
  return out;
}

/**
 * The relation shorthand a line names, each one once, in order of first
 * appearance. Both spellings count — `N2` and the word `neighbor` — and a
 * hey's pass list counts too, because `(WR;NL;MR;PL)` is where a hey says who
 * it is with.
 */
export function extractRelations(text, passes = []) {
  const hits = [];
  for (const match of text.matchAll(RELATION_SHORTHAND)) {
    hits.push({ at: match.index, relation: match[0] });
  }
  for (const [matcher, relation] of RELATION_WORD_MATCHERS) {
    for (const match of text.matchAll(matcher)) hits.push({ at: match.index, relation });
  }
  // A pass token is a relation plus a hand: `NL` is the neighbor by the left,
  // `N2L~` the next neighbor. Strip the hand and keep what is left when it is
  // a relation — `W` and `M` are roles, not relations, so they drop out.
  for (const token of passes) {
    const stem = token.replace(/~$/, "").replace(/[RL]$/, "");
    if (stem.length > 0 && isRelationShorthand(stem)) {
      hits.push({ at: text.indexOf(token), relation: stem });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const seen = [];
  for (const hit of hits) {
    if (!seen.includes(hit.relation)) seen.push(hit.relation);
  }
  return seen;
}

/** Whether a whole token is relation shorthand (`N2` yes, `W` no). */
export function isRelationShorthand(token) {
  return RELATION_SHORTHAND_WHOLE.test(token);
}

/** Fractions as written: "3/4", "1 & 1/2", "½". Each occurrence, in order. */
export function extractFractions(text) {
  return [...text.matchAll(FRACTIONS)].map((match) => match[0]);
}

/** A hey's pass list, or null when the line has none. */
export function extractPasses(text) {
  const match = PASS_LIST.exec(text);
  return match ? match[1].split(";") : null;
}

// Actor phrases stripped from the front of a line before `head` is taken.
// Provisional, like `head` itself: this is the list of openers the Caller's
// Box actually writes, not a grammar. Longest match wins, and only one is
// stripped — "Neighbor swing" is a swing, "N2 neighbor swing" is also a swing.
export const ACTOR_PHRASES = [
  "same-role neighbors",
  "same-role neighbor",
  "next neighbors",
  "next neighbor",
  "new neighbors",
  "new neighbor",
  "other neighbors",
  "other neighbor",
  "n1 neighbors",
  "n1 neighbor",
  "n2 neighbors",
  "n2 neighbor",
  "n3 neighbors",
  "n3 neighbor",
  "p1 partners",
  "p1 partner",
  "p2 partners",
  "p2 partner",
  "neighbors",
  "neighbor",
  "partners",
  "partner",
  "shadows",
  "shadow",
  "trail buddies",
  "trail buddy",
  "corners",
  "corner",
  "opposites",
  "opposite",
  "ladies",
  "gents",
  "men",
  "women",
  "larks",
  "robins",
  "ravens",
  "ones",
  "twos",
  "actives",
  "all",
  "everyone",
  "in long lines,",
  "long lines",
  "as couples,",
];

const ACTOR_MATCHERS = [...ACTOR_PHRASES]
  .sort((a, b) => b.length - a.length)
  .map((phrase) => new RegExp(`^${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,;:]?\\s+`));

// "With the ones, circle left" — the same shape as the listed phrases, but
// the middle is free text, so it needs a pattern rather than a literal.
const ACTOR_WITH_THE = /^with the [^,]{1,40},\s+/;

// An actor phrase may be introduced by relation shorthand: "N2 men allemande
// left", "S1 shadow swing". The shorthand is stripped with the phrase it
// introduces, never on its own — "On slight right diagonal" begins with the
// `ON` shorthand and is not an actor at all.
const ACTOR_SHORTHAND = new RegExp(`^${RELATION_CORE.toLowerCase()}\\s+`);

/**
 * PROVISIONAL. `head` is a two-word guess at which figure family a line
 * belongs to — enough for the index to tag a dance before anyone encodes it,
 * and thrown away the moment the encoded record has real figure ids. It is
 * not a parse and must never be treated as one.
 */
export function deriveHead(text) {
  let rest = stripParenthesised(text).toLowerCase().replace(/\s+/g, " ").trim();
  rest = rest.replace(/^[-–—,;:.'"\s]+/, "");
  const withThe = ACTOR_WITH_THE.exec(rest);
  if (withThe) {
    rest = rest.slice(withThe[0].length);
  } else {
    rest = stripActorPhrase(rest);
  }
  return rest
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .join(" ")
    .replace(/[,;:.]+$/, "");
}

/** Strips one leading actor phrase, with its relation shorthand if it has one. */
function stripActorPhrase(text) {
  const shorthand = ACTOR_SHORTHAND.exec(text);
  const candidates = shorthand ? [text.slice(shorthand[0].length), text] : [text];
  for (const candidate of candidates) {
    for (const matcher of ACTOR_MATCHERS) {
      const match = matcher.exec(candidate);
      if (match) return candidate.slice(match[0].length);
    }
  }
  return text;
}

/**
 * Splits a concurrent line into its branches, or returns null when it is not
 * one. `||` is the Caller's Box's own mark and wins when both are present;
 * ` while ` is the same thing written out. A comma is *not* split on, even
 * though the site writes that too — it is ordinary punctuation far more often
 * than it is a concurrency mark, and a wrong split is worse than no split.
 */
export function splitBranches(text) {
  if (text.includes("||")) {
    return text
      .split("||")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (/ while /i.test(text)) {
    return text
      .split(/ while /i)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  return null;
}

/** A branch: a plain line with no `raw` and no `beats` — it takes the parent's. */
function buildBranch(text) {
  const passes = extractPasses(text);
  const branch = {
    text,
    head: deriveHead(text),
    relations: extractRelations(text, passes ?? []),
    fractions: extractFractions(text),
  };
  if (passes) branch.passes = passes;
  return branch;
}

/**
 * One figure string as a line record. `raw` is the string exactly as the site
 * sent it, indentation included; everything else is derived from it.
 */
export function parseLine(raw) {
  const body = raw.trim();
  const count = LEADING_COUNT.exec(body);
  const beats = count ? Number(count[1]) : null;
  const text = count ? body.slice(count[0].length) : body;
  const passes = extractPasses(text);
  const line = {
    raw,
    beats,
    text,
    head: deriveHead(text),
    relations: extractRelations(text, passes ?? []),
    fractions: extractFractions(text),
  };
  if (passes) line.passes = passes;
  const branches = splitBranches(text);
  if (branches) line.branches = branches.map(buildBranch);
  return line;
}

/** The leading-space width of a raw figure string. */
export function indentOf(raw) {
  return raw.length - raw.trimStart().length;
}

/**
 * The lines of one phrase, with indented lines nested under the line above
 * them. The Caller's Box marks a composite parent with a trailing `:` and
 * indents its parts by five spaces — but the colon is missing in sixty-odd
 * phrases whose parts are indented all the same, and three dances nest a
 * second level at ten spaces, so the indentation is what is trusted here.
 * See the note in docs/corpus-derived.md's composite rule.
 */
export function buildLines(figures) {
  const roots = [];
  const stack = [];
  for (const raw of figures) {
    const indent = indentOf(raw);
    const line = parseLine(raw);
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length === 0) {
      roots.push(line);
    } else {
      const parent = stack[stack.length - 1].line;
      if (!parent.children) parent.children = [];
      parent.children.push(line);
    }
    stack.push({ indent, line });
  }
  for (const line of walkLines(roots)) {
    if (line.children) line.childrenBeatsMismatch = sumBeats(line.children) !== line.beats;
  }
  return roots;
}

/** Every line in a phrase, parents before children. */
export function* walkLines(lines) {
  for (const line of lines) {
    yield line;
    if (line.children) yield* walkLines(line.children);
  }
}

/** The beats of a list of lines, or null when any one of them is uncounted. */
export function sumBeats(lines) {
  let total = 0;
  for (const line of lines) {
    if (line.beats === null) return null;
    total += line.beats;
  }
  return total;
}

/** One raw `{ name, figures }` phrase as a derived phrase. */
export function derivePhrase(phrase) {
  const lines = buildLines(Array.isArray(phrase.figures) ? phrase.figures : []);
  return { name: phrase.name ?? "", beats: sumBeats(lines), lines };
}

/**
 * The flag counts over every line of a record — children included, since a
 * composite's parts carry the odd counts and the uncounted lines just as much
 * as a top-level line does. Branches are not counted separately: they are
 * parts of one line, and that line is counted once as `concurrent`.
 */
export function countFlags(phrases) {
  const flags = {
    uncounted: 0,
    zeroBeat: 0,
    concurrent: 0,
    composite: 0,
    oddCounts: 0,
    either: 0,
    undefined: 0,
  };
  for (const phrase of phrases) {
    for (const line of walkLines(phrase.lines)) {
      if (line.beats === null) flags.uncounted += 1;
      if (line.beats === 0) flags.zeroBeat += 1;
      if (line.branches) flags.concurrent += 1;
      if (line.children) flags.composite += 1;
      if (line.beats !== null && line.beats % 2 !== 0) flags.oddCounts += 1;
      if (line.text.includes("//")) flags.either += 1;
      if (line.text.includes("?")) flags.undefined += 1;
    }
  }
  return flags;
}

/**
 * One raw Caller's Box record as a derived record. Every metadata field is
 * verbatim except the four the doc names: `status` is lower-cased, `mixer`
 * becomes a boolean, `phraseStructure` gains its default, and the counts
 * replace the lists they count.
 */
export function deriveRecord(raw, { id = raw.ID } = {}) {
  const phrases = (Array.isArray(raw.phrases) ? raw.phrases : []).map(derivePhrase);
  return {
    source: SOURCE,
    id: String(id),
    url: danceUrl(id),
    fetchedAt: raw.download_date ?? "",
    permission: raw.Permission ?? "",
    status: (raw.Status ?? "").toLowerCase(),
    title: raw.Name ?? "",
    authors: raw.Authors ?? [],
    otherNames: raw.OtherNames ?? [],
    formation: {
      base: raw.FormationBase ?? "",
      detail: raw.FormationDetail ?? "",
      id: formationId(raw.FormationBase ?? ""),
    },
    progression: raw.Progression ?? "",
    direction: raw.Direction ?? "",
    mixer: (raw["Mixer?"] ?? "").length > 0,
    phraseStructure:
      (raw.PhraseStructure ?? "").length > 0 ? raw.PhraseStructure : DEFAULT_PHRASE_STRUCTURE,
    videos: (raw.Videos ?? []).length,
    appearances: (raw.Appearances ?? []).length,
    callingNotes: raw.CallingNotes ?? [],
    phrases,
    flags: countFlags(phrases),
  };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

// A derived record may be copied verbatim into the public repository as a
// fixture, where `pnpm format` will see it — so the bytes written here are
// the bytes prettier writes, under the repository's own config, not just
// JSON.stringify's. Resolved once per run against a path inside the repo so
// the options are exactly the ones a fixture would get.
let prettierOptions = null;

async function loadPrettierOptions() {
  if (prettierOptions) return prettierOptions;
  const forFixture = resolve(REPO_ROOT, "data/corpus/fixtures/record.json");
  const config = (await resolveConfig(forFixture)) ?? {};
  prettierOptions = { ...config, parser: "json" };
  return prettierOptions;
}

/** A record as the exact bytes to write: prettier's JSON, trailing newline. */
export async function formatRecord(record) {
  return format(`${JSON.stringify(record, null, 2)}\n`, await loadPrettierOptions());
}

/**
 * The data root: `--data`, else $CONTRA_DATA, else `../contra-data` beside
 * the repository — the private cache checkout (see data/README.md).
 */
export function resolveDataRoot({ data } = {}, env = process.env, repoRoot = REPO_ROOT) {
  if (data) return resolve(data);
  if (env.CONTRA_DATA) return resolve(env.CONTRA_DATA);
  return resolve(repoRoot, "../contra-data");
}

export function parseArgs(argv) {
  const args = { data: null, only: null, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data") {
      args.data = argv[++i];
      if (!args.data) fail("--data requires a path");
    } else if (arg === "--only") {
      const value = argv[++i];
      if (!value) fail("--only requires an id or comma-separated ids");
      args.only = value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (args.only.length === 0) fail("--only requires an id or comma-separated ids");
    } else if (arg === "--report") {
      args.report = true;
    } else {
      fail(`unknown argument "${arg}"`);
    }
  }
  return args;
}

function fail(message) {
  console.error(`derive-dances: ${message}`);
  process.exit(1);
}

/** The cached Caller's Box ids, ascending. `manifest.jsonl` is not one. */
export function listRawIds(rawDir, readDir = readdirSync) {
  return readDir(rawDir)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => name.slice(0, -".json".length))
    .sort((a, b) => Number(a) - Number(b));
}

/**
 * The run itself. Everything that touches the filesystem is injected, so the
 * test drives it with hand-written records and captures the writes — it never
 * reads the cache.
 */
export async function runDerive({
  ids,
  readRaw,
  only = null,
  report = false,
  writeRecord,
  log = console.log,
}) {
  const wanted = only ? new Set(only) : null;
  const counts = {
    seen: 0,
    withPhrases: 0,
    written: 0,
    skippedSearchOnly: 0,
    skippedOtherNoPhrases: 0,
  };
  const flags = countFlags([]);

  for (const id of ids) {
    if (wanted && !wanted.has(String(id))) continue;
    const raw = readRaw(id);
    counts.seen += 1;
    const hasPhrases = Array.isArray(raw.phrases) && raw.phrases.length > 0;
    if (!hasPhrases) {
      if (raw.Permission === "search") counts.skippedSearchOnly += 1;
      else counts.skippedOtherNoPhrases += 1;
      continue;
    }
    counts.withPhrases += 1;
    const record = deriveRecord(raw, { id });
    for (const key of Object.keys(flags)) flags[key] += record.flags[key];
    if (report) continue;
    await writeRecord(record.id, await formatRecord(record));
    counts.written += 1;
  }

  if (report) {
    log(`records seen: ${counts.seen}`);
    log(`with phrases: ${counts.withPhrases}`);
    log(`would write: ${counts.withPhrases}`);
    log(`skipped, search-only (no figures): ${counts.skippedSearchOnly}`);
    log(`skipped, other without phrases: ${counts.skippedOtherNoPhrases}`);
    log("flags, summed over every written record:");
    for (const [key, value] of Object.entries(flags)) log(`  ${key}: ${value}`);
  }

  return { counts, flags };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = resolveDataRoot(args);
  const rawDir = resolve(dataRoot, "corpus-raw/callers-box");
  const outDir = resolve(dataRoot, "derived/dances");

  if (!existsSync(rawDir)) {
    fail(`no raw cache at ${rawDir} (pass --data <path> or set CONTRA_DATA)`);
  }

  const ids = listRawIds(rawDir);
  console.log(`derive-dances: reading ${rawDir}`);
  if (!args.report) console.log(`derive-dances: writing ${outDir}`);
  if (args.only) console.log(`derive-dances: only ${args.only.join(", ")}`);

  const readRaw = (id) => JSON.parse(readFileSync(resolve(rawDir, `${id}.json`), "utf-8"));
  const writeRecord = (id, text) => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, `${id}.json`), text);
  };

  const started = Date.now();
  const { counts } = await runDerive({
    ids,
    readRaw,
    only: args.only,
    report: args.report,
    writeRecord,
  });
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1);

  if (!args.report) {
    console.log(
      `derive-dances: done. seen=${counts.seen} withPhrases=${counts.withPhrases} ` +
        `written=${counts.written} searchOnly=${counts.skippedSearchOnly} ` +
        `otherNoPhrases=${counts.skippedOtherNoPhrases} elapsed=${elapsedS}s`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
