#!/usr/bin/env node
// Copies the public half of the derived corpus out of the private data root
// and into the public repository, in the arrangement docs/corpus-derived.md
// defines under "contra/data/corpus/fixtures/<id>.json" and the permission
// ADR's four-tier table.
//
//   derived/index.jsonl      →  data/corpus/index.jsonl        facts only
//   derived/sets/hand.json   →  data/corpus/sets/hand.json      ids and reasons
//   derived/sets/suite.json  →  data/corpus/sets/suite.json     ids and reasons
//   derived/dances/<id>.json →  data/corpus/fixtures/<id>.json  figure text
//
// The first three are facts of the kind `data/corpus/portland-programs.json`
// already publishes. The fourth is the only figure text that ever reaches the
// public repository, and it is fenced: a record is copied only if it is in the
// `hand` set AND its `permission` is `full`. Every run recomputes that from
// scratch and deletes any fixture that no longer answers both — so a dance
// leaving `full` in a later crawl is pruned by the next derive run rather
// than by anyone remembering to.
//
// Nothing is rewritten on the way: a derived record is copied byte for byte,
// which is possible because derive-dances already formats it with THIS
// repository's prettier config. `pnpm format:check` therefore passes over the
// copies untouched.
//
// Usage:
//   node scripts/corpus/derive-fixtures.mjs
//   node scripts/corpus/derive-fixtures.mjs --data ../contra-data
//   node scripts/corpus/derive-fixtures.mjs --public /tmp/try   # write elsewhere
//   node scripts/corpus/derive-fixtures.mjs --only 10320        # a few records, no pruning
//   node scripts/corpus/derive-fixtures.mjs --report            # counts, writes nothing

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { resolveDataRoot } from "./derive-index.mjs";

export { resolveDataRoot };

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

/** Where each file goes, relative to the public repository root. */
export const PUBLIC_PATHS = {
  index: "data/corpus/index.jsonl",
  hand: "data/corpus/sets/hand.json",
  suite: "data/corpus/sets/suite.json",
  fixtures: "data/corpus/fixtures",
  readme: "data/corpus/fixtures/README.md",
};

// ---------------------------------------------------------------------------
// Which records qualify
// ---------------------------------------------------------------------------

/**
 * The ids whose derived record may be published as a fixture: in the hand set,
 * and `permission: full` in the record itself. Both are checked afresh every
 * run — that is what makes the directory equal to the rule rather than to
 * whatever happened to be copied last time.
 */
export function fixtureIds({ handDances = [], permissionById = new Map() } = {}) {
  const ids = [];
  const droppedNotFull = [];
  for (const dance of handDances) {
    const id = String(dance.id);
    const permission = permissionById.get(id);
    if (permission === "full") ids.push(id);
    else droppedNotFull.push({ id, permission: permission ?? "(no derived record)" });
  }
  ids.sort((a, b) => Number(a) - Number(b));
  return { ids, droppedNotFull };
}

/** The fixture files already in the public repository, by id. */
export function existingFixtureIds(fileNames) {
  return fileNames
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => name.slice(0, -".json".length))
    .sort((a, b) => Number(a) - Number(b));
}

/** What to write and what to remove, given what qualifies and what is there. */
export function planFixtures({ wanted, existing }) {
  const want = new Set(wanted);
  return {
    write: [...wanted],
    remove: existing.filter((id) => !want.has(id)),
  };
}

// ---------------------------------------------------------------------------
// The README
// ---------------------------------------------------------------------------

