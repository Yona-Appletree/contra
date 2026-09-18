#!/usr/bin/env node
/**
 * `pnpm lang <command> <file.dance>` — the dance language's one command.
 *
 *   check <file> [--json]                              the checker's complaints
 *   tree  <file> [--dance name] [--minor-sets n]       what `setup` built
 *   run   <file> [--dance name] [--times n] […]        the timelines, then complaints
 *
 * Two loaders meet here, on purpose — both built on `src/load.ts`'s one way
 * of turning a `.dance` file into a parsed module. `check` reads the file the
 * way the checker wants it — `loadProgram`, which follows `use` lines and
 * qualified names from the entry — so its diagnostics carry the spans of
 * exactly the modules the file names. `tree` and `run` read the whole
 * directory with the evaluator's own `loadDanceDir`, because a dance is
 * picked by name (`--dance`, or the first one found) rather than followed to,
 * and a formation file such as `becket.dance` has no dance of its own to
 * follow from at all.
 *
 * Every command exits non-zero when anything is an error, so CI and an agent
 * read the same answer as a person does.
 */
import { basename, dirname, resolve } from "node:path";
import { checkProgram } from "../src/check/check.js";
import { renderJson, renderText } from "../src/diagnostics/render.js";
import {
  buildTree,
  findDance,
  hallFacts,
  loadDanceDir,
  positionsOf,
  printTimeline,
  printTree,
  runEvening,
} from "../src/eval/index.js";
import { loadProgram } from "../src/load.js";
import { moduleNameOf } from "../src/syntax/parser.js";

const USAGE = `pnpm lang <command> <file.dance>

  check <file> [--json]
        parse the file and every module it names, then check it

  tree  <file> [--dance name] [--minor-sets n] [--json]
        run the dance's setup and print the floor it built

  run   <file> [--dance name] [--minor-sets n] [--times n] [--json]
        run the dance that many times through and print each timeline

Defaults: the first fn with a setup in the file, --minor-sets 3, --times 1.
Fixtures live in packages/lang/dances/ (the deliberate errors in broken/).
`;

const argv = process.argv.slice(2);
const command = argv[0];
if (command === undefined || command === "--help" || command === "-h") {
  process.stdout.write(USAGE);
  process.exit(command === undefined ? 2 : 0);
}

let options;
try {
  options = parseArgs(argv.slice(1));
} catch (error) {
  process.stderr.write(`lang: ${error.message}\n\n${USAGE}`);
  process.exit(2);
}

if (options.file === undefined) {
  process.stderr.write(`lang: ${command} wants a .dance file\n\n${USAGE}`);
  process.exit(2);
}

const file = resolve(options.file);

// ---------------------------------------------------------------------------
// The three commands
// ---------------------------------------------------------------------------

/** Parse and check; print the diagnostics; non-zero if any of them is an error. */
function runCheck(file, options) {
  const program = loadProgram(file);
  const diagnostics =
    program.diagnostics.length > 0
      ? [...program.diagnostics]
      : [...checkProgram(program).diagnostics];
  emitDiagnostics(diagnostics, program.sources, options.json);
  if (!options.json && diagnostics.length === 0) {
    process.stdout.write(`${moduleNameOf(file)}: nothing to say\n`);
  }
  return exitFor(diagnostics);
}

/** Build the tree with `setup` and print it. */
function runTree(file, options) {
  const found = danceIn(file, options);
  if (found.exit !== undefined) return found.exit;
  if (found.error !== undefined) return fatal(found.error);
  const { program, dance } = found;
  const built = buildTree(program, dance, hallFacts({ "minor-sets": options.minorSets }));

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          dance: dance.decl.name,
          minorSets: options.minorSets,
          positions: positionsOf(built.tree),
          diagnostics: JSON.parse(renderJson(built.diagnostics, program.sources)),
        },
        undefined,
        2,
      )}\n`,
    );
    return exitFor(built.diagnostics);
  }

  process.stdout.write(`${printTree(built.tree)}\n`);
  if (built.diagnostics.length > 0) {
    process.stdout.write(`\n${renderText(built.diagnostics, program.sources)}`);
  }
  return exitFor(built.diagnostics);
}

/** Run the evening and print a timeline per time through, then the complaints. */
function runRun(file, options) {
  const found = danceIn(file, options);
  if (found.exit !== undefined) return found.exit;
  if (found.error !== undefined) return fatal(found.error);
  const { program, dance } = found;
  const evening = runEvening(program, dance, {
    times: options.times,
    args: hallFacts({ "minor-sets": options.minorSets }),
  });

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          dance: evening.dance,
          minorSets: options.minorSets,
          times: evening.times,
          snapshots: evening.snapshots,
          diagnostics: JSON.parse(renderJson(evening.diagnostics, program.sources)),
        },
        undefined,
        2,
      )}\n`,
    );
    return exitFor(evening.diagnostics);
  }

  process.stdout.write(`${printTimeline(evening)}\n`);
  if (evening.diagnostics.length > 0) {
    process.stdout.write(`\n${renderText(evening.diagnostics, program.sources)}`);
  }
  return exitFor(evening.diagnostics);
}

// ---------------------------------------------------------------------------
// Finding the dance
// ---------------------------------------------------------------------------

