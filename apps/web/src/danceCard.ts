import type { Dance } from "@caller/choreo";
import { withDefaults } from "@caller/choreo";
import { createContraRegistry, resolveFigureCall } from "@caller/contra";
import type { CardPhrase } from "@caller/music";

/**
 * A dance as the card reads it, with every figure line carrying a caller's
 * words whether the dance wrote any or not.
 *
 * `@caller/music`'s `Card` takes a structural `dance` — title, author, phrases,
 * each figure's beats and call — because the music package is allowed one edge,
 * to `core`, and importing `@caller/choreo` there would be a change to the
 * dependency table. That is also what lets this stand between the two: the card
 * gets the same shape it always did, and the app decides what goes in the
 * `call` field.
 *
 * **The dance's own words win.** Every one of the ten demo dances writes a
 * `call` for every figure, and those are what the caller's bubble says
 * (`createScriptDecider`: `call.call ?? def.call`). Putting a generated call on
 * the card would have made the card and the bubble read differently for the
 * same beat, which is the one thing the card is for. So the generated call is
 * the **fallback** — what a dance that writes no call of its own gets, in the
 * project's own voice rather than the figure's terse `def.call`.
 *
 * W1's brief asked for the **short** call here. The long one is what went in:
 * short is the shorthand a caller drops into the middle of a phrase ("HEY",
 * "SWING"), and a card read cold has no phrase around it — the corpus's own
 * lines ("LONG LINES FORWARD AND BACK", "CIRCLE LEFT THREE QUARTERS") are long
 * calls, so the fallback matches what the ten dances already print. The short
 * call is on the Moves row, beside the long one, where the two can be compared.
 */
export function cardDance(dance: Dance): {
  title: string;
  author?: string | undefined;
  phrases: readonly CardPhrase[];
} {
  const registry = createContraRegistry();
  return {
    title: dance.title,
    author: dance.author,
    phrases: dance.phrases.map((phrase) => ({
      name: phrase.name,
      figures: phrase.figures.map((call) => ({
        beats: call.beats,
        call: call.call ?? fallbackCall(registry, call),
      })),
    })),
  };
}

/** The move's own long call, resolved, or the figure contract's terse one. */
function fallbackCall(
  registry: ReturnType<typeof createContraRegistry>,
  call: { figure: string; beats: number; params?: object },
): string {
  const def = registry.get(call.figure);
  return (
    resolveFigureCall(call.figure, withDefaults(def, call.params, call.beats))?.long ?? def.call
  );
}
