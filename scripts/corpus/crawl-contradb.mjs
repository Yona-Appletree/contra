#!/usr/bin/env node
// Resumable, polite, re-runnable crawler for ContraDB (https://contradb.com).
//
// ContraDB is the second dance database this repository reads, beside The
// Caller's Box (`crawl-callers-box.mjs`). It exists here for one thing The
// Caller's Box does not carry: a per-figure progression mark (the pilcrow,
// "⁋", which ContraDB's own curation guide asks transcribers to place on
// the figure after which the progression happens).
//
// Same manners as the Caller's Box crawler, by the user's ruling of
// 2026-09-16 ("same rules as caller's box"): one request every two seconds,
// a User-Agent naming a human contact, raw bytes cached under
// data/local/corpus-raw/contradb/ (gitignored — nothing this script writes
// ever enters git), and no transformation, normalisation or publication
// here. See docs/corpus-crawl.md for the reasoning, what ContraDB exposes,
// and the visibility rules this crawler applies.
//
// How a run works:
//   1. One POST to ContraDB's public search API (`/api/v1/dances`) lists
//      every dance visible to an anonymous visitor: id, title,
//      choreographer, formation, transcriber, publish tier, timestamps.
//      Figures are NOT in that listing.
//   2. One GET of `/choreographers`, the public consent table (never /
//      sometimes / always / deceased-and-unknown per choreographer).
//   3. One GET of `/dances/<id>` for every dance that is `publish:
//      "everywhere"` AND is new since the last run, or whose `updated_at`
//      has changed, or whose last fetch errored. Dances in the
//      "sketchbook" tier are recorded in the manifest as skipped and never
//      fetched: ContraDB serves their pages with `X-Robots-Tag: noindex`,
//      and this crawler treats that header as a hard stop even if one
//      somehow arrives (status "noindex", body discarded). Private dances
//      never appear in the listing at all.
//
// Re-running is the update mechanism: the listing is cheap (one request),
// and only new or changed dances cost a page fetch each.
//
// Usage:
//   CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-contradb.mjs
//   CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-contradb.mjs --plan
//   CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-contradb.mjs --dry-run 5
//   node scripts/corpus/crawl-contradb.mjs --report
//
// CONTRA_CRAWL_CONTACT (required to fetch; not needed for --report) is a
// contact address named in the crawler's User-Agent, so a maintainer who
// wants the crawl to slow down or stop can reach a human immediately. The
// script refuses to run without it.

import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
// Where the cache lives: $CONTRA_DATA_DIR if set (the private contra-data
// checkout, see data/README.md), else data/local/ — which is gitignored and,
// on the user's machine, a symlink to that same checkout.
const DATA_ROOT = process.env.CONTRA_DATA_DIR
  ? resolve(process.env.CONTRA_DATA_DIR)
  : resolve(REPO_ROOT, "data/local");
const DATA_DIR = resolve(DATA_ROOT, "corpus-raw/contradb");
const MANIFEST_PATH = resolve(DATA_DIR, "manifest.jsonl");
const CHOREOGRAPHERS_PATH = resolve(DATA_DIR, "choreographers.html");

const REPO_URL = "https://github.com/Yona-Appletree/contra";
const PROJECT_NAME = "contra-simulator";
export const BASE_URL = "https://contradb.com";
export const API_URL = `${BASE_URL}/api/v1/dances`;
export const CHOREOGRAPHERS_URL = `${BASE_URL}/choreographers`;

// ContraDB's robots.txt disallows nothing and states no crawl-delay; the
// two seconds are carried over from the Caller's Box crawler by the user's
// ruling ("same rules as caller's box"). A floor, never a target.
export const CRAWL_DELAY_MS = 2000;
// A network error backs off, doubling each retry, capped at one minute.
const MAX_BACKOFF_MS = 60_000;
// Retried up to three times beyond the first attempt before giving up.
const MAX_RETRIES = 3;
// The listing is read in pages of this many dances, ordered by the API's
// default (created_at descending, so newest first — stable across pages).
// The server scans every dance per request whatever `count` is, so fewer,
// larger pages would be lighter on it — but as of 2026-09-16 a page of 500
// answers HTTP 500 while 200 is fine, and one particular 200-page (offset
// 400) fails too: some single dance in it crashes the serializer. So a
// page that answers 5xx is halved and retried, down to a single dance;
// a single dance that still fails is recorded as unlistable at that
// offset and stepped over.
export const INDEX_PAGE_SIZE = 200;
const PROGRESS_EVERY = 100;

