import { describe, expect, it } from "vitest";
import { cli } from "../../cli.js";
import { DANCES_DIR, readDance, standardRun } from "../../dances/load.js";
import { run } from "../../pipeline.js";

const butter = () =>
  run(readDance("butter.dance"), { ...standardRun({ "minor-sets": 2 }), bpm: 112 });

describe("the floor checks", () => {
  it("report the overlap in Butter with a trace that names the stand-in swing", () => {
    const result = butter();
    const overlaps = result.diagnostics.filter((d) => d.code === "K101");
    expect(overlaps.length).toBeGreaterThan(0);
    const first = overlaps[0]!;
    expect(first.dancers).toHaveLength(2);
    expect(
      first.trace.some(
        (f) => f.layer === "compile" && /swing|circle|shift|long-lines|balance/.test(f.what),
      ),
    ).toBe(true);
    expect(first.suggestion).toBeDefined();
  });

  it("find no asymmetric selection and no desync in Butter", () => {
    const result = butter();
    expect(result.diagnostics.filter((d) => d.code === "K106")).toEqual([]);
    expect(result.diagnostics.filter((d) => d.code === "K105")).toEqual([]);
  });

  it("names a desync when one role's branch takes more beats than the other's", () => {
    const source = [
      "module d() {",
      "  group becket(minor-sets = $minor-sets);",
      "  repeat (2) {",
      "    if (not $first-time) { progress(); }",
      "    if ($role is Robin) { swing($partner, beats = 8); } else { swing($partner, beats = 12); }",
      "  }",
      "}",
    ].join("\n");
    const result = run(source, { ...standardRun({ "minor-sets": 1 }), bpm: 112 });
    const d = result.diagnostics.find((x) => x.code === "K105");
    expect(d).toBeDefined();
    expect(d?.message).toContain("different beats");
  });

  it("names an asymmetric selection when two dancers do not name each other", () => {
    const source = [
      "module d() {",
      "  group becket(minor-sets = $minor-sets);",
      "  if ($role is Robin) { swing($neighbor, beats = 8); } else { swing($partner, beats = 8); }",
      "}",
    ].join("\n");
    const result = run(source, { ...standardRun({ "minor-sets": 1 }), bpm: 112 });
    const d = result.diagnostics.find((x) => x.code === "K106");
    expect(d).toBeDefined();
    expect(d?.dancers.length).toBe(2);
  });

  it("classes a failed phrase assert as K104", () => {
    const source = 'module d() { group pair(); bow($partner); assert($beat == 16, "A1"); }';
    const result = run(source, { ...standardRun(), bpm: 112 });
    expect(result.diagnostics.map((d) => d.code)).toContain("K104");
  });
});

describe("dance check", () => {
  it("prints rustc-shaped diagnostics for Butter and exits non-zero", () => {
    const { output, code } = cli(["check", `${DANCES_DIR}butter.dance`, "--minor-sets", "2"]);
    expect(code).toBe(1);
    expect(output).toMatch(/^error\[K\d{3}\]/m);
    expect(output).toContain("--> butter.dance:");
    expect(output).toMatch(/\d+ errors?, \d+ warnings?\n$/);
  });

  it("prints JSON with locations when asked", () => {
    const { output, code } = cli(["check", `${DANCES_DIR}fixture.dance`, "--json"]);
    const parsed = JSON.parse(output) as { diagnostics: unknown[]; errors: number };
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
    expect(code).toBe(parsed.errors > 0 ? 1 : 0);
  });

  it("prints the evaluated tree and the expansion", () => {
    const tree = cli(["tree", `${DANCES_DIR}butter.dance`, "--minor-sets", "1"]);
    expect(tree.code).toBe(0);
    expect(tree.output).toContain("place lark Lark @ (-0.64, -0.4) 0° ← 1L");
    expect(tree.output).toContain("provide progress() { … }");
    const expanded = cli(["expand", `${DANCES_DIR}butter.dance`]);
    expect(expanded.output).toContain("// ===== formations/becket.dance =====");
    expect(expanded.output).toContain("// ===== moves.dance =====");
  });

  it("formats and lints a file", () => {
    expect(cli(["format", `${DANCES_DIR}butter.dance`]).output).toBe(readDance("butter.dance"));
    expect(cli(["lint", `${DANCES_DIR}butter.dance`]).code).toBe(0);
    expect(cli(["--help"]).code).toBe(0);
  });
});
