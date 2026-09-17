import { describe, expect, it } from "vitest";
import { check } from "./check.js";
import { parse } from "./parser.js";

const PRELUDE = parse(
  "enum Role { Lark, Robin } enum Hand { Left, Right } enum Turn { Left, Right } enum Axis { X, Y } enum Direction { Up, Down, Left, Right } enum Phrase { A1, A2 }",
);
const MOVES = parse(`
  module swing($partner: Place, beats: Beats = 16) { ir "swing"; }
  module allemande($partner: Place, hand: Hand, turns: Number = 1) { ir "allemande"; }
`);

const errors = (source: string): string[] =>
  check([PRELUDE, MOVES, parse(source)], {
    dynamics: { role: "Role", partner: "Place", phrase: "Phrase" },
  }).map((e) => e.message);

describe("the checker", () => {
  it("types is from its left side", () => {
    expect(errors("module d() { if ($role is Robin) { swing($partner); } }")).toEqual([]);
    expect(errors("module d() { if ($role is Right) { swing($partner); } }")).toEqual([
      "Right is not a Role: Lark, Robin",
    ]);
  });

  it("reads a bare $ or name in a condition as a somebody test", () => {
    expect(errors("module d() { if ($partner) { swing($partner); } }")).toEqual([]);
    expect(
      errors("module d() { if ($partner and not $role is Robin) { swing($partner); } }"),
    ).toEqual([]);
    expect(errors("module d() { if (3) { swing($partner); } }")).toEqual([
      "expected Bool, found Int",
    ]);
  });

  it("resolves a bare member from the parameter it is given to", () => {
    expect(errors("module d() { allemande($partner, Right); }")).toEqual([]);
    expect(errors("module d() { allemande($partner, Robin); }")).toEqual([
      "Robin is not a Hand: Left, Right",
    ]);
    expect(errors("module d() { let h = Left; swing($partner); allemande($partner, h); }")).toEqual(
      ["Left could be Hand or Turn or Direction: write Hand.Left"],
    );
  });

  it("checks a call against the module's parameters", () => {
    expect(errors("module d() { swing($partner, beats = 12); }")).toEqual([]);
    expect(errors("module d() { swing($partner, speed = 12); }")).toEqual([
      "swing has no parameter speed",
    ]);
    expect(errors("module d() { allemande($partner); }")).toEqual(["allemande needs hand: Hand"]);
    expect(errors("module d() { hey($partner); }")).toEqual(["unknown module hey"]);
    expect(errors("module d() { swing($partner, beats = 3m); }")).toEqual([
      "expected Beats, found Length",
    ]);
  });

  it("checks transforms, directions and axes", () => {
    expect(
      errors(
        "module f() { place lark role Lark at translate(x = 1m) rotate(90) mirror(Y) fwd(0.4m); }",
      ),
    ).toEqual([]);
    expect(errors("module f() { place lark role Lark at translate(z = 1m); }")).toEqual([
      "translate takes x and y, not z",
    ]);
    expect(errors("module f() { place lark role Lark at right(1); }")).toEqual([
      "expected Length, found Int",
    ]);
    expect(errors("module f() { place lark role Lark at mirror(Up); }")).toEqual([
      "Up is not a Axis: X, Y",
    ]);
    expect(errors("module f() { place lark role Right; }")).toEqual(["Right is not a Role"]);
    expect(
      errors("module f() { anchor up = direction(Up); anchor a = line(through = up, along = Y); }"),
    ).toEqual([]);
  });

  it("checks match for exhaustiveness and asserts as conditions", () => {
    expect(
      errors("module d() { match ($phrase) { A1 => swing($partner); A2 => swing($partner); } }"),
    ).toEqual([]);
    expect(errors("module d() { match ($phrase) { A1 => swing($partner); } }")).toEqual([
      "match does not cover A2",
    ]);
    expect(
      errors("module d() { match ($phrase) { A1 => swing($partner); _ => swing($partner); } }"),
    ).toEqual([]);
    expect(
      errors("module d() { match ($phrase) { B9 => swing($partner); _ => swing($partner); } }"),
    ).toEqual(["B9 is not a Phrase"]);
    expect(errors('module d() { assert($beat == 16, "A1"); swing($partner); }')).toEqual([]);
  });
});
