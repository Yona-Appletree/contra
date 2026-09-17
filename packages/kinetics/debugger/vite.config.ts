import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The kinetics debugger is a vite root inside the package: served by
// `pnpm --filter @caller/kinetics dev`, built into `dist/debugger/`. It is
// the only consumer of `../src` and is not production code.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  build: { outDir: "../dist/debugger", emptyOutDir: true },
  server: { port: 5177 },
});
