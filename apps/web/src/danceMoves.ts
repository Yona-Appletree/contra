import type { Dance } from "@caller/choreo";
import { callBeats, withDefaults } from "@caller/choreo";
import { createContraRegistry, resolveFigureCall } from "@caller/contra";

/**
 * One figure of a dance, read as the transport, the notecard, the tune box and
 * the move popup all need it — the shared primitive `danceCard.ts`'s narrower
 * `CardFigure` cannot be, because those three surfaces need the figure id and
 * its parameters (for the popup's chips and walkthrough) as well as the words.
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
  /** The dance's own call, or the resolved long call — as {@link fallbackCall} decides. */
  call: string;
  /** The `‖` branches' calls, in the order written. */
  with: readonly string[];
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
 * Built fresh from the dance's own `FigureCall`s rather than derived from
 * `cardDance` — that function answers a narrower question (`CardPhrase`s for
 * `@caller/music`'s `Card`) and drops the figure id and params the popup and
 * the transport's labels need. The two share the one thing they must agree
 * on, the resolved call text, through {@link fallbackCall}.
 */
export function danceMoves(dance: Dance): DanceMoves {
  const registry = createContraRegistry();
  const phrases: { name: string; moves: DanceMove[] }[] = [];
  const moves: DanceMove[] = [];
  let start = 0;
  let index = 0;
  for (const [phraseIndex, phrase] of dance.phrases.entries()) {
    const phraseMoves: DanceMove[] = [];
    for (const [figureIndex, call] of phrase.figures.entries()) {
      const beats = callBeats(call);
      const move: DanceMove = {
        index,
        phrase: phrase.name,
        phraseIndex,
        figureIndex,
        start,
        beats,
        figure: call.figure,
        params: call.params,
        call: call.call ?? fallbackCall(registry, call),
        with: (call.while ?? []).map(
          (branch) =>
            branch.call ?? fallbackCall(registry, { ...branch, beats: branch.beats ?? call.beats }),
        ),
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
 * The move's own long call, resolved, or the figure contract's terse one.
 *
 * Lifted out of `danceCard.ts` (which this module's caller once duplicated) so
 * the card and the moves table can never drift on what a dance that writes no
 * call of its own is heard to say — see that file's doc comment for why the
 * *long* call, and not the short one, is the fallback.
 */
export function fallbackCall(
  registry: ReturnType<typeof createContraRegistry>,
  call: { figure: string; beats: number; params?: object },
): string {
  const def = registry.get(call.figure);
  return (
    resolveFigureCall(call.figure, withDefaults(def, call.params, call.beats))?.long ?? def.call
  );
}
