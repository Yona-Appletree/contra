import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderText } from "../diagnostics/render.js";
import type { Span } from "./ast.js";
import { parseFile } from "./parser.js";

const dancesDir = fileURLToPath(new URL("../../dances", import.meta.url));

/** Every fixture, `dances/x.dance` and `dances/broken/x.dance`, in one order. */
function fixtures(): { name: string; text: string }[] {
  const names: string[] = [];
  for (const entry of readdirSync(dancesDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".dance")) names.push(entry.name);
  }
  for (const entry of readdirSync(join(dancesDir, "broken"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".dance")) names.push(`broken/${entry.name}`);
  }
  names.sort();
  return names.map((name) => ({ name, text: readFileSync(join(dancesDir, name), "utf8") }));
}

/**
 * The tree as one line per node: its kind, its scalar fields and its span.
 * A golden is read by a diff (AGENTS.md), and JSON of the whole tree is three
 * times the size for no reader's benefit.
 */
function outline(value: unknown, label: string, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    out.push(`${pad}${label}:`);
    for (const item of value) outline(item, "-", depth + 1, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const kind = typeof obj["kind"] === "string" ? obj["kind"] : label;
    const span = obj["span"] as Span | undefined;
    const inline: string[] = [];
    const nested: [string, unknown][] = [];
    for (const [key, field] of Object.entries(obj)) {
      if (key === "span" || key === "kind") continue;
      if (isSpan(field)) inline.push(`${key}=[${String(field.start)}..${String(field.end)}]`);
      else if (field === null || typeof field !== "object")
        inline.push(`${key}=${JSON.stringify(field)}`);
      else nested.push([key, field]);
    }
    const prefix = label === "-" || label === kind ? "" : `${label}: `;
    out.push(
      `${pad}${prefix}${kind}${inline.length > 0 ? ` ${inline.join(" ")}` : ""}` +
        `${span === undefined ? "" : ` [${String(span.start)}..${String(span.end)}]`}`,
    );
    for (const [key, field] of nested) outline(field, key, depth + 1, out);
    return;
  }
  out.push(`${pad}${label}=${JSON.stringify(value)}`);
}

const isSpan = (value: unknown): value is Span =>
  value !== null &&
  typeof value === "object" &&
  "file" in value &&
  "start" in value &&
  "end" in value;

const outlineOf = (node: unknown): string => {
  const out: string[] = [];
  outline(node, "-", 0, out);
  return out.join("\n");
};

describe("every fixture parses", () => {
  for (const { name, text } of fixtures()) {
    it(name, () => {
      const result = parseFile(text, name);
      expect(renderText(result.diagnostics, [{ name, text }])).toBe("no complaints\n");
      expect(result.file).toBeDefined();
      expect(outlineOf(result.file)).toMatchSnapshot();
    });
  }
});

