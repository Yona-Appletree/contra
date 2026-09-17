import { describe, expect, it } from "vitest";
import { isSyntaxError, tokenize } from "./lexer.js";
import { parse } from "./parser.js";
import type { ModuleItem } from "./syntax.js";

const moduleBody = (source: string, index = 0) => {
  const item = parse(source).items[index];
  return item?.kind === "module" ? (item as ModuleItem).body : [];
};

describe("the lexer", () => {
  it("keeps a hyphen inside a word and spaces a subtraction", () => {
    const { tokens } = tokenize("minor-set a - b 3m 0.6cm $partner Robin 0..n 0..=n =>");
    expect(tokens.map((t) => `${t.kind}:${t.text}${t.unit ?? ""}`)).toEqual([
      "name:minor-set",
      "name:a",
      "punct:-",
      "name:b",
      "number:3m",
      "number:0.6cm",
      "dyn:partner",
      "cap:Robin",
      "number:0",
      "punct:..",
      "name:n",
      "number:0",
      "punct:..=",
      "name:n",
      "punct:=>",
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
});

describe("the parser", () => {
  it("reads an enum and modules, and refuses the old keywords with a hint", () => {
    const file = parse(`
      enum Role { Lark, Robin }
      module couple() { place lark role Lark; }
      module swing($partner: Place, beats: Beats = 16) { ir "swing"; }
      module d() { swing($partner, beats = 12); }
    `);
    expect(file.items.map((i) => `${i.kind} ${i.name}`)).toEqual([
      "enum Role",
      "module couple",
      "module swing",
      "module d",
    ]);
    expect(() => parse("dance d() {}")).toThrow(/every module is "module"/);
    expect(() => parse("formation f() {}")).toThrow(/every module is "module"/);
  });

  it("reads every space statement", () => {
    const body = moduleBody(`module f(n: Int = 3) {
      place robin role Robin at right(0.4m) rotate(180);
      anchor center: Point = midpoint(lark, robin);
      group ones = couple() at translate(x = -0.64m);
      group couple();
      group major-set() { group minor-set(); }
      provide $partner: Place = other(me);
      provide progress() { $minor-set = along($minor-set, Up) or out-top; }
      dancers;
      let k = n * 2;
      for i in 0..n { group minor-set() at translate(y = 1.6m * i); }
      for i in 0..=n { group minor-set(); }
    }`);
    expect(body.map((s) => s.kind)).toEqual([
      "place",
      "anchor",
      "group",
      "group",
      "group",
      "provide",
      "provide-fn",
      "dancers",
      "let",
      "for",
      "for",
    ]);
    const place = body[0];
    expect(place?.kind === "place" && place.at.map((t) => t.op)).toEqual(["right", "rotate"]);
    const anon = body[3];
    expect(anon?.kind === "group" && anon.name).toBeUndefined();
    const withChildren = body[4];
    expect(withChildren?.kind === "group" && withChildren.children?.length).toBe(1);
    const fn = body[6];
    expect(fn?.kind === "provide-fn" && fn.body[0]?.kind).toBe("assign");
    const last = body[10];
    expect(last?.kind === "for" && last.inclusive).toBe(true);
  });

  it("reads a dance: calls with blocks, children, if/else if/else, match, assert, annotations", () => {
    const body = moduleBody(`module d() {
      card "D";
      repeat (7) {
        if ($time != 1) { progress(); } else if ($role is Robin) { a(); } else { b(); }
        let four = group(me, $partner);
        phrase(A1) { circle(four, Left, places = 3); }
        match ($role) { Lark => a(); Robin => { b(); c(); } _ => d(); }
        assert($beat == 16, "A1 is sixteen beats");
        say "and swing";
        children();
      }
    }`);
    expect(body.map((s) => s.kind)).toEqual(["card", "repeat"]);
    const repeat = body[1];
    const inner = repeat?.kind === "repeat" ? repeat.body : [];
    expect(inner.map((s) => s.kind)).toEqual([
      "if",
      "let",
      "call",
      "match",
      "assert",
      "say",
      "children",
    ]);
    const ifStmt = inner[0];
    expect(ifStmt?.kind === "if" && ifStmt.else[0]?.kind).toBe("if");
    const call = inner[2];
    expect(call?.kind === "call" && call.children?.length).toBe(1);
    const match = inner[3];
    expect(match?.kind === "match" && match.arms.map((a) => a.pattern ?? "_")).toEqual([
      "Lark",
      "Robin",
      "_",
    ]);
    const assert = inner[4];
    expect(assert?.kind === "assert" && assert.message).toBe("A1 is sixteen beats");
  });

  it("gives is its enum member and refuses anything else on the right", () => {
    expect(parse("module d() { if ($role is Robin) { a(); } }").items.length).toBe(1);
    expect(() => parse("module d() { if ($role is robin) { a(); } }")).toThrow(/enum member/);
  });

  it("binds arithmetic and comparison the usual way", () => {
    const body = moduleBody(
      "module f() { let k = 1 + 2 * 3 - -4 / (5 + 6) % 7 > 7 and not x or y; }",
    );
    const e = body[0]?.kind === "let" ? body[0].value : undefined;
    expect(e?.kind === "binary" && e.op).toBe("or");
    expect(e?.kind === "binary" && e.left.kind === "binary" && e.left.op).toBe("and");
  });

  it("says what it expected, where", () => {
    expect(() => parse("module f() { place lark }")).toThrow(/expected ";"/);
    expect(() => parse("module d() { swing($partner) }")).toThrow(/expected ";"/);
    expect(() => parse("module d(partner) {}")).toThrow(/declares its type/);
    expect(() => parse("bogus")).toThrow(/top of the file/);
    expect(() => parse("module d() { let x = 3km; }")).toThrow(/not a unit/);
    expect(() => parse("module d() { for i in 0 to 3 {} }")).toThrow(/".." or "..="/);
  });
});
