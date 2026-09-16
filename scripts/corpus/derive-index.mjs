#!/usr/bin/env node
// Writes `derived/index.jsonl` — one plain-JSON line per derived Caller's Box
// record, in the shape `docs/corpus-derived.md` defines under
// "derived/index.jsonl". It is the queryable face of the corpus: the file an
// agent greps to answer "which dances have a mad robin and a becket
// formation, and which of those may we publish?".
//
// It joins four things and invents nothing:
//
//   derived/dances/<id>.json   the record itself — permission, formation, videos
//   derived/clusters.json      the cluster, and therefore the popularity a tier
//                              is cut from (clusterVideos, portlandCount)
//   contra/data/dances/*.json  whether the dance is encoded, and under which slug
//   derived/sets/hand.json     which records the hand set holds — see below
//   derived/sets/pins.json     the `cleared` list, the only hand-set clearance
//
// Tags are PROVISIONAL and say so on every line (`tagsProvisional: true`).
// Until a dance is encoded there are no figure ids to tag with, only the
// Caller's Box's prose, so every `figure:` value carries a word list matched
// against each line's provisional `head` and its `text`. The word lists are
// the whole of the guesswork and they live next to the value they serve, in
// FIGURE_TAGS below, so that the doc's table and this file can be read side by
// side. A word list is a filter for choosing test dances, never a parse.
//
// ## The index → sets → index question
//
// `publishable` is `fixture` for a record the hand set holds, and the hand set
// is written by derive-sets.mjs, which reads this index — a cycle, on the face
// of it. It is not one, and the chain does NOT need a second index run:
//
//   - this script reads `sets/hand.json` and `sets/pins.json` when they exist
//     (an absent hand set simply means "no fixtures yet"), so a re-run after
//     derive-sets reproduces exactly the same bytes;
//   - derive-sets, having written the two sets, rewrites `publishable` in the
//     index lines it selected, so the index is correct the moment it finishes.
//
// Run the chain once, in the order docs/corpus-derived.md lists it, and both
// files are right. Running this script again afterwards is a no-op, which is
// the property that makes the claim checkable.
//
// Usage:
//   node scripts/corpus/derive-index.mjs
//   node scripts/corpus/derive-index.mjs --data ../contra-data
//   node scripts/corpus/derive-index.mjs --only 10320,6500   # merged into the existing file
//   node scripts/corpus/derive-index.mjs --report            # counts, writes nothing

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Two helpers from the sibling scripts rather than copies of them: the data
// root precedence (--data, $CONTRA_DATA, $CONTRA_DATA_DIR, ../contra-data) and
// the parents-before-children walk over a derived record's lines.
import { resolveDataRoot } from "./derive-contradb.mjs";
import { walkLines } from "./derive-dances.mjs";

export { resolveDataRoot };

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

// How many clusters count as "the popular end" for tier 3.
const TOP_CLUSTERS = 500;

/**
 * The tier a record sits in, from its cluster's popularity alone —
 * docs/corpus-derived.md's four cuts, in order. Tier 1 is "everybody dances
 * this", tier 4 "nobody has filmed it".
 */
