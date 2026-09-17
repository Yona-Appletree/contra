import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { File } from "../lang/syntax.js";
import { parse } from "../lang/parser.js";

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
