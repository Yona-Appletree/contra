/**
 * The assembly limits: how far and how fast a step or a pivot may be. The
 * numbers a compile error is measured against (P4); they live here because
 * they are constants of the same kind as the caps, not because anything in
 * this package enforces them yet.
 */

/** The longest a single step may cover, cm. */
export const MAX_STEP_CM = 75;

/** A comfortable walking step, cm. */
export const PREFERRED_STEP_CM = 60;

/** A quick buzz-step's stride, cm. */
export const BUZZ_STEP_CM = 35;

/** The most a stepping dancer may pivot in one beat, degrees. */
export const MAX_PIVOT_STEPPING_DEG = 90;

/** The most a standing dancer may pivot in one beat, degrees. */
export const MAX_PIVOT_STANDING_DEG = 180;

/**
 * A take (and a release) ramps over this many beats, ending on the beat the
 * hold is needed. P6's finding: a hand pulled from a full hang to an
 * allemande in **one** beat peaks near 100 px/beat² at the elbow against its
 * 57.4 cap at 112 bpm, whatever the ramp shape; at two beats it proves with
 * 10–20% headroom. Whether the take wants two beats, the hang wants less
 * extension, or the elbow cap wants moving is a G1 question.
 */
export const TAKE_BEATS = 2;
