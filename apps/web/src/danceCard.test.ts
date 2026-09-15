import { createContraRegistry, DEMO_DANCES } from "@caller/contra";
import { withDefaults } from "@caller/choreo";
import { resolveFigureCall } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { cardDance } from "./danceCard.js";

/**
 * The card and the caller have to say the same thing on the same beat, or the
 * card is worse than no card. W1's brief: "the calls here must match what it
 * says for the ten dances — assert it."
 */
describe("the dance card's figure lines", () => {
  it.each(DEMO_DANCES.map((d) => d.slug))("%s says what the caller says", (slug) => {
    const dance = DEMO_DANCES.find((d) => d.slug === slug)!;
    const registry = createContraRegistry();
    const card = cardDance(dance);
    expect(card.title).toBe(dance.title);
    expect(card.phrases.map((p) => p.name)).toEqual(dance.phrases.map((p) => p.name));

    for (const [i, phrase] of dance.phrases.entries()) {
      for (const [j, call] of phrase.figures.entries()) {
        const line = card.phrases[i]!.figures[j]!;
        expect(line.beats).toBe(call.beats);
        // `createScriptDecider` says `call.call ?? def.call` into the bubble;
        // the card must land on the same string.
        expect(line.call, `${slug} ${phrase.name} ${call.figure}`).toBe(
          call.call ?? registry.get(call.figure).call,
        );
      }
    }
  });

  it("falls back to the move's own long call when a dance writes none", () => {
    const dance = DEMO_DANCES.find((d) => d.slug === "butter")!;
    const bare = {
      ...dance,
      phrases: dance.phrases.map((phrase) => ({
        ...phrase,
        figures: phrase.figures.map((figure) => {
          const bare = { ...figure };
          delete bare.call;
          return bare;
        }),
      })),
    };
    const card = cardDance(bare);
    const registry = createContraRegistry();
    for (const [i, phrase] of dance.phrases.entries()) {
      for (const [j, call] of phrase.figures.entries()) {
        const def = registry.get(call.figure);
        const want = resolveFigureCall(call.figure, withDefaults(def, call.params, call.beats));
        expect(card.phrases[i]!.figures[j]!.call, call.figure).toBe(want!.long);
      }
    }
    // And the fallback is a real caller's line, not a placeholder.
    expect(card.phrases[0]!.figures[1]!.call).toBe("CIRCLE LEFT THREE QUARTERS");
    expect(card.phrases[2]!.figures[0]!.call).toBe("HEY FOR FOUR");
  });
});
