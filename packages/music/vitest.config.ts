import { defineConfig } from "vitest/config";

// tsc's build emits compiled *.test.js files into dist/ alongside the real
// source (this package's package.json "exports" points at ./src, not
// dist/, so that's harmless for consumers — but vitest's default include
// glob would otherwise pick up both, double-running every test whenever
// dist/ happens to exist locally). Scope discovery to src/ explicitly.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
