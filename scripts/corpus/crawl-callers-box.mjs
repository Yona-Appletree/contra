#!/usr/bin/env node
// Resumable, polite crawler for The Caller's Box
// (https://www.ibiblio.org/contradance/thecallersbox/). Fetches each
// dance's JSON export (`dance.php?id=<id>&format=JSON`) once, ever, ids
// ascending, one request every two seconds — ibiblio's own robots.txt
// `Crawl-delay: 2`, honored site-wide because the site asked (director
// ruling DD32; see docs/corpus-crawl.md).
//
// Nothing is transformed, normalised or filtered here: a successful
// fetch's body is written byte-for-byte to
// data/local/corpus-raw/callers-box/<id>.json, and every id attempted
// (hit, miss, or error) gets one line in
// data/local/corpus-raw/callers-box/manifest.jsonl. `data/local/` is
// gitignored — nothing this script writes ever enters git (see
// docs/adr/2026-09-13-corpus-and-permission.md and data/README.md).
// Encoding, publishing, or otherwise using a fetched dance's figures is a
// later mission's job, gated on author clearance exactly as that ADR
// already requires.
//
// Usage:
//   CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-callers-box.mjs
//   CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-callers-box.mjs --dry-run 50
//   CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-callers-box.mjs --max-id 20000
//   node scripts/corpus/crawl-callers-box.mjs --report
//
// CONTRA_CRAWL_CONTACT (required to fetch; not needed for --report) is a
// contact address (email or similar) named in the crawler's User-Agent, so
// a maintainer who wants the crawl to slow down or stop can reach a human
// immediately. The script refuses to run without it.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const DATA_DIR = resolve(REPO_ROOT, "data/local/corpus-raw/callers-box");
const MANIFEST_PATH = resolve(DATA_DIR, "manifest.jsonl");

const REPO_URL = "https://github.com/Yona-Appletree/contra";
const PROJECT_NAME = "contra-simulator";
const BASE_URL = "https://www.ibiblio.org/contradance/thecallersbox/dance.php";

// ibiblio.org/robots.txt: `User-agent: *` / `Crawl-delay: 2`. This is the
// floor, not a target — never fetch faster than this.
const CRAWL_DELAY_MS = 2000;
// A network error backs off, doubling each retry, capped at one minute.
const MAX_BACKOFF_MS = 60_000;
// Retried up to three times beyond the first attempt before giving up.
const MAX_RETRIES = 3;
// Stop an unbounded crawl after this many consecutive non-hits (missing or
// error) past the highest previously-known id — evidence the id space has
// run out, not just a transient gap.
const CONSECUTIVE_MISS_LIMIT = 300;
const PROGRESS_EVERY = 100;

/** The exact URL fetched for a given Caller's Box id. */
export function danceUrl(id) {
  return `${BASE_URL}?id=${id}&format=JSON`;
}

/** The descriptive User-Agent the crawl identifies itself with. */
export function buildUserAgent(contact) {
  return `${PROJECT_NAME}-corpus-crawler (+${REPO_URL}; contact: ${contact})`;
}

/**
 * Reads an existing manifest.jsonl (if any) into a Map<id, line>. Lines
 * that fail to parse (e.g. a truncated last line from a killed run) are
 * skipped with a warning rather than thrown on — that id is simply
 * treated as not-yet-fetched and will be retried, which is safe because
 * the crawl is idempotent per id, not per line position.
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
      console.warn(`crawl-callers-box: skipping unparseable manifest line: ${line.slice(0, 80)}`);
    }
  }
  return byId;
}

/**
 * Where an upward walk should resume: one past the highest id already in
 * the manifest, or 1 if the manifest is empty. Ids already present are
 * additionally never refetched even if something calls this loop with an
 * earlier start (belt-and-suspenders idempotency).
 */
