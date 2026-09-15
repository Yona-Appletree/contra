import type { Dance } from "@caller/choreo";
import { callTexts } from "@caller/contra";
import type { CardPhrase } from "@caller/music";

/**
 * A dance as the note card reads it: one line per figure, in the caller's own
 * words at the card's own register.
 *
 * `@caller/music`'s `Card` takes a structural `dance` — title, author, phrases,
 * each figure's beats and call — because the music package is allowed one edge,
 * to `core`, and importing `@caller/choreo` there would be a change to the
 * dependency table. That is also what lets this stand between the two: the card
 * gets the same shape it always did, and the app decides what goes in the
 * `call` field.
 *
 * **The card and the caller are one computation** (M13, AC3). Until this
 * milestone the card printed the dance file's own `call` string and the bubble
 * said the same string, and the two agreed by both reading one field. Now a
 * `call` in a dance file is a **flourish** and nothing else, and everything else
 * is derived: `callTexts` is `callScript`'s own fitting rule asked for one
 * register, so the card says what the caller would say for that figure — and the
 * bubble, which is the same function read along a time through rather than down
 * the record, says it on the beat.
 *
 * The register is {@link NOTE_CARD_BUDGET} beats. A card is **read**, not heard,
 * so every figure gets its own line whether or not the caller says two of them
 * in one breath: the merging is the bubble's, not the card's.
 */
export function cardDance(dance: Dance): {
  title: string;
  author?: string | undefined;
  phrases: readonly CardPhrase[];
} {
  const said = callTexts(dance, NOTE_CARD_BUDGET);
  let index = 0;
  return {
    title: dance.title,
    author: dance.author,
    phrases: dance.phrases.map((phrase) => ({
      name: phrase.name,
      figures: phrase.figures.map((call) => {
        // **A concurrent call is one row of the card with two lines** (M8): it
        // is one figure of the phrase — the caller says one thing — and each
        // line says what one half of the hall does. `callTexts` joins the
        // branches with WHILE, so the row's own text is the whole of it and the
        // `with` lines say each half on its own.
        const whole = said[index++]!;
        const branches = (call.while ?? []).map((branch) => branch.figure);
        return {
          beats: whole.beats === 0 ? call.beats : callBeatsOf(call),
          call: whole.text,
          ...(branches.length === 0 ? {} : { with: branchTexts(whole.text) }),
        };
      }),
    })),
  };
}

/** How long a row is: the call's own beats, or its longest branch's. */
function callBeatsOf(call: { beats: number; while?: readonly { beats?: number }[] }): number {
  return (call.while ?? []).reduce(
    (longest, branch) => Math.max(longest, branch.beats ?? call.beats),
    call.beats,
  );
}

/** A concurrent call's joined text, split back into one line per branch. */
const branchTexts = (text: string): string[] => text.split(" WHILE ").slice(1);

/**
 * How many beats of words the note card prints per figure.
 *
 * A ruling rather than an accident (D31, A6): the 4-beat form is what a card
 * read cold wants — the corpus's own lines, "LONG LINES FORWARD AND BACK", are
 * 4-beat forms — and G1's fifth question is whether the Stage's card should show
 * the short one instead. One constant is the whole of that change.
 */
export const NOTE_CARD_BUDGET = 4;
