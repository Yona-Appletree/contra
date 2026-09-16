// Unit tests for the listing/plan/refresh logic in crawl-contradb.mjs.
// No network: every test drives runCrawl with a fake fetch and a fake
// (instant) sleep, and captures writes in plain arrays instead of the
// real filesystem.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  API_URL,
  CHOREOGRAPHERS_URL,
  buildManifestLine,
  buildUserAgent,
  countProgressions,
  danceUrl,
  fetchIndex,
  loadManifest,
  parseArgs,
  planRun,
  runCrawl,
} from "./crawl-contradb.mjs";

/** A minimal fetch-shaped Response for a given status/body/headers. */
function fakeResponse(status, bodyText, headers = {}) {
  const text = bodyText ?? "";
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    async arrayBuffer() {
      return Buffer.from(text, "utf-8");
    },
  };
}

function indexDance(id, overrides = {}) {
  return {
    id,
    title: `Dance ${id}`,
    choreographer_id: 100 + id,
    choreographer_name: `Choreographer ${id}`,
    formation: "improper",
    hook: "",
    user_id: 7,
    user_name: "Some Transcriber",
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-02T00:00:00.000Z",
    publish: "everywhere",
    matching_figures_html: "whole dance",
    ...overrides,
  };
}

function dancePage(id, figures) {
  const rows = figures
    .map(
      (text) =>
        `<tr><td></td><td class=dance-show-beats>8</td><td><div class="show-figure">${text}</div>\n</td></tr>`,
    )
    .join("\n");
  return `<html><body><h1 class="dance-show-title">Dance ${id}</h1><table>${rows}</table></body></html>`;
}

/**
 * Harness: a fake fetch that serves the search API from `dances` (paged by
 * count/offset like the real one) and dance pages / the choreographers
 * page from a Map<url, () => Response>.
 */
function makeFetchImpl({
  dances = [],
  pageHandlers = new Map(),
  indexStatus = 200,
  badPositions = new Set(),
} = {}) {
  return vi.fn(async (url, init = {}) => {
    if (url === API_URL) {
      if (indexStatus !== 200) return fakeResponse(indexStatus, "");
      const { count, offset } = JSON.parse(init.body);
      // Like the real server: one unserialisable dance poisons any page
      // that includes it.
      for (let pos = offset; pos < Math.min(offset + count, dances.length); pos += 1) {
        if (badPositions.has(pos)) return fakeResponse(500, '{"status":500}');
      }
      const page = dances.slice(offset, offset + count);
      return fakeResponse(
        200,
        JSON.stringify({
          numberSearched: dances.length,
          numberMatching: dances.length,
          dances: page,
        }),
      );
    }
    if (url === CHOREOGRAPHERS_URL) {
      return fakeResponse(
        200,
        "<html><table><tr><td>Someone</td><td>Always</td></tr></table></html>",
      );
    }
    const handler = pageHandlers.get(url);
    if (!handler) throw new Error(`no handler for ${url}`);
    return handler();
  });
}

function makeHarness() {
  const rawWrites = [];
  const manifestLines = [];
  const indexPages = [];
  const choreographers = [];
  const sleeps = [];
  const logs = [];
  return {
    rawWrites,
    manifestLines,
    indexPages,
    choreographers,
    sleeps,
    logs,
    writeRaw: (id, buf) => rawWrites.push({ id, buf }),
    appendManifest: (line) => manifestLines.push(line),
    writeIndexPage: (n, buf) => indexPages.push({ n, buf }),
    writeChoreographers: (buf) => choreographers.push(buf),
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
    now: () => "2026-09-16T00:00:00.000Z",
    log: (line) => logs.push(line),
  };
}

