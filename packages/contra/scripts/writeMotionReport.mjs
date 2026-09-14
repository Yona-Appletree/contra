#!/usr/bin/env node
// `pnpm report:motion`: run the motion oracle and the trajectory assertions
// over the whole library and write `docs/motion-report.md`.
//
// The report itself is built by `src/figures/reportMotion.ts`, which is pure —
// it returns a string. All this does is put it on disk, so the package stays
// free of `node:fs` and the report stays testable.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { motionReportMarkdown } from "../src/figures/reportMotion.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const out = resolve(root, "docs/motion-report.md");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, motionReportMarkdown(), "utf8");
console.log(`report:motion: wrote ${out}`);
