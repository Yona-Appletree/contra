#!/usr/bin/env node
// Joins one dance to itself across the three sources and writes
// derived/clusters.json, in the shape docs/corpus-derived.md defines under
// "derived/clusters.json".
//
// Why: the same dance is in the corpus several times over. The Caller's Box
// files variants under separate ids (Heartbeat Contra is 155 videos under one
// id and 69 under another), ContraDB holds its own transcription of many of
// them, and the Portland programme sheet names dances by title alone. Nothing
// downstream can rank a dance by popularity, or find it from the source it
// happens to know, until those are one row.
//
// The join is deliberately conservative — a title match with two different
// named authors does NOT join, because there really are several dances called
// "Butter". The rules, in order:
//
//   1. A Portland row's callersBoxId joins it to that record's cluster.
//   2. Otherwise titleKey and authorKey must both match.
//   3. Otherwise titleKey matches and one side has no author at all
//      ("Traditional", "Unknown person", blank) — recorded as "title-only".
//
// Every record lands in exactly one cluster, alone if nothing joins it.
//
// The title key is the one packages/contra/src/corpus/normaliseTitle.ts
// exports, imported straight from the TypeScript source (node ≥ 22.18 strips
// the types itself, and that file imports nothing, so it needs no loader —
// unlike the package entry points that package.json's report:motion runs
// through scripts/ts-src-resolve.mjs). Reusing it, rather than restating it,
// is the point: the Portland importer's "2. Sorry, Erik" program numbers are
// stripped by the same code that strips them here. On top of it this script
// removes a "{…}" span and a trailing "(var)", which is what turns
// "Heartbeat Contra {folk processed version}" into the same key as
// "Heartbeat Contra".
//
// Usage:
//   node scripts/corpus/derive-clusters.mjs
//   node scripts/corpus/derive-clusters.mjs --data ../contra-data
//   node scripts/corpus/derive-clusters.mjs --report     # counts, writes nothing

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { titleKey as normalisedTitleKey } from "../../packages/contra/src/corpus/normaliseTitle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

/** Where the private cache lives; same precedence as the other derive scripts. */
export function resolveDataRoot({ dataArg = null, env = process.env, repoRoot = REPO_ROOT } = {}) {
  if (dataArg) return resolve(dataArg);
  if (env.CONTRA_DATA) return resolve(env.CONTRA_DATA);
  if (env.CONTRA_DATA_DIR) return resolve(env.CONTRA_DATA_DIR);
  return resolve(repoRoot, "../contra-data");
}

// ------------------------------------------------------------------- keys

const BRACED_SPAN_RE = /\{[^}]*\}/g;
const TRAILING_VAR_RE = /[\s,]*\(var\.?\)\s*$/;

/**
 * The cluster's title key: normaliseTitle's key, then the two things the
 * Caller's Box uses to mark a variant of a dance rather than a new dance —
 * a "{…}" span naming whose version it is, and a trailing "(var)".
 */