// Static prose on purpose: no counts, no generated date. The arrangement it
// describes does not change when the set does, and a README that churned on
// every derive run would bury the one thing it is for — telling a reader, and
// The Caller's Box, exactly what this directory is and how to have something
// taken out of it.
export const FIXTURES_README = `# Corpus fixtures

These files are dance records from **The Caller's Box**
(<https://www.ibiblio.org/contradance/thecallersbox/>), normalised into this
project's own JSON shape by \`scripts/corpus/derive-dances.mjs\` and copied here
unchanged by \`scripts/corpus/derive-fixtures.mjs\`. They exist so the contra
engine's tests have real choreography to run against, and for nothing else.

## What is here

One file per dance, named by its Caller's Box id. Every record carries, inside
itself, the four things that say where it came from and on what footing:

- \`id\` — the Caller's Box dance id
- \`url\` — the dance's page on The Caller's Box
- \`permission\` — the site's own \`Permission\` field, copied verbatim
- \`fetchedAt\` — when this copy was downloaded

## The rules this directory keeps

- **\`Permission: full\` only.** A record whose \`permission\` field is anything
  else is never copied here. This is a small set: the \`hand\` set described in
  [docs/corpus-derived.md](../../../docs/corpus-derived.md), a few dozen dances
  chosen to cover the tag vocabulary, not a mirror of the database.
- **Never rendered, searched or indexed by the site.** Nothing in this
  directory is loaded by the deployed application; the dances it actually
  dances live in \`data/dances/\`, each one separately cleared with its author.
  This is test data, not a place to look a dance up.
- **Pruned on any change of permission.** Every derive run recomputes which
  records qualify and deletes the files of any that no longer do, so a dance
  that leaves \`full\` on The Caller's Box leaves this directory at the next
  run.
- **Removed on request.** If you are The Caller's Box, or the author of a
  dance here, and would like a record — or all of them — taken out, it will be
  done the day you ask, with no discussion needed.

## Contact

Open an issue on <https://github.com/Yona-Appletree/contra/issues>, or contact
the repository owner there. A removal request is acted on immediately; you do
not need to explain it.
`;

/**
 * The README as bytes, formatted with THIS repository's prettier config
 * (print width 100) rather than the target's, so it passes `format:check`
 * after a copy into the real repository and is identical when written into a
 * scratch directory under `--public`.
 */
