import { describe, expect, it } from "vitest";
import { lint } from "./lint.js";
import { parse } from "./parser.js";

const messages = (source: string): string[] =>
  lint(parse(source), { enums: ["Role", "Hand"] }).map((i) => i.message);

describe("the linter", () => {
  it("passes a clean file", () => {
    expect(
      messages(`
        formation couple() { place lark role Lark; provide $partner: Place = other(me); }
        move swing($partner: Place, beats: Beats = 16) { ir "swing"; }
        dance d($partner: Place) { swing($partner, beats = 12); }
      `),
    ).toEqual([]);
  });

  it("names a type nobody declared", () => {
    expect(messages("dance d(x: Widget) { a(x); }")).toEqual(['"Widget" is not a type']);
  });

  it("names a binding nobody reads", () => {
    expect(messages("dance d($partner: Place, n: Int = 1) { let k = 2; a(n); }")).toEqual([
      "$partner is bound but never read",
      "k is bound but never read",
    ]);
  });

  it("keeps each statement to its module kind", () => {
    expect(messages("formation f() { swing(); }")).toEqual([
      'a formation cannot call a move ("swing"); groups are its only calls',
    ]);
    expect(messages("dance d() { place lark; }")).toEqual(['"place" does not belong in a dance']);
    expect(messages('move m() { title "x"; }')).toEqual([
      '"title" does not belong in a move',
      'move m must say which figure it is with one "ir" line',
    ]);
  });
});