export function clusterTitleKey(title) {
  const base = normalisedTitleKey(title ?? "")
    .replace(BRACED_SPAN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.replace(TRAILING_VAR_RE, "").trim();
}

// Names that mean "nobody said". A record carrying one of these is authorless,
// which is what lets it join a titled match by rule 3.
const AUTHORLESS_KEYS = new Set([
  "",
  "traditional",
  "unknown",
  "unknown-person",
  "anon",
  "anonymous",
]);

// The two sources disagree about what an author field is: The Caller's Box
// splits co-authors into an array (["Bill Pope", "Judy Goldsmith"]) while
// ContraDB keeps one free-text string ("Bill Pope and Judy Goldsmith"). Both
// name the same dance, so both must key the same way — split on the joiners
// people actually type, then take the first name either way.
const AUTHOR_SEPARATOR_RE = /\s+and\s+|\s*&\s*|\s*,\s*|\s*;\s*/i;

/** First author, lower-cased, every run of non-alphanumerics a single hyphen. */
export function authorKey(authors) {
  const list = Array.isArray(authors) ? authors : [authors];
  for (const entry of list) {
    const first = String(entry ?? "").split(AUTHOR_SEPARATOR_RE)[0];
    const key = first
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    // An empty or punctuation-only first entry falls through to the next.
    if (key) return key;
  }
  return "";
}

/** True when the author field names nobody, so a title-only join is allowed. */
export function isAuthorless(key) {
  return AUTHORLESS_KEYS.has(key);
}

// ---------------------------------------------------------------- the join

/** A cluster's id: the two keys, as docs/corpus-derived.md states. */
function clusterId(titleKey, author) {
  return `${titleKey}--${author}`;
}

function makeCluster(titleKey, author) {
  return {
    cluster: clusterId(titleKey, author),
    titleKey,
    authorKey: author,
    callersBox: [],
    contradb: [],
    portland: null,
    videos: 0,
    canonical: null,
    note: "",
    // Not written out: the working state the joiner needs.
    members: [],
    portlandRows: [],
    titleOnly: false,
  };
}

/**
 * The Portland side of a cluster. Several rows land on one cluster often
 * enough (115 of 1,293 today) that showing only one would quietly throw
 * away a dance's programming history — the sheet lists "Cows are Watching"
 * and "Cows Are Watching, var" as separate rows of the same dance. So every
 * row is kept verbatim, highest count first, with the cluster's own `count`
 * the sum of them and `callers` the largest single row's (callers are people,
 * and the same caller appears in several rows, so summing them would count
 * one person twice).
 */
function portlandSummary(rows) {
  const sorted = [...rows].sort(
    (a, b) =>
      (b.count ?? 0) - (a.count ?? 0) ||
      (b.callers ?? 0) - (a.callers ?? 0) ||
      String(a.title).localeCompare(String(b.title)),
  );
  return {
    count: sorted.reduce((sum, row) => sum + (row.count ?? 0), 0),
    callers: sorted.reduce((most, row) => Math.max(most, row.callers ?? 0), 0),
    rows: sorted,
  };
}

/**
 * Groups the records of one title key into clusters by author.
 *
 * All records sharing a named author are one cluster. The authorless ones
 * join that cluster when there is exactly one named author under this title
 * (rule 3, "title-only"); when there are two or more they cannot be assigned
 * to either, so they stay together in a cluster of their own.
 */
function clusterOneTitle(titleKey, members) {
  const byAuthor = new Map();
  const authorless = [];
  for (const member of members) {
    if (isAuthorless(member.authorKey)) authorless.push(member);
    else {
      if (!byAuthor.has(member.authorKey)) byAuthor.set(member.authorKey, []);
      byAuthor.get(member.authorKey).push(member);
    }
  }
  const clusters = [];
  for (const [author, authored] of byAuthor) {
    const cluster = makeCluster(titleKey, author);
    cluster.members.push(...authored);
    clusters.push(cluster);
  }
  if (authorless.length === 0) return clusters;
  if (clusters.length === 1) {
    clusters[0].members.push(...authorless);
    clusters[0].titleOnly = true;
    return clusters;
  }
  const cluster = makeCluster(titleKey, "");
  cluster.members.push(...authorless);
  // Two authorless records joined under one title is itself a title-only join.
  cluster.titleOnly = authorless.length > 1;
  clusters.push(cluster);
  return clusters;
}

/**
 * The cluster a Portland row belongs to, or null when nothing takes it.
 * `candidates` are the clusters sharing the row's title key.
 */
function portlandTarget(row, candidates) {
  const rowAuthor = authorKey(row.choreographer);
  if (!isAuthorless(rowAuthor)) {
    const exact = candidates.find((cluster) => cluster.authorKey === rowAuthor);
    if (exact) return { cluster: exact, titleOnly: false };
    // A named row may still join a cluster nobody claimed — rule 3, the
    // other way round.
    const unclaimed = candidates.filter((cluster) => isAuthorless(cluster.authorKey));
    if (unclaimed.length === 1) return { cluster: unclaimed[0], titleOnly: true };
    return null;
  }
  if (candidates.length === 1) return { cluster: candidates[0], titleOnly: true };
  const unclaimed = candidates.filter((cluster) => isAuthorless(cluster.authorKey));
  if (unclaimed.length === 1) return { cluster: unclaimed[0], titleOnly: true };
  return null;
}

/**
 * The whole join. Pure: hand-written arrays in, the clusters.json array and
 * the counts --report prints out, no filesystem anywhere.
 *
 *   callersBox  [{ id, title, authors, videos }]
 *   contradb    [{ id, title, choreographer }]
 *   portland    [{ title, choreographer, count, callers, callersBoxId? }]
 */
export function buildClusters({ callersBox = [], contradb = [], portland = [] } = {}) {
  const members = [
    ...callersBox.map((record) => ({
      source: "callers-box",
      id: String(record.id),
      titleKey: clusterTitleKey(record.title),
      authorKey: authorKey(record.authors),
      videos: Number(record.videos) || 0,
    })),
    ...contradb.map((record) => ({
      source: "contradb",
      id: String(record.id),
      titleKey: clusterTitleKey(record.title),
      authorKey: authorKey(record.choreographer),
      videos: 0,
    })),
  ];

  const byTitle = new Map();
  for (const member of members) {
    if (!byTitle.has(member.titleKey)) byTitle.set(member.titleKey, []);
    byTitle.get(member.titleKey).push(member);
  }

  const clusters = [];
  const byTitleKey = new Map();
  const byCallersBoxId = new Map();
  for (const [titleKey, titleMembers] of byTitle) {
    const made = clusterOneTitle(titleKey, titleMembers);
    byTitleKey.set(titleKey, made);
    for (const cluster of made) {
      clusters.push(cluster);
      for (const member of cluster.members) {
        if (member.source === "callers-box") byCallersBoxId.set(member.id, cluster);
      }
    }
  }

  const stats = {
    callersBoxRecords: callersBox.length,
    contradbRecords: contradb.length,
    portlandRows: portland.length,
    portlandJoinedById: 0,
    portlandJoinedByAuthor: 0,
    portlandJoinedByTitleOnly: 0,
    portlandUnjoined: 0,
    portlandIdNotInCorpus: 0,
    portlandExtraRowsOnACluster: 0,
  };
  const unjoinedRows = [];

  // Highest count first, so that when several rows land on one cluster the
  // one the cluster shows does not depend on the sheet's own order.
  const rows = [...portland].sort(
    (a, b) =>
      (b.count ?? 0) - (a.count ?? 0) ||
      (b.callers ?? 0) - (a.callers ?? 0) ||
      String(a.title).localeCompare(String(b.title)),
  );
  for (const row of rows) {
    let cluster = null;
    let titleOnly = false;
    if (row.callersBoxId != null && row.callersBoxId !== "") {
      cluster = byCallersBoxId.get(String(row.callersBoxId)) ?? null;
      if (cluster) stats.portlandJoinedById += 1;
      else stats.portlandIdNotInCorpus += 1;
    }
    const key = clusterTitleKey(row.title);
    if (!cluster) {
      const target = portlandTarget(row, byTitleKey.get(key) ?? []);
      if (target) {
        cluster = target.cluster;
        titleOnly = target.titleOnly;
        if (titleOnly) stats.portlandJoinedByTitleOnly += 1;
        else stats.portlandJoinedByAuthor += 1;
      }
    }
    if (!cluster) {
      // Nothing in the corpus takes this row: it becomes a cluster of its
      // own, so the row is still in the table and still countable.
      const author = authorKey(row.choreographer);
      const existing = (byTitleKey.get(key) ?? []).find(
        (candidate) => candidate.members.length === 0 && candidate.authorKey === author,
      );
      cluster = existing ?? makeCluster(key, author);
      if (!existing) {
        clusters.push(cluster);
        if (!byTitleKey.has(key)) byTitleKey.set(key, []);
        byTitleKey.get(key).push(cluster);
      }
      stats.portlandUnjoined += 1;
      unjoinedRows.push(row);
    }
    if (cluster.portlandRows.length > 0) stats.portlandExtraRowsOnACluster += 1;
    cluster.portlandRows.push(row);
    if (titleOnly) cluster.titleOnly = true;
  }

  const finished = clusters.map((cluster) => finishCluster(cluster));
  ensureUniqueIds(finished);
  finished.sort((a, b) => b.videos - a.videos || a.cluster.localeCompare(b.cluster));

  stats.clusters = finished.length;
  stats.singletons = finished.filter((c) => memberCount(c) === 1).length;
  stats.multiIdClusters = finished.filter(
    (c) => c.callersBox.length + c.contradb.length > 1,
  ).length;
  stats.titleOnlyClusters = finished.filter((c) => c.note === "title-only").length;

  return { clusters: finished, stats, unjoinedRows };
}

function memberCount(cluster) {
  return cluster.callersBox.length + cluster.contradb.length + (cluster.portland ? 1 : 0);
}

/** Working state off, the documented fields on, members in a fixed order. */
function finishCluster(cluster) {
  const callersBox = cluster.members
    .filter((member) => member.source === "callers-box")
    .sort((a, b) => b.videos - a.videos || Number(a.id) - Number(b.id));
  const contradb = cluster.members
    .filter((member) => member.source === "contradb")
    .sort((a, b) => Number(a.id) - Number(b.id));
  return {
    cluster: cluster.cluster,
    titleKey: cluster.titleKey,
    authorKey: cluster.authorKey,
    callersBox: callersBox.map((member) => member.id),
    contradb: contradb.map((member) => member.id),
    portland: cluster.portlandRows.length > 0 ? portlandSummary(cluster.portlandRows) : null,
    videos: callersBox.reduce((sum, member) => sum + member.videos, 0),
    canonical: callersBox[0]?.id ?? contradb[0]?.id ?? null,
    note: cluster.titleOnly ? "title-only" : "",
  };
}

/**
 * Cluster ids are titleKey + "--" + authorKey, which two different clusters
 * could in principle collide on (a title that itself contains "--"). Rather
 * than let one silently overwrite the other downstream, the later one gets a
 * numeric suffix.
 */
function ensureUniqueIds(clusters) {
  const seen = new Set();
  for (const cluster of clusters) {
    if (!seen.has(cluster.cluster)) {
      seen.add(cluster.cluster);
      continue;
    }
    let suffix = 2;
    while (seen.has(`${cluster.cluster}-${suffix}`)) suffix += 1;
    cluster.cluster = `${cluster.cluster}-${suffix}`;
    seen.add(cluster.cluster);
  }
  return clusters;
}

// ------------------------------------------------------------- the sources

/** A derived Caller's Box record, reduced to what the join needs. */
export function memberFromDerivedDance(record) {
  return {
    id: String(record.id),
    title: record.title ?? "",
    authors: record.authors ?? [],
    videos: Number(record.videos) || 0,
  };
}

/**
 * The same, from a raw Caller's Box record. derived/dances/ is written by
 * derive-dances.mjs and may not exist yet, or may cover only the records with
 * figures; reading the raw file for the rest means a clustering run is
 * complete today rather than after the whole chain has been run.
 */
export function memberFromRawDance(raw) {
  return {
    id: String(raw.ID),
    title: raw.Name ?? "",
    authors: raw.Authors ?? [],
    videos: Array.isArray(raw.Videos) ? raw.Videos.length : 0,
  };
}

/** A ContraDB member, from a derived record or from a raw manifest line. */
export function memberFromContraDb(record) {
  return {
    id: String(record.id),
    title: record.title ?? "",
    choreographer: record.choreographer ?? "",
  };
}

function jsonFileIds(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => name.slice(0, -5));
}

