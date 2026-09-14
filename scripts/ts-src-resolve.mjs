import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Let `node` run the workspace's TypeScript sources directly.
 *
 * Every package's `exports` points at `src/index.ts` and every relative import
 * inside a package is written with the `.js` extension TypeScript's NodeNext
 * resolution wants. Node's own type stripping handles the types; what it does
 * not do is look for `Foo.ts` when the specifier says `Foo.js`. This resolve
 * hook does exactly that and nothing else, so a root script can import a
 * package the same way a test does, with no bundler and no new dependency.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const swapped = swapExtension(specifier, context?.parentURL);
      if (swapped === undefined) throw error;
      return { url: swapped, shortCircuit: true };
    }
  },
});

/** `./Foo.js` beside a parent that has a `./Foo.ts`, as a file URL. */
function swapExtension(specifier, parentURL) {
  if (!specifier.endsWith(".js")) return undefined;
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
  if (parentURL === undefined) return undefined;
  const url = new URL(specifier.slice(0, -3) + ".ts", parentURL);
  return existsSync(fileURLToPath(url)) ? pathToFileURL(fileURLToPath(url)).href : undefined;
}
