import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DerivedDance } from "./importCallersBox.js";

/**
 * **Reading the private derived corpus** (`docs/corpus-derived.md`): where it
 * is, whether it is there, and the four files a consumer wants off it.
 *
 * ## Node only, and never in the browser
 *
 * It opens files. So it is **not** exported from `src/index.ts` and the package
 * has no export path that reaches it: a test imports it by relative path and
 * nothing else does, which is what keeps `node:fs` out of `apps/web`'s bundle.
 * The corpus is private (`docs/adr/2026-09-13-corpus-and-permission.md`) and the
 * site must not so much as know how to look for it.
 *
 * ## Where the data root is
 *
 * `$CONTRA_DATA` if it is set, else `../contra-data` **beside the repository** —
 * the repository being whichever directory up from this file holds
 * `pnpm-workspace.yaml`, so the answer is the same from a test, from a script
 * and from a compiled `dist/`. That is the same order the derive scripts use
 * (`docs/corpus-derived.md` §Running), less their `--data` flag and their
 * `$CONTRA_DATA_DIR`, neither of which a library has any way to be handed.
 *
 * ## Absent is not an error
 *
 * The corpus is private and most checkouts will not have it: CI has it only when
 * the token is set, and a contributor may never have it at all. So
 * {@link corpusPresent} is a plain boolean a `describe.skipIf` can read, and the
 * readers below throw only when asked for something a **present** corpus does
 * not hold — which is a real fault worth the stack.
 */

/** One line of `derived/index.jsonl`. @see docs/corpus-derived.md */
export interface CorpusIndexLine {
  id: string;
  cluster: string;
  title: string;
  authors: readonly string[];
  permission: string;
  /** Our formation id, or `null` for one the three contra formations cannot seat. */
  formation: string | null;
  videos: number;
  clusterVideos: number;
  portlandCount: number;
  /** 1 to 4, from cluster popularity. */
  tier: number;
  /** `axis:value`, every value that applies. */
  tags: readonly string[];
  /** False once the tags come from an encoded record. */
  tagsProvisional: boolean;
  status: "not-started" | "custom-only" | "lab" | "shipped";
  /** The `data/dances` slug when it is encoded, else `null`. */
  slug: string | null;
  publishable: "gated" | "fixture" | "cleared" | "shipped";
}

/** One dance of a named set, with every reason that selected it. */
export interface CorpusSetEntry {
  id: string;
  cluster: string;
  title: string;
  tier: number;
  /** `"pin:…"`, `"tag:figure:hey"`, `"tier:1"`. */
  reasons: readonly string[];
}

/** `derived/sets/hand.json` and `derived/sets/suite.json` share this shape. */
export interface CorpusSet {
  /** A date, so the file is stable within a day. */
  generatedAt: string;
  /** The rule that built it, in one line. */
  rule: string;
  dances: readonly CorpusSetEntry[];
}

/** Which named set: the two `derive-sets.mjs` writes. */
export type CorpusSetName = "hand" | "suite";

/** Where the derived corpus is, whether or not anything is there. */
export function corpusRoot(): string {
  const named = process.env["CONTRA_DATA"];
  if (named !== undefined && named.trim() !== "") {
    return isAbsolute(named) ? named : resolve(repoRoot(), named);
  }
  return resolve(repoRoot(), "..", "contra-data");
}

/**
 * **Whether the derived corpus is readable from here.**
 *
 * The root exists *and* holds a `derived/` directory: a `CONTRA_DATA` pointing
 * at the wrong checkout is the same kind of absent as no checkout at all, and a
 * suite that half-skipped would be worse than one that skipped.
 *
 * Read once, at import: an environment variable that changes under a running
 * process is not a case this has, and a constant is what `describe.skipIf` wants.
 */
export const corpusPresent: boolean = existsSync(join(corpusRoot(), "derived"));

/** One line saying where the corpus is and whether it is there, for a test's skip message. */
export function corpusStatus(): string {
  const root = corpusRoot();
  return corpusPresent
    ? `the derived corpus is at ${root}`
    : `no derived corpus at ${root} — set CONTRA_DATA to a contra-data checkout`;
}

/** `derived/index.jsonl`, one object per line. */
export function readCorpusIndex(): CorpusIndexLine[] {
  const text = read(join("derived", "index.jsonl"));
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, at) => {
      try {
        return JSON.parse(line) as CorpusIndexLine;
      } catch (cause) {
        throw new Error(`derived/index.jsonl line ${String(at + 1)} is not JSON`, { cause });
      }
    });
}

/** `derived/sets/<name>.json`. */
export function readCorpusSet(name: CorpusSetName): CorpusSet {
  return JSON.parse(read(join("derived", "sets", `${name}.json`))) as CorpusSet;
}

/** `derived/dances/<id>.json`: one normalised Caller's Box record. */
export function readDerivedDance(id: string): DerivedDance {
  return JSON.parse(read(join("derived", "dances", `${id}.json`))) as DerivedDance;
}

/** Whether there is a derived record for this id — 2,719 raw records have none. */
export function hasDerivedDance(id: string): boolean {
  return existsSync(join(corpusRoot(), "derived", "dances", `${id}.json`));
}

/**
 * Every derived record's id, in the order the file system lists them.
 *
 * For the consumer that has to look at the whole tree rather than at one
 * record: the suite's stand-in set, built by popularity, is the one this is for
 * while `derive-sets.mjs` is still being written.
 */
export function derivedDanceIds(): string[] {
  return readdirSync(join(corpusRoot(), "derived", "dances"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length));
}

/** One file of the data root, with the root in the message when it is not there. */
function read(relative: string): string {
  const path = join(corpusRoot(), relative);
  if (!existsSync(path)) {
    throw new Error(
      `${relative} is not in the derived corpus at ${corpusRoot()} — ` +
        `run the derive scripts, or set CONTRA_DATA`,
    );
  }
  return readFileSync(path, "utf8");
}

/**
 * The repository root: the nearest directory up from this file with a
 * `pnpm-workspace.yaml` in it.
 *
 * Walked rather than counted off `../../../..`, because this module is compiled
 * into `dist/corpus/` as well as read from `src/corpus/` and the two are
 * different depths. Nothing found — a single file copied somewhere odd — falls
 * back to this file's own directory, so `corpusRoot()` still answers a path and
 * {@link corpusPresent} is simply false.
 */
function repoRoot(): string {
  let here = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(here, "pnpm-workspace.yaml"))) return here;
    const up = dirname(here);
    if (up === here) return dirname(fileURLToPath(import.meta.url));
    here = up;
  }
}