/** The exact page URL fetched for a given ContraDB dance id. */
export function danceUrl(id) {
  return `${BASE_URL}/dances/${id}`;
}

/** The descriptive User-Agent the crawl identifies itself with. */
export function buildUserAgent(contact) {
  return `${PROJECT_NAME}-corpus-crawler (+${REPO_URL}; contact: ${contact})`;
}

/**
 * Reads an existing manifest.jsonl (if any) into a Map<id, line>. The
 * manifest is append-only and a dance may appear more than once (each
 * refresh appends a new line), so the LAST line for an id wins. Lines that
 * fail to parse (a truncated last line from a killed run) are skipped with
 * a warning; that id is simply treated as not-yet-fetched and refetched,
 * which is safe because the crawl is idempotent per id.
 */
export function loadManifest(manifestPath) {
  const byId = new Map();
  if (!existsSync(manifestPath)) return byId;
  const text = readFileSync(manifestPath, "utf-8");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      byId.set(parsed.id, parsed);
    } catch {
      console.warn(`crawl-contradb: skipping unparseable manifest line: ${line.slice(0, 80)}`);
    }
  }
  return byId;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Reads the whole anonymous-visible dance listing from the search API,
 * `pageSize` dances per request with the crawl delay between requests.
 * Returns the parsed dances (deduplicated by id, first sighting wins — a
 * dance entered mid-run shifts the newest-first order by one) plus each
 * page's raw bytes (written to disk by the caller, byte for byte) and the
 * offsets of any single dances the server could not list (`unlistable`).
 *
 * A 5xx answer halves the page and retries at the same offset; a single
 * dance that still answers 5xx is stepped over and its offset recorded.
 * Any other non-2xx, or the fetch throwing, throws: the listing is the one
 * thing a run cannot proceed without.
 */
export async function fetchIndex({
  fetchImpl,
  userAgent,
  sleepImpl = sleep,
  pageSize = INDEX_PAGE_SIZE,
  crawlDelayMs = CRAWL_DELAY_MS,
  log = () => {},
}) {
  const dances = [];
  const seen = new Set();
  const pages = [];
  const unlistable = [];
  let offset = 0;
  let count = pageSize;
  let numberMatching = null;
  let numberSearched = null;
  let first = true;
  for (;;) {
    if (!first) await sleepImpl(crawlDelayMs);
    first = false;
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        "User-Agent": userAgent,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ count, offset }),
    });
    if (res.status >= 500 && res.status < 600) {
      if (count > 1) {
        const halved = Math.ceil(count / 2);
        log(
          `crawl-contradb: listing HTTP ${res.status} at offset=${offset} count=${count}; retrying with count=${halved}`,
        );
        count = halved;
        continue;
      }
      log(
        `crawl-contradb: listing HTTP ${res.status} for the single dance at offset=${offset}; stepping over it`,
      );
      unlistable.push(offset);
      offset += 1;
      count = pageSize;
      if (numberMatching != null && offset >= numberMatching) break;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${API_URL} (offset=${offset})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const parsed = JSON.parse(buf.toString("utf-8"));
    if (!parsed || !Array.isArray(parsed.dances)) {
      throw new Error(
        `unexpected index shape from ${API_URL}: ${buf.toString("utf-8").slice(0, 80)}`,
      );
    }
    pages.push(buf);
    for (const dance of parsed.dances) {
      if (seen.has(dance.id)) continue;
      seen.add(dance.id);
      dances.push(dance);
    }
    numberMatching = parsed.numberMatching;
    numberSearched = parsed.numberSearched;
    offset += parsed.dances.length;
    count = pageSize;
    if (parsed.dances.length === 0 || offset >= numberMatching) break;
  }
  return { dances, pages, unlistable, numberMatching, numberSearched };
}

/**
 * Decides, from the fresh listing and the manifest, what this run does per
 * dance. Pure, so it is the thing the tests pin down.
 *
 *   fetch      — publish "everywhere", and new / updated_at changed / last
 *                attempt errored / previously skipped
 *   unchanged  — publish "everywhere", already cached at this updated_at
 *   skip       — any other publish tier (sketchbook today); recorded in
 *                the manifest as status "skipped" once per updated_at, and
 *                never fetched
 *   gone       — ids the manifest knows that the listing no longer lists
 *                (unpublished, made private, or deleted since); reported,
 *                not touched, and their cached page is left in place
 */
