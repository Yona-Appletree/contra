import type { Dance } from "@caller/choreo";
import { concurrentCalls, withDefaults } from "@caller/choreo";
import {
  contraDataFigures,
  createContraRegistry,
  formationFor,
  probeGroup,
  resolveFigureText,
} from "@caller/contra";

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
 * The dance's figures in order, each with its long walkthrough text resolved
 * through the text layer (W1) — the first "walkthrough card" the vision
 * addenda name as a product pillar (U3).
 *
 * `probeGroup(formationFor(dance), 4)` is the exact group
 * `figureText.test.ts`'s "leaves no slot unresolved" case already proves
 * resolves every call of every phrase of all ten demo dances without an
 * unresolved `{slot}` — a plain four-station group in the dance's own
 * formation, not the (possibly widened) group a call actually danced in.
 * `landmark()` only ever reads the four canonical stations off it, so the
 * difference does not reach the sentence.
 */
export function danceWalkthrough(dance: Dance): readonly DanceWalkthroughStep[] {
  // With the interpreted definitions in it: since M6 a figure can be data
  // with no coded twin, and M7's are the first such figures a **programme**
  // dance calls, so a plain coded registry has no `down-the-hall` to read.
  const registry = createContraRegistry(contraDataFigures());
  const group = probeGroup(formationFor(dance), 4);
  const steps: DanceWalkthroughStep[] = [];
  for (const phrase of dance.phrases) {
    // **A concurrent call is walked through as its own steps** (M8), in the
    // order the record writes them: a caller teaching "women cast back while
    // men go forward" teaches both halves, one after the other, and each half
    // has its own figure and its own words.
    for (const call of phrase.figures.flatMap((written) => concurrentCalls(written))) {
      const texts = textsFor(registry, group, call);
      if (texts === undefined) continue;
      steps.push({
        phrase: phrase.name,
        figure: call.figure,
        call: call.call ?? texts.call.long,
        text: texts.walkthrough.long,
      });
    }
  }
  return steps;
}

/**
 * One call's texts, or `undefined` for a call that has none this page can print.
 *
 * The header says a call whose texts do not resolve is left out and never given
 * a placeholder, and until M8 that meant the one case `resolveFigureText`
 * answers `undefined` for: a figure with no text file. A **lab** dance has two
 * more — a figure a later milestone owns, which the registry does not hold at
 * all, and a parameter value the text layer has no words for — and both of those
 * *throw*, which took the whole dance page down rather than one step of it. A
 * lab dance is exactly the kind of dance whose figures are half written, so the
 * page catches here and shows the rest of the walkthrough.
 *
 * Exported since P4: the Stage's move popup (`MoveDetail.tsx`) wants exactly
 * this — one call's texts, or nothing to print — for one move rather than for a
 * whole dance, and a second copy of the try/catch would eventually disagree
 * with this one about which failures are a missing text and which are a bug.
 */
export function textsFor(
  registry: ReturnType<typeof createContraRegistry>,
  group: ReturnType<typeof probeGroup>,
  call: { figure: string; params?: object; beats: number },
): ReturnType<typeof resolveFigureText> {
  try {
    const def = registry.get(call.figure);
    return resolveFigureText(call.figure, withDefaults(def, call.params, call.beats), group);
  } catch {
    return undefined;
  }
}
