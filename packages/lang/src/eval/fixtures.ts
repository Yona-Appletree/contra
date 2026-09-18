/**
 * The fixtures, loaded once, for the evaluator's tests and for anything else
 * that wants a program to run — `dances/` (and `dances/broken/` on request),
 * plus whatever a test writes inline.
 *
 * A test writes a module inline when the thing it is testing is not a dance
 * anybody would keep: a dance that reads a relation from the wrong place, an
 * `assign` that names three places. The fixtures under `dances/` are the
 * acceptance list and stay readable as dances.
 */
import { fileURLToPath } from "node:url";
import type { Source } from "../diagnostics/Diagnostic.js";
import type { Program } from "./loadForEval.js";
import { loadDanceDir } from "./loadForEval.js";

/** Where the `.dance` fixtures live, from anywhere under `src/`. */
export const dancesDir = fileURLToPath(new URL("../../dances", import.meta.url));

export const fixtures = (options: { broken?: boolean; extra?: readonly Source[] } = {}): Program =>
  loadDanceDir(dancesDir, options);

/** One inline module beside the fixtures. */
export const withModule = (name: string, text: string, broken = false): Program =>
  fixtures({ broken, extra: [{ name: `${name}.dance`, text }] });