describe("parseArgs", () => {
  it("defaults to a full run", () => {
    expect(parseArgs([])).toEqual({ dryRun: null, plan: false, report: false });
  });

  it("parses --plan, --report and --dry-run N", () => {
    expect(parseArgs(["--plan"]).plan).toBe(true);
    expect(parseArgs(["--report"]).report).toBe(true);
    expect(parseArgs(["--dry-run", "5"]).dryRun).toBe(5);
  });

  it("rejects a negative --dry-run and an unknown flag", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseArgs(["--dry-run", "-1"])).toThrow("exit");
    expect(() => parseArgs(["--max-id", "3"])).toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("buildUserAgent / danceUrl", () => {
  it("names the project, the repo, and the contact", () => {
    const ua = buildUserAgent("crawler@example.com");
    expect(ua).toContain("contra-simulator");
    expect(ua).toContain("github.com/Yona-Appletree/contra");
    expect(ua).toContain("crawler@example.com");
  });

  it("builds the public dance page URL", () => {
    expect(danceUrl(42)).toBe("https://contradb.com/dances/42");
  });
});

describe("loadManifest", () => {
  it("lets the last line for an id win and skips a truncated line", () => {
    const dir = mkdtempSync(join(tmpdir(), "contradb-crawler-"));
    const manifestPath = join(dir, "manifest.jsonl");
    writeFileSync(
      manifestPath,
      [
        JSON.stringify({ id: 1, status: "ok", updatedAt: "old" }),
        JSON.stringify({ id: 2, status: "skipped" }),
        JSON.stringify({ id: 1, status: "ok", updatedAt: "new" }),
        '{"id": 3, "stat', // truncated
      ].join("\n"),
    );
    const byId = loadManifest(manifestPath);
    expect(byId.size).toBe(2);
    expect(byId.get(1).updatedAt).toBe("new");
    expect(byId.get(2).status).toBe("skipped");
  });
});

describe("fetchIndex", () => {
  it("reads the whole listing in one request when the server returns everything", async () => {
    const dances = [indexDance(1), indexDance(2), indexDance(3)];
    const fetchImpl = makeFetchImpl({ dances });
    const h = makeHarness();
    const index = await fetchIndex({ fetchImpl, userAgent: "ua", sleepImpl: h.sleepImpl });
    expect(index.dances.map((d) => d.id)).toEqual([1, 2, 3]);
    expect(index.numberMatching).toBe(3);
    expect(index.pages).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["User-Agent"]).toBe("ua");
    expect(h.sleeps).toEqual([]);
  });

  it("pages with offset, sleeping the crawl delay between pages, when the server caps a page", async () => {
    const dances = [1, 2, 3, 4, 5].map((id) => indexDance(id));
    const fetchImpl = makeFetchImpl({ dances });
    const h = makeHarness();
    const index = await fetchIndex({
      fetchImpl,
      userAgent: "ua",
      sleepImpl: h.sleepImpl,
      pageSize: 2,
      crawlDelayMs: 2000,
    });
    expect(index.dances.map((d) => d.id)).toEqual([1, 2, 3, 4, 5]);
    expect(index.pages).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(h.sleeps).toEqual([2000, 2000]);
  });

  it("halves a page that answers 5xx, steps over a single unlistable dance, and continues", async () => {
    // Eight dances, page size 4, position 5 (id 6) poisons its page.
    const dances = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => indexDance(id));
    const fetchImpl = makeFetchImpl({ dances, badPositions: new Set([5]) });
    const h = makeHarness();
    const index = await fetchIndex({
      fetchImpl,
      userAgent: "ua",
      sleepImpl: h.sleepImpl,
      pageSize: 4,
      crawlDelayMs: 2000,
      log: h.log,
    });
    expect(index.dances.map((d) => d.id)).toEqual([1, 2, 3, 4, 5, 7, 8]);
    expect(index.unlistable).toEqual([5]);
    const requests = fetchImpl.mock.calls.map(([, init]) => {
      const { count, offset } = JSON.parse(init.body);
      return `${offset}+${count}`;
    });
    // 0+4 ok → 4+4 poisoned (covers 5) → 4+2 poisoned → 4+1 ok →
    // 5+4 poisoned → 5+2 poisoned → 5+1 poisoned: a single dance, stepped
    // over → 6+4 ok (positions 6, 7) → done.
    expect(requests).toEqual(["0+4", "4+4", "4+2", "4+1", "5+4", "5+2", "5+1", "6+4"]);
    // every request after the first waited the crawl delay, retries included
    expect(h.sleeps).toEqual(Array(requests.length - 1).fill(2000));
    // three pages actually came back: 0+4, 4+1, 6+4
    expect(index.pages).toHaveLength(3);
  });

  it("does not list the same dance twice if the listing shifts between pages", async () => {
    const dances = [1, 2, 3].map((id) => indexDance(id));
    let calls = 0;
    const fetchImpl = vi.fn(async (url, init) => {
      calls += 1;
      const { count, offset } = JSON.parse(init.body);
      // A dance appears at the front after the first page: the second
      // page (offset 2) now starts with what was position 1.
      const current = calls === 1 ? dances : [indexDance(99), ...dances];
      return fakeResponse(
        200,
        JSON.stringify({
          numberSearched: current.length,
          numberMatching: current.length,
          dances: current.slice(offset, offset + count),
        }),
      );
    });
    const h = makeHarness();
    const index = await fetchIndex({
      fetchImpl,
      userAgent: "ua",
      sleepImpl: h.sleepImpl,
      pageSize: 2,
    });
    expect(index.dances.map((d) => d.id)).toEqual([1, 2, 3]);
  });

  it("throws on a non-5xx HTTP error rather than proceeding without a listing", async () => {
    const fetchImpl = makeFetchImpl({ indexStatus: 403 });
    await expect(fetchIndex({ fetchImpl, userAgent: "ua" })).rejects.toThrow("HTTP 403");
  });
});

