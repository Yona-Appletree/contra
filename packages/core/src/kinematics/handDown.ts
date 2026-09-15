import { hangingHand } from "./drawnArms.js";

/**
 * A hand that is not placed by the figure: out to the side and down, swinging
 * with the step.
 *
 * This is {@link hangingHand} under the name every figure calls it by. A figure
 * needs it because every take and every release is animated and the animation
 * has to start where the renderer would have drawn the hand, so the name is
 * worth keeping even though the model behind it is the resting arm in
 * `drawnArms.ts` and not a second copy of those numbers.
 *
 * `beat` is the figure's **own** beat, not the absolute one: a figure's step
 * phase is measured from its own start. Because every figure starts on a whole
 * beat and the phase has period 1 (or 1/2 for a buzz), that is the same number
 * the renderer's quiet motion uses.
 */
export const handDown = hangingHand;
