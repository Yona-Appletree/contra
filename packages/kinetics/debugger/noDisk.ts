/**
 * `node:fs` and `node:path`, in a page that has neither.
 *
 * `@caller/lang` reads `.dance` files from disk for the CLI and the tests
 * (`loadProgram`, `loadDanceDir`), and those functions sit in modules the
 * debugger does import for their *other* exports — `loadTexts`, `loadForEval`,
 * which are pure and take the texts in hand. Rollup binds an import's names
 * before it shakes the dead ones out, so the page needs something for
 * `readFileSync` to be, even though nothing ever calls it.
 *
 * This is that something, and it throws rather than lying: the debugger
 * bundles the fixtures with `import.meta.glob` (`presets.ts`) and never reads
 * a disk. `debugger/vite.config.ts` aliases the two modules here.
 */
const noDisk = (name: string): never => {
  throw new Error(`${name} is not available in the browser: the debugger bundles its .dance text`);
};

export const readFileSync = (): never => noDisk("readFileSync");
export const readdirSync = (): never => noDisk("readdirSync");
export const join = (): never => noDisk("join");
export const resolve = (): never => noDisk("resolve");
export const dirname = (): never => noDisk("dirname");
export const basename = (): never => noDisk("basename");
export default { readFileSync, readdirSync, join, resolve, dirname, basename };
