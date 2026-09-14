// Unit tests for the manifest/resume logic in crawl-callers-box.mjs.
// No network: every test drives runCrawl with a fake fetch and a fake
// (instant) sleep, and captures writes in plain arrays instead of the
// real filesystem.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildManifestLine,
  buildUserAgent,
  computeStartId,
  danceUrl,
  loadManifest,
  runCrawl,
} from "./crawl-callers-box.mjs";

/** A minimal fetch-shaped Response for a given status/body. */
function fakeResponse(status, bodyText) {
  const text = bodyText ?? "";
  return {
    status,
    ok: status >= 200 && status < 300,
    async arrayBuffer() {
      return Buffer.from(text, "utf-8");
    },
  };
}

function danceBody({ id, permission = "full", name = `Dance ${id}`, authors = ["Some Author"] }) {
  return JSON.stringify({
    request: danceUrl(id),
    ID: String(id),
    Name: name,
    Authors: authors,
    Permission: permission,
    phrases: { A1: "Circle left" },
  });
}

/** Harness: a Map<id, () => Response | throws> driving a fake fetch. */
function makeFetchImpl(handlers) {
  return vi.fn(async (url) => {
    const match = /[?&]id=(\d+)/.exec(url);
    const id = Number(match[1]);
    const handler = handlers.get(id);
    if (!handler) throw new Error(`no handler for id=${id}`);
    return handler();
  });
}

function makeHarness() {
  const rawWrites = [];
  const manifestLines = [];
  const sleeps = [];
  return {
    rawWrites,
    manifestLines,
    sleeps,
    writeRaw: (id, buf) => rawWrites.push({ id, buf }),
    appendManifest: (line) => manifestLines.push(line),
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
    now: () => "2026-09-14T00:00:00.000Z",
  };
}

describe("buildUserAgent", () => {
  it("names the project, the repo, and the contact", () => {
    const ua = buildUserAgent("crawler@example.com");
    expect(ua).toContain("contra-simulator");
    expect(ua).toContain("github.com/Yona-Appletree/contra");
    expect(ua).toContain("crawler@example.com");
  });
});

describe("loadManifest / computeStartId", () => {
  it("returns id 1 as the start of a fresh crawl", () => {
    expect(computeStartId(new Map())).toBe(1);
  });

  it("resumes one past the highest id in an existing manifest", () => {
    const byId = new Map([
      [1, { id: 1, status: "ok" }],
      [3, { id: 3, status: "missing" }],
      [2, { id: 2, status: "ok" }],
    ]);
    expect(computeStartId(byId)).toBe(4);
  });

  it("skips unparseable lines instead of throwing, via an injected reader", () => {
    // loadManifest reads from disk directly; exercise its line-parsing via
    // a temp file so we cover the "tolerate a truncated last line" path.
    const dir = mkdtempSync(join(tmpdir(), "c1-callers-box-crawler-"));
    const manifestPath = join(dir, "manifest.jsonl");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ id: 1, status: "ok" })}\n{"id": 2, "stat` /* truncated */,
    );
    const byId = loadManifest(manifestPath);
    expect(byId.size).toBe(1);
    expect(byId.get(1).status).toBe("ok");
  });
});

