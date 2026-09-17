import { ALL_DANCES, DEMO_DANCES } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { danceMoves, moveAt } from "./danceMoves.js";

const airpants = DEMO_DANCES.find((d) => d.slug === "airpants")!;
const fatalAttraction = ALL_DANCES.find((d) => d.slug === "fatal-attraction")!;

describe("danceMoves", () => {
  it("lays Airpants' six moves end to end: A1 16 / A2 8+8 / B1 16 / B2 6+10", () => {
    const moves = danceMoves(airpants);
    expect(moves.title).toBe("Airpants");
    expect(moves.author).toBe("Lisa Greenleaf");
    expect(moves.cycleBeats).toBe(64);
    expect(moves.moves.map((m) => m.start)).toEqual([0, 16, 24, 32, 48, 54]);
    expect(moves.moves.map((m) => m.beats)).toEqual([16, 8, 8, 16, 6, 10]);
    expect(moves.moves.map((m) => m.phrase)).toEqual(["A1", "A2", "A2", "B1", "B2", "B2"]);
    expect(moves.moves.map((m) => m.index)).toEqual([0, 1, 2, 3, 4, 5]);
    // Every move's phraseIndex/figureIndex says where it sits within its own phrase.
    expect(moves.moves.map((m) => [m.phraseIndex, m.figureIndex])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 0],
      [3, 0],
      [3, 1],
    ]);
    // The caller's own words at the notecard's register (M13, D31): two
    // beats of them, which is what a card glanced at while the band plays
    // wants — and the whole sentence beside them for the popup to quote.
    expect(moves.moves[0]!.call).toBe("BALANCE AND SWING");
    expect(moves.moves[0]!.fullCall).toBe("WITH YOUR NEIGHBOR BALANCE AND SWING");
    expect(moves.moves[1]!.call).toBe("LONG LINES");
    expect(moves.moves[1]!.fullCall).toBe("LONG LINES FORWARD AND BACK");
    // No dance in the demo corpus has a `while` branch on Airpants — every move's
    // `with` is empty, not merely absent, so a reader never has to check for it.
    for (const move of moves.moves) expect(move.with).toEqual([]);
  });

  it("groups the moves back up by phrase, in phrase order", () => {
    const moves = danceMoves(airpants);
    expect(moves.phrases.map((p) => p.name)).toEqual(["A1", "A2", "B1", "B2"]);
    expect(moves.phrases.map((p) => p.moves.length)).toEqual([1, 2, 1, 2]);
    // The grouped moves are the same objects as the flat list, not copies.
    expect(moves.phrases[1]!.moves).toEqual(moves.moves.slice(1, 3));
  });

  it("carries a figure's own id and params, for the popup and the transport's labels", () => {
    const moves = danceMoves(airpants);
    const allemande = moves.moves[2]!;
    expect(allemande.figure).toBe("allemande");
    // `danceFromFile` threads a `from` place onto some params at load time
    // (the dance record's own doc comment on `startPlaces`), so this checks
    // the written fields rather than the whole object.
    expect(allemande.params).toMatchObject({ pairs: [["1R", "2R"]], hand: "R", amount: 1.5 });
  });

  it("Fatal Attraction's two-beat cast-back carries its one `‖` branch", () => {
    const moves = danceMoves(fatalAttraction);
    const castBack = moves.moves.find((m) => m.figure === "cast-back")!;
    expect(castBack.beats).toBe(2);
    expect(castBack.with).toHaveLength(1);
    // The branch wrote no call of its own, so it falls back to the dance-local
    // figure's own resolved text, in the same voice as every other fallback.
    expect(castBack.with[0]).toBe(castBack.with[0]!.toUpperCase());
    expect(castBack.call).toBe("CAST BACK");
    expect(castBack.with).toEqual(["GO FORWARD"]);
    // The whole sentence is the dance's own flourish, written as one line.
    expect(castBack.fullCall).toBe("ROBINS CAST BACK, LARKS GO FORWARD");
  });
});

describe("moveAt", () => {
  const moves = danceMoves(airpants);

  it("finds the move a cycle beat falls in", () => {
    expect(moveAt(moves, 0)!.phrase).toBe("A1");
    expect(moveAt(moves, 16)!.phrase).toBe("A2");
    expect(moveAt(moves, 16)!.figureIndex).toBe(0);
  });

  it("is exact at the boundary: beat 16 is A2's first move, 15.99 is still A1's", () => {
    expect(moveAt(moves, 16)!.start).toBe(16);
    expect(moveAt(moves, 15.99)!.start).toBe(0);
  });

  it("is undefined at and past the end of the cycle", () => {
    expect(moveAt(moves, 64)).toBeUndefined();
    expect(moveAt(moves, 64.5)).toBeUndefined();
  });

  it("is undefined before the cycle starts", () => {
    expect(moveAt(moves, -0.5)).toBeUndefined();
  });
});
