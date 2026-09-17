import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { check } from "./check.js";
import { format } from "./format.js";
import { lint } from "./lint.js";
import { parse } from "./parser.js";

/** Every `.dance` file under `packages/kinetics/dances/`, by path. */
const DANCES = fileURLToPath(new URL("../../dances/", import.meta.url));
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : entry.name.endsWith(".dance")
        ? [join(dir, entry.name)]
        : [],
  );
const files = walk(DANCES).sort();
const prelude = parse(readFileSync(join(DANCES, "prelude.dance"), "utf8"));
const enums = prelude.items.filter((i) => i.kind === "enum").map((i) => i.name);

describe("every .dance file in the repo", () => {
  it("exists", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const path of files) {
    const name = path.slice(DANCES.length);
    const text = readFileSync(path, "utf8");
    it(`${name} is formatted`, () => {
      expect(format(text)).toBe(text);
    });
    it(`${name} lints clean`, () => {
      expect(lint(parse(text), { enums })).toEqual([]);
    });
  }

  it("the formations check against the prelude", () => {
    const formations = files
      .filter((p) => p.includes("/formations/"))
      .map((p) => parse(readFileSync(p, "utf8")));
    expect(check([prelude, ...formations]).map((e) => e.message)).toEqual([]);
  });
});
