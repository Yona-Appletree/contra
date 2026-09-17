import { describe, expect, it } from "vitest";
import type { CallStmt, DefineStmt, IfStmt, RepeatStmt, SelectStmt } from "./ast.js";
import { FIXTURE_PROGRAM } from "./fixture.js";
import { isParseError, parse } from "./parse.js";

describe("parse", () => {
  it("reads the fixture as five statements", () => {
    const program = parse(FIXTURE_PROGRAM);
    expect(program.statements.map((s) => s.kind)).toEqual([
      "select",
      "call",
      "repeat",
      "call",
      "define",
    ]);
    expect(program.source).toBe(FIXTURE_PROGRAM);
  });

  it("binds the partner with a select, with its span", () => {
    const [select] = parse(FIXTURE_PROGRAM).statements as [SelectStmt];
    expect(select).toMatchObject({
      kind: "select",
      name: "partner",
      selector: "across",
      span: { start: 0, end: 24, line: 1 },
    });
    expect(FIXTURE_PROGRAM.slice(select.span.start, select.span.end)).toBe(
      "partner = select(across)",
    );
  });

  it("spans both bows, on their own lines", () => {
    const statements = parse(FIXTURE_PROGRAM).statements;
    const first = statements[1] as CallStmt;
    const second = statements[3] as CallStmt;
    const text = "bow(partner)";

    expect(first).toMatchObject({
      kind: "call",
      name: "bow",
      span: { start: FIXTURE_PROGRAM.indexOf(text), line: 3 },
    });
    expect(first.span.end).toBe(first.span.start + text.length);
    expect(first.args).toEqual([
      {
        kind: "word",
        value: "partner",
        span: { start: first.span.start + 4, end: first.span.start + 11, line: 3 },
      },
    ]);

    expect(second).toMatchObject({
      kind: "call",
      name: "bow",
      span: { start: FIXTURE_PROGRAM.lastIndexOf(text), line: 5 },
    });
    expect(second.span.end).toBe(second.span.start + text.length);
  });

  it("reads the repeat and the definition it calls", () => {
    const statements = parse(FIXTURE_PROGRAM).statements;
    const repeat = statements[2] as RepeatStmt;
    expect(repeat.times).toBe(2);
    const dance = FIXTURE_PROGRAM.indexOf("dance()");
    expect(repeat.body).toEqual([
      {
        kind: "call",
        name: "dance",
        args: [],
        span: { start: dance, end: dance + "dance()".length, line: 4 },
      },
    ]);
    expect(FIXTURE_PROGRAM.slice(repeat.span.start, repeat.span.end)).toBe("repeat(2) { dance() }");

    const define = statements[4] as DefineStmt;
    expect(define.name).toBe("dance");
    expect(define.body.map((s) => (s.kind === "call" ? s.name : s.kind))).toEqual([
      "do-si-do",
      "allemande",
    ]);
    const allemande = define.body[1] as CallStmt;
    expect(allemande.args).toMatchObject([
      { kind: "word", value: "partner" },
      { kind: "word", value: "right" },
    ]);
  });

  it("takes numbers as arguments", () => {
    const [call] = parse("allemande(partner, left, 1.5)").statements as [CallStmt];
    expect(call.args).toMatchObject([
      { kind: "word", value: "partner" },
      { kind: "word", value: "left" },
      { kind: "number", value: 1.5 },
    ]);
  });

  it("reads if and else", () => {
    const [stmt] = parse("if (partner) { bow(partner) } else { bow(partner); bow(partner) }")
      .statements as [IfStmt];
    expect(stmt.kind).toBe("if");
    expect(stmt.name).toBe("partner");
    expect(stmt.then).toHaveLength(1);
    expect(stmt.else).toHaveLength(2);
  });

  it("reads an if with no else", () => {
    const [stmt] = parse("if (partner) { bow(partner) }").statements as [IfStmt];
    expect(stmt.else).toEqual([]);
  });

  it("drops comments and does not mind separators", () => {
    const program = parse(`
      // the whole dance
      bow(partner) // to your partner
      bow(partner); bow(partner)
    `);
    expect(program.statements).toHaveLength(3);
    expect(program.statements.every((s) => s.kind === "call")).toBe(true);
  });

  it("counts lines through comments", () => {
    const program = parse("// one\n// two\nbow(partner)");
    expect(program.statements[0]).toMatchObject({ span: { line: 3 } });
  });

  it("reads a definition written after the statement that calls it", () => {
    const program = parse("dance()\ndance { bow(partner) }");
    expect(program.statements.map((s) => s.kind)).toEqual(["call", "define"]);
  });

  it("reports an unclosed call with a line and column", () => {
    expect.assertions(3);
    try {
      parse("bow(partner\nbow(partner)");
    } catch (error) {
      expect(isParseError(error)).toBe(true);
      if (!isParseError(error)) return;
      expect(error.line).toBe(2);
      expect(error.message).toContain('expected ")"');
    }
  });

  it("insists on parentheses for a call", () => {
    expect(() => parse("bow partner")).toThrow(/expected "=", "\(" or "\{"/);
  });

  it("insists a binding is a select", () => {
    expect(() => parse("partner = across")).toThrow(/only "select" can bind a name/);
  });

  it("insists a repeat counts in whole numbers", () => {
    expect(() => parse("repeat(1.5) { bow(partner) }")).toThrow(/whole number/);
  });

  it("rejects a character the language has not got", () => {
    expect(() => parse("bow(Partner)")).toThrow(/unexpected character "P"/);
  });
});
