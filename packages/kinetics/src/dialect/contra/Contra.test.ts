import { describe, expect, it } from "vitest";
import { FIGURES } from "../../figures/registry.js";
import { FIXTURE_PROGRAM } from "../../lang/fixture.js";
import type { CompiledCall } from "../../lang/compile.js";
import { compile } from "../../lang/compile.js";
import { parse } from "../../lang/parse.js";
import { PAIR } from "../pair/Pair.js";
import { contraDialect } from "./Contra.js";

/** The fixture the whole stack is built on, danced with the neighbour across the set. */
const CONTRA_FIXTURE = FIXTURE_PROGRAM.replace("select(across)", "select(neighbor)");

const run = (source: string, couples = 6, formation: "becket" | "duple-improper" = "becket") =>
  compile(parse(source), FIGURES, contraDialect({ formation, couples }));

const named = (calls: readonly CompiledCall[]) => calls.map((call) => call.figure.id);

describe("the contra dialect", () => {
  it("is named for the formation it stands in", () => {
    expect(contraDialect({ formation: "becket", couples: 3 }).id).toBe("contra-becket");
    expect(contraDialect({ formation: "duple-improper", couples: 3 }).id).toBe(
      "contra-duple-improper",
    );
  });

  it("puts every couple on the floor, lark and robin", () => {
    const dialect = contraDialect({ formation: "becket", couples: 3 });
    expect(dialect.dancers).toEqual(["1L", "1R", "2L", "2R", "3L", "3R"]);
    expect(dialect.dancers.map((id) => dialect.roleOf(id))).toEqual([
      "lark",
      "robin",
      "lark",
      "robin",
      "lark",
      "robin",
    ]);
  });

  it("stands them where the formation says, aligned at rest", () => {
    // At rest a becket set is aligned — every couple faces a couple — which is
    // the lattice's Butter start (half a place back) progressed once.
    const state = contraDialect({ formation: "becket", couples: 2 }).initial();
    expect(state.dancers["1L"]).toEqual({ p: [-16, -10], facing: 0 });
    expect(state.dancers["1R"]).toEqual({ p: [-16, 10], facing: 0 });
    expect(state.dancers["2L"]).toEqual({ p: [16, 10], facing: 180 });
    expect(state.dancers["2R"]).toEqual({ p: [16, -10], facing: 180 });
  });

  it("resolves a selector from each dancer's own point of view", () => {
    const dialect = contraDialect({ formation: "becket", couples: 6 });
    const state = dialect.initial();
    expect(dialect.select("partner", "1L", state)).toBe("1R");
    expect(dialect.select("neighbor", "1L", state)).toBe("2R");
    expect(dialect.select("neighbor", "2R", state)).toBe("1L");
    expect(dialect.select("neighbor", "2L", state)).toBe("1R");
    // After a progression the couples at the two ends have nobody across.
    const after = dialect.progress!(state);
    expect(dialect.select("neighbor", "1L", after)).toBeUndefined();
    expect(dialect.select("neighbor", "6R", after)).toBeUndefined();
    expect(dialect.select("partner", "1L", after)).toBe("1R");
  });

  it("resolves a group the same way, and answers nobody at the end of a line", () => {
    const dialect = contraDialect({ formation: "becket", couples: 6 });
    const state = dialect.initial();
    expect(dialect.group?.("hands-four", "1L", state)).toEqual(["1L", "2R", "2L", "1R"]);
    expect(dialect.group?.("hands-four", "2L", state)).toEqual(["2L", "1R", "1L", "2R"]);
    const after = dialect.progress!(state);
    expect(dialect.group?.("hands-four", "1L", after)).toBeUndefined();
  });

  it("says what it knows when asked for a word it has not got", () => {
    const dialect = contraDialect({ formation: "becket", couples: 2 });
    expect(() => dialect.select("trail-buddy", "1L", dialect.initial())).toThrow(
      /trail-buddy.*partner \| neighbor/,
    );
    expect(() => dialect.group?.("shadow-pair", "1L", dialect.initial())).toThrow(/shadow-pair/);
  });
});

describe("one program, every dancer's script", () => {
  it("gives all twelve the same six calls, laid end to end", () => {
    const { sequence, errors } = run(CONTRA_FIXTURE);
    expect(errors).toEqual([]);
    expect(sequence.dialect).toBe("contra-becket");
    expect(Object.keys(sequence.perDancer)).toHaveLength(12);
    for (const calls of Object.values(sequence.perDancer)) {
      expect(named(calls)).toEqual([
        "bow",
        "do-si-do",
        "allemande",
        "do-si-do",
        "allemande",
        "bow",
      ]);
      expect(calls.map((c) => c.start)).toEqual([0, 4, 12, 20, 28, 36]);
      expect(calls.at(-1)?.end).toBe(40);
    }
  });

  it("casts each dancer's own neighbour, and nobody at the end of a line", () => {
    const { sequence } = run(CONTRA_FIXTURE);
    const partners = Object.fromEntries(
      Object.entries(sequence.perDancer).map(([id, calls]) => [id, calls[0]?.cast.partner]),
    );
    expect(partners).toEqual({
      "1L": "2R",
      "1R": "2L",
      "2L": "1R",
      "2R": "1L",
      "3L": "4R",
      "3R": "4L",
      "4L": "3R",
      "4R": "3L",
      "5L": "6R",
      "5R": "6L",
      "6L": "5R",
      "6R": "5L",
    });
  });

  it("keeps the beats of a dancer with nobody to dance them with", () => {
    // The user's ruling (DA14): a select that finds no-one is a stand, not a
    // skip, so an end couple's forty beats are still theirs.
    const { sequence } = run("progress()\n" + CONTRA_FIXTURE);
    const calls = sequence.perDancer["1L"] ?? [];
    expect(calls).toHaveLength(6);
    expect(calls.every((call) => call.cast.partner === undefined)).toBe(true);
    expect(calls.at(-1)?.end).toBe(40);
  });

  it("dances duple improper's neighbours along the line instead", () => {
    const { sequence, errors } = run(CONTRA_FIXTURE, 5, "duple-improper");
    expect(errors).toEqual([]);
    expect(sequence.perDancer["1L"]?.[0]?.cast).toEqual({ self: "1L", partner: "2R" });
    expect(sequence.perDancer["5L"]?.[0]?.cast).toEqual({ self: "5L", partner: undefined });
  });
});

describe("a group binding", () => {
  it("is not one dancer, and a figure that wants one says so", () => {
    const { errors } = run("four = select(hands-four)\nbow(four)");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("four is a group, and bow takes one dancer");
  });

  it("branches on whether the dancer is in a hands four at all", () => {
    const source = [
      "progress()",
      "four = select(hands-four)",
      "neighbor = select(neighbor)",
      "if (four) { bow(neighbor) } else { bow(neighbor); bow(neighbor) }",
    ].join("\n");
    const { sequence, errors } = run(source);
    expect(errors).toEqual([]);
    expect(named(sequence.perDancer["2L"] ?? [])).toEqual(["bow"]);
    expect(named(sequence.perDancer["1L"] ?? [])).toEqual(["bow", "bow"]);
  });

  it("is still an unknown selector to a dialect with no groups", () => {
    // The pair has neither `groups` nor `group`, so the word goes to `select`
    // and comes back as the error it always was.
    const { errors } = compile(parse("four = select(hands-four)"), FIGURES, PAIR);
    expect(errors[0]?.message).toContain("hands-four");
  });
});
