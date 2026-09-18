/**
 * What `node:fs` and `node:path` are in a browser: nothing, loudly.
 *
 * `src/load.ts` and `src/eval/loadForEval.ts` both read a directory of
 * `.dance` files when node is underneath them; the playground hands them text
 * instead (`loadTexts`, `loadForEval`), so these three never run. Vite aliases
 * the two modules here so the import graph resolves without dragging node into
 * the bundle, and so a future call site says why it broke rather than
 * producing `undefined`.
 */
const absent =
  (name: string) =>
  (...args: unknown[]): never => {
    throw new Error(
      `${name}(${args.map(String).join(", ")}) is node's, and the playground is a browser: ` +
        "hand the loader its sources as text instead.",
    );
  };

export const readFileSync = absent("readFileSync");
export const readdirSync = absent("readdirSync");
export const join = absent("join");
