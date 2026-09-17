import { describe, expect, it } from "vitest";
import { PAIR, PAIR_SOLO } from "../dialect/pair/Pair.js";
import { FIGURES } from "../figures/registry.js";
import type { CompiledCall } from "./compile.js";
import { compile } from "./compile.js";
import { FIXTURE_PROGRAM } from "./fixture.js";
import { parse } from "./parse.js";

const run = (source: string, dialect = PAIR) => compile(parse(source), FIGURES, dialect);
const named = (calls: readonly CompiledCall[]) => calls.map((call) => call.figure.id);

describe("compile", () => {
  it("gives both dancers the same six calls, laid end to end", () => {
    const { sequence, errors } = run(FIXTURE_PROGRAM);
    expect(errors).toEqual([]);
    expect(sequence.dialect).toBe("pair");
    expect(Object.keys(sequence.perDancer)).toEqual(["lark", "robin"]);

    for (const dancer of ["lark", "robin"]) {
      const calls = sequence.perDancer[dancer] ?? [];
      expect(named(calls)).toEqual([
        "bow",
        "do-si-do",
        "allemande",
        "do-si-do",
        "allemande",
        "bow",
      ]);
      expect(calls.map((c) => c.start)).toEqual([0, 4, 12, 20, 28, 36]);
      expect(calls.map((c) => c.end)).toEqual([4, 12, 20, 28, 36, 40]);
      expect(calls.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("casts each dancer's partner as the other one", () => {
    const { sequence } = run(FIXTURE_PROGRAM);
    expect(sequence.perDancer["lark"]?.[0]?.cast).toEqual({ self: "lark", partner: "robin" });
    expect(sequence.perDancer["robin"]?.[0]?.cast).toEqual({ self: "robin", partner: "lark" });
  });

  it("leaves a breadcrumb through the repeat and the definition", () => {
    const calls = run(FIXTURE_PROGRAM).sequence.perDancer["lark"] ?? [];
    expect(calls.map((c) => c.path)).toEqual([
      "bow",
      "repeat[0]/dance/do-si-do",
      "repeat[0]/dance/allemande",
      "repeat[1]/dance/do-si-do",
      "repeat[1]/dance/allemande",
      "bow",
    ]);
  });

  it("points a call's span at the call statement", () => {
    const calls = run(FIXTURE_PROGRAM).sequence.perDancer["lark"] ?? [];
    const first = calls[0];
    expect(first).toBeDefined();
    expect(FIXTURE_PROGRAM.slice(first?.span.start, first?.span.end)).toBe("bow(partner)");
    expect(calls[1]?.span.line).toBe(8);
  });

  it("fills in the defaults a call did not say", () => {
    const calls = run(FIXTURE_PROGRAM).sequence.perDancer["lark"] ?? [];
    expect(calls[2]?.params).toEqual({ hand: "right", amount: 1, beats: 8 });
    expect(calls[2]?.beats).toBe(8);
  });

  it("takes the hand a call names", () => {
    const { sequence, errors } = run("partner = select(across)\nallemande(partner, left)");
    expect(errors).toEqual([]);
    expect(sequence.perDancer["lark"]?.[0]?.params["hand"]).toBe("left");
  });

  it("takes the beats a call names", () => {
    const { sequence, errors } = run("partner = select(across)\nallemande(partner, right, 1, 2)");
    expect(errors).toEqual([]);
    expect(sequence.perDancer["lark"]?.[0]?.beats).toBe(2);
    expect(sequence.perDancer["lark"]?.[0]?.end).toBe(2);
  });

  it("names the choices when a word is not one of them", () => {
    const source = "partner = select(across)\nallemande(partner, up)";
    const { sequence, errors } = run(source);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("right | left");
    expect(source.slice(errors[0]?.span?.start, errors[0]?.span?.end)).toBe("up");
    expect(sequence.perDancer["lark"]).toEqual([]);
  });

  it("errors on a figure it has not got, with the call's span", () => {
    const source = "partner = select(across)\nwiggle(partner)";
    const { errors } = run(source);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("unknown figure wiggle");
    expect(source.slice(errors[0]?.span?.start, errors[0]?.span?.end)).toBe("wiggle(partner)");
    expect(errors[0]?.span?.line).toBe(2);
  });

  it("errors on a name that was never bound", () => {
    const { errors } = run("do-si-do(nobody-bound)");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("nobody-bound is not bound");
  });

  it("errors on a selector the dialect has not got", () => {
    const { errors } = run("partner = select(sideways)\nbow(partner)");
    expect(errors[0]?.message).toContain("sideways");
    expect(errors[0]?.message).toContain("across");
  });

  it("errors on a definition that calls itself", () => {
    const { errors } = run("dance()\ndance { dance() }");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("dance calls itself");
  });

  it("unrolls a repeat, and repeat(0) yields nothing", () => {
    const source = "partner = select(across)\nrepeat(0) { bow(partner) }";
    expect(run(source).sequence.perDancer["lark"]).toEqual([]);
    expect(run(source).errors).toEqual([]);
  });

  it("branches on whether the select found anybody", () => {
    const source =
      "partner = select(across)\nif (partner) { bow(partner) } else { bow(partner); bow(partner) }";
    expect(named(run(source).sequence.perDancer["lark"] ?? [])).toEqual(["bow"]);
    expect(named(run(source, PAIR_SOLO).sequence.perDancer["lark"] ?? [])).toEqual(["bow", "bow"]);
  });

  it("gives the solo dancer the whole fixture with nobody to dance it with", () => {
    const { sequence, errors } = run(FIXTURE_PROGRAM, PAIR_SOLO);
    expect(errors).toEqual([]);
    const calls = sequence.perDancer["lark"] ?? [];
    expect(calls).toHaveLength(6);
    expect(calls.map((c) => c.cast)).toEqual(
      Array.from({ length: 6 }, () => ({ self: "lark", partner: undefined })),
    );
    expect(calls.at(-1)?.end).toBe(40);
    // Nobody means stay put, not skip: the beats are still the dancer's.
    expect(calls.every((c) => c.figure.casts.partner === "stand")).toBe(true);
  });

  it("reports an error both dancers make only once", () => {
    const { errors } = run("partner = select(across)\nallemande(partner, up)");
    expect(errors).toHaveLength(1);
  });
});
