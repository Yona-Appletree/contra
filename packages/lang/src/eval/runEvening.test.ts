import { describe, expect, it } from "vitest";
import { findDance } from "./buildTree.js";
import { fixtures, withModule } from "./fixtures.js";
import type { Program } from "./loadForEval.js";
import { printTimeline } from "./printTimeline.js";
import { printTree } from "./printTree.js";
import type { EveningResult } from "./runEvening.js";
import { hallFacts, runEvening } from "./runEvening.js";
import { placesUnder, shortPath } from "./tree.js";

function evening(
  program: Program,
  name: string,
  times: number,
  facts: Record<string, number> = {},
): EveningResult {
  const dance = findDance(program, name);
  if (dance === undefined) throw new Error(`no dance called ${name}`);
  return runEvening(program, dance, { times, args: hallFacts(facts) });
}

/** Who is standing where, as a map a test can read out loud. */
const membership = (result: EveningResult): Record<string, string> =>
  Object.fromEntries(result.tree.dancers.map((dancer) => [dancer.id, shortPath(dancer.at)]));

/**
 * Nobody shares a place, everybody is in one, and no minor set is left half
 * full. On the half-couple lattice (M8) half the places are empty at any
 * moment — they are the parity the hall is about to progress on to — so what
 * is checked is that a set holds four dancers or none, never a couple with
 * nobody across from them.
 */
function everyPlaceHoldsOne(result: EveningResult): void {
  expect(new Set(result.tree.dancers.map((dancer) => dancer.at)).size).toBe(
    result.tree.dancers.length,
  );
  for (const dancer of result.tree.dancers)
    expect(dancer.at.place, `${dancer.id} stands at ${dancer.at.path}`).toBe(true);
  for (const set of result.tree.nodes.filter((node) => node.kind === "MinorSet")) {
    const filled = placesUnder(set).filter((place) => place.occupant !== undefined).length;
    expect([0, 4], `${set.label} holds ${String(filled)}`).toContain(filled);
  }
}

