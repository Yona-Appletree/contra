import { configDefaults, defineConfig } from "vitest/config";

// The same `dist/**` exclude every package in this workspace repeats (`tsc`
// emits compiled `*.test.js` into `dist/`, which vitest's default include
// glob would otherwise pick up too, double-running every test after a
// build), made uniform by M10 (cleanup), plus this app's own extra: `e2e/` is
// Playwright's, and vitest would try to run those specs and fail on
// `@playwright/test`'s fixtures.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/dist/**", "**/e2e/**"],
    // Turbo runs every package's vitest in parallel on CI, and under that
    // contention the whole-dance suites cross vitest's 5000 ms default
    // `testTimeout`/`hookTimeout` although they run in a few hundred ms
    // alone. This is a harness guard against that contention, not a
    // performance budget — `pnpm dance`'s motion rows and the perf spec are
    // the budgets.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
