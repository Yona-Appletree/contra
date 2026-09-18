/**
 * Read a set of `.dance` files into something the evaluator can run: one
 * module per file, its declarations indexed, and its `use` lines turned into a
 * map from a bare name to the module it came from.
 *
 * The reading itself — text to a parsed module, `use` lines and qualified
 * names followed, missing-module diagnostics — is `../load.js`'s job. It
 * offers two shapes of that read: {@link loadProgram}/{@link loadTexts}
 * follow one entry's transitive closure (the checker's and the CLI's
 * `check`); {@link loadAllTexts} reads every given file as its own entry, for
 * a caller that picks a dance out of a whole set of files **by name**, not by
 * following one file's `use` lines to it. That is what `loadDanceDir` below
 * wants — a dance in `square.dance` is found the same way as one in
 * `butter.dance`, whichever file the run started from — so it is what this
 * module builds on. `loadForEval` is a thin layer on top of that one loaded
 * program: the declaration tables (`groups`, `fns`, `enums`) and the
 * name-resolution helpers (`findGroup`, `findFn`, …) the evaluator reads
 * instead of walking the AST itself.
 *
 * `prelude.dance` is read before every other file and imported by none, so
 * its enums (`Hand`, `Turn`, `Direction`, `Axis`) are in scope everywhere.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Diagnostic, Source } from "../diagnostics/Diagnostic.js";
import { loadAllTexts } from "../load.js";
import type { EnumDecl, FileNode, FnDecl, GroupDecl } from "../syntax/ast.js";

export interface Module {
  name: string;
  file: FileNode;
  groups: Map<string, GroupDecl>;
  fns: Map<string, FnDecl>;
  enums: Map<string, EnumDecl>;
  /** A name brought in by `use m::{name}` — the module it came from. */
  imports: Map<string, string>;
  /** The modules brought in wholesale by `use m::*`. */
  globs: string[];
}

export interface Program {
  modules: Map<string, Module>;
  sources: Source[];
  diagnostics: Diagnostic[];
  /** The module every other one reads without saying so. */
  preludeName: string;
}

/** The name of the file every module reads for free. */
export const PRELUDE = "prelude";

/**
 * Read a set of named texts into a program, every one its own entry
 * (`loadAllTexts`), then index each module's declarations. A file that does
 * not parse contributes its diagnostic and no module, so a caller can run the
 * files that did.
 */
export function loadForEval(sources: readonly Source[]): Program {
  const loaded = loadAllTexts(sources);
  const modules = new Map<string, Module>();
  for (const module of loaded.modules)
    modules.set(module.name, indexModule(module.name, module.ast));
  return {
    modules,
    sources: [...loaded.sources],
    diagnostics: [...loaded.diagnostics],
    preludeName: PRELUDE,
  };
}

function indexModule(name: string, file: FileNode): Module {
  const module: Module = {
    name,
    file,
    groups: new Map(),
    fns: new Map(),
    enums: new Map(),
    imports: new Map(),
    globs: [],
  };
  for (const use of file.uses) {
    if (use.names === undefined) module.globs.push(use.module);
    else for (const named of use.names) module.imports.set(named.name, use.module);
  }
  for (const decl of file.decls) {
    if (decl.kind === "group") module.groups.set(decl.name, decl);
    else if (decl.kind === "fn") module.fns.set(decl.name, decl);
    else module.enums.set(decl.name, decl);
  }
  return module;
}

/** What a name resolved to, and which module it was declared in. */
export interface Resolved<T> {
  decl: T;
  module: Module;
}

/**
 * A group by name, as read from `from`: its own declarations first, then the
 * names it imported, then the modules it globbed, then the prelude. A
 * qualified name (`improper::MajorSet`) skips all of that and asks that
 * module directly, which is what lets one file name two formations.
 */
export const findGroup = (
  program: Program,
  from: Module,
  name: string,
  qualifier?: string,
): Resolved<GroupDecl> | undefined => find(program, from, name, qualifier, (m) => m.groups);

export const findFn = (
  program: Program,
  from: Module,
  name: string,
  qualifier?: string,
): Resolved<FnDecl> | undefined => find(program, from, name, qualifier, (m) => m.fns);