export function computeStartId(manifestById) {
  let highest = 0;
  for (const id of manifestById.keys()) {
    if (id > highest) highest = id;
  }
  return highest + 1;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * One fetch attempt, no retry. Classifies the outcome without throwing for
 * "there is no dance with this id" cases (404, or a 200 whose body isn't
 * parseable JSON with an `ID` field — Caller's Box returns a short plain
 * "no such dance" message with HTTP 200 for gaps in the id space, per the
 * discovery document). A genuine transport/HTTP problem (anything else
 * non-2xx, or fetchImpl throwing) throws, so the caller can retry/back off.
 */
async function fetchOnce(id, { fetchImpl, userAgent }) {
  const url = danceUrl(id);
  const res = await fetchImpl(url, { headers: { "User-Agent": userAgent } });
  if (res.status === 404) {
    return { outcome: "missing", url, bytes: 0 };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for id=${id}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  let parsed = null;
  try {
    parsed = JSON.parse(buf.toString("utf-8"));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || !parsed.ID) {
    // e.g. `"There is no dance with id=25000"` — a 200 with a body that
    // isn't a dance record.
    return { outcome: "missing", url, bytes: buf.length };
  }
  return { outcome: "ok", url, buf, parsed };
}

/**
 * Fetches one id with retry-with-backoff. Returns a settled outcome —
 * "ok" | "missing" | "error" — never throws. `sleepImpl` is injectable so
 * tests can run the backoff logic without real waiting.
 */
export async function fetchWithRetry(id, { fetchImpl, userAgent, sleepImpl = sleep }) {
  let attempt = 0;
  for (;;) {
    try {
      return await fetchOnce(id, { fetchImpl, userAgent });
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

/** Builds the exact manifest line object for one attempted id. */
export function buildManifestLine({ id, url, fetchedAt, outcome, buf, parsed, error }) {
  const status = outcome; // "ok" | "missing" | "error"
  const sha256 = buf ? createHash("sha256").update(buf).digest("hex") : null;
  const bytes = buf ? buf.length : outcome === "missing" ? 0 : null;
  const permission = parsed && "Permission" in parsed ? parsed.Permission : null;
  const title = parsed && "Name" in parsed ? parsed.Name : null;
  const choreographer =
    parsed && Array.isArray(parsed.Authors) && parsed.Authors.length > 0
      ? parsed.Authors.join(", ")
      : null;
  const line = { id, url, fetchedAt, status, sha256, bytes, permission, title, choreographer };
  if (error) line.error = error;
  return line;
}

/**
 * The main crawl loop. Everything that touches the network or the clock is
 * injectable so `crawl-callers-box.test.mjs` can drive it with a fake
 * fetch and zero real delay. `writeRaw`/`appendManifest` default to real
 * filesystem writes but are also injectable, mainly so tests can point at
 * a scratch directory instead of the repo's own `data/local/`.
 */
export async function runCrawl({
  fetchImpl,
  userAgent,
  manifestById,
  startId,
  maxId = Infinity,
  dryRunCount = Infinity,
  consecutiveMissLimit = CONSECUTIVE_MISS_LIMIT,
  crawlDelayMs = CRAWL_DELAY_MS,
  sleepImpl = sleep,
  writeRaw,
  appendManifest,
  now = () => new Date().toISOString(),
  log = console.log,
}) {
  const counts = { ok: 0, missing: 0, error: 0, skipped: 0 };
  let attempted = 0;
  let consecutiveMisses = 0;
  let id = startId;
  let lastId = startId - 1;

  while (id <= maxId && attempted < dryRunCount) {
    if (manifestById.has(id)) {
      counts.skipped += 1;
      lastId = id;
      id += 1;
      continue;
    }

    const result = await fetchWithRetry(id, { fetchImpl, userAgent, sleepImpl });
    const fetchedAt = now();
    const line = buildManifestLine({ id, url: danceUrl(id), fetchedAt, ...result });
    appendManifest(line);
    manifestById.set(id, line);

    if (result.outcome === "ok") {
      writeRaw(id, result.buf);
    }

    counts[result.outcome] += 1;
    attempted += 1;
    lastId = id;
    consecutiveMisses = result.outcome === "ok" ? 0 : consecutiveMisses + 1;

    log(
      `[${attempted}] id=${id} status=${result.outcome}` +
        (result.outcome === "ok"
          ? ` permission=${line.permission} bytes=${line.bytes}`
          : result.outcome === "error"
            ? ` (${result.error})`
            : ""),
    );
    if (attempted % PROGRESS_EVERY === 0) {
      log(
        `-- progress: ${attempted} ids this run (ok=${counts.ok} missing=${counts.missing} error=${counts.error} skipped=${counts.skipped}) --`,
      );
    }

    if (consecutiveMisses >= consecutiveMissLimit) {
      log(
        `crawl-callers-box: stopping after ${consecutiveMisses} consecutive non-hits past id=${id}.`,
      );
      break;
    }

    id += 1;
    if (id <= maxId && attempted < dryRunCount) {
      await sleepImpl(crawlDelayMs);
    }
  }

  return { counts, lastId };
}

function realWriteRaw(id, buf) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(resolve(DATA_DIR, `${id}.json`), buf);
}

function realAppendManifest(line) {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(MANIFEST_PATH, `${JSON.stringify(line)}\n`);
}

function parseArgs(argv) {
  const args = { dryRun: null, maxId: null, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      args.dryRun = Number(argv[++i]);
    } else if (arg === "--max-id") {
      args.maxId = Number(argv[++i]);
    } else if (arg === "--report") {
      args.report = true;
    } else {
      console.error(`crawl-callers-box: unknown argument "${arg}"`);
      process.exit(1);
    }
  }
  return args;
}

function printReport() {
  const manifestById = loadManifest(MANIFEST_PATH);
  const byStatus = new Map();
  const byPermission = new Map();
  let totalBytes = 0;
  for (const line of manifestById.values()) {
    byStatus.set(line.status, (byStatus.get(line.status) ?? 0) + 1);
    if (line.status === "ok") {
      const perm = line.permission ?? "unknown";
      byPermission.set(perm, (byPermission.get(perm) ?? 0) + 1);
      totalBytes += line.bytes ?? 0;
    }
  }
  console.log(`manifest: ${MANIFEST_PATH}`);
  console.log(`total lines: ${manifestById.size}`);
  console.log("by status:");
  for (const [status, count] of [...byStatus.entries()].sort()) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("by permission (ok only):");
  for (const [perm, count] of [...byPermission.entries()].sort()) {
    console.log(`  ${perm}: ${count}`);
  }
  console.log(`total bytes (ok only): ${totalBytes}`);
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
      "crawl-callers-box: CONTRA_CRAWL_CONTACT is required (a contact address named in the " +
        "crawler's User-Agent, so a maintainer can reach a human). Refusing to run without it.",
    );
    process.exit(1);
  }

  const userAgent = buildUserAgent(contact);
  const manifestById = loadManifest(MANIFEST_PATH);
  const startId = computeStartId(manifestById);
  const dryRunCount = args.dryRun != null && Number.isFinite(args.dryRun) ? args.dryRun : Infinity;
  const maxId = args.maxId != null && Number.isFinite(args.maxId) ? args.maxId : Infinity;

  console.log(`crawl-callers-box: User-Agent: ${userAgent}`);
  console.log(`crawl-callers-box: starting at id=${startId}, rate=1 req/${CRAWL_DELAY_MS}ms`);
  if (dryRunCount !== Infinity) console.log(`crawl-callers-box: dry run, ${dryRunCount} fetches`);
  if (maxId !== Infinity) console.log(`crawl-callers-box: max id ${maxId}`);

  const started = Date.now();
  const { counts, lastId } = await runCrawl({
    fetchImpl: fetch,
    userAgent,
    manifestById,
    startId,
    maxId,
    dryRunCount,
    writeRaw: realWriteRaw,
    appendManifest: realAppendManifest,
  });
  const elapsedS = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `crawl-callers-box: done. ok=${counts.ok} missing=${counts.missing} error=${counts.error} ` +
      `skipped=${counts.skipped} lastId=${lastId} elapsed=${elapsedS}s`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
