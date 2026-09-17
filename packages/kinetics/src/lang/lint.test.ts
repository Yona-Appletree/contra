import { describe, expect, it } from "vitest";
import { lint } from "./lint.js";
import { parse } from "./parser.js";

const messages = (source: string): string[] =>
  lint(parse(source), { enums: ["Role", "Hand"] }).map((i) => i.message);

describe("the linter", () => {
  it("passes a clean file", () => {
    expect(
      messages(`
        module couple() { place lark role Lark; provide $partner: Place = other(me); }
        module swing($partner: Place, beats: Beats = 16) { ir "swing"; }
        module d() { swing($partner, beats = 12); }
      `),
    ).toEqual([]);
  });

  it("names a type nobody declared", () => {
    expect(messages("module d(x: Widget) { a(x); }")).toEqual(['"Widget" is not a type']);
  });

  it("names a binding nobody reads", () => {
    expect(messages("module d(n: Int = 1) { let k = 2; a(n); }")).toEqual([
      "k is bound but never read",
    ]);
  });

  it("keeps space from depending on a dancer", () => {
    expect(messages("module f() { if ($role is Robin) { place robin role Robin; } }")).toEqual([
      '"place" is space, and space cannot depend on a dancer: it is under a condition that reads a $ variable or me',
    ]);
    expect(messages("module f() { match (me) { _ => group couple(); } }").length).toBe(1);
    // A provide is deferred, so it may sit anywhere; a plain call may depend on anything.
    expect(
      messages(
        "module f() { if ($role is Robin) { provide $x: Place = other(me); swing($partner); } }",
      ),
    ).toEqual([]);
  });
});
