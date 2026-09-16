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
const PORT = safePort(
  4173 +
    (createHash("sha256")
      .update(dirname(fileURLToPath(import.meta.url)))
      .digest()
      .readUInt16BE(0) %
      1000),
);

/**
 * The same port, stepped past the ones Chrome refuses to navigate to at all.
 *
 * Chrome keeps a list of ports it will not open (`net::ERR_UNSAFE_PORT`) for
 * protocols that can be smuggled over HTTP — 4190 is ManageSieve and 5060/5061
 * are SIP. A worktree whose path happens to hash on to one of them cannot run
 * a single golden: every `page.goto` fails before the server is even asked.
 * That is a one-in-three-hundred accident of the path, and it took a whole
 * worktree's goldens out until it was found, so the derivation steps over them
 * rather than leaving the next worktree to rediscover it. Nothing else about
 * the hash changes, so every path that was already fine keeps the port it had.
 */
function safePort(port: number): number {
  // **And the two macOS already answers on** (M9h). 5000 and 7000 are the
  // AirPlay Receiver's, served by Control Centre and on by default on a Mac,
  // and what they answer `GET /contra/` with is `403 Forbidden` from
  // `Server: AirTunes/950.7.1`. That is worse than a port Chrome refuses,
  // because the page loads: `--strict-port` stops `vite preview` binding, but
  // `reuseExistingServer` sees something answering at the URL, decides a server
  // is already up, and **every e2e test in that worktree then screenshots
  // AirPlay** and fails on an empty body. This worktree's own path hashed to
  // 5000 and took the whole suite out, the smoke test included, until it was
  // found — so the two go in the list beside the Chrome ones rather than being
  // rediscovered.
  const BLOCKED = new Set([4190, 5000, 5060, 5061, 7000]);
  let at = port;
  while (BLOCKED.has(at)) at += 1;
  return at;
}

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