export const findEnum = (
  program: Program,
  from: Module,
  name: string,
  qualifier?: string,
): Resolved<EnumDecl> | undefined => find(program, from, name, qualifier, (m) => m.enums);

function find<T>(
  program: Program,
  from: Module,
  name: string,
  qualifier: string | undefined,
  table: (module: Module) => Map<string, T>,
): Resolved<T> | undefined {
  if (qualifier !== undefined) {
    const module = program.modules.get(qualifier);
    const decl = module === undefined ? undefined : table(module).get(name);
    return module !== undefined && decl !== undefined ? { decl, module } : undefined;
  }
  const own = table(from).get(name);
  if (own !== undefined) return { decl: own, module: from };
  const imported = from.imports.get(name);
  if (imported !== undefined) {
    const module = program.modules.get(imported);
    const decl = module === undefined ? undefined : table(module).get(name);
    if (module !== undefined && decl !== undefined) return { decl, module };
  }
  for (const glob of from.globs) {
    const module = program.modules.get(glob);
    const decl = module === undefined ? undefined : table(module).get(name);
    if (module !== undefined && decl !== undefined) return { decl, module };
  }
  const prelude = program.modules.get(program.preludeName);
  const fromPrelude = prelude === undefined ? undefined : table(prelude).get(name);
  if (prelude !== undefined && fromPrelude !== undefined)
    return { decl: fromPrelude, module: prelude };
  return undefined;
}

/**
 * The enum a TitleCase word is a member of, looked for where the word was
 * written: the visible enums first, then the id types of the visible groups,
 * so `Ones` finds `Couple`'s id type without anybody declaring an enum for it.
 */
export function findEnumMember(
  program: Program,
  from: Module,
  member: string,
): { enumName: string; module: Module } | undefined {
  const modules = visibleModules(program, from);
  for (const module of modules) {
    for (const decl of module.enums.values())
      if (decl.members.some((m) => m.name === member)) return { enumName: decl.name, module };
  }
  for (const module of modules) {
    for (const decl of module.groups.values()) {
      if (decl.idType.kind !== "enum") continue;
      if (decl.idType.members.some((m) => m.name === member))
        return { enumName: decl.name, module };
    }
  }
  return undefined;
}

/** Every module a name written in `from` could come from, nearest first. */
export function visibleModules(program: Program, from: Module): Module[] {
  const names = [from.name, ...new Set(from.imports.values()), ...from.globs, program.preludeName];
  const out: Module[] = [];
  for (const name of names) {
    const module = program.modules.get(name);
    if (module !== undefined && !out.includes(module)) out.push(module);
  }
  return out;
}

/** Every group declared anywhere in the program that has a member of this name. */
export function groupsDeclaringMember(program: Program, member: string): GroupDecl[] {
  const out: GroupDecl[] = [];
  for (const module of program.modules.values())
    for (const decl of module.groups.values())
      if (decl.members.some((m) => memberName(m) === member)) out.push(decl);
  return out;
}

export const memberName = (member: GroupDecl["members"][number]): string => member.name;

/**
 * Read a directory of `.dance` files (and the `broken/` ones beside it) into a
 * program. The whole directory is read rather than the one file asked for,
 * because a dance stands on a formation which stands on `contra.dance`, and
 * following `use` lines one at a time would be a module system where a
 * directory listing does. The directory listing is this function's own — the
 * loader has no notion of "everything under this path", only "a module by
 * name" — but the listing's texts are then read the one way any text becomes
 * a module (`loadForEval`, `../load.js` underneath it).
 */
export function loadDanceDir(
  dir: string,
  options: { broken?: boolean; extra?: readonly Source[] } = {},
): Program {
  const sources: Source[] = [];
  const read = (base: string, prefix: string): void => {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) continue;
      if (!entry.name.endsWith(".dance")) continue;
      sources.push({
        name: `${prefix}${entry.name}`,
        text: readFileSync(join(base, entry.name), "utf8"),
      });
    }
  };
  read(dir, "");
  if (options.broken === true) read(join(dir, "broken"), "broken/");
  if (options.extra !== undefined) sources.push(...options.extra);
  sources.sort((a, b) => a.name.localeCompare(b.name));
  return loadForEval(sources);
}
