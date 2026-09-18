import type { EveningResult } from "@caller/lang";
import { findDance, hallFacts, loadForEval, runEvening } from "@caller/lang";
import { describe, expect, it } from "vitest";
import { danceSources } from "../dances/load.js";
import { FIGURES } from "../figures/registry.js";
import { sequenceFromEvening } from "./fromLang.js";

/** An evening of a fixture, straight from the language. */
function evening(dance: string, facts: Record<string, number> = {}, times = 1): EveningResult {
  const program = loadForEval(danceSources());
  const found = findDance(program, dance);
  if (found === undefined) throw new Error(`no dance called ${dance}`);
  return runEvening(program, found, { times, args: hallFacts(facts) });
}

const joined = (dance: string, facts: Record<string, number> = {}, times = 1) =>
  sequenceFromEvening(evening(dance, facts, times), FIGURES);

describe("the pair", () => {
  const { sequence, dialect, errors } = joined("fixture");

  it("makes six calls per dancer with the cast read from the ref", () => {
    expect(errors).toEqual([]);
    expect(dialect.dancers).toEqual(["L", "R"]);
    expect(dialect.roleOf("L")).toBe("lark");
    expect(dialect.roleOf("R")).toBe("robin");
    const lark = sequence.perDancer["L"]!;
    expect(lark.map((c) => c.figure.id)).toEqual([
      "bow",
      "do-si-do",
      "allemande",
      "do-si-do",
      "allemande",
      "bow",
    ]);
    expect(lark.every((c) => c.cast.partner === "R")).toBe(true);
    expect(lark.map((c) => [c.start, c.end])).toEqual([
      [0, 4],
      [4, 12],
      [12, 20],
      [20, 28],
      [28, 36],
      [36, 40],
    ]);
    expect(lark[2]?.params).toEqual({ hand: "right", amount: 1, beats: 8 });
    expect(lark[0]?.bindings).toEqual({ with: "R", beats: "4" });
  });

  it("seats the two 0.8 m apart facing each other (D4)", () => {
    // 25 px to the metre, so 0.4 m is 10 px; a facing is degrees from +x.
    const initial = dialect.initial().dancers;
    expect(initial["L"]).toEqual({ p: [0, -10], facing: 90 });
    expect(initial["R"]).toEqual({ p: [0, 10], facing: 270 });
    expect(sequence.perDancer["L"]?.[0]?.seatAfter).toEqual({ p: [0, -10], facing: 90 });
  });

  it("reads a Role on an empty place as nobody, without complaining", () => {
    const solo = joined("solo");
    expect(solo.errors).toEqual([]);
    expect(solo.dialect.dancers).toEqual(["L"]);
    expect(solo.sequence.perDancer["L"]?.every((c) => c.cast.partner === undefined)).toBe(true);
  });
});

