import type { Dance, Selector } from "@caller/choreo";
import { callBeats } from "@caller/choreo";
import { FULL_CALL_BUDGET, WHILE, callTexts } from "@caller/contra";
import { NOTE_CARD_BUDGET } from "./danceCard.js";

/**
 * One figure of a dance, read as the transport, the notecard, the tune box and
 * the move popup all need it — the shared primitive `danceCard.ts`'s narrower
 * `CardFigure` cannot be, because those surfaces need the figure id and its
 * parameters (for the popup's chips and walkthrough) as well as the words.
 */
export interface DanceMove {
  /** 0-based across the whole dance, in call order. */
  index: number;
  phrase: string;
  phraseIndex: number;
  /** Which figure of the phrase this is, 0-based. */
  figureIndex: number;
  /** First beat of the move within the cycle, 0-based. */
  start: number;
  /** {@link callBeats}: the longest of the call and its `while` branches. */
  beats: number;
  /** The figure id, e.g. `"allemande"`. */
  figure: string;
  params: object | undefined;
  /** Who the call is aimed at, as the record wrote it. */
  who: Selector | undefined;
  /**
   * What the notecard prints for this move: the caller's words at the card's
   * own register, {@link NOTE_CARD_BUDGET} beats of them (M13, D31).
   */
  call: string;
  /** The `‖` branches at the same register, in the order written. */
  with: readonly string[];
  /** The whole sentence, {@link FULL_CALL_BUDGET} beats: what the popup quotes. */
  fullCall: string;
  /** The `‖` branches of the whole sentence. */
  fullWith: readonly string[];
}

/** One dance's moves, phrase by phrase and flat. */
export interface DanceMoves {
  title: string;
  author: string | undefined;
  /** Sum of the phrases — 64 for every demo dance. */
  cycleBeats: number;
  phrases: readonly { name: string; moves: readonly DanceMove[] }[];
  moves: readonly DanceMove[];
}

/**
 * A `Dance` as every Stage surface reads it: one flat table of moves, each
 * carrying its own start beat, its figure and params, and the words a caller
 * would say for it.
 *
 * **The words are the caller's own** (M13, AC3): `callTexts` is the same fitting
 * rule the bubble reads along a time through, asked here for one register down
 * the record, so the notecard and the bubble cannot disagree about a figure.
 * `cardDance` (the Dances tab's static card) asks the same function at the same
 * budget; this table exists because that card drops the figure id, the params
 * and the start beat that the transport, the popup and the tune box need.
 */
export function danceMoves(dance: Dance): DanceMoves {
  const said = callTexts(dance, NOTE_CARD_BUDGET);
  const whole = callTexts(dance, FULL_CALL_BUDGET);
  const phrases: { name: string; moves: DanceMove[] }[] = [];
  const moves: DanceMove[] = [];
  let start = 0;
  let index = 0;
  for (const [phraseIndex, phrase] of dance.phrases.entries()) {
    const phraseMoves: DanceMove[] = [];
    for (const [figureIndex, call] of phrase.figures.entries()) {
      const beats = callBeats(call);
      const [short, ...shortWith] = branches(said[index]?.text ?? "");
      const [full, ...fullWith] = branches(whole[index]?.text ?? "");
      const move: DanceMove = {
        index,
        phrase: phrase.name,
        phraseIndex,
        figureIndex,
        start,
        beats,
        figure: call.figure,
        params: call.params,
        who: call.who,
        call: short ?? "",
        with: shortWith,
        fullCall: full ?? "",
        fullWith,
      };
      moves.push(move);
      phraseMoves.push(move);
      start += beats;
      index += 1;
    }
    phrases.push({ name: phrase.name, moves: phraseMoves });
  }
  return { title: dance.title, author: dance.author, cycleBeats: start, phrases, moves };
}

/** The move a cycle beat falls in, or `undefined` outside `[0, cycleBeats)`. */
export function moveAt(moves: DanceMoves, cycleBeat: number): DanceMove | undefined {
  if (cycleBeat < 0 || cycleBeat >= moves.cycleBeats) return undefined;
  return moves.moves.find((move) => cycleBeat >= move.start && cycleBeat < move.start + move.beats);
}

/**
 * A concurrent call's joined text — `callTexts` writes the branches after the
 * call with WHILE between them — split back into one line per branch: the call
 * first, then each `‖` line on its own, as the notecard prints them (M8).
 */
const branches = (text: string): string[] => text.split(` ${WHILE} `);
