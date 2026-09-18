import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The package's own import rule, which `scripts/check-deps.mjs` states from
 * the outside and this test states from the inside: **`@caller/lang` imports
 * nothing from the workspace.** The language is a spike beside the engines,
 * not on top of one; it has no geometry, no renderer and no figures, and the
 * day it grows a dependency is the day someone has to change this list on
 * purpose.
 */
const ALLOWED_BARE = new Set(["vitest", "vitest/config"]);

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
  /^\s*(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|[^'"]*?)\s*from\s+['"]([^'"]+)['"]/gm;

describe("allowed imports", () => {
  const files = walk(join(packageRoot, "src"));

  it("scans something", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = relative(packageRoot, file);
    it(rel, () => {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? "";
        if (spec.startsWith(".") || spec.startsWith("node:")) continue;
        expect(ALLOWED_BARE.has(spec), `${rel} imports "${spec}"`).toBe(true);
      }
    });
  }
});
