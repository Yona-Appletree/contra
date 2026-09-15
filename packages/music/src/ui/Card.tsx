import type { Beat } from "@caller/core";
import type { ReactNode } from "react";

/** One phrase of a dance, as much of it as the card reads. */
export interface CardPhrase {
  name: string;
  figures: readonly CardFigure[];
}

/** One figure of a phrase, as much of it as the card reads. */
export interface CardFigure {
  beats: number;
  call?: string | undefined;
  /**
   * Calls danced **beside** this one, by other dancers, over the same beats.
   *
   * The card draws a concurrent call as **one row with two lines** — one figure
   * of the phrase, which is what it is, with each line saying what one half of
   * the hall does. The row is bold when the beat is inside it, exactly as a
   * single-figure row is.
   */
  with?: readonly string[] | undefined;
}

/**
 * The dance card: a note card with a coloured header band carrying the title
 * and the author, then the A1/A2/B1/B2 rows with a fill bar and the current
 * figure bold, then whatever the page hands it (the tune, on the front page).
 *
 * The markup is three parts — head, body, extra — so a stylesheet can make it
 * a piece of paper. The look itself lives in the app's stylesheet, not here.
 */
export function Card({ dance, beat, children }: CardProps) {
  // **The phrases say how long they are** (M8). A phrase used to be sixteen
  // beats because every dance on the card had four of them and each was a tune's
  // eight bars; 113 corpus dances have phrases beyond A1–B2 and a two-pass
  // record has eight of them, so the length is read off the figures. A phrase
  // with no figures at all still measures sixteen, which is what an empty card
  // used to draw.
  const lengths = dance.phrases.map((phrase) => phraseLength(phrase));
  const cycleBeats = lengths.reduce((sum, n) => sum + n, 0) || BEATS_PER_PHRASE;
  const t = ((beat % cycleBeats) + cycleBeats) % cycleBeats;
  let phraseIndex = 0;
  let intoPhrase = t;
  while (phraseIndex + 1 < lengths.length && intoPhrase >= lengths[phraseIndex]!) {
    intoPhrase -= lengths[phraseIndex]!;
    phraseIndex += 1;
  }

  return (
    <div className="caller-music-card">
      <div className="caller-music-card-head">
        <div className="caller-music-card-title">{dance.title}</div>
        {dance.author === undefined ? null : (
          <div className="caller-music-card-author">{dance.author}</div>
        )}
      </div>
      <div className="caller-music-card-body">
        {dance.phrases.map((phrase, i) => {
          const isCurrent = i === phraseIndex;
          const length = lengths[i] ?? BEATS_PER_PHRASE;
          const fill = isCurrent ? (intoPhrase / length) * 100 : i < phraseIndex ? 100 : 0;
          const starts = figureStarts(phrase);
          return (
            <div
              key={phrase.name}
              className={
                isCurrent
                  ? "caller-music-card-phrase caller-music-card-phrase--current"
                  : "caller-music-card-phrase"
              }
              data-phrase={phrase.name}
            >
              <div className="caller-music-card-fill" style={{ width: `${fill}%` }} />
              <div className="caller-music-card-label">{phrase.name}</div>
              <div className="caller-music-card-figures">
                {phrase.figures.map((figure, fi) => {
                  const start = starts[fi] ?? 0;
                  const isOn =
                    isCurrent && intoPhrase >= start && intoPhrase < start + figure.beats;
                  return (
                    <span
                      key={fi}
                      className={
                        isOn
                          ? "caller-music-card-figure caller-music-card-figure--on"
                          : "caller-music-card-figure"
                      }
                      style={isOn ? { fontWeight: "bold" } : undefined}
                      data-figure-on={isOn}
                    >
                      {figure.call ?? ""}
                      {(figure.with ?? []).map((line, wi) => (
                        <span key={wi} className="caller-music-card-figure-with">
                          {line}
                        </span>
                      ))}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {children === undefined ? null : <div className="caller-music-card-extra">{children}</div>}
    </div>
  );
}

export interface CardProps {
  /**
   * The dance being called.
   *
   * Structural on purpose: `@caller/choreo`'s `Dance` satisfies this exactly,
   * so the card reads a real dance with no shim and no conversion — but
   * `scripts/check-deps.mjs` gives `music` one edge, to `core`, and importing
   * `@caller/choreo` here would have been a change to that table. The shape is
   * the part of a `Dance` the card draws: its title, its phrases, and each
   * figure's duration and call text.
   */
  dance: {
    title: string;
    /** The choreographer, shown in the header band beside the title. */
    author?: string | undefined;
    phrases: readonly CardPhrase[];
  };
  beat: Beat;
  /**
   * Anything that belongs on the card under the phrases — the front page puts
   * the tune's notation there. Left out, the card ends at its last phrase.
   */
  children?: ReactNode;
}

/** What a phrase with no figures of its own measures: one tune's eight bars. */
const BEATS_PER_PHRASE = 16;

/** How long one phrase is: its own figures, or the ordinary sixteen. */
function phraseLength(phrase: CardPhrase): number {
  const beats = phrase.figures.reduce((sum, figure) => sum + figure.beats, 0);
  return beats > 0 ? beats : BEATS_PER_PHRASE;
}

/** Cumulative start beat of each figure within its phrase. */
function figureStarts(phrase: CardPhrase): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const figure of phrase.figures) {
    starts.push(cursor);
    cursor += figure.beats;
  }
  return starts;
}
