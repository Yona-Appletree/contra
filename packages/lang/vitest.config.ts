import { configDefaults, defineConfig } from "vitest/config";

// `tsc -p tsconfig.json` emits the compiled tests into `dist/`, and vitest's
// default include glob would otherwise pick those up too, double-running (and
// possibly running a stale copy of) every test after a build. Only `src/`
// holds tests worth running. Every package in this workspace repeats this
// same `exclude`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/dist/**"],
    // Turbo runs every package's vitest in parallel on CI; the timeouts are a
    // harness guard against that contention, not a performance budget.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