describe("Butter", () => {
  const { sequence, dialect, errors } = joined("butter", { "minor-sets": 3 }, 2);

  it("lays the two times through end to end on one beat line", () => {
    const lark = sequence.perDancer["0-1L"]!;
    expect(lark[0]?.figure.id).toBe("circle");
    expect(lark[0]?.beats).toBe(8);
    // The second time opens with the shift, at beat 64 of the evening.
    const second = lark.find((c) => c.start === 64)!;
    expect(second.figure.id).toBe("shift");
    expect(second.beats).toBe(2);
  });

  it("gives the shift the seat the beat-0 commit moved it to (D6)", () => {
    const lark = sequence.perDancer["0-1L"]!;
    const before = lark.find((c) => c.start === 52)!; // the swing that ends time 1
    const shift = lark.find((c) => c.start === 64)!;
    expect(before.membership).toBeLessThan(shift.membership);
    // The ones travel one minor set down the hall: 1.6 m is 40 px along +y.
    expect(shift.seatAfter.p[1] - before.seatAfter.p[1]).toBeCloseTo(40, 6);
  });

  it("casts the circle's ring as the minor set, clockwise from self", () => {
    const circle = sequence.perDancer["1-1L"]!.find((c) => c.figure.id === "circle")!;
    expect(circle.group?.[0]).toBe("1-1L");
    expect(circle.group).toHaveLength(4);
    expect(new Set(circle.group)).toEqual(new Set(["1-1L", "1-1R", "1-2L", "1-2R"]));
  });

  it("casts the chain's `to` as the partner, the role word as a parameter, and the hey's ring", () => {
    expect(errors.filter((e) => e.kind === "NoFigure")).toEqual([]);
    const lark = sequence.perDancer["1-1L"]!;
    const chain = lark.find((c) => c.path === "chain")!;
    expect(chain.figure.id).toBe("chain");
    expect(chain.cast.partner).toBe("1-1R");
    expect(chain.params["who"]).toBe("robin");
    const hey = lark.find((c) => c.path === "hey")!;
    expect(hey.figure.id).toBe("hey");
    expect(hey.group).toHaveLength(4);
    expect(hey.params["start"]).toBe("robin");
    expect(hey.params["shoulder"]).toBe("right");
    expect(hey.params["amount"]).toBe(1);
  });

  it("stands a move whose figure the registry has not got, and says so once", () => {
    const without = Object.fromEntries(Object.entries(FIGURES).filter(([id]) => id !== "hey"));
    const { sequence: s, errors: e } = sequenceFromEvening(
      evening("butter", { "minor-sets": 1 }),
      without,
    );
    expect(e.filter((x) => x.kind === "NoFigure")).toHaveLength(1);
    const hey = s.perDancer["0-1L"]!.find((c) => c.path === "hey")!;
    expect(hey.figure.id).toBe("standing");
    expect(hey.figure.windows[0]?.kind).toBe("stand");
  });

  it("says a role word nobody on the floor dances is a bad parameter", () => {
    const program = loadForEval([
      ...danceSources(),
      {
        name: "ducks.dance",
        text: `use contra::{Role, Couple, chain};
use becket::{MajorSet, MinorSet};

fn ducks(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  chain(Lark, to = neighbor, beats = 8);
}
`,
      },
    ]);
    const found = findDance(program, "ducks");
    if (found === undefined) throw new Error("no dance called ducks");
    const result = sequenceFromEvening(
      runEvening(program, found, { times: 1, args: hallFacts({ "minor-sets": 1 }) }),
      FIGURES,
    );
    // `Lark` is a role somebody dances: the larks chain. No complaint.
    expect(result.errors.filter((e) => e.kind === "BadParam")).toEqual([]);
    const chain = result.sequence.perDancer["0-1L"]!.find((c) => c.path === "chain")!;
    expect(chain.params["who"]).toBe("lark");
  });

  it("gives the couple that ran off the end a wait-out with its partner", () => {
    const waiting = dialect.dancers
      .map((id) => sequence.perDancer[id]!)
      .find((calls) => calls.some((c) => c.figure.id === "wait-out"))!;
    const out = waiting.find((c) => c.figure.id === "wait-out")!;
    expect(out.cast.partner).toBeDefined();
    expect(out.beats).toBe(64);
  });
});

describe("a Role argument by name", () => {
  it("maps left, right and opposite straight onto the cast for a figure with no ring", () => {
    // M3's long wave balances with whoever is to each side; the join wires it
    // now so the figure has a cast to read when it lands.
    const program = loadForEval([
      ...danceSources(),
      {
        name: "by-name.dance",
        text: `use contra::{Role, Couple, balance};
use becket::{MajorSet, MinorSet};

fn sided(with: Role, left: Role, right: Role, beats: i32 = 4) { ir "balance"; }

fn by-name(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  sided(partner, left = partner, right = neighbor, beats = 4);
}
`,
      },
    ]);
    const found = findDance(program, "by-name")!;
    const result = runEvening(program, found, { times: 1, args: hallFacts({ "minor-sets": 3 }) });
    const { sequence } = sequenceFromEvening(result, FIGURES);
    const call = sequence.perDancer["1-1L"]![0]!;
    expect(call.cast.partner).toBe("1-1R");
    expect(call.cast.left).toBe("1-1R");
    expect(call.cast.right).toBe("1-2R");
  });
});