describe("planRun", () => {
  it("fetches new 'everywhere' dances, skips other tiers, leaves cached ones alone", () => {
    const listing = [
      indexDance(1),
      indexDance(2, { publish: "sketchbook" }),
      indexDance(3),
      indexDance(4),
    ];
    const manifest = new Map([
      [3, { id: 3, status: "ok", updatedAt: "2020-01-02T00:00:00.000Z" }],
      [4, { id: 4, status: "ok", updatedAt: "2019-12-31T00:00:00.000Z" }], // stale
    ]);
    const plan = planRun(listing, manifest);
    expect(plan.fetch.map((d) => d.id)).toEqual([1, 4]);
    expect(plan.unchanged.map((d) => d.id)).toEqual([3]);
    expect(plan.skip.map((d) => d.id)).toEqual([2]);
    expect(plan.gone).toEqual([]);
  });

  it("retries a previous error, refetches a dance that left the sketchbook, and records a skip only once", () => {
    const listing = [
      indexDance(1),
      indexDance(2),
      indexDance(3, { publish: "sketchbook" }),
      indexDance(4, { publish: "sketchbook", updated_at: "2021-06-01T00:00:00.000Z" }),
    ];
    const manifest = new Map([
      [1, { id: 1, status: "error", updatedAt: "2020-01-02T00:00:00.000Z" }],
      [2, { id: 2, status: "skipped", updatedAt: "2020-01-02T00:00:00.000Z" }],
      [3, { id: 3, status: "skipped", updatedAt: "2020-01-02T00:00:00.000Z" }],
      [4, { id: 4, status: "skipped", updatedAt: "2020-01-02T00:00:00.000Z" }],
    ]);
    const plan = planRun(listing, manifest);
    expect(plan.fetch.map((d) => d.id)).toEqual([1, 2]);
    expect(plan.skipAlreadyRecorded.map((d) => d.id)).toEqual([3]);
    expect(plan.skip.map((d) => d.id)).toEqual([4]);
  });

  it("reports manifest ids missing from the listing as gone", () => {
    const manifest = new Map([
      [9, { id: 9, status: "ok", title: "Vanished", updatedAt: "x" }],
      [10, { id: 10, status: "gone", title: "Already noted", updatedAt: "x" }],
    ]);
    const plan = planRun([indexDance(1)], manifest);
    expect(plan.gone.map((l) => l.id)).toEqual([9]);
  });
});

