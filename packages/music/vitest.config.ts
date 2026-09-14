import { configDefaults, defineConfig } from "vitest/config";

// `tsc -p tsconfig.json` emits the compiled tests into `dist/`, and vitest's
// default include glob would otherwise pick those up too, double-running (and
// possibly running a stale copy of) every test after a build. Only `src/`
// holds tests worth running. Every package in this workspace repeats this
// same `exclude`, made uniform by M10 (cleanup) — this file used a narrower
// `include` before, which had the same effect but not the same shape as
// every other package's config.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/dist/**"] },
});
