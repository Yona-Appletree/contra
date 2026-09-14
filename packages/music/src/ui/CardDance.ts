/**
 * A minimal, local stand-in for the `Dance` type `@caller/choreo` will
 * define in M7. `Card` takes this shape until then; M9 (or whichever
 * milestone wires the real card up to a real `Dance`) should replace it
 * with `@caller/choreo`'s `Dance` and drop this file. See
 * `packages/music/README.md`.
 *
 * A dance's card has four phrases (A1, A2, B1, B2 — 16 beats each, 64
 * beats total, matching `Tune.beatsPerCycle`). Each phrase is a list of
 * figures; a figure's `beats` is its duration within the phrase, and `call`
 * is the text a caller would say for it.
 */
export interface CardFigure {
  beats: number;
  call: string;
}

export interface CardPhrase {
  name: string;
  figures: CardFigure[];
}

export interface CardDance {
  title: string;
  phrases: CardPhrase[];
}