export async function formatReadme(text = FIXTURES_README) {
  const config = (await resolveConfig(resolve(REPO_ROOT, PUBLIC_PATHS.readme))) ?? {};
  return format(text, { ...config, parser: "markdown" });
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * The whole copy, with every side effect injected so the test drives it on
 * strings. `readFixture` returns a record's bytes; `write` and `remove` are
 * the two things that touch the public repository.
 */
export async function runFixtures({
  handDances,
  permissionById,
  existing,
  copies = [],
  only = null,
  report = false,
  readFixture,
  write,
  remove,
}) {
  const { ids, droppedNotFull } = fixtureIds({ handDances, permissionById });
  const wanted = only ? ids.filter((id) => only.includes(id)) : ids;
  // With --only the script is looking at a slice, and a slice cannot tell a
  // fixture that has left the set from one it simply did not look at — so it
  // prunes nothing.
  const plan = only ? { write: wanted, remove: [] } : planFixtures({ wanted, existing });

  const counts = {
    handDances: handDances.length,
    qualify: ids.length,
    written: 0,
    removed: 0,
    droppedNotFull: droppedNotFull.length,
    copied: 0,
  };

  if (!report) {
    for (const copy of copies) {
      write(copy.to, copy.text);
      counts.copied += 1;
    }
    write(PUBLIC_PATHS.readme, await formatReadme());
    for (const id of plan.write) {
      write(`${PUBLIC_PATHS.fixtures}/${id}.json`, readFixture(id));
      counts.written += 1;
    }
    for (const id of plan.remove) {
      remove(`${PUBLIC_PATHS.fixtures}/${id}.json`);
      counts.removed += 1;
    }
  }

  return { counts, plan, droppedNotFull };
}

// ------------------------------------------------------------------- the CLI

export function parseArgs(argv) {
  const args = { data: null, public: null, only: null, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data") {
      args.data = argv[++i];
      if (!args.data) throw new Error("--data requires a path");
    } else if (arg === "--public") {
      args.public = argv[++i];
      if (!args.public) throw new Error("--public requires a path");
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

/** The public repository root: `--public`, else this repository. */
export function resolvePublicRoot({ publicArg = null } = {}, repoRoot = REPO_ROOT) {
  return publicArg ? resolve(publicArg) : repoRoot;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`derive-fixtures: ${error.message}`);
    process.exit(1);
  }

  const dataRoot = resolveDataRoot({ dataArg: args.data });
  const publicRoot = resolvePublicRoot({ publicArg: args.public });
  const indexPath = resolve(dataRoot, "derived/index.jsonl");
  const handPath = resolve(dataRoot, "derived/sets/hand.json");
  const suitePath = resolve(dataRoot, "derived/sets/suite.json");
  for (const [what, path] of [
    ["index.jsonl", indexPath],
    ["sets/hand.json", handPath],
    ["sets/suite.json", suitePath],
  ]) {
    if (!existsSync(path)) {
      console.error(`derive-fixtures: no ${what} at ${path} (run derive-index and derive-sets)`);
      process.exit(1);
    }
  }

  const hand = JSON.parse(readFileSync(handPath, "utf-8"));
  const dancesDir = resolve(dataRoot, "derived/dances");
  const permissionById = new Map();
  for (const dance of hand.dances ?? []) {
    const path = resolve(dancesDir, `${dance.id}.json`);
    if (!existsSync(path)) continue;
    permissionById.set(String(dance.id), JSON.parse(readFileSync(path, "utf-8")).permission);
  }

  const fixturesDir = resolve(publicRoot, PUBLIC_PATHS.fixtures);
  const existing = existsSync(fixturesDir) ? existingFixtureIds(readdirSync(fixturesDir)) : [];

  const copies = [
    { to: PUBLIC_PATHS.index, text: readFileSync(indexPath, "utf-8") },
    { to: PUBLIC_PATHS.hand, text: readFileSync(handPath, "utf-8") },
    { to: PUBLIC_PATHS.suite, text: readFileSync(suitePath, "utf-8") },
  ];

  const write = (relative, text) => {
    const path = resolve(publicRoot, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const remove = (relative) => rmSync(resolve(publicRoot, relative), { force: true });
  const readFixture = (id) => readFileSync(resolve(dancesDir, `${id}.json`), "utf-8");

  const { counts, plan, droppedNotFull } = await runFixtures({
    handDances: hand.dances ?? [],
    permissionById,
    existing,
    copies,
    only: args.only,
    report: args.report,
    readFixture,
    write,
    remove,
  });

  console.log(`derive-fixtures: ${dataRoot} → ${publicRoot}`);
  console.log(`hand set: ${counts.handDances} dances (generatedAt ${hand.generatedAt})`);
  console.log(`qualify as fixtures (in hand, permission full): ${counts.qualify}`);
  console.log(`hand dances held back (permission not full): ${counts.droppedNotFull}`);
  for (const dropped of droppedNotFull.slice(0, 10)) {
    console.log(`  ${dropped.id.padStart(6)}  permission ${JSON.stringify(dropped.permission)}`);
  }
  console.log(`fixtures already in ${publicRoot}: ${existing.length}`);
  console.log(`to write: ${plan.write.length}`);
  console.log(`to remove (no longer in the set, or no longer full): ${plan.remove.length}`);
  for (const id of plan.remove.slice(0, 10)) console.log(`  ${id}.json`);
  console.log("also copied: index.jsonl, sets/hand.json, sets/suite.json, fixtures/README.md");
  if (args.only) console.log(`only: ${args.only.join(", ")} (pruning skipped)`);
  if (args.report) {
    console.log("(report only, nothing written)");
    return;
  }
  console.log(
    `derive-fixtures: wrote ${counts.written} fixture(s), removed ${counts.removed}, ` +
      `copied ${counts.copied} file(s) plus the README`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
