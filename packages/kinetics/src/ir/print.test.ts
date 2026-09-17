import { describe, expect, it } from "vitest";
import { allemande } from "../figures/allemande.js";
import { bow } from "../figures/bow.js";
import { doSiDo } from "../figures/doSiDo.js";
import { printFigure } from "./print.js";

/**
 * These are the blocks the debugger's Source pane shows beneath the program
 * when a call is lit, so a change to one of them is a change to what the user
 * reads at the gate — not a formatting detail. Read the diff before accepting
 * it.
 */
describe("printFigure", () => {
  it("prints the bow's authored assembly", () => {
    expect(printFigure(bow)).toMatchInlineSnapshot(`
      "bow  4 beats (min 4)
      pre   facing partner · hands free · apart 14–24 px
      body  intrinsic
            beat 0  stand · look partner · lean 25°
            beat 0½ look down
            beat 1  stand · lean 25°
            beat 2  stand · lean 0° · look partner
            beat 3  stand
      look  partner 0–0.5 · down 0.5–2 · partner 2–4
      post  facing partner · hands free · apart 14–24 px"
    `);
  });

  it("prints the do-si-do", () => {
    expect(printFigure(doSiDo)).toMatchInlineSnapshot(`
      "do-si-do  8 beats (min 6)
      pre   facing partner · hands free · apart 14–24 px
      body  orbit midpoint · 1 turn · partner on right · facing fixed · r 10 px · ≤ 0.25 turn/beat
      look  partner, else ahead
      post  facing partner · hands free · apart 14–24 px"
    `);
  });

  it("prints a right-hand allemande", () => {
    expect(printFigure(allemande, { hand: "right", amount: 1, beats: 8 })).toMatchInlineSnapshot(`
      "allemande(right)  8 beats (min 4)
      pre   facing partner · right hands within reach · hold allemande-R right with partner
      body  orbit hands · 1 turn · partner on right · facing tangent · r 7 px · ≤ 0.25 turn/beat
      look  partner
      post  facing partner · hands free · apart 14 px"
    `);
  });

  it("prints a left-hand allemande, a turn and a half in six beats", () => {
    expect(printFigure(allemande, { hand: "left", amount: 1.5, beats: 6 })).toMatchInlineSnapshot(`
      "allemande(left, 1.5, 6)  6 beats (min 4)
      pre   facing partner · left hands within reach · hold allemande-L left with partner
      body  orbit hands · 1.5 turns · partner on left · facing tangent · r 7 px · ≤ 0.25 turn/beat
      look  partner
      post  facing partner · hands free · apart 14 px"
    `);
  });
});
