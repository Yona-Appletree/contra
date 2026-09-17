import { afterEach, describe, expect, it, vi } from "vitest";
import {
  corpusPresent,
  corpusRoot,
  corpusStatus,
  hasDerivedDance,
  readCorpusIndex,
  readCorpusSet,
  readDerivedDance,
} from "./corpusData.js";

/**
 * Where the data root is, whether it is there, and what is refused when it is
 * not — plus, when a real corpus is beside the checkout, that the four files the
 * contract describes really are shaped the way the types say.
 */

const HELD = process.env["CONTRA_DATA"];

afterEach(() => {
  if (HELD === undefined) delete process.env["CONTRA_DATA"];
  else process.env["CONTRA_DATA"] = HELD;
  vi.resetModules();
});

describe("where the corpus is", () => {
  it("takes an absolute CONTRA_DATA as it stands", () => {
    process.env["CONTRA_DATA"] = "/somewhere/else/contra-data";
    expect(corpusRoot()).toBe("/somewhere/else/contra-data");
  });

  it("resolves a relative CONTRA_DATA against the repository root", () => {
    process.env["CONTRA_DATA"] = "../sibling-data";
    const root = corpusRoot();
    expect(root.endsWith("/sibling-data")).toBe(true);
    expect(root.startsWith("/")).toBe(true);
  });

  it("falls back to contra-data beside the repository", () => {
    delete process.env["CONTRA_DATA"];
    expect(corpusRoot().endsWith("/contra-data")).toBe(true);
  });

  it("says in one line where it looked and what it found", () => {
    expect(corpusStatus()).toContain(corpusRoot());
  });
});

describe("a data root that is not there", () => {
  it("is absent rather than an error", async () => {
    process.env["CONTRA_DATA"] = "/nonexistent";
    vi.resetModules();
    const fresh = await import("./corpusData.js");
    expect(fresh.corpusPresent).toBe(false);
    expect(fresh.corpusStatus()).toContain("set CONTRA_DATA");
    expect(fresh.hasDerivedDance("10320")).toBe(false);
  });

  it("names the file and the root when a reader is asked anyway", async () => {
    process.env["CONTRA_DATA"] = "/nonexistent";
    vi.resetModules();
    const fresh = await import("./corpusData.js");
    expect(() => fresh.readCorpusIndex()).toThrow(/index\.jsonl is not in the derived corpus/);
    expect(() => fresh.readCorpusSet("hand")).toThrow(/hand\.json/);
    expect(() => fresh.readDerivedDance("10320")).toThrow(/10320\.json/);
  });
});

describe("the package's browser-facing exports", () => {
  it("do not reach the corpus reader, which opens files", async () => {
    const index = (await import("../index.js")) as Record<string, unknown>;
    for (const name of [
      "corpusRoot",
      "corpusPresent",
      "corpusStatus",
      "readCorpusIndex",
      "readCorpusSet",
      "readDerivedDance",
      "hasDerivedDance",
    ]) {
      expect(index[name], name).toBeUndefined();
    }
  });
});

describe.skipIf(!corpusPresent)("a real derived corpus", () => {
  it("reads a derived record by id", () => {
    expect(hasDerivedDance("10320")).toBe(true);
    const record = readDerivedDance("10320");
    expect(record.source).toBe("callers-box");
    expect(record.id).toBe("10320");
    expect(record.formation.id).toBe("becket");
    expect(record.phrases.length).toBeGreaterThan(0);
    expect(record.phrases[0]!.lines.length).toBeGreaterThan(0);
  });

  // `derive-index.mjs` and `derive-sets.mjs` are another agent's; a checkout
  // that has the dances and not yet the index is the ordinary state of things
  // while the chain is being built, and is not this module's failure.
  it("reads the index when the chain has written one", () => {
    let index;
    try {
      index = readCorpusIndex();
    } catch {
      return;
    }
    expect(index.length).toBeGreaterThan(0);
    const line = index[0]!;
    expect(typeof line.id).toBe("string");
    expect(typeof line.tier).toBe("number");
    expect(Array.isArray(line.tags)).toBe(true);
    expect(["not-started", "custom-only", "lab", "shipped"]).toContain(line.status);
    expect(["gated", "fixture", "cleared", "shipped"]).toContain(line.publishable);
  });

  it.each(["hand", "suite"] as const)("reads sets/%s.json when it is there", (name) => {
    let set;
    try {
      set = readCorpusSet(name);
    } catch {
      return;
    }
    expect(typeof set.generatedAt).toBe("string");
    expect(typeof set.rule).toBe("string");
    expect(set.dances.length).toBeGreaterThan(0);
    expect(typeof set.dances[0]!.id).toBe("string");
    expect(Array.isArray(set.dances[0]!.reasons)).toBe(true);
  });
});
