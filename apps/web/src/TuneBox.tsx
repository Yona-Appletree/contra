import type { Beat, Meter } from "@caller/core";
import { beatsPerPhrase } from "@caller/core";
import type { NotationCaption, Tune } from "@caller/music";
import { Notation } from "@caller/music";
import type { JSX } from "react";
import { Potatoes } from "./PotatoIcon.js";
import type { DanceMove } from "./danceMoves.js";

/**
 * **The tune, in its own box** — the Stage's second sheet of paper since P5.
 *
 * Round 2's brief, in Yona's words: *"a separate box for the tune... grow a
 * dropdown to change it. clicking into the music should take you there in the
 * tune, too, with move-level granularity."* So: the same paper the notecard is
 * printed on, a "THE TUNE" caption, a native `<select>` of every bundled tune,
 * the four potatoes at the right — and under them the notation with the phrase
 * letters at the left of the staves, the calls written small under the bars
 * they take, and every bar clickable.
 *
 * Structural props only, like the notecard: this component knows nothing about
 * the programme, the clock or the medley. It is given a tune, a beat, the
 * dance's phrases and four callbacks, and the page decides what any of them
 * mean. That is also what keeps `@caller/music` form-neutral (D7) — every word
 * under a stave comes from {@link captionsFor} here, in the app.
 */
export function TuneBox({
  tune,
  tunes,
  onPick,
  beat,
  phrases,
  currentMove,
  potatoes,
  onBar,
}: {
  tune: Tune;
  /** Every bundled tune, for the select (reels then jigs, as the Tunes tab lists them). */
  tunes: readonly Tune[];
  onPick(slug: string): void;
  /** The music beat the notation follows (`shownMusicBeat`). */
  beat: Beat;
  /** The four phrase names and the calls under the bars: from `danceMoves`. */
  phrases: readonly { name: string; moves: readonly DanceMove[] }[];
  /** The move being danced, for the cursor-coloured caption, or null. */
  currentMove: number | null;
  /** 0–4: how many potatoes are lit. */
  potatoes: number;
  onBar(cycleBeat: number): void;
}): JSX.Element {
  const perPhrase = beatsPerPhrase(tune.meter);
  return (
    <div className="paper tunebox">
      <div className="tunebox-head">
        <span className="cap">The tune</span>
        {/*
         * A native `<select>`, for the same reason the dance picker is one
         * (U4 requirement 1): it is a list of thirteen names on a page that
         * already has a transport to look at. Its value is the tune *sounding*
         * for this dance, whether that came from the evening's shuffle, a
         * `?tune=` pin or this select — so it is also the readout, and nothing
         * else on the box has to say the tune's name.
         */}
        <select
          value={tune.slug}
          onChange={(e) => {
            onPick(e.target.value);
          }}
          aria-label="Tune"
          data-testid="hall-tune-select"
        >
          {tunes.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <Potatoes lit={potatoes} />
      </div>
      {/*
       * `hall-notation` stays on the wrapper the notation is inside: it is
       * what the cursor test measures, and the cursor did not move when the
       * sheet under the notecard became this box.
       */}
      <div className="tunebox-notation" data-testid="hall-notation">
        <Notation
          tune={tune}
          beat={beat}
          showTitle={false}
          staveLabels={phrases.map((phrase) => phrase.name)}
          captions={captionsFor(phrases, tune.meter, currentMove)}
          onBarClick={(line, measure) => {
            onBar(line * perPhrase + measure * tune.meter.beatsPerBar);
          }}
        />
      </div>
    </div>
  );
}

/**
 * The dance's calls as captions under the bars they take.
 *
 * One caption per move, placed by arithmetic rather than by layout: a stave is
 * a phrase, a bar is `beatsPerBar` beats, so a move's first bar is how far
 * into its phrase it starts and its width is its own length in bars.
 * **Fractional bars are allowed and wanted** — a six-beat circle is three
 * bars, a two-beat cast back is one — because `Notation` measures the span
 * from the rendered bars' own boxes and a caption that claimed a whole number
 * of bars would sit under the wrong notes.
 *
 * A phrase past the tune's own staves is dropped rather than drawn: every
 * bundled tune is four staves of one 64-beat cycle, and a corpus dance with
 * eight phrases (M9's imports) would otherwise ask for captions on staves
 * that do not exist.
 */
export function captionsFor(
  phrases: readonly { name: string; moves: readonly DanceMove[] }[],
  meter: Meter,
  currentMove: number | null,
): NotationCaption[] {
  const perPhrase = beatsPerPhrase(meter);
  const staves = TUNE_CYCLE_BEATS / perPhrase;
  const captions: NotationCaption[] = [];
  for (const [line, phrase] of phrases.entries()) {
    if (line >= staves) break;
    // The phrase's own first beat, not `line * perPhrase`: `danceMoves` lays
    // the moves out end to end from the dance's own phrase lengths, and a
    // caption is placed against the phrase it is written in.
    const phraseStart = phrase.moves[0]?.start;
    if (phraseStart === undefined) continue;
    for (const move of phrase.moves) {
      captions.push({
        line,
        fromBar: (move.start - phraseStart) / meter.beatsPerBar,
        bars: move.beats / meter.beatsPerBar,
        text: move.call,
        current: move.index === currentMove,
      });
    }
  }
  return captions;
}

/**
 * How long one pass of a bundled tune is, in beats.
 *
 * `Tune["beatsPerCycle"]` is the literal type `64` for every tune this
 * package bundles, so the number of staves a tune is written on is this over
 * its own phrase length — four, for both meters.
 */
const TUNE_CYCLE_BEATS = 64;
