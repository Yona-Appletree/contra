#!/usr/bin/env node
/**
 * `pnpm kinetics check <dance>` — engine 3's own oracle, headless.
 *
 * The same wiring `pnpm lang` uses: node runs the TypeScript sources directly
 * through `scripts/ts-src-resolve.mjs`, so there is nothing to build first.
 * The command itself is `src/cli/check.ts`.
 */
import { checkCommand } from "../src/cli/check.js";

// `process.exitCode`, never `process.exit()`: a few hundred diagnostics down a
// pipe is an asynchronous write, and exiting outright truncates it — which
// once made a run look half as noisy as it was.
process.exitCode = checkCommand(process.argv.slice(2));
