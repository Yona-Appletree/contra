#!/usr/bin/env node
// `pnpm figure <id> [--dance <slug>] [--out <dir>] [--chain <n>]` (O1, F10):
// one figure's whole
// inner loop — assertions, its motion row alone and its seam rows, its
// oracles, and its three pictures — in one command, well under a minute,
// exiting non-zero the moment anything is wrong.
//
// Steps 1 to 3 of the brief's list (the assertions, the motion, the oracles)
// are pure and come from `src/figures/figureLab.ts`'s `figureLabReport`; this
// file only prints that text, builds `@caller/web` and drives Playwright for
// the pictures (step 4), and turns both into one exit code (step 5's
// "exit non-zero on any assertion or oracle failure").
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { figureLabReport } from "../src/figures/figureLab.js";
import { CHAIN_CANDIDATES } from "../src/figures/robins-chain.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const { id, dance, out, chain } = parseArgs(process.argv.slice(2));
if (id === undefined) {
  console.error("usage: pnpm figure <id> [--dance <slug>] [--out <dir>] [--chain <n>]");
  process.exit(2);
}

// `--chain <n>` picks the same courtesy-turn candidate the app's own query
// parameter picks, out of the same table, so the lab and the preview cannot
// drift apart. It overrides `robins-chain`'s tuning defaults for the
// assertions, the motion rows, the seam rows, the oracles *and* the pictures.
let overrides = {};
if (chain !== undefined) {
  const candidate = CHAIN_CANDIDATES[chain];
  if (candidate === undefined) {
    const have = Object.keys(CHAIN_CANDIDATES).join(", ");
    console.error(`figure lab: no chain candidate "${chain}" (have ${have})`);
    process.exit(2);
  }
  overrides = { "robins-chain": candidate };
}

const suffix = chain === undefined ? id : `${id}-chain${chain}`;
const outDir =
  out === undefined ? resolve(repoRoot, "data/local/figure-lab", suffix) : resolve(out);

const report = figureLabReport(id, dance, undefined, overrides);
console.log(report.text);

console.log("## 4. Pictures");
console.log("");

// A name the registry does not have has no gallery tile either — the build
// and the Playwright run would only fail a second time, more slowly.
let picturesOk = false;
if (!report.ok && report.text.includes("no such figure")) {
  console.error(`figure lab: no such figure, skipping the pictures`);
} else {
  console.log(`building @caller/web…`);
  const build = spawnSync("pnpm", ["--filter", "@caller/web", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    console.error("figure lab: build failed, no pictures written");
    process.exit(build.status ?? 1);
  }

  const picturesEnv = {
    ...process.env,
    FIGURE_LAB_ID: id,
    FIGURE_LAB_OUT: outDir,
    ...(chain === undefined ? {} : { FIGURE_LAB_CHAIN: chain }),
  };
  const pictures = spawnSync(
    "pnpm",
    ["--filter", "@caller/web", "exec", "playwright", "test", "e2e/figureLab.spec.ts"],
    { cwd: repoRoot, env: picturesEnv, stdio: "inherit" },
  );
  picturesOk = pictures.status === 0;
  if (picturesOk) {
    console.log("");
    console.log(`${resolve(outDir, `${id}-strip.png`)}`);
    console.log(`${resolve(outDir, `${id}-pen.png`)}`);
    console.log(`${resolve(outDir, `${id}-strip-cell.png`)}`);
  } else {
    console.error("figure lab: pictures failed");
  }
}

console.log("");
console.log(report.ok && picturesOk ? `pnpm figure ${id}: green` : `pnpm figure ${id}: FAIL`);
process.exit(report.ok && picturesOk ? 0 : 1);

/** `<id> [--dance <slug>] [--out <dir>] [--chain <n>]` from argv. */
function parseArgs(argv) {
  let id;
  let dance;
  let out;
  let chain;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dance") {
      dance = argv[++i];
      if (dance === undefined) throw new Error("--dance needs a value");
    } else if (arg === "--out") {
      out = argv[++i];
      if (out === undefined) throw new Error("--out needs a value");
    } else if (arg === "--chain") {
      chain = argv[++i];
      if (chain === undefined) throw new Error("--chain needs a value");
    } else if (id === undefined && !arg.startsWith("--")) {
      id = arg;
    }
  }
  return { id, dance, out, chain };
}
