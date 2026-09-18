/**
 * What `node:fs` and `node:path` are in a browser: nothing, loudly.
 *
 * `src/load.ts` reads a `.dance` file by name when node is underneath it;
 * `src/eval/loadForEval.ts`'s `loadDanceDir` reads a whole directory of them
 * on top of that. The playground hands both text instead (`loadTexts`,
 * `loadForEval`), so none of `readFileSync`, `readdirSync` or `join` ever
 * run. Vite aliases the two node modules here so the import graph resolves
 * without dragging node into the bundle, and so a future call site says why
 * it broke rather than producing `undefined`.
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