/**
 * The directory of `.dance` files this file belongs to, and the dance to run.
 * A fixture under `broken/` reads the formations one directory up, which is
 * the loader's rule (`load.ts`) and is spelled out here for the evaluator's.
 */
function danceIn(file, options) {
  const dir = dirname(file);
  const root = basename(dir) === "broken" ? dirname(dir) : dir;
  const broken = basename(dir) === "broken";
  const moduleName = moduleNameOf(file);

  let program = loadDanceDir(root, { broken });
  if (program.diagnostics.length > 0) {
    emitDiagnostics(program.diagnostics, program.sources, options.json);
    return { exit: exitFor(program.diagnostics) };
  }

  let module = program.modules.get(moduleName);
  if (module === undefined) return { error: `no module "${moduleName}" beside ${dir}` };

  let name = options.dance ?? firstDanceIn(module);
  let from = moduleName;

  // A formation file (becket, improper) declares a floor and no dance, and
  // "show me becket" is still a fair thing to ask. Stand its root group up in
  // a one-line dance of our own and build that. The note goes to stderr so a
  // pipe reads the tree alone.
  if (name === undefined) {
    const floor = floorModuleFor(module);
    if (floor === undefined) return { error: `${moduleName} has no fn with a setup in it` };
    process.stderr.write(
      `lang: ${moduleName} declares no dance — standing up ${floor.invocation}\n`,
    );
    program = loadDanceDir(root, { broken, extra: [floor.source] });
    module = program.modules.get(FLOOR_MODULE);
    if (module === undefined) return { error: `could not stand up ${moduleName}'s floor` };
    name = FLOOR_FN;
    from = FLOOR_MODULE;
  }

  const dance = findDance(program, name, from);
  if (dance === undefined) return { error: `${from} has no fn called "${name}"` };
  return { error: undefined, program, dance };
}

/** The first `fn` in the module with a `setup` in it — a dance, by definition. */
function firstDanceIn(module) {
  for (const decl of module.file.decls) {
    if (decl.kind !== "fn") continue;
    if (decl.body.some((stmt) => stmt.kind === "setup")) return decl.name;
  }
  return undefined;
}

const FLOOR_MODULE = "lang-floor";
const FLOOR_FN = "floor";

/**
 * A module of one dance whose `setup` invokes the formation's root group —
 * the group it declares that nothing in it invokes. `minor-sets` is passed on
 * when the group takes it; every other parameter keeps its default.
 */
function floorModuleFor(module) {
  const declared = module.file.decls.filter((decl) => decl.kind === "group");
  const invoked = new Set();
  const walk = (node) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.kind === "invoke") invoked.add(node.name);
    for (const value of Object.values(node)) walk(value);
  };
  walk(declared.map((decl) => decl.body));

  const root = declared.findLast((decl) => !invoked.has(decl.name));
  if (root === undefined) return undefined;

  const id = root.idType.kind === "i32" ? "1" : (root.idType.members[0]?.name ?? "1");
  const takesSets = root.params.some((param) => param.name === "minor-sets");
  const args = takesSets ? `${id}, minor-sets = minor-sets` : id;
  const invocation = `${module.name}::${root.name}(${args})`;
  return {
    invocation,
    source: {
      name: `${FLOOR_MODULE}.dance`,
      text:
        `use ${module.name}::*;\n` +
        `fn ${FLOOR_FN}(minor-sets: i32 = 3) { setup { ${invocation}; } }\n`,
    },
  };
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

function emitDiagnostics(diagnostics, sources, json) {
  if (json) {
    process.stdout.write(`${renderJson(diagnostics, sources)}\n`);
    return;
  }
  if (diagnostics.length > 0) process.stdout.write(renderText(diagnostics, sources));
}

function exitFor(diagnostics) {
  return diagnostics.some((d) => d.severity === "error") ? 1 : 0;
}

function fatal(message) {
  process.stderr.write(`lang: ${message}\n`);
  return 2;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/** `<file> [--dance name] [--minor-sets n] [--times n] [--json]`. */
function parseArgs(args) {
  const options = { file: undefined, dance: undefined, minorSets: 3, times: 1, json: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--dance") options.dance = value(args, (i += 1), "--dance");
    else if (arg === "--minor-sets")
      options.minorSets = whole(value(args, (i += 1), "--minor-sets"), "--minor-sets");
    else if (arg === "--times") options.times = whole(value(args, (i += 1), "--times"), "--times");
    else if (arg.startsWith("-")) throw new Error(`no option "${arg}"`);
    else if (options.file === undefined) options.file = arg;
    else throw new Error(`one file at a time, not "${options.file}" and "${arg}"`);
  }
  return options;
}

function value(args, index, name) {
  const given = args[index];
  if (given === undefined) throw new Error(`${name} wants a value`);
  return given;
}

function whole(text, name) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} wants a whole number, not "${text}"`);
  return n;
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

const COMMANDS = { check: runCheck, tree: runTree, run: runRun };
const body = COMMANDS[command];
if (body === undefined) {
  process.stderr.write(`lang: no command "${command}"\n\n${USAGE}`);
  process.exit(2);
}
process.exit(body(file, options));
