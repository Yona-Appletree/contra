import { describe, expect, it } from "vitest";
import { check } from "./check.js";
import { parse } from "./parser.js";

const PRELUDE = parse(
  "enum Role { Lark, Robin } enum Hand { Left, Right } enum Turn { Left, Right }",
);
const MOVES = parse(`
  move swing($partner: Place, beats: Beats = 16) { ir "swing"; }
  move allemande($partner: Place, hand: Hand, turns: Number = 1) { ir "allemande"; }
`);

const errors = (source: string): string[] =>
  check([PRELUDE, MOVES, parse(source)], { dynamics: { role: "Role", partner: "Place" } }).map(
    (e) => e.message,
  );

describe("the checker", () => {
  it("types is from its left side", () => {
    expect(errors("dance d() { if ($role is Robin) { swing($partner); } }")).toEqual([]);
    expect(errors("dance d() { if ($role is Right) { swing($partner); } }")).toEqual([
      "Right is not a Role: Lark, Robin",
    ]);
  });

  it("reads a bare $ or name in a condition as a somebody test", () => {
    expect(errors("dance d() { if ($partner) { swing($partner); } }")).toEqual([]);
    expect(
      errors("dance d() { if ($partner and not $role is Robin) { swing($partner); } }"),
    ).toEqual([]);
    expect(errors("dance d() { if (3) { swing($partner); } }")).toEqual([
      "expected Bool, found Int",
    ]);
  });

  it("resolves a bare member from the parameter it is given to", () => {
    expect(errors("dance d() { allemande($partner, Right); }")).toEqual([]);
    expect(errors("dance d() { allemande($partner, Robin); }")).toEqual([
      "Robin is not a Hand: Left, Right",
    ]);
    expect(errors("dance d() { let h = Left; swing($partner); allemande($partner, h); }")).toEqual([
      "Left could be Hand or Turn: write Hand.Left",
    ]);
  });

  it("checks a call against the module's parameters", () => {
    expect(errors("dance d() { swing($partner, beats = 12); }")).toEqual([]);
    expect(errors("dance d() { swing($partner, speed = 12); }")).toEqual([
      "swing has no parameter speed",
    ]);
    expect(errors("dance d() { allemande($partner); }")).toEqual(["allemande needs hand: Hand"]);
    expect(errors("dance d() { hey($partner); }")).toEqual(["unknown move hey"]);
    expect(errors("dance d() { swing($partner, beats = 3m); }")).toEqual([
      "expected Beats, found Length",
    ]);
  });

  it("checks transforms", () => {
    expect(
      errors("formation f() { place lark role Lark at translate(x = 1m) rotate(90) mirror(y); }"),
    ).toEqual([]);
    expect(errors("formation f() { place lark role Lark at translate(z = 1m); }")).toEqual([
      "translate takes x and y, not z",
    ]);
    expect(errors("formation f() { place lark role Lark at translate(x = 1); }")).toEqual([
      "expected Length, found Int",
    ]);
    expect(errors("formation f() { place lark role Right; }")).toEqual(["Right is not a Role"]);
  });
});
