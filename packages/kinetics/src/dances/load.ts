import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Source } from "@caller/lang";
import type { Run, RunOptions } from "../pipeline.js";
import { run } from "../pipeline.js";

/**
 * The `.dance` files, read from disk — for the tests, the CLI and node.
 *
 * There is **one home for `.dance` text** (notes D2), and it is
 * `packages/lang/dances/`: the language owns the grammar, so it owns the
 * fixtures, and this package reads them the way anybody else would. The
 * debugger bundles the same directory with vite's `import.meta.glob`.
 *
 * The deliberately-broken fixtures under `dances/broken/` are left out: they
 * are the language's own tests and have nothing to animate.
 */
export const DANCES_DIR = fileURLToPath(new URL("../../../lang/dances/", import.meta.url));

export const danceSources = (): Source[] =>
  readdirSync(DANCES_DIR)
    .filter((name) => name.endsWith(".dance"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(DANCES_DIR, name), "utf8") }));

/**
 * One dance through the whole stack — the tests' and the CLI's one-liner.
 *
 * `extra` puts a source beside the fixtures without writing a file: a test
 * that wants one figure on a becket writes the four lines of a dance that
 * calls it, and reads `becket.dance` and `contra.dance` from disk like
 * anything else.
 */
export const runNamed = (
  dance: string,
  opts: Omit<RunOptions, "sources" | "dance"> & { extra?: readonly Source[] } = {},
): Run => {
  const { extra, ...rest } = opts;
  return run({ sources: [...danceSources(), ...(extra ?? [])], dance, ...rest });
};
