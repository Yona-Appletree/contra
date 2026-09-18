import { readFileSync } from "node:fs";
import { moduleRefs } from "./check/walk.js";
import type { Diagnostic, Source } from "./diagnostics/Diagnostic.js";
import { diagnostic } from "./diagnostics/Diagnostic.js";
import type { FileNode } from "./syntax/ast.js";
import { moduleNameOf, parseFile } from "./syntax/parser.js";

/**
 * Loading a program: **a file is a module and its name is the file's stem**
 * (§5). A run is the entry file, every module it names — by `use` or by a
 * qualified name, transitively — and `prelude.dance`, which is read before
 * every file and imports nothing. {@link loadAllTexts} below is the same
 * reading with every given file as its own entry, for a caller that wants a
 * whole set of files indexed rather than one file's transitive closure — the
 * evaluator's `loadDanceDir`, and the playground. This is the one place a
 * `.dance` file turns into a parsed `Module`; nothing else reads one.
 *
 * Modules are looked for beside the entry file and one directory up, so a
 * fixture in `dances/broken/` reads the formations in `dances/` without
 * spelling out a path. There are no paths in the language: `use becket::…`
 * names a module, never a file, and where the module lives is the loader's
 * business.
 */
export function loadProgram(entryPath: string, options: LoadOptions = {}): Program {
  const find = options.find ?? fileFinder(entryPath);
  return loadFrom([moduleNameOf(entryPath)], find);
}

/** What a run is made of, once every module it names has been read and parsed. */
export interface Program {
  /** The module the run is about — absent when it did not parse. */
  entry?: Module;
  /** Every module read, `prelude` first and the entry last. */
  modules: readonly Module[];
  /** The one every module reads without importing it (§3: enums only). */
  prelude?: Module;
  /** Every file's text, for `renderText`'s carets. */
  sources: readonly Source[];
  /** What went wrong reading and parsing — a checker runs only when this is empty. */
  diagnostics: readonly Diagnostic[];
}

/** One parsed file. */
export interface Module {
  /** The file's stem: `becket`. */
  name: string;
  /** The file name spans point into: `becket.dance`. */
  file: string;
  text: string;
  ast: FileNode;
}

export interface LoadOptions {
  /** Where a module's text comes from; the default reads `<module>.dance` from disk. */
  find?: ModuleFinder;
}

/** Answers "is there a module of this name, and what does it say?". */
export type ModuleFinder = (module: string) => { file: string; text: string } | undefined;

/**
 * The same load, from texts already in hand — what the tests and the
 * playground use. Keys are file names (`becket.dance`); the entry is the last
 * one unless it is named.
 */
export function loadTexts(files: readonly Source[], entry?: string): Program {
  const find = finderFor(files);
  const last = files.at(-1);
  const entryName = entry ?? (last === undefined ? "" : moduleNameOf(last.name));
  return loadFrom([entryName], find);
}

/**
 * The same load, with every file its own root — for a set of `.dance` files a
 * dance is picked from **by name**, not followed to from one file's `use`
 * lines (`@caller/lang`'s evaluator: a directory of fixtures, or the
 * playground's bundle). Every file is read and its `use` lines and qualified
 * names still checked, exactly as a single entry's are; nothing is left out
 * because nothing happened to import it.
 */
export function loadAllTexts(files: readonly Source[]): Program {
  return loadFrom(
    files.map((f) => moduleNameOf(f.name)),
    finderFor(files),
  );
}

/** A finder over texts already in hand, keyed by the module name their file name gives them. */
function finderFor(files: readonly Source[]): ModuleFinder {
  const byModule = new Map(files.map((f) => [moduleNameOf(f.name), f]));
  return (module) => {
    const found = byModule.get(module);
    return found === undefined ? undefined : { file: found.name, text: found.text };
  };
}

/** The prelude every module reads, by name. */
export const PRELUDE = "prelude";

/**
 * Read the prelude, then every name in `entryNames`, following `use` lines
 * and qualified names as they turn up. One name is a single file's own load
 * (`loadProgram`, `loadTexts`); every name in the set is `loadAllTexts`'s —
 * either way, `read` is the one function that turns a module name into a
 * parsed `Module` or a diagnostic, so there is exactly one way a file is
 * found.
 */
function loadFrom(entryNames: readonly string[], find: ModuleFinder): Program {
  const diagnostics: Diagnostic[] = [];
  const modules = new Map<string, Module>();
  const sources: Source[] = [];

  const missing = new Set<string>();
  const read = (name: string): Module | undefined => {
    const already = modules.get(name);
    if (already !== undefined) return already;
    const found = find(name);
    if (found === undefined) {
      missing.add(name);
      return undefined;
    }
    sources.push({ name: found.file, text: found.text });
    const parsed = parseFile(found.text, found.file);
    if (parsed.file === undefined) {
      diagnostics.push(...parsed.diagnostics);
      return undefined;
    }
    const module: Module = { name, file: found.file, text: found.text, ast: parsed.file };
    modules.set(name, module);
    for (const ref of moduleRefs(parsed.file)) {
      if (ref.module === name) continue;
      read(ref.module);
      if (missing.has(ref.module)) {
        diagnostics.push(
          diagnostic("L010", "load", `there is no module called "${ref.module}"`, {
            span: ref.span,
            suggestion: `a module is a file: "${ref.module}.dance" beside this one`,
            trace: [{ layer: "load", what: `reading "${found.file}"` }],
          }),
        );
      }
    }
    return module;
  };

  const prelude = read(PRELUDE);
  for (const name of entryNames) read(name);

  const primary = entryNames.at(-1);
  const entry = primary === undefined ? undefined : modules.get(primary);
  if (entry === undefined && primary !== undefined && missing.has(primary)) {
    diagnostics.push(
      diagnostic("L010", "load", `there is no module called "${primary}"`, {
        suggestion: "the entry of a run is a file, and its module name is the file's stem",
      }),
    );
  }

  const ordered = [...modules.values()].sort((a, b) => order(a, entryNames) - order(b, entryNames));
  return {
    ...(entry ? { entry } : {}),
    modules: ordered,
    ...(prelude ? { prelude } : {}),
    sources,
    diagnostics,
  };
}

/** The prelude reads first; a root name reads last; the rest keep the order they were found in. */
const order = (module: Module, entryNames: readonly string[]): number =>
  module.name === PRELUDE ? -1 : entryNames.includes(module.name) ? 1 : 0;

/** The default finder: `<module>.dance` beside the entry, then one directory up. */
function fileFinder(entryPath: string): ModuleFinder {
  const slash = entryPath.lastIndexOf("/");
  const dir = slash < 0 ? "." : entryPath.slice(0, slash);
  const up = dir.lastIndexOf("/");
  const dirs = [dir, up < 0 ? "." : dir.slice(0, up)];
  return (module) => {
    for (const where of dirs) {
      const path = `${where}/${module}.dance`;
      const text = readText(path);
      if (text !== undefined) return { file: `${module}.dance`, text };
    }
    return undefined;
  };
}

/** `node:fs` behind one call, so the rest of the loader is pure. */
function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