describe("buildManifestLine", () => {
  it("carries permission, title and choreographer through for a hit", () => {
    const buf = Buffer.from(danceBody({ id: 42, permission: "full", name: "Butter" }), "utf-8");
    const parsed = JSON.parse(buf.toString("utf-8"));
    const line = buildManifestLine({
      id: 42,
      url: danceUrl(42),
      fetchedAt: "2026-01-01T00:00:00Z",
      outcome: "ok",
      buf,
      parsed,
    });
    expect(line.status).toBe("ok");
    expect(line.permission).toBe("full");
    expect(line.title).toBe("Butter");
    expect(line.choreographer).toBe("Some Author");
    expect(line.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(line.bytes).toBe(buf.length);
  });

  it("records null fields for a miss and keeps the error message for an error", () => {
    const miss = buildManifestLine({
      id: 5,
      url: danceUrl(5),
      fetchedAt: "t",
      outcome: "missing",
    });
    expect(miss.status).toBe("missing");
    expect(miss.permission).toBeNull();
    expect(miss.sha256).toBeNull();

    const err = buildManifestLine({
      id: 6,
      url: danceUrl(6),
      fetchedAt: "t",
      outcome: "error",
      error: "boom",
    });
    expect(err.status).toBe("error");
    expect(err.error).toBe("boom");
  });
});

describe("runCrawl", () => {
  it("fetches ok/missing ids, writes raw bytes only for hits, and appends a manifest line for every attempt", async () => {
    const handlers = new Map([
      [1, () => fakeResponse(200, danceBody({ id: 1 }))],
      [2, () => fakeResponse(404, "")],
      [3, () => fakeResponse(200, danceBody({ id: 3, permission: "search" }))],
    ]);
    const fetchImpl = makeFetchImpl(handlers);
    const h = makeHarness();

    const { counts, lastId } = await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById: new Map(),
      startId: 1,
      maxId: 3,
      ...h,
    });

    expect(counts).toEqual({ ok: 2, missing: 1, error: 0, skipped: 0 });
    expect(lastId).toBe(3);
    expect(h.rawWrites.map((w) => w.id)).toEqual([1, 3]);
    expect(h.manifestLines.map((l) => [l.id, l.status])).toEqual([
      [1, "ok"],
      [2, "missing"],
      [3, "ok"],
    ]);
    expect(h.manifestLines[2].permission).toBe("search");
    // one request per id, none skipped, none retried
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("never refetches an id already present in the manifest", async () => {
    const fetchImpl = makeFetchImpl(new Map([[3, () => fakeResponse(200, danceBody({ id: 3 }))]]));
    const h = makeHarness();
    const manifestById = new Map([
      [1, { id: 1, status: "ok" }],
      [2, { id: 2, status: "missing" }],
    ]);

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById,
      startId: 1,
      maxId: 3,
      ...h,
    });

    expect(counts.skipped).toBe(2);
    expect(counts.ok).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(danceUrl(3), expect.anything());
  });

  it("retries a network error with doubling backoff, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("ECONNRESET");
      return fakeResponse(200, danceBody({ id: 1 }));
    });
    const h = makeHarness();

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById: new Map(),
      startId: 1,
      maxId: 1,
      ...h,
    });

    expect(counts.ok).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // backoff doubles from the 2s crawl delay, capped at 60s: 4000, 8000
    expect(h.sleeps).toEqual([4000, 8000]);
  });

  it("gives up after three retries and records the id as error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    });
    const h = makeHarness();

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById: new Map(),
      startId: 1,
      maxId: 1,
      ...h,
    });

    expect(counts.error).toBe(1);
    // 1 initial attempt + 3 retries = 4 calls
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(h.manifestLines[0].status).toBe("error");
    expect(h.manifestLines[0].error).toContain("ETIMEDOUT");
  });

  it("stops after a run of consecutive misses past the highest known id", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(404, ""));
    const h = makeHarness();

    const { counts, lastId } = await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById: new Map(),
      startId: 1,
      consecutiveMissLimit: 5,
      ...h,
    });

    expect(counts.missing).toBe(5);
    expect(lastId).toBe(5);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("a hit resets the consecutive-miss counter", async () => {
    const handlers = new Map([
      [1, () => fakeResponse(404, "")],
      [2, () => fakeResponse(404, "")],
      [3, () => fakeResponse(200, danceBody({ id: 3 }))],
      [4, () => fakeResponse(404, "")],
      [5, () => fakeResponse(404, "")],
    ]);
    const fetchImpl = makeFetchImpl(handlers);
    const h = makeHarness();

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById: new Map(),
      startId: 1,
      maxId: 5,
      consecutiveMissLimit: 3,
      ...h,
    });

    // Without the reset, misses at 1,2 + 4,5 would hit the limit of 3
    // after id 5's second consecutive miss; the hit at id 3 must restart
    // the count, so all five ids are attempted.
    expect(counts).toEqual({ ok: 1, missing: 4, error: 0, skipped: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("--dry-run style limit stops after N attempts regardless of maxId", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const id = Number(/[?&]id=(\d+)/.exec(url)[1]);
      return fakeResponse(200, danceBody({ id }));
    });
    const h = makeHarness();

    const { counts, lastId } = await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById: new Map(),
      startId: 1,
      dryRunCount: 3,
      ...h,
    });

    expect(counts.ok).toBe(3);
    expect(lastId).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("sleeps the crawl delay between ids but not after the last one", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const id = Number(/[?&]id=(\d+)/.exec(url)[1]);
      return fakeResponse(200, danceBody({ id }));
    });
    const h = makeHarness();

    await runCrawl({
      fetchImpl,
      userAgent: "test-agent",
      manifestById: new Map(),
      startId: 1,
      maxId: 3,
      crawlDelayMs: 2000,
      ...h,
    });

    expect(h.sleeps).toEqual([2000, 2000]);
  });
});