/** Every Caller's Box record, derived where there is one, raw where there is not. */
function loadCallersBox(dataRoot) {
  const derivedDir = resolve(dataRoot, "derived/dances");
  const rawDir = resolve(dataRoot, "corpus-raw/callers-box");
  const derivedIds = new Set(jsonFileIds(derivedDir));
  const ids = [...new Set([...jsonFileIds(rawDir), ...derivedIds])].sort(
    (a, b) => Number(a) - Number(b),
  );
  const records = [];
  let fromDerived = 0;
  for (const id of ids) {
    if (derivedIds.has(id)) {
      records.push(
        memberFromDerivedDance(
          JSON.parse(readFileSync(resolve(derivedDir, `${id}.json`), "utf-8")),
        ),
      );
      fromDerived += 1;
      continue;
    }
    records.push(
      memberFromRawDance(JSON.parse(readFileSync(resolve(rawDir, `${id}.json`), "utf-8"))),
    );
  }
  return { records, fromDerived, fromRaw: records.length - fromDerived };
}

/** Every ContraDB record, derived where there is one, from the manifest where not. */
function loadContraDb(dataRoot) {
  const derivedDir = resolve(dataRoot, "derived/contradb");
  const ids = jsonFileIds(derivedDir);
  const records = ids.map((id) =>
    memberFromContraDb(JSON.parse(readFileSync(resolve(derivedDir, `${id}.json`), "utf-8"))),
  );
  const known = new Set(ids);
  let fromManifest = 0;
  const manifestPath = resolve(dataRoot, "corpus-raw/contradb/manifest.jsonl");
  if (existsSync(manifestPath)) {
    const byId = new Map();
    for (const line of readFileSync(manifestPath, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        byId.set(String(parsed.id), parsed);
      } catch {
        // A truncated last line from a killed crawl; skip it.
      }
    }
    for (const [id, line] of byId) {
      if (known.has(id) || line.status !== "ok") continue;
      records.push(memberFromContraDb(line));
      fromManifest += 1;
    }
  }
  records.sort((a, b) => Number(a.id) - Number(b.id));
  return { records, fromDerived: ids.length, fromManifest };
}