export function planRun(indexDances, manifestById) {
  const plan = { fetch: [], unchanged: [], skip: [], skipAlreadyRecorded: [], gone: [] };
  const listed = new Set();
  for (const dance of indexDances) {
    listed.add(dance.id);
    const prior = manifestById.get(dance.id);
    if (dance.publish !== "everywhere") {
      if (prior && prior.status === "skipped" && prior.updatedAt === dance.updated_at) {
        plan.skipAlreadyRecorded.push(dance);
      } else {
        plan.skip.push(dance);
      }
      continue;
    }
    const needsFetch =
      !prior ||
      prior.status === "error" ||
      prior.status === "skipped" ||
      prior.updatedAt !== dance.updated_at;
    (needsFetch ? plan.fetch : plan.unchanged).push(dance);
  }
  for (const [id, line] of manifestById) {
    if (!listed.has(id) && line.status !== "gone") plan.gone.push(line);
  }
  return plan;
}

/**
 * One page fetch attempt, no retry. 404 (the dance was made private or
 * deleted between the listing and now) is "missing", not an error. A page
 * that arrives with `X-Robots-Tag: noindex` is "noindex" and its body is
 * discarded — ContraDB puts that header on every dance it does not want
 * searchable, and this crawler takes it at its word. Anything else non-2xx,
 * or the fetch throwing, throws so the caller can retry with backoff.
 */
async function fetchDanceOnce(id, { fetchImpl, userAgent }) {
  const url = danceUrl(id);
  const res = await fetchImpl(url, {
    headers: { "User-Agent": userAgent, Accept: "text/html" },
  });
  if (res.status === 404) return { outcome: "missing", url, bytes: 0 };
  if (!res.ok) throw new Error(`HTTP ${res.status} for id=${id}`);
  const robots =
    res.headers && typeof res.headers.get === "function" ? res.headers.get("x-robots-tag") : null;
  if (robots && /noindex/i.test(robots)) return { outcome: "noindex", url, bytes: 0 };
  const buf = Buffer.from(await res.arrayBuffer());
  return { outcome: "ok", url, buf };
}

/**
 * Fetches one dance page with retry-with-backoff. Returns a settled outcome
 * — "ok" | "missing" | "noindex" | "error" — never throws. `sleepImpl` is
 * injectable so tests can run the backoff logic without real waiting.
 */
export async function fetchWithRetry(id, { fetchImpl, userAgent, sleepImpl = sleep }) {
  let attempt = 0;
  for (;;) {
    try {
      return await fetchDanceOnce(id, { fetchImpl, userAgent });
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        return {
          outcome: "error",
          url: danceUrl(id),
          error: err && err.message ? err.message : String(err),
        };
      }
      const backoff = Math.min(CRAWL_DELAY_MS * 2 ** attempt, MAX_BACKOFF_MS);
      console.log(
        `  id=${id}: retry ${attempt}/${MAX_RETRIES} in ${backoff}ms (${err && err.message ? err.message : err})`,
      );
      await sleepImpl(backoff);
    }
  }
}

/**
 * Builds the exact manifest line for one dance. Every descriptive field is
 * copied verbatim from the listing (never parsed out of the page), so the
 * manifest is usable on its own for counts and cross-referencing. `status`
 * is "ok" | "missing" | "noindex" | "error" | "skipped".
 */
export function buildManifestLine({ dance, fetchedAt, outcome, buf, error }) {
  const line = {
    id: dance.id,
    url: danceUrl(dance.id),
    fetchedAt,
    status: outcome,
    sha256: buf ? createHash("sha256").update(buf).digest("hex") : null,
    bytes: buf ? buf.length : outcome === "error" ? null : 0,
    publish: dance.publish ?? null,
    title: dance.title ?? null,
    choreographer: dance.choreographer_name ?? null,
    choreographerId: dance.choreographer_id ?? null,
    formation: dance.formation ?? null,
    transcriber: dance.user_name ?? null,
    createdAt: dance.created_at ?? null,
    updatedAt: dance.updated_at ?? null,
  };
  if (error) line.error = error;
  return line;
}

/**
 * Counts, in one cached dance page, the figures and how many carry the
 * progression mark. Used by --report only — nothing here is persisted.
 * ContraDB renders each figure as `<div class="show-figure">…</div>` and
 * appends "⁋" to a figure's text when its `progression` flag is set.
 */
