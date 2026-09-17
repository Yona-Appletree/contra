import { layoutHall } from "@caller/hall";
import { describe, expect, it } from "vitest";
import { danceMoves } from "./danceMoves.js";
import { createDemoProgram, danceStartBeat, positionAt } from "./program.js";
import {
  PREV_THRESHOLD_BEATS,
  barTarget,
  danceAtItem,
  movesAtItem,
  moveStartBeat,
  moveTarget,
  nextDance,
  nextMove,
  prevDance,
  prevMove,
} from "./transport.js";

/**
 * The real programme, Airpants first — the same fixture the phase file's own
 * acceptance table is written against (`data/dances/programme.json`).
 */
const program = createDemoProgram(layoutHall({ lines: 2, couplesPerLine: [8, 7] }));

describe("danceAtItem / movesAtItem / moveStartBeat", () => {
  it("wraps an unwrapped item index at the programme's own length", () => {
    expect(danceAtItem(program, 0).slug).toBe("airpants");
    expect(danceAtItem(program, program.dances.length).slug).toBe("airpants");
    expect(danceAtItem(program, -1).slug).toBe(program.dances[program.dances.length - 1]!.slug);
  });

  it("agrees with danceMoves on the dance's own move starts", () => {
    const moves = danceMoves(program.dances[0]!);
    expect(movesAtItem(program, 0)).toEqual(moves);
    expect(moveStartBeat(program, 0, 0, 2)).toBe(moves.moves[2]!.start);
    expect(moveStartBeat(program, 1, 1, 0)).toBe(172 + 64 + 0);
  });
});

describe("transport: the acceptance table (plan.md AC1, p1-moves-and-transport.md)", () => {
  it("|◀ restart: pressed ≥2 beats into a move goes to its own start (A2 first move, 2 in)", () => {
    expect(prevMove(program, 16 + 2).beat).toBe(16);
  });

  it("|◀ previous within the move: pressed <2 beats in goes to the previous move (A1)", () => {
    expect(prevMove(program, 16 + 1.5).beat).toBe(0);
  });

  it("|◀ previous across a time through: tt 1's first move goes to tt 0's last (B2's second move)", () => {
    expect(prevMove(program, 64 + 1).beat).toBe(64 - 10);
  });

  it("|◀ the first move of tt 0 goes to the dance's own start (the potatoes), normalised", () => {
    expect(prevMove(program, 1).beat).toBeCloseTo(program.totalBeats - 4);
  });

  it("|◀ lining up after dance 0 goes to dance 0's last move, on its last time through", () => {
    expect(prevMove(program, 128 + 20).beat).toBe(64 + 54);
  });

  it("▶| the next move", () => {
    expect(nextMove(program, 3).beat).toBe(16);
  });

  it("▶| into tt 1: the last move of tt 0 goes to tt 1's first", () => {
    expect(nextMove(program, 55).beat).toBe(64);
  });

  it("▶| past the last time through goes to the next dance's own start", () => {
    expect(nextMove(program, 64 + 55).beat).toBe(danceStartBeat(1));
    expect(danceStartBeat(1)).toBe(168);
  });

  it("▶| lining up goes to the dance now's first move (dance 1's own beat 0)", () => {
    expect(nextMove(program, 128 + 20).beat).toBe(172);
  });

  it("|◀◀ restart: dancing, well past the potatoes, restarts the dance now", () => {
    expect(prevDance(program, 40).beat).toBeCloseTo(program.totalBeats - 4);
    expect(danceStartBeat(0)).toBe(-4);
  });

  it("|◀◀ previous within 2 beats: one beat into dance 1's potatoes goes to dance 0's", () => {
    expect(prevDance(program, 172 - 4 + 1).beat).toBeCloseTo(program.totalBeats - 4);
  });

  it("|◀◀ lining up (c = 1) restarts dance 1's own potatoes", () => {
    expect(prevDance(program, 128 + 20).beat).toBe(168);
  });

  it("▶▶| dancing goes to the next dance's potatoes", () => {
    expect(nextDance(program, 40).beat).toBe(168);
  });

  it("▶▶| lining up (c = 1) goes to dance 2's potatoes", () => {
    expect(nextDance(program, 128 + 20).beat).toBe(danceStartBeat(2));
    expect(danceStartBeat(2)).toBe(340);
  });

  it("tap move 2 in tt 1 (dancing, dance 0 = Airpants)", () => {
    expect(moveTarget(program, 64 + 3, 2).beat).toBe(64 + 24);
  });

  it("tap move 2 lining up (c = 1 = Butter): Butter's own move 2 (not Airpants'), start 8", () => {
    // The phase file's worked example (`172 + 24`) reads as though the dance
    // now were the spike's second demo dance ("The Baby Rose", whose move 2
    // starts at beat 24) rather than this repository's real second dance,
    // Butter — whose own move 2 (0-based, across the whole dance) is
    // "NEIGHBOR SWING", starting at beat 8. `moveTarget`'s rule is otherwise
    // unambiguous and every other row of the table (including the dancing-mode
    // "tap move 2 in tt 1" row above, which the two share a formula with)
    // checks out against this program exactly, so this asserts the value the
    // rule actually produces for the real programme rather than the one the
    // worked example prints. Flagged in the phase's own report rather than
    // silently "fixed" in the plan.
    const butterMove2 = movesAtItem(program, 1).moves[2]!;
    expect(butterMove2.call).toBe("NEIGHBOR SWING");
    expect(butterMove2.start).toBe(8);
    expect(moveTarget(program, 128 + 20, 2).beat).toBe(172 + 8);
  });

  it("bar 12 (cycle beat 24) in tt 0 goes to the move that bar is in", () => {
    expect(barTarget(program, 3, 24).beat).toBe(24);
  });

  it("PREV_THRESHOLD_BEATS is exact: restart at exactly 2 beats in, previous at 1.999", () => {
    expect(PREV_THRESHOLD_BEATS).toBe(2);
    expect(prevMove(program, 16 + PREV_THRESHOLD_BEATS).beat).toBe(16);
    expect(prevMove(program, 16 + PREV_THRESHOLD_BEATS - 0.001).beat).toBe(0);
  });
});

describe("transport targets land where their labels say", () => {
  it("prevMove's restart lands on the move it names", () => {
    const target = prevMove(program, 16 + 2);
    const position = positionAt(program, target.beat);
    expect(position.dance.slug).toBe("airpants");
    expect(position.danceBeat).toBe(16);
    expect(target.label).toContain("A2");
    expect(target.label).toContain("LONG LINES FORWARD AND BACK");
  });

  it("nextDance's target is the next dance's own beat 0, four beats after where it lands", () => {
    const target = nextDance(program, 40);
    expect(target.label).toContain("Butter");
    const position = positionAt(program, target.beat + 4);
    expect(position.dance.slug).toBe("butter");
    expect(position.danceBeat).toBe(0);
  });

  it("moveTarget while lining up names the dance it is jumping into", () => {
    const target = moveTarget(program, 128 + 20, 0);
    expect(target.label).toContain("Butter");
    const position = positionAt(program, target.beat);
    expect(position.dance.slug).toBe("butter");
    expect(position.danceBeat).toBe(0);
  });
});