describe("the fixtures cover the acceptance list", () => {
  const byName = new Map(fixtures().map((f) => [f.name, f.text]));
  const parsed = (name: string) => {
    const text = byName.get(name);
    if (text === undefined) throw new Error(`no fixture ${name}`);
    const result = parseFile(text, name);
    if (result.file === undefined)
      throw new Error(renderText(result.diagnostics, [{ name, text }]));
    return result.file;
  };

  it("the nine broken files are all there", () => {
    expect([...byName.keys()].filter((n) => n.startsWith("broken/"))).toEqual([
      "broken/broken-progression.dance",
      "broken/duplicate-member.dance",
      "broken/move-in-setup.dance",
      "broken/neighbor-from-out.dance",
      "broken/non-exhaustive-match.dance",
      "broken/other-in-is.dance",
      "broken/partner-in-body.dance",
      "broken/phrase-assert.dance",
      "broken/wrong-arity.dance",
    ]);
  });

  it("becket declares Station, MinorSet and MajorSet, and imports from contra", () => {
    const file = parsed("becket.dance");
    expect(file.module).toBe("becket");
    expect(file.uses.map((u) => u.module)).toEqual(["contra"]);
    expect(file.uses[0]?.names?.map((n) => n.name)).toEqual(["Role", "Couple", "wait-out"]);
    expect(file.decls.map((d) => d.name)).toEqual(["Station", "MinorSet", "MajorSet"]);
  });

  it("MajorSet keeps its parameters, body and members apart", () => {
    const major = parsed("becket.dance").decls.find((d) => d.name === "MajorSet");
    if (major?.kind !== "group") throw new Error("MajorSet is not a group");
    expect(major.idType.kind).toBe("i32");
    expect(major.params.map((p) => p.name)).toEqual(["minor-sets"]);
    expect(major.members.map((m) => m.name)).toEqual(["progress", "out"]);
    expect(major.body.map((s) => s.kind)).toEqual(["anchor", "modified", "invoke", "modified"]);
  });

  it("a group invocation may carry one trailing statement", () => {
    const major = parsed("becket.dance").decls.find((d) => d.name === "MajorSet");
    if (major?.kind !== "group") throw new Error("MajorSet is not a group");
    const modified = major.body[1];
    if (modified?.kind !== "modified") throw new Error("expected the transforms");
    expect(modified.modifiers.map((m) => m.callee)).toEqual(["translate", "rotate"]);
    const station = modified.stmt;
    if (station.kind !== "invoke") throw new Error("expected Station(OutTop)");
    expect(station.name).toBe("Station");
    expect(station.children).toHaveLength(1);
    expect(station.children[0]?.kind).toBe("invoke");
  });

  it("a computed pattern needs no parentheses", () => {
    const minor = parsed("becket.dance").decls.find((d) => d.name === "MinorSet");
    if (minor?.kind !== "group") throw new Error("MinorSet is not a group");
    const shadow = minor.members.find((m) => m.name === "shadow");
    if (shadow?.kind !== "member") throw new Error("no shadow");
    if (shadow.value.kind !== "one") throw new Error("shadow is not a one!");
    const select = shadow.value.arg;
    if (select.kind !== "select") throw new Error("shadow does not select");
    expect(select.args.map((a) => a.group)).toEqual(["MinorSet", "Role"]);
    expect(select.args[0]?.pattern.kind).toBe("expr-pattern");
    expect(select.args[1]?.pattern).toMatchObject({ kind: "relative", which: "other" });
  });

  it("a block's last expression, written without a ';', is its value", () => {
    const square = parsed("square.dance").decls.find((d) => d.name === "Square");
    if (square?.kind !== "group") throw new Error("Square is not a group");
    const wrap = square.members.find((m) => m.name === "wrap");
    if (wrap?.kind !== "fn") throw new Error("no wrap");
    expect(wrap.body).toHaveLength(1);
    expect(wrap.body[0]).toMatchObject({ kind: "expr", tail: true });
  });

  it("phrase takes a trailing block, which is its last argument", () => {
    const butter = parsed("butter.dance").decls.find((d) => d.name === "butter");
    if (butter?.kind !== "fn") throw new Error("no butter");
    const phrases = butter.body.filter((s) => s.kind === "expr" && s.block !== undefined);
    expect(phrases).toHaveLength(4);
    const a1 = phrases[0];
    if (a1?.kind !== "expr" || a1.expr.kind !== "call") throw new Error("A1 is not a call");
    expect(a1.expr.callee).toBe("phrase");
    expect(a1.expr.args[0]?.value).toMatchObject({ kind: "name", name: "A1", title: true });
  });

  it("a qualified name needs no use", () => {
    const file = parsed("medley.dance");
    expect(file.uses.map((u) => u.module)).toEqual(["becket", "butter"]);
    const mismatch = file.decls.find((d) => d.name === "mismatch");
    if (mismatch?.kind !== "fn") throw new Error("no mismatch");
    const setup = mismatch.body[0];
    if (setup?.kind !== "setup") throw new Error("mismatch has no setup");
    expect(setup.body[0]).toMatchObject({ kind: "invoke", module: "improper", name: "MajorSet" });
  });

  it("a square's ids are i32 and it declares no Station", () => {
    const file = parsed("square.dance");
    const couple = file.decls.find((d) => d.name === "Couple");
    if (couple?.kind !== "group") throw new Error("no Couple");
    expect(couple.idType.kind).toBe("i32");
    expect(file.decls.map((d) => d.name)).not.toContain("Station");
  });

  it("triple minor's couple has three ids", () => {
    const couple = parsed("triple-minor.dance").decls.find((d) => d.name === "Couple");
    if (couple?.kind !== "group") throw new Error("no Couple");
    if (couple.idType.kind !== "enum") throw new Error("ids are not an enum");
    expect(couple.idType.members.map((m) => m.name)).toEqual(["Ones", "Twos", "Threes"]);
  });

  it("the prelude is enums and nothing else", () => {
    expect(parsed("prelude.dance").decls.map((d) => d.kind)).toEqual([
      "enum",
      "enum",
      "enum",
      "enum",
    ]);
  });
});

