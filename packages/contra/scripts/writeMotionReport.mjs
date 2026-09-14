#!/usr/bin/env node
// `pnpm report:motion`: run the motion oracle and the trajectory assertions
// over the whole library and write `docs/motion-report.md`.
//
// The report itself is built by `src/figures/reportMotion.ts`, which is pure —
// it returns a string. All this does is put it on disk, so the package stays
// free of `node:fs` and the report stays testable.
//
// `--figure <id>` (O1) patches just that figure's rows and its seam rows into
// the file that is already there, via `src/figures/motionReportPatch.ts`,
// instead of overwriting the whole thing — so a figure milestone's report
// diff is small. It still computes the full report to patch from (that part
// was never the slow one — P1 found the plan cache, not the report, was the
// cost — so `--figure` is not faster than a full run; it is smaller on disk).
// The full, unflagged run is still the gate: it is the only one that can
// re-rank the top-ten tables or add/drop a row.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchMotionReport } from "../src/figures/motionReportPatch.js";
import { motionReportMarkdown } from "../src/figures/reportMotion.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const out = resolve(root, "docs/motion-report.md");
const figureId = readFigureArg(process.argv.slice(2));
const fresh = motionReportMarkdown();

mkdirSync(dirname(out), { recursive: true });
if (figureId === undefined) {
  writeFileSync(out, fresh, "utf8");
  console.log(`report:motion: wrote ${out}`);
} else {
  const existing = existsSync(out) ? readFileSync(out, "utf8") : fresh;
  writeFileSync(out, patchMotionReport(existing, fresh, figureId), "utf8");
  console.log(`report:motion --figure ${figureId}: patched ${out}`);
}

/** `--figure <id>` from argv, or `undefined` when it is not there. */
function readFigureArg(argv) {
  const at = argv.indexOf("--figure");
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined) throw new Error("--figure needs a value");
  return value;
}
