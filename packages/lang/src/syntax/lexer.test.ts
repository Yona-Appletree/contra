import { describe, expect, it } from "vitest";
import { isKebab, isSyntaxFailure, isTitle, tokenize } from "./lexer.js";

const kinds = (source: string) =>
  tokenize(source, "t.dance")
    .tokens.filter((t) => t.kind !== "end")
    .map((t) => `${t.kind} ${t.text}${t.unit === undefined || t.unit === "" ? "" : `·${t.unit}`}`);

const failure = (source: string) => {
  try {
    tokenize(source, "t.dance");
  } catch (error) {
    if (isSyntaxFailure(error)) return error.diagnostic;
    throw error;
  }
  throw new Error("expected a failure");
};

describe("casing is grammar", () => {
  it("kebab is a name and TitleCase is a cap", () => {
    expect(kinds("long-lines MinorSet A1")).toEqual(["name long-lines", "cap MinorSet", "cap A1"]);
  });

  it("a hyphen inside a word belongs to the word", () => {
    expect(kinds("a-b")).toEqual(["name a-b"]);
    expect(kinds("a - b")).toEqual(["name a", "punct -", "name b"]);
  });

  it("camelCase and snake_case are neither", () => {
    expect(failure("minorSet").code).toBe("L002");
    expect(failure("minor_set").code).toBe("L002");
    expect(failure("Minor-Set").code).toBe("L002");
  });

  it("the predicates agree", () => {
    expect(isKebab("do-si-do")).toBe(true);
    expect(isKebab("do-")).toBe(false);
    expect(isTitle("OutTop")).toBe(true);
    expect(isTitle("outTop")).toBe(false);
  });
});

describe("numbers", () => {
  it("carry a unit glued on", () => {
    expect(kinds("0.64m 90deg 8")).toEqual(["number 0.64·m", "number 90·deg", "number 8"]);
  });

  it("stop at a range's second dot", () => {
    expect(kinds("0..minor-sets")).toEqual(["number 0", "punct ..", "name minor-sets"]);
    expect(kinds("0..=3")).toEqual(["number 0", "punct ..=", "number 3"]);
  });

  it("refuse a unit the language does not have", () => {
    expect(failure("8beats").code).toBe("L005");
  });
});

describe("what the language does not have", () => {
  it("the sigil", () => {
    const d = failure("$partner");
    expect(d.code).toBe("L007");
    expect(d.span).toEqual({ file: "t.dance", start: 0, end: 8 });
  });

  it("the dot", () => {
    expect(failure("a.b").code).toBe("L006");
  });

  it("a character it cannot read", () => {
    expect(failure("@").code).toBe("L004");
  });
});

describe("the rest", () => {
  it("keeps comments on the side", () => {
    const { tokens, comments } = tokenize("// a note\nswing;\n", "t.dance");
    expect(comments).toEqual([{ text: "a note", start: 0, end: 9, line: 1 }]);
    expect(tokens.map((t) => t.text)).toEqual(["swing", ";", ""]);
  });

  it("reads the long operators before the short ones", () => {
    expect(kinds("<= >= == != => :: | !")).toEqual([
      "punct <=",
      "punct >=",
      "punct ==",
      "punct !=",
      "punct =>",
      "punct ::",
      "punct |",
      "punct !",
    ]);
  });

  it("reads a lone underscore as the wildcard", () => {
    expect(kinds("_")).toEqual(["punct _"]);
  });

  it("wants a string closed on its line", () => {
    expect(failure('card "Butter;\n').code).toBe("L003");
  });
});
