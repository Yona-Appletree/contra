import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `e2e/` is Playwright's; vitest would try to run those specs and fail on
    // `@playwright/test`'s fixtures. `dist/` is the build.
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
