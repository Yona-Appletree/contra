import { configDefaults, defineConfig } from "vitest/config";

// `tsc -p tsconfig.json` emits the compiled tests into `dist/`, and vitest
// picks those up too, so a run after a build counts every test twice and can
// run a stale copy. Only `src/` holds tests worth running.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/dist/**"] },
});