describe("runEvening", () => {
  // Acceptance item 1: becket at one, two and three sets.
  describe("becket progresses", () => {
    for (const sets of [1, 2, 3]) {
      it(`at ${String(sets)} ${sets === 1 ? "set" : "sets"}, with every place still holding one`, () => {
        const result = evening(fixtures(), "butter", 5, { "minor-sets": sets });
        expect(result.diagnostics).toEqual([]);
        expect(result.times).toHaveLength(5);
        everyPlaceHoldsOne(result);
        // One event per dancer per progression, and the first time does not
        // progress at all: Butter's A1 takes the eight for the circle.
        expect(result.times[0]?.events).toEqual([]);
        for (const time of result.times.slice(1))
          expect(time.events).toHaveLength(result.tree.dancers.length);
      });
    }

    /**
     * The ruling (G1, 2026-09-18: "you slide 1/2 couple over") as a number.
     * Every progression walks a couple **one dancer place, 0.8 m**, along its
     * own line, and the couples waiting at the ends walk the same 0.8 m in on
     * to the parity the rest of the hall is progressing on to — which is what
     * `MinorSet = first` and `MinorSet = last` name, because the ends of the
     * lattice are free on exactly the beats somebody is waiting to come in on
     * them. The only longer walk is the crossing over at the end of the line,
     * where a couple changes sides and its two dancers trade places along it.
     */
    it("slides each line one dancer place, the ends in on the free parity", () => {
      for (const sets of [1, 2, 3]) {
        const result = evening(fixtures(), "butter", 5, { "minor-sets": sets });
        const commits = result.snapshots.filter((snapshot) => snapshot.at === "commit");
        expect(commits.length).toBe(4);
        let previous = result.snapshots[0]!;
        let lastParity: number | undefined;
        for (const commit of commits) {
          const before = new Map(previous.positions.map((p) => [p.dancer, p]));
          const ids: number[] = [];
          for (const position of commit.positions) {
            const set = /MinorSet\((\d+)\)/.exec(position.place) ?? undefined;
            const was = before.get(position.dancer)!;
            const walked = Math.hypot(position.x - was.x, position.y - was.y);
            if (set === undefined) {
              // Out at an end, which is the crossing over: the lark walks
              // straight across the set (1.28 m) and the robin crosses and
              // trades sides with him along the line as well (2.05 m).
              expect([1280, 2049], `${position.dancer} out`).toContain(Math.round(walked));
              continue;
            }
            ids.push(Number(set[1]));
            expect(Math.round(walked), `${position.dancer} walked`).toBe(800);
          }
          // Every set in the hall is on one parity, and it is the other one
          // from the beat before: the hall slides on to the places between.
          const parities = new Set(ids.map((id) => id % 2));
          expect(parities.size, ids.join(",")).toBe(1);
          const parity = [...parities][0]!;
          if (lastParity !== undefined) expect(parity).not.toBe(lastParity);
          lastParity = parity;
          previous = commit;
        }
      }
    });

    it("puts everybody in their place after two times through three sets", () => {
      const result = evening(fixtures(), "butter", 2, { "minor-sets": 3 });
      // One progression, and it moves every couple one place along the
      // lattice: the odd sets empty on to the even ones, the two waiting
      // couples come in at the ends, and the hall dances four sets (M8).
      expect(membership(result)).toEqual({
        "OT-1L": "Station(In)/MinorSet(0)/Couple(Ones)/Role(Lark)",
        "OT-1R": "Station(In)/MinorSet(0)/Couple(Ones)/Role(Robin)",
        "1-1L": "Station(In)/MinorSet(2)/Couple(Ones)/Role(Lark)",
        "1-1R": "Station(In)/MinorSet(2)/Couple(Ones)/Role(Robin)",
        "1-2L": "Station(In)/MinorSet(0)/Couple(Twos)/Role(Lark)",
        "1-2R": "Station(In)/MinorSet(0)/Couple(Twos)/Role(Robin)",
        "3-1L": "Station(In)/MinorSet(4)/Couple(Ones)/Role(Lark)",
        "3-1R": "Station(In)/MinorSet(4)/Couple(Ones)/Role(Robin)",
        "3-2L": "Station(In)/MinorSet(2)/Couple(Twos)/Role(Lark)",
        "3-2R": "Station(In)/MinorSet(2)/Couple(Twos)/Role(Robin)",
        "5-1L": "Station(In)/MinorSet(6)/Couple(Ones)/Role(Lark)",
        "5-1R": "Station(In)/MinorSet(6)/Couple(Ones)/Role(Robin)",
        "5-2L": "Station(In)/MinorSet(4)/Couple(Twos)/Role(Lark)",
        "5-2R": "Station(In)/MinorSet(4)/Couple(Twos)/Role(Robin)",
        "OB-2L": "Station(In)/MinorSet(6)/Couple(Twos)/Role(Lark)",
        "OB-2R": "Station(In)/MinorSet(6)/Couple(Twos)/Role(Robin)",
      });
    });

    it("waits the couple the hall started at the ends with, for a whole time through", () => {
      const result = evening(fixtures(), "butter", 4, { "minor-sets": 3 });
      const waits = result.times.map((time) =>
        time.moves
          .filter((move) => move.ir === "wait-out")
          .map((move) => `${move.dancer} ${String(move.start)}+${String(move.beats)}`),
      );
      // Time 1 does not progress, so the couples setup left at the ends have
      // nothing to enter on and wait the whole of it.
      expect(waits[0]).toEqual(["OT-1L 0+64", "OT-1R 0+64", "OB-2L 0+64", "OB-2R 0+64"]);
      // Time 2's progression brings them in and carries **nobody** out: on
      // the half-couple lattice the ends come in on the parity the hall is
      // moving on to, and that time it dances one more set than it had.
      expect(waits[1]).toEqual([]);
      // Time 3's puts a couple out at each end, and each waits what is left
      // of that time from the shift it had already begun (D4).
      expect(waits[2]).toEqual(["1-2L 2+62", "1-2R 2+62", "5-1L 2+62", "5-1R 2+62"]);
    });

    it("dances the couple that enters on the progression, the time it enters", () => {
      const result = evening(fixtures(), "butter", 4, { "minor-sets": 3 });
      // 1-2 goes out at the top of time 3, waits the rest of it, and comes back
      // in on time 4's own beat 0 — and then dances all sixty-four beats of
      // time 4, shift and all, rather than watching it from a place it has left.
      expect(result.times[3]?.events.filter((event) => event.dancer === "1-2L")).toEqual([
        {
          dancer: "1-2L",
          beat: 0,
          from: "Station(OutTop)/Couple(Ones)/Role(Lark)",
          to: "Station(In)/MinorSet(0)/Couple(Ones)/Role(Lark)",
        },
      ]);
      expect(result.times[3]?.inDancers).toContain("1-2L");
      expect(
        result.times[3]?.moves.filter((move) => move.dancer === "1-2L").map((move) => move.ir),
      ).toEqual(["shift", "circle", "swing", "long-lines", "chain", "hey", "balance", "swing"]);
    });

    it("never asks a dancer to swing somebody who is waiting out", () => {
      const result = evening(fixtures(), "butter", 7, { "minor-sets": 3 });
      for (const time of result.times) {
        const waiting = new Set(time.outDancers);
        const partnered = time.moves.flatMap((move) =>
          move.args.filter((arg) => arg.name === "with" || arg.name === "to").map((a) => a.value),
        );
        // A dancer that went out mid-time may still have been named by the
        // moves it danced before the progression; nobody may be named after it.
        // The out couple's own `wait-out` names its partner — who is of course
        // also waiting out — so what is being asked here is only what the
        // dancers still *in* the dance say.
        const asked = time.moves
          .filter((move) => move.start >= 2 && !waiting.has(move.dancer))
          .flatMap((move) =>
            move.args.filter((arg) => arg.name === "with" || arg.name === "to").map((a) => a.value),
          );
        expect(partnered.length).toBeGreaterThan(0);
        expect(asked.filter((name) => waiting.has(name))).toEqual([]);
      }
    });
  });

  // Acceptance item 2: the same names as becket behind `use`, a different floor.
  describe("improper", () => {
    const dance = `use contra::{Role, Couple, balance, swing};
use improper::{MajorSet, MinorSet};

fn cross-over(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
  card "Cross over";
  balance(neighbor, beats = 4);
  swing(neighbor, beats = 12);
  progress();
  swing(partner, beats = 16);
}
`;

    it("lays its own floor under the same names, and progresses on it", () => {
      const program = withModule("cross-over", dance);
      const result = evening(program, "cross-over", 2, { "minor-sets": 2 });
      expect(result.diagnostics).toEqual([]);
      everyPlaceHoldsOne(result);
      expect(printTree(result.tree)).toMatchSnapshot();
    });

    it("sends a couple out on the other side of the line: the crossing over", () => {
      const program = withModule("cross-over", dance);
      const result = evening(program, "cross-over", 2, { "minor-sets": 2 });
      const leaving = result.times[1]?.events
        .filter((event) => !event.to.startsWith("Station(In)"))
        .map((event) => `${event.dancer} ${event.to}`);
      expect(leaving).toEqual([
        "1-2L Station(OutTop)/Couple(Ones)/Role(Lark)",
        "1-2R Station(OutTop)/Couple(Ones)/Role(Robin)",
        "3-1L Station(OutBottom)/Couple(Twos)/Role(Lark)",
        "3-1R Station(OutBottom)/Couple(Twos)/Role(Robin)",
      ]);
      // Improper's waiting couples stand *in* the line and face the way they
      // will dance when they come back; becket's wait beside it.
      const stations = result.tree.nodes.filter(
        (node) => node.kind === "Station" && node.idLabel !== "In",
      );
      expect(stations.map((node) => [node.idLabel, node.frame.x, node.frame.heading])).toEqual([
        ["OutTop", 0, 0],
        ["OutBottom", 0, 180],
      ]);
    });
  });

  // Acceptance item 5: Butter, seven times through, three sets.
  it("runs Butter seven times through three sets with nothing to say", () => {
    const result = evening(fixtures(), "butter", 7, { "minor-sets": 3 });
    expect(result.diagnostics).toEqual([]);
    expect(result.times.map((time) => time.length)).toEqual([64, 64, 64, 64, 64, 64, 64]);
    expect(result.times[0]?.firstTime).toBe(true);
    expect(result.times[6]?.lastTime).toBe(true);
    everyPlaceHoldsOne(result);
    expect(printTimeline(result)).toMatchSnapshot();
  });

  // The kinetics-on-lang plan, M3: Robins on a Wire, whose progression is
  // mid-dance (beat 16), whose ends are in the dance, and whose end robin
  // balances the long wave with one hand (notes D8, D10).
  describe("Robins on a Wire", () => {
    for (const sets of [2, 3, 4]) {
      it(`at ${String(sets)} sets, seven times, with nothing to say`, () => {
        const result = evening(fixtures(), "robins-on-a-wire", 7, { "minor-sets": sets });
        expect(result.diagnostics).toEqual([]);
        expect(result.times.map((time) => time.length)).toEqual([64, 64, 64, 64, 64, 64, 64]);
        everyPlaceHoldsOne(result);
        result.times.forEach((time, index) => {
          // One commit per time through, at A2's shift, everybody moving.
          expect(time.events.every((event) => event.beat === 16)).toBe(true);
          expect(time.events).toHaveLength(result.tree.dancers.length);
          // The ends take turns on the lattice (M8): the odd times through
          // bring the waiting couples in at 16 — they wait out the beats
          // before — and the even ones put a couple out at each end at 16.
          const entrants = time.moves.filter(
            (move) => move.ir === "wait-out" && move.start === 0 && move.beats === 16,
          );
          expect(entrants).toHaveLength(index % 2 === 0 ? 4 : 0);
          expect(time.outDancers).toHaveLength(index % 2 === 0 ? 0 : 4);
          // At each end of a wave a dancer's far hand is nobody, and it is
          // never a diagnostic: two robins in A2, two larks in B1, and one
          // more of each on the times the hall is one set longer.
          const oneHanded = time.moves.filter(
            (move) =>
              move.ir === "balance-wave" &&
              move.args.some(
                (arg) => (arg.name === "right" || arg.name === "left") && arg.value === "[]",
              ),
          );
          expect(oneHanded.length).toBeGreaterThanOrEqual(4);
          expect(oneHanded.length).toBeLessThanOrEqual(6);
        });
      });
    }
  });

  // Acceptance item 7: two dances composed, and two that do not compose.
  describe("a medley", () => {
    it("runs two Butters on one floor, one after the other", () => {
      const result = evening(fixtures(), "two-butters", 1, { "minor-sets": 3 });
      expect(result.diagnostics).toEqual([]);
      expect(result.times[0]?.length).toBe(128);
      // Each dance counts its own beats from where it starts, so the second
      // Butter's `phrase(A1)` is right at beat 64.
      expect(result.times[0]?.cards.map((card) => [card.beat, card.text])).toEqual([
        [0, "Two butters"],
        [0, "Butter"],
        [64, "Butter"],
      ]);
      expect(
        result.times[0]?.moves.filter((move) => move.dancer === "1-1L").map((move) => move.start),
      ).toEqual([0, 8, 16, 24, 32, 48, 52, 64, 72, 80, 88, 96, 112, 116]);
    });

    it("refuses a becket dance on an improper floor", () => {
      const result = evening(fixtures(), "mismatch", 1, { "minor-sets": 3 });
      expect(result.diagnostics[0]?.code).toBe("L107");
      expect(result.diagnostics[0]?.message).toContain("becket::MajorSet");
      expect(result.diagnostics[0]?.message).toContain("improper::MajorSet");
    });
  });

  it("records where everybody stood at every commit", () => {
    const result = evening(fixtures(), "butter", 2, { "minor-sets": 2 });
    expect(result.snapshots.map((snapshot) => [snapshot.at, snapshot.time, snapshot.beat])).toEqual(
      [
        ["setup", 0, 0],
        ["commit", 2, 0],
      ],
    );
    const first = result.snapshots[0]?.positions.find((position) => position.dancer === "1-1L");
    expect(first).toEqual({
      dancer: "1-1L",
      place: "Station(In)/MinorSet(1)/Couple(Ones)/Role(Lark)",
      // Becket's ones stand on the line at x = -0.64m facing across it
      // (heading 270 = +x), so the lark is 0.4m along the line from the
      // couple's centre: side by side with the robin, not across from them.
      x: -640,
      y: 400,
      heading: 270,
    });
  });
});
