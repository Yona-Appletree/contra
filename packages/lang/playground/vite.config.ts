import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The playground is a vite root inside the package: served by
 * `pnpm --filter @caller/lang dev` on 5178, built into `dist/playground/`. It
 * is the only consumer of `../src` that runs in a browser, and it is not
 * production code.
 *
 * Two of the language's own modules reach for `node:fs` and `node:path` — the
 * loaders that read a directory of `.dance` files. The playground never calls
 * those functions (its files arrive as text, bundled by `import.meta.glob`),
 * but the imports are still in the graph, so they resolve to a stub that
 * throws if anything ever does call them.
 */
const root = fileURLToPath(new URL(".", import.meta.url));
const nodeStub = fileURLToPath(new URL("./nodeStub.ts", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  build: { outDir: "../dist/playground", emptyOutDir: true },
  server: { port: 5178, strictPort: true },
  resolve: { alias: [{ find: /^node:(fs|path)$/, replacement: nodeStub }] },
});
