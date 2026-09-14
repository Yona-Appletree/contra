import type { Beat } from "../clock/Clock.js";
import type { CardDance, CardPhrase } from "./CardDance.js";

export interface CardProps {
  dance: CardDance;
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
                    {figure.call}
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
