import { describe, expect, it } from "vitest";
import { isSyntaxError, tokenize } from "./lexer.js";
import { parse } from "./parser.js";

describe("the lexer", () => {
  it("keeps a hyphen inside a word and spaces a subtraction", () => {
    const { tokens } = tokenize("minor-set a - b 3m 0.6cm $partner Robin");
    expect(tokens.map((t) => `${t.kind}:${t.text}${t.unit ?? ""}`)).toEqual([
      "name:minor-set",
      "name:a",
      "punct:-",
      "name:b",
      "number:3m",
      "number:0.6cm",
      "dyn:partner",
      "cap:Robin",
      "end:",
    ]);
  });

  it("refuses every other casing, naming the rule", () => {
    for (const bad of ["minorSet", "Minor-Set", "minor_set", "$Partner"]) {
      let error: unknown;
      try {
        tokenize(bad);
      } catch (e) {
        error = e;
      }
      expect(isSyntaxError(error), bad).toBe(true);
      expect(String((error as Error).message)).toMatch(/kebab-case|TitleCase|variable/);
    }
  });

  it("keeps comments on the side, with their lines", () => {
    const { tokens, comments } = tokenize("a(); // one\n// two\nb();");
    expect(tokens.filter((t) => t.kind === "name").map((t) => t.text)).toEqual(["a", "b"]);
    expect(comments.map((c) => `${String(c.line)}:${c.text}`)).toEqual(["1:one", "2:two"]);
  });

  it("points at the line and column of what it cannot read", () => {
    let error: unknown;
    try {
      tokenize('x();\n  y = "open');
    } catch (e) {
      error = e;
    }
    expect(isSyntaxError(error) && error.line === 2 && error.col === 7).toBe(true);
  });
});

describe("the parser", () => {
  it("reads an enum and the three module kinds", () => {
    const file = parse(`
      enum Role { Lark, Robin }
      formation couple() { place lark role Lark; }
      move swing($partner: Place, beats: Beats = 16) { ir "swing"; }
      dance d($partner: Place) { swing($partner, beats = 12); }
    `);
    expect(file.items.map((i) => `${i.kind} ${i.name}`)).toEqual([
      "enum Role",
      "formation couple",
      "move swing",
      "dance d",
    ]);
    const swing = file.items[2];
    expect(
      swing?.kind === "move" &&
        swing.params.map((p) => `${p.dynamic ? "$" : ""}${p.name}: ${p.type}`),
    ).toEqual(["$partner: Place", "beats: Beats"]);
  });

  it("reads every statement form of a formation", () => {
    const file = parse(`formation f(n: Int = 3) {
      place robin role Robin at translate(y = 0.4m) rotate(180);
      anchor centre: Point = midpoint(lark, robin);
      group ones = couple() at translate(x = -0.64m);
      group couple();
      provide $partner: Place = other(me);
      next = duple-progression(along = up);
      let k = n * 2;
      repeat (i in n) group minor-set() at translate(y = 1.6m * i);
    }`);
    const body = file.items[0]?.kind === "formation" ? file.items[0].body : [];
    expect(body.map((s) => s.kind)).toEqual([
      "place",
      "anchor",
      "group",
      "group",
      "provide",
      "next",
      "let",
      "repeat",
    ]);
    const place = body[0];
    expect(place?.kind === "place" && place.at.map((t) => t.op)).toEqual(["translate", "rotate"]);
    const anon = body[3];
    expect(anon?.kind === "group" && anon.name).toBeUndefined();
  });

  it("reads a dance: calls, if/else if/else, repeat, let, progress", () => {
    const file = parse(`dance d($partner: Place) {
      title "D";
      repeat (7) {
        if ($time != 1) { progress(); } else if ($role is Robin) { a(); } else { b(); }
        let four = group(me, $partner);
        circle(four, Left, places = 3);
      }
    }`);
    const body = file.items[0]?.kind === "dance" ? file.items[0].body : [];
    expect(body.map((s) => s.kind)).toEqual(["title", "repeat"]);
    const repeat = body[1];
    const inner = repeat?.kind === "repeat" ? repeat.body : [];
    expect(inner.map((s) => s.kind)).toEqual(["if", "let", "call"]);
    const ifStmt = inner[0];
    expect(ifStmt?.kind === "if" && ifStmt.else[0]?.kind).toBe("if");
  });

  it("gives is its enum member and refuses anything else on the right", () => {
    const ok = parse("dance d() { if ($role is Robin) { a(); } }");
    expect(ok.items.length).toBe(1);
    expect(() => parse("dance d() { if ($role is robin) { a(); } }")).toThrow(/enum member/);
  });

  it("binds arithmetic and comparison the usual way", () => {
    const file = parse("formation f() { let k = 1 + 2 * 3 - -4 / (5 + 6) > 7 and not x or y; }");
    const stmt = file.items[0]?.kind === "formation" ? file.items[0].body[0] : undefined;
    const e = stmt?.kind === "let" ? stmt.value : undefined;
    expect(e?.kind === "binary" && e.op).toBe("or");
    expect(e?.kind === "binary" && e.left.kind === "binary" && e.left.op).toBe("and");
  });

  it("says what it expected, where", () => {
    expect(() => parse("formation f() { place lark }")).toThrow(/expected ";"/);
    expect(() => parse("dance d() { swing($partner) }")).toThrow(/expected ";"/);
    expect(() => parse("dance d(partner) {}")).toThrow(/declares its type/);
    expect(() => parse("bogus")).toThrow(/top of the file/);
    expect(() => parse("dance d() { let x = 3km; }")).toThrow(/not a unit/);
  });
});