export function tierFor({ clusterVideos = 0, portlandCount = 0, inTopClusters = false } = {}) {
  if (clusterVideos >= 50 || portlandCount >= 8) return 1;
  if (clusterVideos >= 10 || portlandCount >= 3) return 2;
  if (inTopClusters || portlandCount >= 1) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// The tag vocabulary — docs/corpus-derived.md's table, value by value
// ---------------------------------------------------------------------------

// A word or phrase counts only as a whole word: `hey` is not in `they`, and
// `balance` is not in `balanced`. Hyphens do not block a match, so `star` is
// found in `star-promenade` and `hey` in `hey-for-four`. An entry that begins
// or ends in punctuation gets no boundary on that side — `~`, the mark on a
// hey pass that carries into the next phrase, is written hard against the
// hand it belongs to (`NL~`), and a word boundary would never find it.
export function wordMatcher(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = /^[a-z0-9]/.test(word) ? "(?<![a-z0-9])" : "";
  const after = /[a-z0-9]$/.test(word) ? "(?![a-z0-9])" : "";
  return new RegExp(`${before}${escaped}${after}`);
}

const matcherCache = new Map();

function matches(haystack, words) {
  for (const word of words) {
    if (!matcherCache.has(word)) matcherCache.set(word, wordMatcher(word));
    if (matcherCache.get(word).test(haystack)) return true;
  }
  return false;
}

// -------------------------------------------------------------- formation

// `FormationBase` → the tag value, exactly the seven the doc's table names —
// the three facing-lines spellings it lists in its parenthesis included.
// Everything else is `other` on purpose: "Duple Minor - Indecent",
// "Duple Minor - Progressed improper" and the rest are real formations we have
// not modelled, and calling them `improper` would be a guess the doc did not
// authorise.
export const FORMATION_TAGS = new Map([
  ["Duple Minor - Improper", "improper"],
  ["Duple Minor - Becket", "becket"],
  ["Duple Minor - Proper", "proper"],
  ["Triple Minor", "triple-minor"],
  ["Circle Mixer", "circle-mixer"],
  ["Four Facing Four", "facing-lines"],
  ["Three Facing Three", "facing-lines"],
  ["Sicilian Circle", "facing-lines"],
]);

export const FORMATION_VALUES = [
  "improper",
  "becket",
  "proper",
  "triple-minor",
  "circle-mixer",
  "facing-lines",
  "other",
];

/** The `formation:` value of a record, from its verbatim FormationBase. */
export function formationTag(base) {
  return FORMATION_TAGS.get(base ?? "") ?? "other";
}

// ------------------------------------------------------------- progression

export const PROGRESSION_VALUES = ["single", "double", "none", "other"];

/**
 * The `progression:` value. The Caller's Box qualifies a progression after a
 * full stop — "Single. Swap sides", "Double. Twos and threes swap sides" — and
 * the qualifier does not change which of the four this is, so only the
 * sentence before it is read. A blank field is not "no progression", it is the
 * site not saying, so it lands in `other`.
 */
export function progressionTag(progression) {
  const head = String(progression ?? "")
    .split(".")[0]
    .trim()
    .toLowerCase();
  if (head === "single") return "single";
  if (head === "double") return "double";
  if (head === "none") return "none";
  return "other";
}

// ------------------------------------------------------------------ phrase

export const PHRASE_VALUES = ["standard", "nonstandard"];

// The two phrase-name shapes the doc calls standard: the ordinary four, and
// the eight of a dance that runs the tune twice with a `2` prefix on the
// second pass (108 records do).
const STANDARD_PHRASE_NAMES = [
  ["A1", "A2", "B1", "B2"],
  ["A1", "A2", "B1", "B2", "2A1", "2A2", "2B1", "2B2"],
];

/** `standard` when the structure is 4*8*2 AND the phrase names are one of the two shapes. */
export function phraseTag({ phraseStructure, phraseNames }) {
  if (phraseStructure !== "4*8*2") return "nonstandard";
  const standard = STANDARD_PHRASE_NAMES.some(
    (want) =>
      want.length === phraseNames.length && want.every((name, at) => name === phraseNames[at]),
  );
  return standard ? "standard" : "nonstandard";
}

// ---------------------------------------------------------------- relation

// Each value is a shorthand-token test, a whole-text pattern, or both. The
// shorthand is what the Caller's Box writes most of the time (`N2`, `SRN`,
// `TB`); the patterns catch the dances that spell it out instead, and the
// three values — diagonal, corner, six — that have no shorthand at all.
//
// "corner" excludes "contra corners", which is its own thing and belongs to
// `six` by the doc's own parenthesis.
export const RELATION_TAGS = [
  { value: "neighbor", token: /^N1?$/, text: null },
  { value: "partner", token: /^P-?\d*$/, text: null },
  { value: "next-neighbor", token: /^N(?:[2-9]|\d\d+)$/, text: null },
  { value: "prev-neighbor", token: /^N(?:0|-\d+)$/, text: null },
  { value: "shadow", token: /^S-?\d*$/, text: /(?<![a-z0-9])shadows?(?![a-z0-9])/ },
  { value: "same-role", token: /^SRN$/, text: /(?<![a-z0-9])same[- ]role(?![a-z0-9])/ },
  { value: "diagonal", token: null, text: /(?<![a-z0-9])diagonal(?:ly)?(?![a-z0-9])/ },
  { value: "corner", token: /^C-?\d*$/, text: /(?<!contra )(?<![a-z0-9])corners?(?![a-z0-9])/ },
  { value: "opposite", token: /^ON?$/, text: /(?<![a-z0-9])opposites?(?![a-z0-9])/ },
  { value: "trail-buddy", token: /^TB$/, text: /(?<![a-z0-9])trail budd(?:y|ies)(?![a-z0-9])/ },
  { value: "ones-twos", token: /^[12]$/, text: /(?<![a-z0-9])(?:ones|twos)(?![a-z0-9])/ },
  {
    value: "six",
    token: /^[12]CC?$/,
    text: /(?<![a-z0-9])(?:six|contra corners?)(?![a-z0-9])/,
  },
];

export const RELATION_VALUES = RELATION_TAGS.map((rule) => rule.value);

// ------------------------------------------------------------- concurrency

export const CONCURRENCY_VALUES = ["none", "split"];

// ------------------------------------------------------------------ timing

export const TIMING_VALUES = [
  "composite",
  "odd-counts",
  "zero-beat",
  "uncounted",
  "either",
  "swing-off-grid",
];

// `flags` key → the timing value a non-zero count means. `flags.undefined`
// (a line containing "?") has no value in the doc's table and so raises no
// tag; it is still in the record for anyone who wants it.
const TIMING_FROM_FLAGS = [
  ["composite", "composite"],
  ["oddCounts", "odd-counts"],
  ["zeroBeat", "zero-beat"],
  ["uncounted", "uncounted"],
  ["either", "either"],
];

// A swing is eight beats, or a long one of twelve or sixteen, or the ten-beat
// swing a four-beat balance leaves. Anything else is a swing the engine's
// timing has to be told about, which is the whole point of the tag.
const SWING_BEATS = new Set([8, 10, 12, 16]);

// ------------------------------------------------------------------ figure

// The doc's figure list, in the doc's order, each value beside the words that
// raise it. Adding a value is a change to the table and to this list together.
export const FIGURE_TAGS = [
  ["swing", ["swing", "swings"]],
  ["balance", ["balance", "balances"]],
  ["circle", ["circle", "circles"]],
  ["star", ["star", "stars"]],
  ["allemande", ["allemande", "allemand", "alamande"]],
  ["do-si-do", ["do-si-do", "do si do", "dosido", "do-sa-do", "seesaw", "see-saw", "see saw"]],
  ["chain", ["chain", "chains"]],
  [
    "right-left-through",
    [
      "right and left through",
      "right & left through",
      "right and left thru",
      "right & left thru",
      "rights and lefts",
    ],
  ],
  ["hey", ["hey", "heys"]],
  // A partial hey is a hey that is not a whole one: the doc names ricochet,
  // broken, a 1/4 or 3/4, and the `~` that marks a pass carried into the next
  // phrase. A plain "hey 1/2" is NOT one of them — see the note in the report.
  ["hey-partial", ["ricochet", "broken", "1/4", "3/4", "¼", "¾", "~"]],
  ["wave", ["wave", "waves", "wavy"]],
  ["long-lines", ["long lines"]],
  [
    "down-the-hall",
    [
      "down the hall",
      "up the hall",
      "down the center",
      "up the center",
      "down the centre",
      "up the centre",
      "lead down",
      "lead up",
      "sashay down",
      "sashay up",
    ],
  ],
  ["petronella", ["petronella"]],
  ["pass-through", ["pass through", "pass thru"]],
  ["square-through", ["square through", "square thru"]],
  ["pull-by", ["pull by", "pull-by", "pull past"]],
  ["roll-away", ["roll away", "roll-away", "rollaway"]],
  ["twirl", ["twirl", "twirls", "box the gnat", "swat the flea"]],
  ["mad-robin", ["mad robin", "mad-robin"]],
  ["shoulder-round", ["shoulder round", "shoulder-round", "gypsy"]],
  ["promenade", ["promenade", "promenades"]],
  ["slide", ["slide", "slides", "shift"]],
  ["slice", ["slice", "slices"]],
  ["poussette", ["poussette"]],
  ["give-and-take", ["give-and-take", "give and take"]],
  ["circulate", ["circulate"]],
  ["orbit", ["orbit", "orbits"]],
  ["contra-corners", ["contra corners", "contra corner"]],
  ["cast", ["cast"]],
  ["actives", ["actives", "active", "active couple"]],
  ["figure-eight", ["figure eight", "figure-eight", "figure 8", "fig 8"]],
  ["arch", ["arch", "arches"]],
];

export const FIGURE_VALUES = FIGURE_TAGS.map(([value]) => value);

const wordsFor = (value) => FIGURE_TAGS.find(([name]) => name === value)[1];

// A hey line is only `hey-partial` when it is also marked partial, so the two
// are decided together rather than by the flat word list. The swing words are
// borrowed by `timing:swing-off-grid`, which is a question about one line's
// beats rather than about the record.
const HEY_WORDS = wordsFor("hey");
const HEY_PARTIAL_WORDS = wordsFor("hey-partial");
const SWING_WORDS = wordsFor("swing");

/** Every tag value there is, `axis:value`, in the doc's table order. */
export const ALL_TAG_VALUES = [
  ...FORMATION_VALUES.map((value) => `formation:${value}`),
  ...PROGRESSION_VALUES.map((value) => `progression:${value}`),
  ...PHRASE_VALUES.map((value) => `phrase:${value}`),
  ...RELATION_VALUES.map((value) => `relation:${value}`),
  ...CONCURRENCY_VALUES.map((value) => `concurrency:${value}`),
  ...TIMING_VALUES.map((value) => `timing:${value}`),
  ...FIGURE_VALUES.map((value) => `figure:${value}`),
];

// ---------------------------------------------------------------------------
// Tagging a record
// ---------------------------------------------------------------------------

/** Every line of a record, children included, each as one lower-cased haystack. */
function lineHaystacks(record) {
  const out = [];
  for (const phrase of record.phrases ?? []) {
    for (const line of walkLines(phrase.lines ?? [])) {
      out.push({ line, hay: `${line.head ?? ""} ${line.text ?? ""}`.toLowerCase() });
      // A branch of a concurrent line is a figure in its own right and has to
      // be tagged as one: "Ones swing || twos do-si-do" is both.
      for (const branch of line.branches ?? []) {
        out.push({
          line: branch,
          hay: `${branch.head ?? ""} ${branch.text ?? ""}`.toLowerCase(),
        });
      }
    }
  }
  return out;
}

/**
 * The tags of one derived record: every value on every axis that applies, in
 * the doc's table order. Pure — a hand-written record in, an array of
 * `axis:value` strings out.
 */
export function tagsForRecord(record) {
  const tags = [];
  const haystacks = lineHaystacks(record);
  const wholeText = haystacks.map((entry) => entry.hay).join("\n");
  const relations = new Set();
  for (const { line } of haystacks) {
    for (const relation of line.relations ?? []) relations.add(relation);
  }

  tags.push(`formation:${formationTag(record.formation?.base)}`);
  tags.push(`progression:${progressionTag(record.progression)}`);
  tags.push(
    `phrase:${phraseTag({
      phraseStructure: record.phraseStructure,
      phraseNames: (record.phrases ?? []).map((phrase) => phrase.name ?? ""),
    })}`,
  );

  for (const rule of RELATION_TAGS) {
    const byToken = rule.token && [...relations].some((token) => rule.token.test(token));
    const byText = rule.text && rule.text.test(wholeText);
    if (byToken || byText) tags.push(`relation:${rule.value}`);
  }

  const flags = record.flags ?? {};
  tags.push(`concurrency:${flags.concurrent > 0 ? "split" : "none"}`);

  for (const [flag, value] of TIMING_FROM_FLAGS) {
    if ((flags[flag] ?? 0) > 0) tags.push(`timing:${value}`);
  }
  // An uncounted swing is `timing:uncounted` already; off-grid is about a
  // swing the source did count, and counted to something the engine's eight-
  // beat grid has no room for.
  const offGrid = haystacks.some(
    ({ line, hay }) =>
      typeof line.beats === "number" && !SWING_BEATS.has(line.beats) && matches(hay, SWING_WORDS),
  );
  if (offGrid) tags.push("timing:swing-off-grid");

  for (const [value, words] of FIGURE_TAGS) {
    if (value === "hey-partial") continue;
    if (haystacks.some(({ hay }) => matches(hay, words))) tags.push(`figure:${value}`);
  }
  const partialHey = haystacks.some(
    ({ hay }) => matches(hay, HEY_WORDS) && matches(hay, HEY_PARTIAL_WORDS),
  );
  if (partialHey) {
    // Keep the doc's order: hey-partial sits directly after hey.
    const at = tags.indexOf("figure:hey");
    if (at === -1) tags.push("figure:hey-partial");
    else tags.splice(at + 1, 0, "figure:hey-partial");
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Status, from the public repository's encoded dances
// ---------------------------------------------------------------------------

/**
 * The `status` of an encoded dance. `lab` is the dance's own field; a dance
 * every one of whose calls is the `custom` figure is `custom-only` — no such
 * dance exists today, because there is no `custom` figure yet, and the rule is
 * here so that the first one is not silently counted as shipped.
 */
export function encodedStatus(dance) {
  if (dance?.status === "lab") return "lab";
  const figures = (dance?.phrases ?? []).flatMap((phrase) => phrase.figures ?? []);
  if (figures.length > 0 && figures.every((figure) => figure.figure === "custom")) {
    return "custom-only";
  }
  return "shipped";
}

/**
 * Caller's Box id → { slug, status } for every encoded dance that names one.
 * `dances` is [{ slug, dance }]; `programme.json` names no record and drops out.
 */
export function encodedIndex(dances) {
  const byId = new Map();
  for (const { slug, dance } of dances) {
    const id = dance?.source?.callersBoxId;
    if (id === undefined || id === null || id === "") continue;
    byId.set(String(id), { slug: dance.slug ?? slug, status: encodedStatus(dance) });
  }
  return byId;
}

/**
 * Which tier of publication a record may reach, in the order
 * docs/corpus-derived.md gives: already public beats a hand clearance, a hand
 * clearance beats the fixture rule, and a record the site does not mark `full`
 * is gated whatever set it is in.
 */
export function publishableFor({ status, permission, inHandSet = false, cleared = false }) {
  if (status === "shipped" || status === "lab") return "shipped";
  if (cleared) return "cleared";
  if (inHandSet && permission === "full") return "fixture";
  return "gated";
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/**
 * The whole index, pure: derived records and clusters in, one line object per
 * record out, plus the counts --report prints. Nothing here touches the
 * filesystem, so the test drives it on hand-written records.
 */
export function buildIndex({
  records,
  clusters = [],
  encodedById = new Map(),
  handIds = new Set(),
  clearedIds = new Set(),
}) {
  const clusterById = new Map();
  const clusterOfRecord = new Map();
  for (const cluster of clusters) {
    clusterById.set(cluster.cluster, cluster);
    for (const id of cluster.callersBox ?? []) clusterOfRecord.set(String(id), cluster);
  }
  const ranked = [...clusters].sort(
    (a, b) => (b.videos ?? 0) - (a.videos ?? 0) || String(a.cluster).localeCompare(b.cluster),
  );
  const topClusters = new Set(ranked.slice(0, TOP_CLUSTERS).map((cluster) => cluster.cluster));

  const stats = {
    records: 0,
    tiers: { 1: 0, 2: 0, 3: 0, 4: 0 },
    status: { "not-started": 0, "custom-only": 0, lab: 0, shipped: 0 },
    publishable: { gated: 0, fixture: 0, cleared: 0, shipped: 0 },
    tagCounts: new Map(ALL_TAG_VALUES.map((tag) => [tag, 0])),
    topTierTagCounts: new Map(ALL_TAG_VALUES.map((tag) => [tag, 0])),
    withoutCluster: 0,
  };

  const lines = [];
  for (const record of records) {
    const id = String(record.id);
    const cluster = clusterOfRecord.get(id) ?? null;
    if (!cluster) stats.withoutCluster += 1;
    const clusterVideos = cluster?.videos ?? record.videos ?? 0;
    const portlandCount = cluster?.portland?.count ?? 0;
    const tier = tierFor({
      clusterVideos,
      portlandCount,
      inTopClusters: cluster ? topClusters.has(cluster.cluster) : false,
    });
    const encoded = encodedById.get(id) ?? null;
    const status = encoded ? encoded.status : "not-started";
    const publishable = publishableFor({
      status,
      permission: record.permission,
      inHandSet: handIds.has(id),
      cleared: clearedIds.has(id),
    });
    const tags = tagsForRecord(record);

    lines.push({
      id,
      cluster: cluster?.cluster ?? null,
      title: record.title ?? "",
      authors: record.authors ?? [],
      permission: record.permission ?? "",
      formation: record.formation?.id ?? null,
      videos: record.videos ?? 0,
      clusterVideos,
      portlandCount,
      tier,
      tags,
      tagsProvisional: true,
      status,
      slug: encoded?.slug ?? null,
      publishable,
    });

    stats.records += 1;
    stats.tiers[tier] += 1;
    stats.status[status] = (stats.status[status] ?? 0) + 1;
    stats.publishable[publishable] = (stats.publishable[publishable] ?? 0) + 1;
    for (const tag of tags) {
      stats.tagCounts.set(tag, (stats.tagCounts.get(tag) ?? 0) + 1);
      if (tier <= 2) stats.topTierTagCounts.set(tag, (stats.topTierTagCounts.get(tag) ?? 0) + 1);
    }
  }

  lines.sort((a, b) => Number(a.id) - Number(b.id));
  return { lines, stats };
}

/** The file's bytes: one compact JSON object per line, newline-terminated. */
export function formatIndex(lines) {
  return lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length > 0 ? "\n" : "");
}

/** Parses an index.jsonl back into line objects, skipping blanks. */
export function parseIndex(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * `--only` rebuilds a few records without throwing the other eleven thousand
 * away: the rebuilt lines replace the lines of the same id in the file that is
 * already there, and the result is re-sorted.
 */
export function mergeIndex(existing, rebuilt) {
  const byId = new Map(existing.map((line) => [String(line.id), line]));
  for (const line of rebuilt) byId.set(String(line.id), line);
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function jsonFileIds(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => name.slice(0, -".json".length))
    .sort((a, b) => Number(a) - Number(b));
}

/** Every encoded dance in the public repository's data/dances, slug-ordered. */
export function loadEncodedDances(dancesDir) {
  if (!existsSync(dancesDir)) return [];
  return readdirSync(dancesDir)
    .filter((name) => name.endsWith(".json") && name !== "programme.json")
    .sort()
    .map((name) => ({
      slug: name.slice(0, -".json".length),
      dance: JSON.parse(readFileSync(resolve(dancesDir, name), "utf-8")),
    }));
}

/** The ids the hand set holds, or an empty set when it has not been written yet. */
export function loadHandIds(handPath) {
  if (!existsSync(handPath)) return new Set();
  const hand = JSON.parse(readFileSync(handPath, "utf-8"));
  return new Set((hand.dances ?? []).map((dance) => String(dance.id)));
}

/** The ids a human has cleared in pins.json, or an empty set when there is none. */
export function loadClearedIds(pinsPath) {
  if (!existsSync(pinsPath)) return new Set();
  const pins = JSON.parse(readFileSync(pinsPath, "utf-8"));
  return new Set((pins.cleared ?? []).map((pin) => String(pin.id)));
}

// ------------------------------------------------------------------- the CLI

export function parseArgs(argv) {
  const args = { data: null, only: null, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data") {
      args.data = argv[++i];
      if (!args.data) throw new Error("--data requires a path");
    } else if (arg === "--only") {
      const value = argv[++i];
      if (!value) throw new Error("--only requires an id or a comma-separated list of ids");
      args.only = value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (args.only.length === 0) throw new Error("--only requires an id or comma-separated ids");
    } else if (arg === "--report") {
      args.report = true;
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  return args;
}

function printReport(stats, log = console.log) {
  log(`records: ${stats.records}`);
  log("tiers:");
  for (const tier of [1, 2, 3, 4]) log(`  ${tier}: ${stats.tiers[tier]}`);
  log("status:");
  for (const key of ["not-started", "custom-only", "lab", "shipped"]) {
    log(`  ${key}: ${stats.status[key] ?? 0}`);
  }
  log("publishable:");
  for (const key of ["gated", "fixture", "cleared", "shipped"]) {
    log(`  ${key}: ${stats.publishable[key] ?? 0}`);
  }
  log("tags (count over all records, then within tiers 1 and 2):");
  for (const tag of ALL_TAG_VALUES) {
    const all = stats.tagCounts.get(tag) ?? 0;
    const top = stats.topTierTagCounts.get(tag) ?? 0;
    log(`  ${tag.padEnd(30)} ${String(all).padStart(6)}  ${String(top).padStart(5)}`);
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`derive-index: ${error.message}`);
    process.exit(1);
  }

  const dataRoot = resolveDataRoot({ dataArg: args.data });
  const dancesDir = resolve(dataRoot, "derived/dances");
  if (!existsSync(dancesDir)) {
    console.error(`derive-index: no derived records at ${dancesDir} (run derive-dances first)`);
    process.exit(1);
  }
  const clustersPath = resolve(dataRoot, "derived/clusters.json");
  if (!existsSync(clustersPath)) {
    console.error(`derive-index: no ${clustersPath} (run derive-clusters first)`);
    process.exit(1);
  }

  const outPath = resolve(dataRoot, "derived/index.jsonl");
  const clusters = JSON.parse(readFileSync(clustersPath, "utf-8"));
  const encodedById = encodedIndex(loadEncodedDances(resolve(REPO_ROOT, "data/dances")));
  const handIds = loadHandIds(resolve(dataRoot, "derived/sets/hand.json"));
  const clearedIds = loadClearedIds(resolve(dataRoot, "derived/sets/pins.json"));

  let ids = jsonFileIds(dancesDir);
  if (args.only) {
    const wanted = new Set(args.only);
    const missing = args.only.filter((id) => !ids.includes(id));
    if (missing.length > 0) {
      console.warn(`derive-index: no derived record for id(s) ${missing.join(", ")}`);
    }
    ids = ids.filter((id) => wanted.has(id));
  }
  const records = ids.map((id) =>
    JSON.parse(readFileSync(resolve(dancesDir, `${id}.json`), "utf-8")),
  );

  const { lines, stats } = buildIndex({ records, clusters, encodedById, handIds, clearedIds });

  console.log(`derive-index: ${dancesDir} → ${outPath}`);
  console.log(`clusters: ${clusters.length}`);
  console.log(`encoded dances naming a Caller's Box id: ${encodedById.size}`);
  console.log(
    `hand set: ${handIds.size === 0 ? "not written yet (no fixtures)" : `${handIds.size} ids`}`,
  );
  console.log(`cleared pins: ${clearedIds.size}`);
  if (args.only) console.log(`only: ${args.only.join(", ")}`);

  if (args.report) {
    console.log("(report only, nothing written)");
    printReport(stats);
    return;
  }

  const merged =
    args.only && existsSync(outPath)
      ? mergeIndex(parseIndex(readFileSync(outPath, "utf-8")), lines)
      : lines;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatIndex(merged));
  console.log(`derive-index: wrote ${merged.length} lines`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
