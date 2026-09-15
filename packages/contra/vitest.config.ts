import { configDefaults, defineConfig } from "vitest/config";

// `tsc -p tsconfig.json` emits the compiled tests into `dist/`, and vitest
// picks those up too, so a run after a build counts every test twice and can
// run a stale copy. Only `src/` holds tests worth running.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/dist/**"],
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
