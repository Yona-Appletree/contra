#!/usr/bin/env node
// `pnpm dance <slug> [--couples n] [--out dir]` (the figure model's M1): one
// dance's whole inner loop — how every call resolves against the live set, the
// oracles at every checked line length, the motion rows for its own seams, and
// its four trace SVGs — in one command, exiting non-zero the moment anything is
// wrong.
//
// The counterpart of `pnpm figure <id>` and built on the same split: everything
// pure comes from `src/dances/danceLab.ts`; this file prints that text, spawns
// the existing `traces:export` path for the pictures, and turns both into one
// exit code.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { danceLabReport } from "../src/dances/danceLab.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const { slug, couples, out, noTraces } = parseArgs(process.argv.slice(2));
if (slug === undefined) {
  console.error("usage: pnpm dance <slug> [--couples n] [--out dir] [--no-traces]");
  process.exit(2);
}

const outDir = out === undefined ? resolve(repoRoot, "data/local/dance-lab", slug) : resolve(out);

const report = danceLabReport(slug, couples);
console.log(report.text);

// A slug the loader does not have has no trace tile either: the export would
// only fail a second time, more slowly.
const unknown = report.text.includes("no such dance");

let tracesOk = false;
if (noTraces || unknown) {
  if (unknown) console.error("dance lab: no such dance, skipping the traces");
  tracesOk = !unknown;
} else {
  console.log("## 4. Traces");
  console.log("");
  const traces = spawnSync(
    "node",
    [
      "--import",
      "./scripts/ts-src-resolve.mjs",
      "apps/web/scripts/writeTraces.mjs",
      "--dance",
      slug,
      "--out",
      resolve(outDir, "traces"),
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  tracesOk = traces.status === 0;
  if (!tracesOk) console.error("dance lab: traces failed");
}

console.log("");
console.log(report.ok && tracesOk ? `pnpm dance ${slug}: green` : `pnpm dance ${slug}: FAIL`);
process.exit(report.ok && tracesOk ? 0 : 1);

/** `<slug> [--couples n] [--out dir] [--no-traces]` from argv. */
function parseArgs(argv) {
  let slug;
  let couples;
  let out;
  let noTraces = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--couples") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--couples needs a value");
      couples = Number(value);
      if (!Number.isInteger(couples) || couples < 2) {
        throw new Error(`--couples wants a whole number of couples, not "${value}"`);
      }
    } else if (arg === "--out") {
      out = argv[++i];
      if (out === undefined) throw new Error("--out needs a value");
    } else if (arg === "--no-traces") {
      noTraces = true;
    } else if (slug === undefined && !arg.startsWith("--")) {
      slug = arg;
    }
  }
  return { slug, couples, out, noTraces };
}
