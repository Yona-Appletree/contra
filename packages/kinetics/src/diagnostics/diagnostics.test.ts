import { describe, expect, it } from "vitest";
import { readDance, standardFloor, standardRun } from "../dances/load.js";
import { run } from "../pipeline.js";
import { collectDiagnostics } from "./collect.js";
import { lineAt, renderJson, renderText } from "./render.js";

const opts = (floorName: string) => ({
  ...standardRun(),
  floor: standardFloor(floorName),
  bpm: 112,
});

describe("diagnostics", () => {
  it("renders a check error with a caret on the right line", () => {
    const source = "module d() {\n  allemande($partner, Robin);\n}\n";
    const result = run(source, opts("pair"));
    const text = renderText(result.diagnostics, [{ name: "d.dance", text: source }]);
    expect(text).toContain("error[K002] check: Robin is not a Hand: Left, Right");
    expect(text).toContain("  --> d.dance:2:23");
    expect(text).toContain("  2 |   allemande($partner, Robin);");
    expect(text).toMatch(/\| {23}\^{5}/);
  });

  it("gives a schedule error a trace through the call and the window, and a suggestion", () => {
    const source = "module d() {\n  allemande($partner, Right, beats = 2);\n}\n";
    const result = run(source, opts("pair"));
    const rate = result.diagnostics.find((d) => d.code === "K021");
    expect(rate).toBeDefined();
    expect(rate?.trace.map((f) => f.layer)).toEqual(
      expect.arrayContaining(["compile", "schedule"]),
    );
    expect(rate?.trace[0]?.what).toContain("allemande($partner, Right, beats = 2);");
    const text = renderText(result.diagnostics, [{ name: "d.dance", text: source }]);
    expect(text).toContain("= schedule: allemande:");
  });

  it("folds one complaint from many dancers into one line with their names", () => {
    const result = run(readDance("butter.dance"), {
      ...standardRun({ "minor-sets": 2 }),
      bpm: 112,
    });
    const steps = result.diagnostics.filter((d) => d.code === "K022");
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((d) => d.dancers.length > 1)).toBe(true);
    const text = renderText(result.diagnostics, [{ name: "butter.dance", text: result.source }]);
    expect(text).toMatch(/\d+ errors?, \d+ warnings?/);
  });

  it("round-trips through JSON with a location", () => {
    const source = "module d() {\n  allemande($partner, Robin);\n}\n";
    const result = run(source, opts("pair"));
    const parsed = JSON.parse(
      renderJson(result.diagnostics, [{ name: "d.dance", text: source }]),
    ) as {
      diagnostics: { code: string; location?: { line: number; col: number } }[];
      errors: number;
    };
    expect(parsed.errors).toBeGreaterThan(0);
    expect(parsed.diagnostics[0]?.location).toEqual({
      file: "d.dance",
      line: 2,
      col: 23,
      text: "  allemande($partner, Robin);",
    });
  });

  it("lineAt counts lines and columns from one", () => {
    expect(lineAt("ab\ncd\nef", 4)).toEqual({ line: 2, col: 2, text: "cd" });
  });

  it("collects the proof's violations with a trace to the slot", () => {
    const result = run(readDance("fixture.dance"), { ...standardRun(), bpm: 112 });
    const proof = collectDiagnostics(result).filter((d) => d.code === "K060" || d.code === "K050");
    for (const d of proof) {
      expect(d.dancers.length).toBeGreaterThan(0);
      expect(d.trace.some((f) => f.layer === "assembly" || f.layer === "compile")).toBe(true);
    }
  });
});
