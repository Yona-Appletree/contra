// `pnpm traces:export`: writes every figure's and every dance's four views as
// SVG under `apps/web/e2e/traces/`, with the index that lists them.
//
// The builder is pure and lives in `src/traces/traceFiles.ts`; this file is the
// only part that touches a disk, the same split `packages/contra/scripts/
// writeMotionReport.mjs` uses. Run through `scripts/ts-src-resolve.mjs`, which
// lets node import the workspace's TypeScript sources directly.
//
// `--figure <id>` (O1) writes only that one figure's four files — never a
// dance's, never another figure's, and never a rewritten index, which only a
// full run can get right — to `--out`, default `data/local/figure-lab/<id>/
// traces/` (gitignored). Pointed explicitly at the committed directory
// (`--out apps/web/e2e/traces`) it updates just that figure's four files
// there and leaves every other committed file untouched; the unflagged run
// above is the only one that deletes and rewrites the whole directory.
//
// `--dance <slug>` is the same thing for one dance, and is what `pnpm dance
// <slug>` spawns for its pictures. Default `--out` is
// `data/local/dance-lab/<slug>/traces/`.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { traceFiles, traceIndex } from "../src/traces/traceFiles.js";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(webRoot, "..", "..");
const args = parseArgs(process.argv.slice(2));
const files = traceFiles();

if (args.figure === undefined && args.dance === undefined) {
  const out = resolve(webRoot, "e2e/traces");
  rmSync(out, { recursive: true, force: true });
  for (const file of files) writeOne(out, file);
  writeFileSync(resolve(out, "README.md"), traceIndex(files), "utf8");
  console.log(`traces:export: wrote ${String(files.length)} SVGs and an index to ${out}`);
} else if (args.dance !== undefined) {
  const matching = files.filter((file) => file.kind === "dances" && file.key === args.dance);
  if (matching.length === 0) {
    throw new Error(`traces:export --dance ${args.dance}: no dance trace named that`);
  }
  const out = args.out ?? resolve(repoRoot, "data/local/dance-lab", args.dance, "traces");
  for (const file of matching) writeOne(out, file);
  console.log(
    `traces:export --dance ${args.dance}: wrote ${String(matching.length)} SVGs to ${out}`,
  );
} else {
  const matching = files.filter((file) => file.kind === "figures" && file.key === args.figure);
  if (matching.length === 0) {
    throw new Error(`traces:export --figure ${args.figure}: no figure tile named that`);
  }
  const out = args.out ?? resolve(repoRoot, "data/local/figure-lab", args.figure, "traces");
  for (const file of matching) writeOne(out, file);
  console.log(
    `traces:export --figure ${args.figure}: wrote ${String(matching.length)} SVGs to ${out}`,
  );
}

/** One file, at `out` plus its own relative path. */
function writeOne(out, file) {
  const target = resolve(out, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.content, "utf8");
}

/** `--figure <id>`, `--dance <slug>` and `--out <dir>` from argv. */
function parseArgs(argv) {
  const figure = valueAfter(argv, "--figure");
  const dance = valueAfter(argv, "--dance");
  const out = valueAfter(argv, "--out");
  if (figure !== undefined && dance !== undefined) {
    throw new Error("traces:export: --figure and --dance are alternatives, not a pair");
  }
  return { figure, dance, out: out === undefined ? undefined : resolve(process.cwd(), out) };
}

function valueAfter(argv, flag) {
  const at = argv.indexOf(flag);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined) throw new Error(`${flag} needs a value`);
  return value;
}
