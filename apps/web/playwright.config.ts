import { defineConfig } from "@playwright/test";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The port the preview server the tests screenshot runs on.
 *
 * Playwright starts `vite preview` itself and reuses one that is already up
 * (`reuseExistingServer` below), which is right inside one checkout and wrong
 * across several. This repository is worked on in parallel git worktrees, and
 * with a fixed port whichever worktree started its server first silently
 * serves every other worktree's screenshots and goldens — a green run against
 * somebody else's build. Deriving the port from the checkout's own path gives
 * each worktree its own server and keeps the reuse inside it. CI has one
 * checkout, so it lands wherever its path hashes to and nothing contends.
 */
const PORT =
  4173 +
  (createHash("sha256")
    .update(dirname(fileURLToPath(import.meta.url)))
    .digest()
    .readUInt16BE(0) %
    1000);

const BASE_URL = `http://localhost:${String(PORT)}/contra/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strict-port`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
