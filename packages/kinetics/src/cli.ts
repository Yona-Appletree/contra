import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  loadLibrary,
  loadMoves,
  readDance,
  resolveFormation,
  standardFloor,
} from "./dances/load.js";
import { renderJson, renderText } from "./diagnostics/render.js";
import { format } from "./lang/format.js";
import { printTree } from "./tree/print.js";
import { lint } from "./lang/lint.js";
import { parse } from "./lang/parser.js";
import { run } from "./pipeline.js";

/**
 * `dance check <file> [--floor name:size | --minor-sets n] [--json] [--bpm n]`
 * `dance format <file>` · `dance lint <file>`
 *
 * The tool an agent runs (round 2, P4): every diagnostic of the whole
 * engine, rustc-shaped, or as JSON; a non-zero exit on any error. Run it
 * with `pnpm --filter @caller/kinetics check dances/butter.dance --minor-sets 2`.
 */
export interface CliResult {
  output: string;
  code: number;
}

export function cli(argv: readonly string[]): CliResult {
  const [command, file, ...rest] = argv;
  if (command === undefined || file === undefined || command === "--help") {
    return { output: USAGE, code: command === "--help" ? 0 : 2 };
  }
  const flags = parseFlags(rest);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { output: `cannot read ${file}\n`, code: 2 };
  }
  switch (command) {
    case "format":
      return { output: format(text), code: 0 };
    case "lint": {
      const issues = lint(parse(text), {
        enums: ["Role", "Hand", "Turn", "Axis", "Direction", "Phrase"],
      });
      return {
        output:
          issues.map((i) => `lint: ${i.message} (line ${String(i.span.line)})`).join("\n") +
          (issues.length ? "\n" : "clean\n"),
        code: issues.length ? 1 : 0,
      };
    }
    case "expand":
      return { output: expand(text), code: 0 };
    case "tree": {
      const minorSets = flags.get("minor-sets");
      const dynamics: Record<string, number> = {};
      if (minorSets !== undefined) dynamics["minor-sets"] = Number(minorSets);
      const result = run(text, {
        moves: loadMoves(),
        library: loadLibrary(),
        resolve: resolveFormation,
        dynamics,
      });
      if (result.floor === undefined) {
        return {
          output: result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n") + "\n",
          code: 1,
        };
      }
      return { output: printTree(result.floor.root, result.floor.dancers), code: 0 };
    }
    case "check": {
      const floorArg = flags.get("floor");
      const minorSets = flags.get("minor-sets");
      const dynamics: Record<string, number> = {};
      if (minorSets !== undefined) dynamics["minor-sets"] = Number(minorSets);
      else if (floorArg?.includes(":")) dynamics["minor-sets"] = Number(floorArg.split(":")[1]);
      const floorName = floorArg?.split(":")[0];
      const result = run(text, {
        moves: loadMoves(),
        library: loadLibrary(),
        resolve: resolveFormation,
        dynamics,
        ...(floorName === undefined || floorName === ""
          ? {}
          : { floor: standardFloor(floorName, dynamics) }),
        ...(flags.has("bpm") ? { bpm: Number(flags.get("bpm")) } : {}),
      });
      const sources = [{ name: basename(file), text }];
      const errors = result.diagnostics.filter((d) => d.severity === "error").length;
      return {
        output: flags.has("json")
          ? renderJson(result.diagnostics, sources) + "\n"
          : renderText(result.diagnostics, sources, { traces: !flags.has("brief") }),
        code: errors > 0 ? 1 : 0,
      };
    }
    default:
      return { output: USAGE, code: 2 };
  }
}

const USAGE = `dance check <file.dance> [--floor <name>[:<size>] | --minor-sets <n>] [--json | --brief] [--bpm <n>]
dance tree <file.dance> [--minor-sets <n>]     the evaluated initial tree, with the seating
dance expand <file.dance>                      the dance with every file it depends on, in read order
dance format <file.dance>
dance lint <file.dance>
`;

/** The dance with the prelude, the couple, the formations it names and the moves, in the order they are read. */
export function expand(text: string): string {
  const parts: [string, string][] = [
    ["prelude.dance", readDance("prelude.dance")],
    ["formations/common.dance", readDance("formations/common.dance")],
  ];
  for (const m of text.matchAll(/\bgroup\s+([a-z][a-z0-9-]*)\s*\(/g)) {
    const name = m[1] as string;
    if (name === "couple" || parts.some(([p]) => p === `formations/${name}.dance`)) continue;
    const file = resolveFormation(name);
    if (file !== undefined) parts.push([`formations/${name}.dance`, file.source]);
  }
  parts.push(["moves.dance", readDance("moves.dance")], ["the dance", text]);
  return parts.map(([name, body]) => `// ===== ${name} =====\n${body.trimEnd()}\n`).join("\n");
}

const parseFlags = (args: readonly string[]): Map<string, string> => {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] as string;
    if (!a.startsWith("--")) continue;
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(a.slice(2), next);
      i += 1;
    } else flags.set(a.slice(2), "");
  }
  return flags;
};

// Run when invoked directly: `tsx src/cli.ts check dances/butter.dance --minor-sets 2`.
if (process.argv[1] !== undefined && /cli\.(ts|js)$/.test(process.argv[1])) {
  const { output, code } = cli(process.argv.slice(2));
  process.stdout.write(output);
  process.exitCode = code;
}