export function countProgressions(html) {
  const figures = [...html.matchAll(/<div class="show-figure">([\s\S]*?)<\/div>/g)];
  const marked = figures.filter((m) => m[1].includes("⁋")).length;
  return { figures: figures.length, marked };
}

/**
 * The main run. Everything that touches the network, the clock, or the
 * disk is injectable so `crawl-contradb.test.mjs` can drive it with a fake
 * fetch, zero delay, and arrays instead of files.
 */
export async function runCrawl({
  fetchImpl,
  userAgent,
  manifestById,
  planOnly = false,
  dryRunCount = Infinity,
  crawlDelayMs = CRAWL_DELAY_MS,
  sleepImpl = sleep,
  writeIndexPage,
  writeChoreographers,
  writeRaw,
  appendManifest,
  now = () => new Date().toISOString(),
  log = console.log,
}) {
  const index = await fetchIndex({ fetchImpl, userAgent, sleepImpl, crawlDelayMs, log });
  index.pages.forEach((buf, n) => writeIndexPage(n, buf));
  const plan = planRun(index.dances, manifestById);
  log(
    `crawl-contradb: listing has ${index.dances.length} dances in ${index.pages.length} pages ` +
      `(numberSearched=${index.numberSearched} numberMatching=${index.numberMatching}` +
      `${index.unlistable.length ? `, unlistable offsets: ${index.unlistable.join(", ")}` : ""})`,
  );
  log(
    `crawl-contradb: plan — fetch=${plan.fetch.length} unchanged=${plan.unchanged.length} ` +
      `skip=${plan.skip.length + plan.skipAlreadyRecorded.length} ` +
      `(${plan.skip.length} newly recorded) gone=${plan.gone.length}`,
  );
  for (const line of plan.gone) {
    log(`  gone from listing: id=${line.id} "${line.title}" (last status ${line.status})`);
  }

  const counts = { ok: 0, missing: 0, noindex: 0, error: 0, skipped: 0, unchanged: 0 };
  counts.unchanged = plan.unchanged.length;
  if (planOnly) return { counts, plan, index };

  await sleepImpl(crawlDelayMs);
  const choreoRes = await fetchImpl(CHOREOGRAPHERS_URL, {
    headers: { "User-Agent": userAgent, Accept: "text/html" },
  });
  if (choreoRes.ok) {
    writeChoreographers(Buffer.from(await choreoRes.arrayBuffer()));
    log(`crawl-contradb: choreographers page cached`);
  } else {
    log(`crawl-contradb: choreographers page HTTP ${choreoRes.status}; continuing without it`);
  }

  for (const dance of plan.skip) {
    const line = buildManifestLine({ dance, fetchedAt: now(), outcome: "skipped" });
    appendManifest(line);
    manifestById.set(dance.id, line);
    counts.skipped += 1;
  }

  let attempted = 0;
  for (const dance of plan.fetch) {
    if (attempted >= dryRunCount) break;
    await sleepImpl(crawlDelayMs);
    const result = await fetchWithRetry(dance.id, { fetchImpl, userAgent, sleepImpl });
    const line = buildManifestLine({ dance, fetchedAt: now(), ...result });
    appendManifest(line);
    manifestById.set(dance.id, line);
    if (result.outcome === "ok") writeRaw(dance.id, result.buf);
    counts[result.outcome] += 1;
    attempted += 1;
    log(
      `[${attempted}/${plan.fetch.length}] id=${dance.id} status=${result.outcome}` +
        (result.outcome === "ok"
          ? ` bytes=${line.bytes} "${dance.title}"`
          : result.outcome === "error"
            ? ` (${result.error})`
            : ""),
    );
    if (attempted % PROGRESS_EVERY === 0) {
      log(
        `-- progress: ${attempted} pages this run (ok=${counts.ok} missing=${counts.missing} ` +
          `noindex=${counts.noindex} error=${counts.error}) --`,
      );
    }
  }

  return { counts, plan, index };
}

function realWriteIndexPage(n, buf) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(resolve(DATA_DIR, `index-page-${n}.json`), buf);
}

function realWriteChoreographers(buf) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CHOREOGRAPHERS_PATH, buf);
}

function realWriteRaw(id, buf) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(resolve(DATA_DIR, `${id}.html`), buf);
}