// Prettier resolves its config from the path of the file being formatted, so
// this does too, memoised per directory.
const prettierOptionsByDir = new Map();

/**
 * The table as bytes: prettier's own JSON shape, formatted by prettier itself
 * rather than by an imitation of it, so that running prettier over the file
 * afterwards changes nothing and a second derive run is a no-op.
 */
export async function formatJson(value, filePath = null) {
  const dir = filePath ? dirname(filePath) : "";
  if (!prettierOptionsByDir.has(dir)) {
    prettierOptionsByDir.set(dir, (filePath ? await resolveConfig(filePath) : null) ?? {});
  }
  return format(JSON.stringify(value, null, 2), {
    ...prettierOptionsByDir.get(dir),
    parser: "json",
  });
}

// ------------------------------------------------------------------- the CLI

export function parseArgs(argv) {
  const args = { data: null, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data") {
      args.data = argv[++i];
      if (!args.data) throw new Error("--data requires a path");
    } else if (arg === "--report") {
      args.report = true;
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`derive-clusters: ${error.message}`);
    process.exit(1);
  }

  const dataRoot = resolveDataRoot({ dataArg: args.data });
  if (!existsSync(resolve(dataRoot, "corpus-raw"))) {
    console.error(`derive-clusters: no cache at ${dataRoot} (pass --data or set CONTRA_DATA)`);
    process.exit(1);
  }
  const portlandPath = resolve(REPO_ROOT, "data/corpus/portland-programs.json");
  const portland = existsSync(portlandPath)
    ? (JSON.parse(readFileSync(portlandPath, "utf-8")).dances ?? [])
    : [];

  const dances = loadCallersBox(dataRoot);
  const contradb = loadContraDb(dataRoot);
  const { clusters, stats, unjoinedRows } = buildClusters({
    callersBox: dances.records,
    contradb: contradb.records,
    portland,
  });

  const outPath = resolve(dataRoot, "derived/clusters.json");
  if (!args.report) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, await formatJson(clusters, outPath));
  }

  console.log(`derive-clusters: ${dataRoot} → ${outPath}`);
  console.log(
    `Caller's Box records: ${stats.callersBoxRecords} ` +
      `(${dances.fromDerived} derived, ${dances.fromRaw} read from the raw cache)`,
  );
  console.log(
    `ContraDB records: ${stats.contradbRecords} ` +
      `(${contradb.fromDerived} derived, ${contradb.fromManifest} from the manifest)`,
  );
  console.log(`Portland rows: ${stats.portlandRows}`);
  console.log(`clusters: ${stats.clusters}${args.report ? " (report only, nothing written)" : ""}`);
  console.log(`  singletons (one record and nothing else): ${stats.singletons}`);
  console.log(`  holding more than one source id: ${stats.multiIdClusters}`);
  console.log(`  joined by title alone ("title-only"): ${stats.titleOnlyClusters}`);
  console.log(
    `Portland rows joined: ${stats.portlandJoinedById + stats.portlandJoinedByAuthor + stats.portlandJoinedByTitleOnly}` +
      ` (${stats.portlandJoinedById} by callersBoxId, ${stats.portlandJoinedByAuthor} by title+author,` +
      ` ${stats.portlandJoinedByTitleOnly} by title alone)`,
  );
  console.log(`Portland rows unjoined (a cluster of their own): ${stats.portlandUnjoined}`);
  console.log(
    `Portland rows whose callersBoxId is not in the corpus: ${stats.portlandIdNotInCorpus}`,
  );
  console.log(
    `Portland rows landing on a cluster that already had one: ${stats.portlandExtraRowsOnACluster}`,
  );

  console.log("\nten largest clusters by videos:");
  for (const cluster of clusters.slice(0, 10)) {
    console.log(
      `  ${String(cluster.videos).padStart(5)}  ${cluster.cluster}` +
        `  [cb ${cluster.callersBox.join(",") || "-"}]` +
        `  [cdb ${cluster.contradb.join(",") || "-"}]` +
        `${cluster.portland ? `  [portland ${cluster.portland.count}]` : ""}` +
        `${cluster.note ? `  (${cluster.note})` : ""}`,
    );
  }

  console.log("\nten Portland rows that failed to join:");
  for (const row of [...unjoinedRows]
    .sort(
      (a, b) => (b.count ?? 0) - (a.count ?? 0) || String(a.title).localeCompare(String(b.title)),
    )
    .slice(0, 10)) {
    console.log(
      `  ${String(row.count ?? 0).padStart(3)}×  ${JSON.stringify(row.title)}` +
        ` by ${JSON.stringify(row.choreographer ?? "")}` +
        `${row.callersBoxId ? ` (callersBoxId ${row.callersBoxId}, not in the corpus)` : ""}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