describe("parse errors", () => {
  const check = (name: string, text: string) => {
    const result = parseFile(text, name);
    expect(result.file).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0];
    if (d === undefined) throw new Error("no diagnostic");
    return d;
  };

  it("L002: a name that is neither kebab nor TitleCase", () => {
    const d = check("casing.dance", "group minorSet {\n  id: i32\n}\n");
    expect(d.code).toBe("L002");
    expect(d.span).toEqual({ file: "casing.dance", start: 6, end: 14 });
    expect(d.message).toContain("minorSet");
  });

  it("L003: a string with no closing quote", () => {
    const d = check("quote.dance", 'fn a() {\n  card "Butter;\n}\n');
    expect(d.code).toBe("L003");
    expect(d.stage).toBe("parse");
  });

  it("L004: a character that begins nothing", () => {
    const d = check("stray.dance", "fn a() {\n  swing(partner) @ 3;\n}\n");
    expect(d.code).toBe("L004");
    expect(d.message).toContain("@");
  });

  it("L005: a unit the language does not have", () => {
    const d = check("unit.dance", 'fn a(beats: i32 = 8beats) { ir "a"; }\n');
    expect(d.code).toBe("L005");
    expect(d.suggestion).toContain("beats");
  });

  it("L006: a dot", () => {
    const d = check("dot.dance", "fn a() {\n  swing(MinorSet.center);\n}\n");
    expect(d.code).toBe("L006");
    expect(d.suggestion).toContain("anchor(MinorSet, center)");
  });

  it("L007: round 2's sigil", () => {
    const d = check("sigil.dance", "fn a() {\n  swing($partner, beats = 8);\n}\n");
    expect(d.code).toBe("L007");
    expect(d.suggestion).toContain("partner");
  });

  it("L008: a retired declaration keyword", () => {
    const d = check("retired.dance", "module minor-set() {\n}\n");
    expect(d.code).toBe("L008");
    expect(d.suggestion).toContain("group");
    expect(d.span).toEqual({ file: "retired.dance", start: 0, end: 6 });
  });

  it("L009: a group that is never closed", () => {
    const d = check("unclosed.dance", "group Couple {\n  id: i32\n");
    expect(d.code).toBe("L009");
    // The caret sits on the "{" that opened it, not on the end of the file.
    expect(d.span).toEqual({ file: "unclosed.dance", start: 13, end: 14 });
  });

  it("L001: a missing comma between arguments", () => {
    const d = check("comma.dance", "fn a() {\n  swing(partner beats = 8);\n}\n");
    expect(d.code).toBe("L001");
    expect(d.message).toContain('expected ")"');
  });

  it("L001: a group that never says what its ids are", () => {
    const d = check("noid.dance", "group Couple {\n  partner = other(Role);\n}\n");
    expect(d.code).toBe("L001");
    expect(d.message).toContain("does not say what its ids are");
    expect(d.suggestion).toContain("id: i32");
  });

  it("L001: a statement that forgot its semicolon", () => {
    const d = check("semi.dance", 'fn a() {\n  swing(partner)\n  card "x";\n}\n');
    expect(d.code).toBe("L001");
    expect(d.message).toContain('expected ";"');
  });

  it("renders with a caret under the text that caused it", () => {
    const name = "caret.dance";
    const text = "fn a() {\n  swing(partner beats = 8);\n}\n";
    const result = parseFile(text, name);
    expect(renderText(result.diagnostics, [{ name, text }])).toMatchInlineSnapshot(`
      "error[L001] syntax: expected ")" to close the arguments, found "beats"
        --> caret.dance:2:17
          |
        2 |   swing(partner beats = 8);
          |                 ^^^^^

      1 error, 0 warnings
      "
    `);
  });
});
