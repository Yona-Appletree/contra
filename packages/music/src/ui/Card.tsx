import type { Beat } from "@caller/core";

/** One phrase of a dance, as much of it as the card reads. */
export interface CardPhrase {
  name: string;
  figures: readonly CardFigure[];
}

/** One figure of a phrase, as much of it as the card reads. */
export interface CardFigure {
  beats: number;
  call?: string | undefined;
}

/** The dance card readout: A1/A2/B1/B2 rows, a fill bar, current figure bold. */
export function Card({ dance, beat }: CardProps) {
  const cycleBeats = BEATS_PER_PHRASE * dance.phrases.length;
  const t = ((beat % cycleBeats) + cycleBeats) % cycleBeats;
  const phraseIndex = Math.floor(t / BEATS_PER_PHRASE);
  const intoPhrase = t % BEATS_PER_PHRASE;

  return (
    <div className="caller-music-card">
      <div className="caller-music-card-title">{dance.title}</div>
      {dance.phrases.map((phrase, i) => {
        const isCurrent = i === phraseIndex;
        const fill = isCurrent ? (intoPhrase / BEATS_PER_PHRASE) * 100 : i < phraseIndex ? 100 : 0;
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
                const isOn = isCurrent && intoPhrase >= start && intoPhrase < start + figure.beats;
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
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
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
    phrases: readonly CardPhrase[];
  };
  beat: Beat;
}

const BEATS_PER_PHRASE = 16;

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
