#!/usr/bin/env node
// Workspace-wide scan of import specifiers against the allowed-imports table
// in AGENTS.md / m01-scaffold.md. Fails on any edge not listed and on any
// import from spikes/.
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const SCOPE = "@caller/";

/** @type {Record<string, {dir: string, allows: Set<string>}>} */
const PACKAGES = {
  core: { dir: "packages/core", allows: new Set([]) },
  choreo: { dir: "packages/choreo", allows: new Set(["core"]) },
  contra: { dir: "packages/contra", allows: new Set(["choreo", "core"]) },
  hall: { dir: "packages/hall", allows: new Set(["core"]) },
  music: { dir: "packages/music", allows: new Set(["core"]) },
  "ui-design": { dir: "packages/ui-design", allows: new Set([]) },
  "ui-base": { dir: "packages/ui-base", allows: new Set(["ui-design"]) },
  web: {
    dir: "apps/web",
    allows: new Set(["core", "choreo", "contra", "hall", "music", "ui-design", "ui-base"]),
  },
  storybook: {
    dir: "apps/storybook",
    allows: new Set(["core", "choreo", "contra", "hall", "music", "ui-design", "ui-base", "web"]),
  },
};

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "storybook-static",
  "test-results",
  "playwright-report",
]);

/** @returns {string[]} absolute file paths */
function walk(dir) {
  /** @type {string[]} */
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (CODE_EXTENSIONS.has(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const IMPORT_RE =
  /\b(?:import|export)\s+(?:[^'"]*?\bfrom\s+)?['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** @param {string} source */
function extractSpecifiers(source) {
  /** @type {string[]} */
  const specs = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(source))) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.push(spec);
  }
  return specs;
}

let errors = 0;

for (const [pkgName, pkg] of Object.entries(PACKAGES)) {
  const pkgAbsDir = resolve(root, pkg.dir);
  const files = walk(pkgAbsDir);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const specifiers = extractSpecifiers(source);
    for (const spec of specifiers) {
      // Any import that touches spikes/ is always forbidden in production code.
      if (spec.includes("/spikes/") || spec.startsWith("spikes/")) {
        console.error(
          `check-deps: ${relative(root, file)} imports from spikes/ ("${spec}") — forbidden`,
        );
        errors++;
        continue;
      }
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const resolved = resolve(file, "..", spec);
        if (resolved.includes(`${resolve(root, "spikes")}`)) {
          console.error(
            `check-deps: ${relative(root, file)} imports from spikes/ ("${spec}") — forbidden`,
          );
          errors++;
        }
        continue;
      }
      if (!spec.startsWith(SCOPE)) continue;
      const targetName = spec.slice(SCOPE.length).split("/")[0];
      if (targetName === pkgName) continue; // self-import
      if (!(targetName in PACKAGES)) {
        console.error(`check-deps: ${relative(root, file)} imports unknown package "${spec}"`);
        errors++;
        continue;
      }
      if (!pkg.allows.has(targetName)) {
        console.error(
          `check-deps: ${relative(root, file)} (${pkgName}) imports "${spec}" — edge ${pkgName} -> ${targetName} is not in the allowed table`,
        );
        errors++;
      }
    }
  }
}

if (errors > 0) {
  console.error(`\ncheck-deps: ${errors} violation(s) found.`);
  process.exit(1);
}

console.log("check-deps: all import edges are allowed.");
