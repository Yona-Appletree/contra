/**
 * Read a set of `.dance` files into something the evaluator can run: one
 * module per file, its declarations indexed, and its `use` lines turned into a
 * map from a bare name to the module it came from.
 *
 * This is the evaluator's own light name resolution, written because P3 and
 * P2 were built side by side and the checker's tables were not there yet. It
 * is deliberately thin — it answers "which declaration does this name mean
 * here?" and nothing else — and the day the checker's `load.ts` lands, this
 * is the file that folds into it.
 *
 * `prelude.dance` is read before every other file and imported by none, so
 * its enums (`Hand`, `Turn`, `Direction`, `Axis`) are in scope everywhere.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Diagnostic, Source } from "../diagnostics/Diagnostic.js";
import type { EnumDecl, FileNode, FnDecl, GroupDecl } from "../syntax/ast.js";
import { moduleNameOf, parseFile } from "../syntax/parser.js";

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
 * Parse a set of named texts into a program. A file that does not parse
 * contributes its diagnostic and no module, so a caller can run the files
 * that did.
 */
export function loadForEval(sources: readonly Source[]): Program {
  const program: Program = {
    modules: new Map(),
    sources: [...sources],
    diagnostics: [],
    preludeName: PRELUDE,
  };
  for (const source of sources) {
    const parsed = parseFile(source.text, source.name);
    program.diagnostics.push(...parsed.diagnostics);
    if (parsed.file === undefined) continue;
    program.modules.set(moduleNameOf(source.name), indexModule(parsed.file));
  }
  return program;
}

function indexModule(file: FileNode): Module {
  const module: Module = {
    name: file.module,
    file,
    groups: new Map(),
    fns: new Map(),
    enums: new Map(),
    imports: new Map(),
    globs: [],
  };
  for (const use of file.uses) {
    if (use.names === undefined) module.globs.push(use.module);
    else for (const name of use.names) module.imports.set(name.name, use.module);
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
 * directory listing does.
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
