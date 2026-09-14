import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `build` emits `dist/**/*.test.js`, which vitest would otherwise run a
    // second time. M10 owns the general fix; this keeps this package's counts
    // honest in the meantime.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
