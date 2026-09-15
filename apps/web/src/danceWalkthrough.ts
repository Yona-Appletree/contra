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
      const def = registry.get(call.figure);
      const params = withDefaults(def, call.params, call.beats);
      const texts = resolveFigureText(call.figure, params, group);
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
