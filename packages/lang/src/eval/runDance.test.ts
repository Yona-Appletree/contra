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
    // The shift names the partner it slides with, so the second time through
    // reads: shift with the partner, swing the *new* neighbour, then the
    // partner twice.
    expect(partners(second, "0-1L")).toEqual(["0-1R", "2-2R", "0-1R", "0-1R"]);
  });

  // The pair fixture (notes D2): the floor the kinetics stack is built on, and
  // the one place a move's `ref` and `span` can be read without a progression
  // in the way.
  describe("the pair", () => {
    it("gives every argument a ref and every move a span", () => {
      const time = once(fixtures(), "fixture");
      expect(time.diagnostics).toEqual([]);
      expect(time.outDancers).toEqual([]);
      expect(time.moves.filter((move) => move.dancer === "L")).toHaveLength(6);
      expect(time.moves.filter((move) => move.dancer === "R")).toHaveLength(6);
      expect(partners(time, "L")).toEqual(["R", "R", "R", "R", "R", "R"]);

      // A `Role` argument is the person standing in the place, not the place.
      const first = time.moves.find((move) => move.dancer === "L");
      expect(first?.args.find((arg) => arg.name === "with")?.ref).toEqual({
        t: "dancer",
        id: "R",
      });
      // An enum and a number name nobody, so they carry no ref at all.
      const allemande = time.moves.find((move) => move.dancer === "L" && move.ir === "allemande");
      expect(allemande?.args.find((arg) => arg.name === "hand")?.ref).toBeUndefined();
      expect(allemande?.args.find((arg) => arg.name === "beats")?.ref).toBeUndefined();

      // Every move points back at the call that made it, in `pair.dance`.
      for (const move of time.moves) {
        expect(move.span.file).toBe("pair.dance");
        expect(move.span.end).toBeGreaterThan(move.span.start);
      }
    });

    it("leaves the solo's `with` on an empty place", () => {
      const time = once(fixtures(), "solo");
      expect(time.diagnostics).toEqual([]);
      expect(time.moves.map((move) => move.dancer)).toEqual(["L", "L", "L", "L", "L", "L"]);
      // Nobody is standing there, so the argument names the place instead —
      // which is what a consumer reads as nobody (D10).
      expect(time.moves[0]?.args.find((arg) => arg.name === "with")?.ref).toEqual({
        t: "node",
        path: "Pair(1)/Role(Robin)",
      });
    });
  });

  it("prints a time through", () => {
    const time = once(fixtures(), "butter", { "minor-sets": 1 });
    expect(printTime(time)).toMatchSnapshot();
  });

  // The kinetics-on-lang plan, M3: nobody as a `Role` value (notes D10) and
  // mid-dance admission by silent replay (D8).
  describe("nobody as a Role value (D10)", () => {
    const WAVE = `use contra::{Role, Couple, form-wave, stand};
use becket::{MajorSet, MinorSet};

fn wave(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  if (Role is Robin) { form-wave(right = wave-mate, left = opposite, beats = 2); }
  else { stand(beats = 2); }
}
`;
    const argOf = (time: TimeResult, dancer: string, name: string) =>
      time.moves.find((move) => move.dancer === dancer)?.args.find((arg) => arg.name === name);

    it("leaves the end robin's far hand on nobody, and is not a diagnostic", () => {
      const time = once(withModule("wave", WAVE), "wave", { "minor-sets": 2 });
      expect(time.diagnostics).toEqual([]);
      // The ones travel down the hall: the ones' robin of the top set has a
      // far mate below her, the twos' robin of the same set has nobody above.
      expect(argOf(time, "0-1R", "right")).toEqual({
        name: "right",
        value: "[1-2R]",
        ref: { t: "dancer", id: "1-2R" },
      });
      expect(argOf(time, "0-2R", "right")).toEqual({ name: "right", value: "[]" });
      expect(argOf(time, "1-1R", "right")).toEqual({ name: "right", value: "[]" });
      expect(argOf(time, "1-2R", "right")?.ref).toEqual({ t: "dancer", id: "0-1R" });
      // The near hand is always somebody.
      for (const robin of ["0-1R", "0-2R", "1-1R", "1-2R"])
        expect(argOf(time, robin, "left")?.ref?.t).toBe("dancer");
    });

    it("says so at the call when a Role argument names two", () => {
      const time = once(fixtures({ broken: true }), "two-partners", { "minor-sets": 1 });
      const first = time.diagnostics[0];
      expect(first?.code).toBe("L110");
      expect(first?.beat).toBe(0);
      expect(first?.dancers).toEqual(["0-1L"]);
      expect(first?.message).toBe("swing(with): 2 matched, 0-2L and 0-2R; a move takes one");
      expect(first?.span?.file).toBe("broken/two-partners.dance");
    });
  });

  describe("mid-dance admission by silent replay (D8)", () => {
    const MID = `use contra::{Role, Couple, swing, balance};
use becket::{MajorSet, MinorSet};

fn mid(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  card "Mid";
  swing(partner, beats = 16);
  progress();
  balance(neighbor, beats = 4);
  swing(neighbor, beats = 12);
}
`;

    it("admits the waiting couple at the commit that makes it addressable, live from the statement after progress()", () => {
      const time = once(withModule("mid", MID), "mid", { "minor-sets": 2 });
      expect(time.diagnostics).toEqual([]);
      expect(time.events.every((event) => event.beat === 16)).toBe(true);
      expect(time.events.map((event) => event.dancer)).toContain("OT-1L");
      // The entrant's first recorded move is the one after `progress()`,
      // read from where the commit put it: the balance with its new
      // neighbour, at beat 16 — not the swing at 0 it replayed silently.
      const recorded = time.moves
        .filter((move) => move.dancer === "OT-1R" && move.ir !== "wait-out")
        .map((move) => `${String(move.start)} ${move.ir}(${move.args[0]?.value ?? ""})`);
      expect(recorded).toEqual(["16 balance(1-2L)", "20 swing(1-2L)"]);
      // It waited out the beats before it, and the card was said by the
      // dancers who were in at beat 0 only.
      const waited = time.moves.find((move) => move.dancer === "OT-1R" && move.ir === "wait-out");
      expect([waited?.start, waited?.beats]).toEqual([0, 16]);
      expect(time.cards[0]?.dancers).not.toContain("OT-1R");
      expect(time.inDancers).toContain("OT-1R");
      // The couple the commit carried out at the bottom danced the move it
      // had already begun at 16 — read before the commit, with its old
      // neighbour — and waits out from there (D4, as Butter's shift at 2).
      const out = time.moves.find((move) => move.dancer === "1-1R" && move.ir === "wait-out");
      expect([out?.start, out?.beats]).toEqual([20, 12]);
      expect(time.length).toBe(32);
    });

    it("keeps Butter's beat-0 admission as it was: the entrant is live from its first statement", () => {
      const time = once(fixtures(), "butter", { "minor-sets": 2 }, { time: 2 });
      expect(time.diagnostics).toEqual([]);
      const entrant = time.moves.filter((move) => move.dancer === "OT-1L").map((m) => m.ir);
      expect(entrant.slice(0, 3)).toEqual(["shift", "circle", "swing"]);
      expect(entrant).not.toContain("wait-out");
    });

    it("refuses an entrant whose replay never meets a progress() at the admitting beat (L111)", () => {
      // The larks progress the set at beat 0; the robins' text says it at 8.
      // The robin waiting at the top is made addressable at 0, replays past
      // it without a `progress()` at cursor 0, and waits out instead.
      const time = once(
        withModule(
          "skew",
          `use contra::{Role, Couple, swing};
use becket::{MajorSet, MinorSet};

fn skew(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  if (Role is Lark) { progress(); swing(neighbor, beats = 16); }
  else { swing(neighbor, beats = 8); progress(); swing(neighbor, beats = 8); }
}
`,
        ),
        "skew",
        { "minor-sets": 2 },
      );
      const refused = time.diagnostics.find((d) => d.code === "L111");
      expect(refused?.dancers).toEqual(["OT-1R"]);
      expect(refused?.beat).toBe(0);
      expect(refused?.message).toBe("OT-1R entered at beat 0 but the script progresses at beat 8");
      expect(time.outDancers).toContain("OT-1R");
      expect(time.inDancers).toContain("OT-1L");
    });
  });
});
