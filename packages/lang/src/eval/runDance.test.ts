import { describe, expect, it } from "vitest";
import { buildTree, findDance } from "./buildTree.js";
import { fixtures, withModule } from "./fixtures.js";
import type { Program } from "./loadForEval.js";
import { printTime } from "./printTimeline.js";
import { runDance } from "./runDance.js";
import { hallFacts } from "./runEvening.js";
import type { TimeResult } from "./timeline.js";

/** One time through a named dance, on its own floor. */
function once(
  program: Program,
  name: string,
  facts: Record<string, number> = {},
  options: Parameters<typeof runDance>[4] = {},
): TimeResult {
  const dance = findDance(program, name);
  if (dance === undefined) throw new Error(`no dance called ${name}`);
  const args = hallFacts(facts);
  const built = buildTree(program, dance, args);
  expect(built.diagnostics).toEqual([]);
  return runDance(program, built.tree, dance, args, options);
}

/** Every `with =` / `to =` argument a dancer's moves were given, in order. */
const partners = (time: TimeResult, dancer: string): string[] =>
  time.moves
    .filter((move) => move.dancer === dancer)
    .flatMap((move) => move.args.filter((arg) => arg.name === "with").map((arg) => arg.value));

describe("runDance", () => {
  // Acceptance item 4: an `i32` id, a wrap-around `corner`, and no `Station`.
  it("wraps a square's corners: the lark's is the couple below, the robin's above", () => {
    const time = once(fixtures(), "corners");
    expect(time.diagnostics).toEqual([]);
    expect(time.outDancers).toEqual([]);
    expect(
      Object.fromEntries(
        time.moves
          .filter((move) => move.ir === "balance")
          .map((move) => [move.dancer, move.args[0]?.value]),
      ),
    ).toEqual({
      "1L": "4R",
      "1R": "2L",
      "2L": "1R",
      "2R": "3L",
      "3L": "2R",
      "3R": "4L",
      "4L": "3R",
      "4R": "1L",
    });
  });

  // Acceptance item 6: a swap both partners say, and a swap only one says.
  describe("a role swap", () => {
    it("is clean when both partners say it", () => {
      const time = once(fixtures(), "swap-both", { "minor-sets": 2 });
      expect(time.diagnostics).toEqual([]);
      expect(time.events).toHaveLength(12);
      expect(time.events.every((event) => event.beat === 4)).toBe(true);
      // Every place still holds exactly one dancer, and the two of a couple
      // have traded: the lark's place now holds who was the robin.
      const swap = time.events.find((event) => event.dancer === "0-1L");
      expect(swap?.from).toContain("Role(Lark)");
      expect(swap?.to).toContain("Role(Robin)");
    });

    it("names the pair and the beat when only the larks say it", () => {
      const time = once(fixtures(), "swap-one", { "minor-sets": 2 });
      const first = time.diagnostics[0];
      expect(first?.code).toBe("L102");
      expect(first?.beat).toBe(4);
      expect(first?.dancers).toEqual(["OT-1L", "OT-1R"]);
      expect(first?.message).toContain("Role(Robin)");
      expect(time.events).toEqual([]);
    });
  });

  // Acceptance item 8: nothing is a check error; it goes wrong at the commit.
  it("names the pair and the beat when a progression sends two couples to one place", () => {
    const program = fixtures({ broken: true });
    const dance = findDance(program, "collide")!;
    const args = hallFacts({ "minor-sets": 3 });
    const tree = buildTree(program, dance, args).tree;
    const first = runDance(program, tree, dance, args, { time: 1, firstTime: true });
    expect(first.diagnostics).toEqual([]);
    const second = runDance(program, tree, dance, args, { time: 2 });
    expect(second.diagnostics.map((d) => [d.code, d.beat, d.dancers])).toEqual([
      ["L102", 0, ["0-2L", "2-1L"]],
      ["L102", 0, ["0-2R", "2-1R"]],
    ]);
    expect(second.diagnostics[0]?.message).toContain("MinorSet(2)/Couple(Twos)/Role(Lark)");
  });

  // Acceptance item 10: a trailing block, a closure, and defaults.
  describe("fn", () => {
    it("runs a trailing block as the call's last argument, and asserts its beat", () => {
      const time = once(fixtures(), "butter", { "minor-sets": 2 });
      expect(time.diagnostics).toEqual([]);
      const starts = time.moves.filter((move) => move.dancer === "0-1L").map((move) => move.start);
      expect(starts).toEqual([0, 8, 16, 24, 32, 48, 52]);
    });

    it("says where a phrase went wrong when its block does not fit", () => {
      const time = once(fixtures({ broken: true }), "long-a1", { "minor-sets": 2 });
      const first = time.diagnostics[0];
      expect(first?.code).toBe("L101");
      expect(first?.beat).toBe(18);
      expect(first?.trace.map((fact) => fact.what)).toContain("phrase(…)");
    });

    it("takes a default when the call does not say, and the call when it does", () => {
      const time = once(fixtures(), "swap-both", { "minor-sets": 1 });
      const beats = time.moves
        .filter((move) => move.dancer === "0-1L")
        .map((move) => [move.ir, move.beats]);
      expect(beats).toEqual([
        ["balance", 4],
        ["swing", 12],
      ]);
      const defaulted = once(
        withModule(
          "defaults",
          `use contra::{Role, Couple, swing};
use becket::{MajorSet, MinorSet};

fn plain(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  swing(partner);
}
`,
        ),
        "plain",
        { "minor-sets": 1 },
      );
      expect(defaulted.moves[0]?.beats).toBe(8);
    });

    it("lets a member close over the group's parameter", () => {
      const time = once(
        withModule(
          "closure",
          `use contra::{Role, swing};

group Ring {
  id: i32
  spacing: Length = 1.2m
  body {
    for i in 0..4 { rotate(90 * i) fwd(spacing) Role(Lark); }
  }
  reach = spacing * 2;
}

fn around() {
  setup { Ring(1, spacing = 1.5m); }
  assert(reach == 3.0m, "a member reads the parameter of the node it hangs on");
  swing(Role, beats = 8);
}
`,
        ),
        "around",
      );
      expect(time.diagnostics).toEqual([]);
      expect(time.moves).toHaveLength(4);
    });
  });

  describe("the events", () => {
    it("complains when an assign names no place and nothing caught it", () => {
      const time = once(
        withModule(
          "nowhere",
          `use contra::{Role, Couple, swing};
use becket::{MajorSet, MinorSet};

fn nowhere(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  assign(MinorSet = 99);
  swing(partner, beats = 8);
}
`,
        ),
        "nowhere",
        { "minor-sets": 2 },
      );
      expect(time.diagnostics[0]?.code).toBe("L105");
    });

    it("complains when an assign names more than one", () => {
      const time = once(
        withModule(
          "everywhere",
          `use contra::{Role, Couple, swing};
use becket::{MajorSet, MinorSet};

fn everywhere(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  assign(MinorSet = _);
  swing(partner, beats = 8);
}
`,
        ),
        "everywhere",
        { "minor-sets": 3 },
      );
      expect(time.diagnostics[0]?.code).toBe("L106");
      expect(time.diagnostics[0]?.message).toContain("3 places");
    });

    it("complains when one! does not name one", () => {
      // The triple minor's progression is a spike's worth and empties a place;
      // the dancer left beside it has no neighbor to name.
      const program = fixtures();
      const dance = findDance(program, "down-the-hall")!;
      const args = hallFacts({ "minor-sets": 3 });
      const tree = buildTree(program, dance, args).tree;
      runDance(program, tree, dance, args, { time: 1, firstTime: true });
      const second = runDance(program, tree, dance, args, { time: 2 });
      expect(second.diagnostics[0]?.code).toBe("L104");
      expect(second.diagnostics[0]?.message).toContain("got 0");
    });
  });

  it("reads the relations of where a dancer stands now, not where it started", () => {
    // Butter's only event is the progression at beat 0, and the swing at beat
    // 8 is with the *new* neighbour — the whole point of a live read (§9).
    const program = fixtures();
    const dance = findDance(program, "butter")!;
    const args = hallFacts({ "minor-sets": 3 });
    const tree = buildTree(program, dance, args).tree;
    runDance(program, tree, dance, args, { time: 1, firstTime: true });
    const second = runDance(program, tree, dance, args, { time: 2 });
    expect(partners(second, "0-1L")).toEqual(["2-2R", "0-1R", "0-1R"]);
  });

  it("prints a time through", () => {
    const time = once(fixtures(), "butter", { "minor-sets": 1 });
    expect(printTime(time)).toMatchSnapshot();
  });
});
