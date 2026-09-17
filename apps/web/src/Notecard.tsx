import type { JSX, ReactNode } from "react";
import type { DanceMove } from "./danceMoves.js";

/**
 * **The dance, as a caller's index card** — the Stage's own card since P4.
 *
 * Round 2's brief, in Yona's words: *"think notecard. white background. clear
 * simple text. minimal boxes. icon at the end for info. tapping takes you to
 * the beginning."* So: off-white paper, the title and the choreographer on the
 * first line with the time through at the right, the phrase letter in the
 * margin, **one call to a line** with its `‖` branches under it and its beat
 * count faint at the end, an ⓘ after each, and a gold underline filling across
 * the call being danced. The calls already danced this time through are faded.
 *
 * Structural props only, and deliberately: the component knows nothing about
 * `@caller/choreo`, the programme, or the clock. It is given the phrases, which
 * move is current and how far through it the hall is, and two callbacks — which
 * is what lets the page decide that the ⓘ is a popover on a laptop and a bottom
 * sheet on a phone (D6) without the card having an opinion about either.
 */
export function Notecard({
  title,
  author,
  timeThrough,
  phrases,
  current,
  onSeek,
  renderInfo,
}: {
  title: string;
  author?: string | undefined;
  /** `"1 of 2"` while dancing; `undefined` while lining up (the head shows nothing). */
  timeThrough?: string | undefined;
  phrases: readonly { name: string; moves: readonly DanceMove[] }[];
  /** The move being danced and how far through it (0–1), or `null` between dances. */
  current: { index: number; progress: number } | null;
  onSeek(move: DanceMove): void;
  /** Renders the ⓘ for a move: P4 passes the popover's or the sheet's trigger. */
  renderInfo(move: DanceMove): ReactNode;
}): JSX.Element {
  return (
    <div className="paper notecard nc-list" data-testid="hall-notecard">
      <div className="nc-head">
        <span className="nc-title">{title}</span>
        {author === undefined ? null : <span className="nc-author">{author}</span>}
        <span className="tt">{timeThrough ?? ""}</span>
      </div>
      <div className="nc-body">
        {phrases.map((phrase) => {
          const on = phrase.moves.some((move) => move.index === current?.index);
          return (
            <div key={phrase.name} className={on ? "nc-row cur" : "nc-row"}>
              <div className="nc-lab">{phrase.name}</div>
              <div className="nc-track">
                {phrase.moves.map((move) => (
                  <Call
                    key={move.index}
                    move={move}
                    current={current}
                    onSeek={onSeek}
                    info={renderInfo(move)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One call: the words, the beat count, the ⓘ and the fill underline.
 *
 * The spike nests the ⓘ inside the call's own `<button>` and gives it
 * `role="button"` to keep the markup parseable. React on a laptop puts a real
 * `<button>` there — `@caller/ui-base`'s `Popover` owns its trigger — and a
 * button inside a button is not HTML, so the row is a `<div>` holding two
 * siblings instead: the seek button (`.nc-go`), which is everything but the
 * icon, and whatever the page hands back for the ⓘ. Every spike value is
 * unchanged; only which element carries them moved.
 */
function Call({
  move,
  current,
  onSeek,
  info,
}: {
  move: DanceMove;
  current: { index: number; progress: number } | null;
  onSeek(move: DanceMove): void;
  info: ReactNode;
}): JSX.Element {
  const progress = current !== null && current.index === move.index ? current.progress : null;
  const on = progress !== null;
  // Danced already, this time through: everything before the current move.
  const done = current !== null && !on && current.index > move.index;
  return (
    <div className={`nc-call${on ? " on" : ""}${done ? " done" : ""}`}>
      <button
        type="button"
        className="nc-go"
        title={`Go to ${move.call}`}
        data-testid="notecard-call"
        data-move={move.index}
        data-on={on ? "true" : "false"}
        onClick={() => {
          onSeek(move);
        }}
      >
        <span className="nc-txt">
          {move.call}
          {move.with.map((line) => (
            <span key={line} className="with">
              {line}
            </span>
          ))}
        </span>
        <span className="nc-beats">{move.beats}</span>
      </button>
      {info}
      <i
        className="nc-prog"
        style={
          progress === null
            ? undefined
            : { width: `${String(Math.min(100, Math.max(0, progress * 100)))}%` }
        }
      />
    </div>
  );
}

/** The ⓘ, drawn as the spike draws it: a 12 px ring with a lower-case i in it. */
export function InfoIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.3" y="5" width="1.4" height="4" fill="currentColor" />
      <rect x="5.3" y="2.7" width="1.4" height="1.4" fill="currentColor" />
    </svg>
  );
}