describe("buildManifestLine", () => {
  it("copies the listing's fields verbatim and hashes the page for a hit", () => {
    const dance = indexDance(42, { title: "The Rendezvous", choreographer_name: "Dan Pearl" });
    const buf = Buffer.from(dancePage(42, ["neighbors balance & swing ⁋"]), "utf-8");
    const line = buildManifestLine({ dance, fetchedAt: "t", outcome: "ok", buf });
    expect(line).toMatchObject({
      id: 42,
      url: "https://contradb.com/dances/42",
      status: "ok",
      publish: "everywhere",
      title: "The Rendezvous",
      choreographer: "Dan Pearl",
      choreographerId: 142,
      formation: "improper",
      transcriber: "Some Transcriber",
      updatedAt: "2020-01-02T00:00:00.000Z",
      bytes: buf.length,
    });
    expect(line.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(line.error).toBeUndefined();
  });

  it("records zero bytes for a skip/miss and keeps the error message for an error", () => {
    const dance = indexDance(5, { publish: "sketchbook" });
    const skipped = buildManifestLine({ dance, fetchedAt: "t", outcome: "skipped" });
    expect(skipped.status).toBe("skipped");
    expect(skipped.publish).toBe("sketchbook");
    expect(skipped.sha256).toBeNull();
    expect(skipped.bytes).toBe(0);

    const err = buildManifestLine({
      dance: indexDance(6),
      fetchedAt: "t",
      outcome: "error",
      error: "boom",
    });
    expect(err.status).toBe("error");
    expect(err.error).toBe("boom");
    expect(err.bytes).toBeNull();
  });
});

describe("countProgressions", () => {
  it("counts figures and the ones carrying the pilcrow", () => {
    const html = dancePage(1, [
      "neighbors balance &amp; swing",
      "circle left 4 places",
      "slide left along set ⁋",
      "circle left 3 places",
    ]);
    expect(countProgressions(html)).toEqual({ figures: 4, marked: 1 });
  });

  it("returns zeros for a page with no figure rows", () => {
    expect(countProgressions("<html></html>")).toEqual({ figures: 0, marked: 0 });
  });
});

describe("runCrawl", () => {
  it("lists, caches the choreographers page, records skips, fetches pages, and sleeps between every request", async () => {
    const dances = [indexDance(1), indexDance(2, { publish: "sketchbook" }), indexDance(3)];
    const pageHandlers = new Map([
      [danceUrl(1), () => fakeResponse(200, dancePage(1, ["a ⁋"]))],
      [danceUrl(3), () => fakeResponse(404, "")],
    ]);
    const fetchImpl = makeFetchImpl({ dances, pageHandlers });
    const h = makeHarness();

    const { counts, plan } = await runCrawl({
      fetchImpl,
      userAgent: "ua",
      manifestById: new Map(),
      crawlDelayMs: 2000,
      ...h,
    });

    expect(counts).toEqual({ ok: 1, missing: 1, noindex: 0, error: 0, skipped: 1, unchanged: 0 });
    expect(plan.fetch.map((d) => d.id)).toEqual([1, 3]);
    expect(h.indexPages).toHaveLength(1);
    expect(h.choreographers).toHaveLength(1);
    expect(h.rawWrites.map((w) => w.id)).toEqual([1]);
    expect(h.manifestLines.map((l) => [l.id, l.status])).toEqual([
      [2, "skipped"],
      [1, "ok"],
      [3, "missing"],
    ]);
    // listing, choreographers, two pages: one sleep before each request after the first
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(h.sleeps).toEqual([2000, 2000, 2000]);
    // the sketchbook dance's page was never requested
    expect(fetchImpl).not.toHaveBeenCalledWith(danceUrl(2), expect.anything());
  });

  it("with planOnly, makes exactly the listing request and writes nothing but the index", async () => {
    const dances = [indexDance(1), indexDance(2, { publish: "sketchbook" })];
    const fetchImpl = makeFetchImpl({ dances });
    const h = makeHarness();

    const { counts, plan } = await runCrawl({
      fetchImpl,
      userAgent: "ua",
      manifestById: new Map(),
      planOnly: true,
      ...h,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(plan.fetch.map((d) => d.id)).toEqual([1]);
    expect(plan.skip.map((d) => d.id)).toEqual([2]);
    expect(counts.ok).toBe(0);
    expect(h.indexPages).toHaveLength(1);
    expect(h.manifestLines).toEqual([]);
    expect(h.rawWrites).toEqual([]);
    expect(h.choreographers).toEqual([]);
  });

  it("on a re-run, refetches only changed dances and does not re-record an unchanged skip", async () => {
    const dances = [
      indexDance(1), // cached at this updated_at
      indexDance(2, { updated_at: "2025-05-05T00:00:00.000Z" }), // edited since
      indexDance(3, { publish: "sketchbook" }), // skip already recorded
    ];
    const pageHandlers = new Map([[danceUrl(2), () => fakeResponse(200, dancePage(2, ["b ⁋"]))]]);
    const fetchImpl = makeFetchImpl({ dances, pageHandlers });
    const h = makeHarness();
    const manifestById = new Map([
      [1, { id: 1, status: "ok", updatedAt: "2020-01-02T00:00:00.000Z" }],
      [2, { id: 2, status: "ok", updatedAt: "2020-01-02T00:00:00.000Z" }],
      [3, { id: 3, status: "skipped", updatedAt: "2020-01-02T00:00:00.000Z" }],
    ]);

    const { counts } = await runCrawl({ fetchImpl, userAgent: "ua", manifestById, ...h });

    expect(counts).toEqual({ ok: 1, missing: 0, noindex: 0, error: 0, skipped: 0, unchanged: 1 });
    expect(h.rawWrites.map((w) => w.id)).toEqual([2]);
    expect(h.manifestLines.map((l) => l.id)).toEqual([2]);
    expect(manifestById.get(2).updatedAt).toBe("2025-05-05T00:00:00.000Z");
    expect(fetchImpl).not.toHaveBeenCalledWith(danceUrl(1), expect.anything());
  });

  it("discards a page that arrives with X-Robots-Tag: noindex", async () => {
    const dances = [indexDance(1)];
    const pageHandlers = new Map([
      [danceUrl(1), () => fakeResponse(200, dancePage(1, ["a"]), { "X-Robots-Tag": "noindex" })],
    ]);
    const fetchImpl = makeFetchImpl({ dances, pageHandlers });
    const h = makeHarness();

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "ua",
      manifestById: new Map(),
      ...h,
    });

    expect(counts.noindex).toBe(1);
    expect(h.rawWrites).toEqual([]);
    expect(h.manifestLines[0]).toMatchObject({ id: 1, status: "noindex", bytes: 0, sha256: null });
  });

  it("retries a network error with doubling backoff, then succeeds", async () => {
    let calls = 0;
    const dances = [indexDance(1)];
    const pageHandlers = new Map([
      [
        danceUrl(1),
        () => {
          calls += 1;
          if (calls < 3) throw new Error("ECONNRESET");
          return fakeResponse(200, dancePage(1, ["a"]));
        },
      ],
    ]);
    const fetchImpl = makeFetchImpl({ dances, pageHandlers });
    const h = makeHarness();

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "ua",
      manifestById: new Map(),
      crawlDelayMs: 2000,
      ...h,
    });

    expect(counts.ok).toBe(1);
    // crawl delay before choreographers, before the page, then backoffs 4000, 8000
    expect(h.sleeps).toEqual([2000, 2000, 4000, 8000]);
  });

  it("gives up after three retries and records the dance as error", async () => {
    const dances = [indexDance(1)];
    const pageHandlers = new Map([
      [
        danceUrl(1),
        () => {
          throw new Error("ETIMEDOUT");
        },
      ],
    ]);
    const fetchImpl = makeFetchImpl({ dances, pageHandlers });
    const h = makeHarness();

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "ua",
      manifestById: new Map(),
      ...h,
    });

    expect(counts.error).toBe(1);
    // listing + choreographers + 1 initial attempt + 3 retries
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(h.manifestLines[0].status).toBe("error");
    expect(h.manifestLines[0].error).toContain("ETIMEDOUT");
  });

  it("--dry-run style limit stops after N pages", async () => {
    const dances = [indexDance(1), indexDance(2), indexDance(3)];
    const pageHandlers = new Map(
      dances.map((d) => [danceUrl(d.id), () => fakeResponse(200, dancePage(d.id, ["a"]))]),
    );
    const fetchImpl = makeFetchImpl({ dances, pageHandlers });
    const h = makeHarness();

    const { counts } = await runCrawl({
      fetchImpl,
      userAgent: "ua",
      manifestById: new Map(),
      dryRunCount: 2,
      ...h,
    });

    expect(counts.ok).toBe(2);
    expect(h.rawWrites.map((w) => w.id)).toEqual([1, 2]);
  });
});