function realAppendManifest(line) {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(MANIFEST_PATH, `${JSON.stringify(line)}\n`);
}

export function parseArgs(argv) {
  const args = { dryRun: null, plan: false, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 0) {
        console.error("crawl-contradb: --dry-run requires a non-negative integer");
        process.exit(1);
      }
      args.dryRun = value;
    } else if (arg === "--plan") {
      args.plan = true;
    } else if (arg === "--report") {
      args.report = true;
    } else {
      console.error(`crawl-contradb: unknown argument "${arg}"`);
      process.exit(1);
    }
  }
  return args;
}

function printReport() {
  const manifestById = loadManifest(MANIFEST_PATH);
  const byStatus = new Map();
  const byPublish = new Map();
  let totalBytes = 0;
  for (const line of manifestById.values()) {
    byStatus.set(line.status, (byStatus.get(line.status) ?? 0) + 1);
    byPublish.set(line.publish ?? "unknown", (byPublish.get(line.publish ?? "unknown") ?? 0) + 1);
    if (line.status === "ok") totalBytes += line.bytes ?? 0;
  }
  console.log(`manifest: ${MANIFEST_PATH}`);
  console.log(`dances known: ${manifestById.size}`);
  console.log("by status:");
  for (const [status, count] of [...byStatus.entries()].sort())
    console.log(`  ${status}: ${count}`);
  console.log("by publish tier:");
  for (const [tier, count] of [...byPublish.entries()].sort()) console.log(`  ${tier}: ${count}`);
  console.log(`total bytes (ok only): ${totalBytes}`);

  if (!existsSync(DATA_DIR)) return;
  const pages = readdirSync(DATA_DIR).filter((name) => /^\d+\.html$/.test(name));
  let withMark = 0;
  let withoutMark = 0;
  let figures = 0;
  let marked = 0;
  const markHistogram = new Map();
  for (const name of pages) {
    const stats = countProgressions(readFileSync(resolve(DATA_DIR, name), "utf-8"));
    figures += stats.figures;
    marked += stats.marked;
    if (stats.marked > 0) withMark += 1;
    else withoutMark += 1;
    markHistogram.set(stats.marked, (markHistogram.get(stats.marked) ?? 0) + 1);
  }
  console.log(`cached pages: ${pages.length}`);
  console.log(`  with at least one progression mark (⁋): ${withMark}`);
  console.log(`  with none: ${withoutMark}`);
  console.log(`  figures total: ${figures}, marked: ${marked}`);
  console.log("  marks per dance:");
  for (const [n, count] of [...markHistogram.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${n}: ${count}`);
  }
  console.log(`choreographers page cached: ${existsSync(CHOREOGRAPHERS_PATH) ? "yes" : "no"}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.report) {
    printReport();
    return;
  }

  const contact = process.env.CONTRA_CRAWL_CONTACT;
  if (!contact) {
    console.error(
      "crawl-contradb: CONTRA_CRAWL_CONTACT is required (a contact address named in the " +
        "crawler's User-Agent, so a maintainer can reach a human). Refusing to run without it.",
    );
    process.exit(1);
  }

  const userAgent = buildUserAgent(contact);
  const manifestById = loadManifest(MANIFEST_PATH);
  const dryRunCount = args.dryRun != null ? args.dryRun : Infinity;

  console.log(`crawl-contradb: User-Agent: ${userAgent}`);
  console.log(
    `crawl-contradb: manifest knows ${manifestById.size} dances, rate=1 req/${CRAWL_DELAY_MS}ms`,
  );
  if (args.plan) console.log("crawl-contradb: plan only — one listing request, no pages fetched");
  if (dryRunCount !== Infinity)
    console.log(`crawl-contradb: dry run, at most ${dryRunCount} pages`);

  const started = Date.now();
  const { counts } = await runCrawl({
    fetchImpl: fetch,
    userAgent,
    manifestById,
    planOnly: args.plan,
    dryRunCount,
    writeIndexPage: realWriteIndexPage,
    writeChoreographers: realWriteChoreographers,
    writeRaw: realWriteRaw,
    appendManifest: realAppendManifest,
  });
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `crawl-contradb: done. ok=${counts.ok} missing=${counts.missing} noindex=${counts.noindex} ` +
      `error=${counts.error} skipped=${counts.skipped} unchanged=${counts.unchanged} elapsed=${elapsedS}s`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
