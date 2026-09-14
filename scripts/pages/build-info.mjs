#!/usr/bin/env node
// Deploy metadata for the build-info badge: writes `version.json` and
// `changelog.json` into a built site directory.
//
// `main-push.yml` runs this against `apps/web/dist` after the build and
// before the Pages upload, so the deployed artifact carries its own identity
// and the badge can fetch it at runtime. Nothing writes these files locally,
// which is deliberate: a dev build 404s on both and the badge says "dev
// build" rather than claiming to be a release. To see the real thing by hand:
//
//     pnpm --filter @caller/web build
//     node scripts/pages/build-info.mjs --out apps/web/dist
//
// Ported from lightplayer's `scripts/pages/prepare-pages-artifact.mjs`
// (`versionInfo`, `changelogInfo`, `changelogEntry`, `versionTags`). The one
// adaptation: this repository squash-merges, so a version tag's commit is the
// squash commit `<PR title> (#NN)` rather than GitHub's `Merge pull request
// #NN from …`. The trailing `(#NN)` is what names the pull request here; the
// merge-commit shape is still recognised, for a tag that predates the ruleset
// or was made by hand.
//
// No dependencies, and the changelog never throws: a shallow clone, a tagless
// tree or a missing `git` yields `entries: []` rather than failing a deploy.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** How many version tags the "Recent updates" list carries. */
const CHANGELOG_ENTRY_LIMIT = 20;
/** Longer summaries are cut here; the badge shows one or two lines per entry. */
const CHANGELOG_SUMMARY_MAX = 120;
const VERSION_TAG_PATTERN = /^v\d{4}\.\d{2}\.\d{2}-\d+$/;
/** A squash merge's subject: `Some pull request title (#34)`. */
const SQUASH_SUBJECT_PATTERN = /\s*\(#(\d+)\)$/;
/** A GitHub merge commit's subject, whose body's first line is the PR title. */
const MERGE_SUBJECT_PATTERN = /^Merge pull request #(\d+) from /;

const DEFAULT_REPOSITORY = "Yona-Appletree/contra";
const SCHEMA_VERSION = 1;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "../..");

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2));
}

function main(argv) {
  const args = parseArgs(argv);
  const repoRoot = path.resolve(args.repo ?? defaultRepoRoot);
  const outDir = path.resolve(args.out ?? "");
  if (!args.out) {
    throw new Error("missing required argument: --out <built site directory>");
  }
  const git = gitRunner(repoRoot);

  mkdirSync(outDir, { recursive: true });
  const version = versionInfo({ git, app: args.app ?? "contra", channel: args.channel ?? "pages" });
  const changelog = changelogInfo(git);
  writeJson(path.join(outDir, "version.json"), version);
  writeJson(path.join(outDir, "changelog.json"), changelog);

  console.log(`build-info: ${version.version} (${version.source.sha.slice(0, 8)}) → ${outDir}`);
  console.log(`build-info: ${String(changelog.entries.length)} changelog entries`);
}

/**
 * Runs git in `cwd` and returns its trimmed output, or `""` for any failure
 * (no git, no repository, no tags). Every caller is best-effort by design.
 */
export function gitRunner(cwd) {
  return (...args) => {
    try {
      return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  };
}

/**
 * The deployed artifact's identity.
 *
 * `version` prefers `APP_VERSION` from the workflow — resolved straight after
 * checkout, from the tag the deploy is building — over anything read here.
 * The `source` block is GitHub's own environment when there is one, and the
 * checkout's git otherwise, so running this by hand still produces a truthful
 * file.
 */
export function versionInfo({ git, app = "contra", channel = "pages", env = process.env } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    app,
    channel,
    version: env.APP_VERSION?.trim() || describeVersion(git),
    source: {
      repository: env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
      ref: env.GITHUB_REF_NAME || git("rev-parse", "--abbrev-ref", "HEAD") || "unknown",
      sha: env.GITHUB_SHA || git("rev-parse", "HEAD") || "unknown",
      // On a runner the checkout is the commit; locally a dirty tree means
      // the deployed bytes are not the ones the sha names, and the badge says
      // so next to the commit.
      dirty: env.GITHUB_ACTIONS === "true" ? false : git("status", "--porcelain") !== "",
    },
    build: {
      generatedAt: new Date().toISOString(),
      workflow: env.GITHUB_WORKFLOW || null,
      runId: env.GITHUB_RUN_ID || null,
      runAttempt: env.GITHUB_RUN_ATTEMPT || null,
    },
  };
}

/** The tag on HEAD, else the most recent one reachable, else `"dev"`. */
function describeVersion(git) {
  const onHead = git("tag", "--points-at", "HEAD")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => VERSION_TAG_PATTERN.test(line));
  if (onHead) return onHead;
  const described = git("describe", "--tags", "--match", "v[0-9]*", "--abbrev=0");
  return VERSION_TAG_PATTERN.test(described) ? described : "dev";
}

/**
 * "Recent updates": the most recent version tags, newest first, each
 * summarised from the commit it points at.
 *
 * Needs the checkout to have tags and history — `main-push.yml` uses
 * `fetch-depth: 0` — and yields `entries: []` when it does not.
 */
export function changelogInfo(git) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    entries: versionTags(git)
      .slice(0, CHANGELOG_ENTRY_LIMIT)
      .map((tag) => changelogEntry(git, tag)),
  };
}

/**
 * Every `vYYYY.MM.DD-N` tag, newest first.
 *
 * Sorted here rather than by `--sort=-creatordate` alone: these tags are made
 * by CI, several can share a second, and git breaks a creator-date tie by
 * refname ascending — which puts the OLDEST of that second's releases at the
 * top of "Recent updates". The name carries the ordering, so read it.
 */
function versionTags(git) {
  return git("tag", "--sort=-creatordate", "--list", "v*")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => VERSION_TAG_PATTERN.test(line))
    .sort(newestFirst);
}

function newestFirst(a, b) {
  const [aDate, aIndex] = a.slice(1).split("-");
  const [bDate, bIndex] = b.slice(1).split("-");
  return aDate === bDate ? Number(bIndex) - Number(aIndex) : bDate.localeCompare(aDate);
}

/**
 * One tag as a "Recent updates" row. The tag is treated as a single unit: a
 * squash merge contributes its pull request's number and title, a merge
 * commit the number and its body's first line, and any other commit its
 * subject.
 */
export function changelogEntry(git, tag) {
  const subject = git("log", "-1", "--pretty=%s", tag);
  let summary = subject;
  let pr = null;

  const squash = SQUASH_SUBJECT_PATTERN.exec(subject);
  const merge = MERGE_SUBJECT_PATTERN.exec(subject);
  if (squash) {
    pr = Number(squash[1]);
    summary = subject.slice(0, squash.index);
  } else if (merge) {
    pr = Number(merge[1]);
    summary = firstNonEmptyLine(git("log", "-1", "--pretty=%b", tag)) ?? subject;
  }

  return {
    version: tag,
    date: git("log", "-1", "--pretty=%cs", tag) || null,
    summary: summary.trim().slice(0, CHANGELOG_SUMMARY_MAX) || null,
    pr,
  };
}

function firstNonEmptyLine(text) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument: ${value}`);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[value.slice(2)] = "true";
    } else {
      parsed[value.slice(2)] = next;
      index += 1;
    }
  }
  return parsed;
}
