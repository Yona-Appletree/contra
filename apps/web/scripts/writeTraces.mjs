// `pnpm traces:export`: writes every figure's and every dance's four views as
// SVG under `apps/web/e2e/traces/`, with the index that lists them.
//
// The builder is pure and lives in `src/traces/traceFiles.ts`; this file is the
// only part that touches a disk, the same split `packages/contra/scripts/
// writeMotionReport.mjs` uses. Run through `scripts/ts-src-resolve.mjs`, which
// lets node import the workspace's TypeScript sources directly.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { traceFiles, traceIndex } from "../src/traces/traceFiles.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = resolve(root, "e2e/traces");

rmSync(out, { recursive: true, force: true });
const files = traceFiles();
for (const file of files) {
  const target = resolve(out, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.content, "utf8");
}
writeFileSync(resolve(out, "README.md"), traceIndex(files), "utf8");
console.log(`traces:export: wrote ${String(files.length)} SVGs and an index to ${out}`);
