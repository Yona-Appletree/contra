import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The kinetics debugger is a vite root inside the package: served by
// `pnpm --filter @caller/kinetics dev`, built into `dist/debugger/`. It is
// the only consumer of `../src` and is not production code.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  // `@caller/lang`'s loader reads a disk for the CLI and the tests; the page
  // never does (`noDisk.ts` says why, and throws if anything tries).
  resolve: {
    alias: {
      "node:fs": fileURLToPath(new URL("./noDisk.ts", import.meta.url)),
      "node:path": fileURLToPath(new URL("./noDisk.ts", import.meta.url)),
    },
  },
  build: { outDir: "../dist/debugger", emptyOutDir: true },
  server: { port: 5177, fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
});
