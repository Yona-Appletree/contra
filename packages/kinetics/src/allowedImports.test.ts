import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The package's own import rule, which `scripts/check-deps.mjs` cannot see:
 * `@caller/core` and `@caller/hall` are the workspace packages this one may
 * import, and of `core` only the geometry, time and rendering-contract
 * pieces. The kinematics under `core/src/kinematics/` are what engine 3
 * replaces; importing one of their names would be engine 2 leaking in.
 *
 * The one exception is the debugger's pixels pane, which draws with the
 * hall's own passes (the dance-language plan, P6) and so has to hand the
 * hall its own types — `PoseSample`, `ArmPair` — as **types only**, built
 * from this engine's solved points. The engine itself never sees them.
 */
const ENGINE_2_NAMES = [
  "solveArm",
  "solveArm3d",
  "planarReach",
  "POLE_OUTWARD",
  "drawnArms",
  "elbowPole",
  "hangingHand",
  "resolveHand",
  "handDown",
  "stackJoined",
  "easeSeam",
  "seamProgress",
  "quietMotion",
  "lerpFeet",
  "swingFeet",
  "plantedGait",
  "plantAt",
  "memoPlants",
  "footRest",
  "trapezoid",
  "cruiseRamp",
  "profileSpeed",
  "armShortfall",
  "PoseSample",
  "lerpHand",
  "shoulders",
  "shouldersAt",
];

const ALLOWED_BARE = new Set(["@caller/core", "@caller/hall", "vitest", "vite", "vitest/config"]);

/** The hall's types the pixels pane must speak, and nothing else may. */
const HALL_TYPES_ONLY: Readonly<Record<string, readonly string[]>> = {
  "debugger/panes/pixels.ts": ["PoseSample", "ArmPair"],
};

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const IMPORT_RE =
  /^\s*(?:import|export)\s+(?:type\s+)?(\{[^}]*\}|[^'"]*?)\s*from\s+['"]([^'"]+)['"]/gm;

describe("allowed imports", () => {
  const files = [...walk(join(packageRoot, "src")), ...walk(join(packageRoot, "debugger"))];

  it("scans something", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = relative(packageRoot, file);
    it(rel, () => {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(IMPORT_RE)) {
        const names = m[1] ?? "";
        const spec = m[2] ?? "";
        if (spec.startsWith(".")) continue;
        if (spec.startsWith("node:")) continue;
        expect(ALLOWED_BARE.has(spec), `${rel} imports "${spec}"`).toBe(true);
        if (spec === "@caller/core") {
          for (const name of ENGINE_2_NAMES) {
            if (
              (HALL_TYPES_ONLY[rel] ?? []).includes(name) &&
              /^\s*(?:import|export)\s+type\s/.test(m[0])
            )
              continue;
            const used = new RegExp(`\\b${name}\\b`).test(names);
            expect(used, `${rel} imports engine 2's ${name} from @caller/core`).toBe(false);
          }
        }
      }
    });
  }
});
