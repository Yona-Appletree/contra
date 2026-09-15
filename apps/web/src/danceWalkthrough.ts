import type { Dance } from "@caller/choreo";
import { concurrentCalls } from "@caller/choreo";
import { callWho, formFor, resolveFigureText } from "@caller/contra";

/** One figure of a dance walkthrough: what the caller says, and the full teach. */
export interface DanceWalkthroughStep {
  phrase: string;
  figure: string;
  /** The dance's own call where it wrote one, else the move's resolved long call. */
  call: string;
  /** The move's long walkthrough, resolved against this call's own parameters. */
  text: string;
}

/**
 * The dance's figures in order, each with its full teach resolved through the
 * text layer — the first "walkthrough card" the vision addenda name as a
 * product pillar (U3).
 *
 * **P4 of the walkthrough-language plan replaces this file** with
 * `danceWalkthrough` in `@caller/contra`, which dances the dance through the
 * planner and carries the seam hints, the headings and the wrap. What is here
 * is U3's list, moved on to M13's seven texts and nothing more.
 */
export function danceWalkthrough(dance: Dance): readonly DanceWalkthroughStep[] {
  const steps: DanceWalkthroughStep[] = [];
  for (const phrase of dance.phrases) {
    // **A concurrent call is walked through as its own steps** (M8), in the
    // order the record writes them: a caller teaching "robins cast back while
    // larks go forward" teaches both halves, one after the other, and each half
    // has its own figure and its own words.
    for (const call of phrase.figures.flatMap((written) => concurrentCalls(written))) {
      const texts = textsFor(call);
      if (texts === undefined) continue;
      steps.push({
        phrase: phrase.name,
        figure: call.figure,
        call: call.call ?? formFor(texts.forms, 4)?.text ?? call.figure,
        text: texts.walkthrough.teach,
      });
    }
  }
  return steps;
}

/**
 * One call's texts, or `undefined` for a call that has none this page can print.
 *
 * The header says a call whose texts do not resolve is left out and never given
 * a placeholder. A **lab** dance is the case that needs the catch: a figure a
 * later milestone owns, or a parameter value the text layer has no words for,
 * *throws*, which took the whole dance page down rather than one step of it.
 */
function textsFor(call: {
  figure: string;
  params?: object;
  beats: number;
  who?: unknown;
}): ReturnType<typeof resolveFigureText> {
  try {
    return resolveFigureText(
      call.figure,
      { ...(call.params ?? {}), beats: call.beats },
      { who: callWho(call) },
    );
  } catch {
    return undefined;
  }
}
