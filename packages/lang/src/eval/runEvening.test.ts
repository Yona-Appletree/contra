import { describe, expect, it } from "vitest";
import { findDance } from "./buildTree.js";
import { fixtures, withModule } from "./fixtures.js";
import type { Program } from "./loadForEval.js";
import { printTimeline } from "./printTimeline.js";
import { printTree } from "./printTree.js";
import type { EveningResult } from "./runEvening.js";
import { hallFacts, runEvening } from "./runEvening.js";
import { shortPath } from "./tree.js";

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

/** Every place holds one dancer, and every dancer is in a place. */
function everyPlaceHoldsOne(result: EveningResult): void {
  for (const place of result.tree.places)
    expect(place.occupant, `${place.path} is empty`).toBeDefined();
  expect(new Set(result.tree.dancers.map((dancer) => dancer.at)).size).toBe(
    result.tree.dancers.length,
  );
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

    it("puts everybody in their place after two times through three sets", () => {
      const result = evening(fixtures(), "butter", 2, { "minor-sets": 3 });
      expect(membership(result)).toEqual({
        "OT-1L": "Station(In)/MinorSet(0)/Couple(Ones)/Role(Lark)",
        "OT-1R": "Station(In)/MinorSet(0)/Couple(Ones)/Role(Robin)",
        "0-1L": "Station(In)/MinorSet(1)/Couple(Ones)/Role(Lark)",
        "0-1R": "Station(In)/MinorSet(1)/Couple(Ones)/Role(Robin)",
        "0-2L": "Station(OutTop)/Couple(Ones)/Role(Lark)",
        "0-2R": "Station(OutTop)/Couple(Ones)/Role(Robin)",
        "1-1L": "Station(In)/MinorSet(2)/Couple(Ones)/Role(Lark)",
        "1-1R": "Station(In)/MinorSet(2)/Couple(Ones)/Role(Robin)",
        "1-2L": "Station(In)/MinorSet(0)/Couple(Twos)/Role(Lark)",
        "1-2R": "Station(In)/MinorSet(0)/Couple(Twos)/Role(Robin)",
        "2-1L": "Station(OutBottom)/Couple(Twos)/Role(Lark)",
        "2-1R": "Station(OutBottom)/Couple(Twos)/Role(Robin)",
        "2-2L": "Station(In)/MinorSet(1)/Couple(Twos)/Role(Lark)",
        "2-2R": "Station(In)/MinorSet(1)/Couple(Twos)/Role(Robin)",
        "OB-2L": "Station(In)/MinorSet(2)/Couple(Twos)/Role(Lark)",
        "OB-2R": "Station(In)/MinorSet(2)/Couple(Twos)/Role(Robin)",
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
      // From then on a couple goes out on the progression at beat 0 and waits
      // what is left of that time, and comes back in on the next beat 0.
      expect(waits[1]).toEqual(["0-2L 2+62", "0-2R 2+62", "2-1L 2+62", "2-1R 2+62"]);
    });

    it("dances the couple that enters on the progression, the time it enters", () => {
      const result = evening(fixtures(), "butter", 4, { "minor-sets": 3 });
      // 0-2 goes out at the top of time 2, waits the rest of it, and comes back
      // in on time 3's own beat 0 — and then dances all sixty-four beats of
      // time 3, shift and all, rather than watching it from a place it has left.
      expect(result.times[2]?.events.filter((event) => event.dancer === "0-2L")).toEqual([
        {
          dancer: "0-2L",
          beat: 0,
          from: "Station(OutTop)/Couple(Ones)/Role(Lark)",
          to: "Station(In)/MinorSet(0)/Couple(Ones)/Role(Lark)",
        },
      ]);
      expect(result.times[2]?.inDancers).toContain("0-2L");
      expect(
        result.times[2]?.moves.filter((move) => move.dancer === "0-2L").map((move) => move.ir),
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
        const asked = time.moves
          .filter((move) => move.start >= 2)
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
        "0-1L Station(OutBottom)/Couple(Twos)/Role(Lark)",
        "0-1R Station(OutBottom)/Couple(Twos)/Role(Robin)",
        "1-2L Station(OutTop)/Couple(Ones)/Role(Lark)",
        "1-2R Station(OutTop)/Couple(Ones)/Role(Robin)",
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
        result.times[0]?.moves.filter((move) => move.dancer === "0-1L").map((move) => move.start),
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
    const first = result.snapshots[0]?.positions.find((position) => position.dancer === "0-1L");
    expect(first).toEqual({
      dancer: "0-1L",
      place: "Station(In)/MinorSet(0)/Couple(Ones)/Role(Lark)",
      // Becket's ones stand on the line at x = -0.64m facing across it
      // (heading 270 = +x), so the lark is 0.4m along the line from the
      // couple's centre: side by side with the robin, not across from them.
      x: -640,
      y: 400,
      heading: 270,
    });
  });
});
