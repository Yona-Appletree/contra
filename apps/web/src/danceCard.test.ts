import { DEMO_DANCES, callTexts, callingCard } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { NOTE_CARD_BUDGET, cardDance } from "./danceCard.js";

/**
 * The card and the caller have to say the same thing on the same beat, or the
 * card is worse than no card. Since M13 they are one computation — the card is
 * `callTexts` at one register and the bubble is `callScript` along a time
 * through — so what is tested here is that the card really reads it rather than
 * keeping a second list of its own.
 */
describe("the dance card's figure lines", () => {
  it.each(DEMO_DANCES.map((d) => d.slug))("%s says what the caller says", (slug) => {
    const dance = DEMO_DANCES.find((d) => d.slug === slug)!;
    const card = cardDance(dance);
    expect(card.title).toBe(dance.title);
    expect(card.phrases.map((p) => p.name)).toEqual(dance.phrases.map((p) => p.name));

    const said = callTexts(dance, NOTE_CARD_BUDGET);
    let index = 0;
    for (const [i, phrase] of dance.phrases.entries()) {
      for (const [j, call] of phrase.figures.entries()) {
        const line = card.phrases[i]!.figures[j]!;
        expect(line.beats).toBe(call.beats);
        expect(line.call, `${slug} ${phrase.name} ${call.figure}`).toBe(said[index++]!.text);
        // Never a `{slot}`, never empty: a card with a hole in it is worse than
        // no card.
        expect(line.call, `${slug} ${phrase.name} ${call.figure}`).not.toContain("{");
        expect((line.call ?? "").length).toBeGreaterThan(0);
      }
    }
  });

  it("prints one line per figure at the short register, whatever the caller says", () => {
    // Butter's slide is two beats, so the **caller** says it and the circle
    // together; the card still has a line for each, which is the difference
    // between something read and something heard. And the card's own register
    // is the short form (D31): "NEIGHBOR SWING", not "SWING YOUR NEIGHBOR".
    const butter = DEMO_DANCES.find((d) => d.slug === "butter")!;
    const card = cardDance(butter);
    expect(card.phrases[0]!.figures.map((f) => f.call)).toEqual([
      "SLIDE LEFT",
      "CIRCLE LEFT",
      "NEIGHBOR SWING",
    ]);
    const rows = callingCard(butter);
    expect(rows[0]!.byTime[0]!.text).toBe("SHIFT LEFT, CIRCLE LEFT THREE PLACES");
    expect(rows[1]!.byTime[0]!.mergedInto).toBe(0);
  });

  it("shows a flourish figure's own short form, because a flourish is the long one", () => {
    // After the Solstice writes "AND SWING" for its A1 swing, which is a
    // 4-beat flourish; at the card's own two beats the figure's own form is
    // what there is room for.
    const solstice = DEMO_DANCES.find((d) => d.slug === "after-the-solstice")!;
    expect(cardDance(solstice).phrases[0]!.figures[1]!.call).toBe("NEIGHBOR SWING");
    expect(callingCard(solstice)[1]!.byTime[0]!.text).toBe("AND SWING");
  });
});
