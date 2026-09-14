#!/usr/bin/env node
// `pnpm strips [--figure <id>] [--out <dir>]` (O1): the strip writer inside
// `e2e/gallery.spec.ts`, run on its own rather than as part of the whole
// `playwright test` suite.
//
// With no `--figure` this is exactly today's full sweep — every figure and
// every seam tile, into the committed `e2e/strips/`, README rewritten — the
// same test `pnpm test:golden` already runs. `--figure <id>` narrows it to
// that one figure's tile and the seam tiles either side of it, and writes to
// `data/local/figure-lab/<id>/strips/` unless `--out` points somewhere else
// (the committed directory itself, to update just that figure's files there).
//
// Needs the app already built — this does not build it; `pnpm figure <id>`
// does, for exactly the same reason `docs/figure-lab.md` gives.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
// `--out` resolves against the repo root, not `process.cwd()`, so it means
// the same thing (e.g. `apps/web/e2e/strips`, as `docs/figure-lab.md` shows
// it) whether this runs as the root `pnpm strips` or as `apps/web`'s own
// `pnpm strips` from inside that package, where `process.cwd()` differs.
const repoRoot = resolve(webRoot, "..", "..");
const { figure, out } = parseArgs(process.argv.slice(2));

const env = { ...process.env };
if (figure !== undefined) env.STRIPS_FIGURE = figure;
if (out !== undefined) env.STRIPS_OUT = resolve(repoRoot, out);

const result = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", "e2e/gallery.spec.ts", "-g", "writes the figure and seam strips"],
  { cwd: webRoot, env, stdio: "inherit" },
);
process.exit(result.status ?? 1);

function parseArgs(argv) {
  return { figure: valueAfter(argv, "--figure"), out: valueAfter(argv, "--out") };
}

function valueAfter(argv, flag) {
  const at = argv.indexOf(flag);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined) throw new Error(`${flag} needs a value`);
  return value;
}
