import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIGURES } from "../figures/registry.js";
import type { FigureRegistry } from "../figures/registry.js";
import type { CompileInput } from "../lang/compile.js";
import { compile } from "../lang/compile.js";
import { parse } from "../lang/parser.js";
import type { File } from "../lang/syntax.js";
import type { Floor } from "../tree/floor.js";
import { floorOf } from "../tree/floor.js";

/**
 * The `.dance` files of the package, read from disk — for tests and node.
 * The debugger reads the same files with vite's `?raw`.
 *
 * A formation is a **file**: `formations/becket.dance` is read with the
 * prelude and `common.dance` (the couple) and nothing else, so every
 * formation may name its modules `minor-set` and `major-set` and a move's
 * `$minor-set` means the same thing on every floor. The root module is the
 * one named after the file.
 */
export const DANCES_DIR = fileURLToPath(new URL("../../dances/", import.meta.url));

export const readDance = (relative: string): string =>
  readFileSync(join(DANCES_DIR, relative), "utf8");

export const loadDance = (relative: string): File => parse(readDance(relative));

/** The names of the formations on disk (`becket`, `improper`, …), sorted. */
export const formationNames = (): string[] =>
  readdirSync(join(DANCES_DIR, "formations"))
    .filter((n) => n.endsWith(".dance") && n !== "common.dance")
    .map((n) => n.slice(0, -".dance".length))
    .sort();

/** The prelude, the couple, and the named formation, parsed, in that order. */
export const loadFormation = (name: string): File[] => [
  loadDance("prelude.dance"),
  loadDance("formations/common.dance"),
  loadDance(`formations/${name}.dance`),
];

/** `dances/moves.dance`, parsed. */
export const loadMoves = (): File => loadDance("moves.dance");

/** The prelude and the couple: what every floor a dance declares is read with. */
export const loadLibrary = (): File[] => [
  loadDance("prelude.dance"),
  loadDance("formations/common.dance"),
];

/** The file that defines a formation, by its name, or nothing. */
export const resolveFormation = (name: string): File | undefined =>
  formationNames().includes(name) ? loadDance(`formations/${name}.dance`) : undefined;

/** Everything a dance that owns its floor needs to run, for tests: the library, the resolver and the moves. */
export const standardRun = (dynamics: Readonly<Record<string, number>> = {}) => ({
  moves: loadMoves(),
  library: loadLibrary(),
  resolve: resolveFormation,
  dynamics,
});

/** A standard floor: the named formation from disk, built and seated. */
export const standardFloor = (name: string, args: Readonly<Record<string, number>> = {}): Floor =>
  floorOf(loadFormation(name), name, args);

/** A dance file from disk compiled on a floor with the standard moves — the tests' one-liner. */
export function compileDance(
  source: string,
  floor?: Floor,
  options: {
    registry?: FigureRegistry;
    moves?: File;
    entry?: string;
    dynamics?: Readonly<Record<string, number>>;
  } = {},
): ReturnType<typeof compile> {
  const input: CompileInput = {
    dance: parse(source),
    moves: options.moves ?? loadMoves(),
    registry: options.registry ?? FIGURES,
    library: loadLibrary(),
    resolve: resolveFormation,
  };
  if (floor !== undefined) input.floor = floor;
  if (options.entry !== undefined) input.entry = options.entry;
  if (options.dynamics !== undefined) input.dynamics = options.dynamics;
  return compile(input);
}
