import type { Beat } from "@caller/core";
import { addScaled, clamp01, dirOf, mix, smooth } from "@caller/core";
import type { ContraParams, FigurePlan, PlanContext, Spots } from "./ContraFigure.js";
import { contraFigure } from "./ContraFigure.js";
import { COUPLE_PITCH_PX } from "../formation/becket.js";

/** {@link slideLeft}'s parameters. */
export interface SlideLeftParams extends ContraParams {
  /** How far along the line each dancer slides, px. One couple place by default. */
  alongPx: number;
  /** `1` slides to the dancer's own left, `-1` to their right. */
  direction: 1 | -1;
}

/**
 * How long one walking step of the slide lasts, in beats.
 *
 * A slide left is called in two beats and danced in two steps — "and slide,
 * two" — so the travel is one step a beat, not one glide across the whole
 * call. It is the same distance either way and the same top speed; the
 * difference is that the body arrives, settles and sets off again on the beat,
 * which is what makes it read as stepping rather than as being dragged
 * sideways. Every other travelling figure in this library covers a place pitch
 * over four or eight beats; this one covers a *couple* pitch over two, so it is
 * by a long way the fastest sustained travel on the floor and the only one
 * where a single ease over the whole figure reads as a glide.
 */
export const STEP_BEATS: Beat = 1;

/**
 * How far off the facing a dancer looks along the line they are travelling.
 *
 * The torso stays square — see the figure's own note — so this is only the
 * head. The renderer's neck limit (`headLook`, 55° free and fading out to 115°)
 * turns a full 90° glance into about 23° of actual head turn, which is a dancer
 * glancing along the line rather than a dancer looking over their shoulder.
 */
const GLANCE_DEG = 90;

/**
 * Slide along the line to the next couple: everybody sashays to their own left,
 * facing the same way the whole time.
 *
 * This is becket's progression, and it is the only figure here whose `ends`
 * leave the group's own frame — which is exactly what a becket time through
 * does, and why M7 could not write a becket closure fixture with the engine's
 * placeholder figure. The two lines slide opposite ways because they face
 * opposite ways, so nobody crosses anybody's path.
 *
 * **It is a sidestep, not a walk round.** A becket couple stays square to the
 * couple across the set for the whole of it — that is the point of the figure:
 * you keep your place in the line and in the couple and simply find a new
 * couple in front of you. So the body never turns, unlike every other
 * travelling figure here, which turns toward its travel. What it does instead
 * is step, twice, and glance along the line it is travelling down.
 */
export const slideLeft = contraFigure<SlideLeftParams>({
  id: "slide-left",
  call: "SLIDE LEFT ALONG THE SET",
  describe:
    "In a becket dance the whole line slides one couple's width along to its own left, so you find yourselves facing a new couple. It is a sidestep, not a walk round: you stay square to the couple across the set and to your own partner beside you, take two steps sideways along the line — one to the beat, one to the next — and glance the way you are going. The whole line moves together. This is the becket progression, and it is what the dance's last figure sets up.",
  lead: 4,
  beats: 4,
  defaults: { from: {}, alongPx: COUPLE_PITCH_PX, direction: 1 },

  plan(ctx: PlanContext, params: SlideLeftParams): FigurePlan {
    const ends: Spots = {};
    for (const id of ctx.ids) {
      const self = ctx.spot(id);
      ends[id] = {
        p: addScaled(self.p, dirOf(self.facing - 90 * params.direction), params.alongPx),
        facing: self.facing,
      };
    }

    const steps = Math.max(1, Math.round(params.beats / STEP_BEATS));

    return {
      ends,
      joinsAt: () => [],
      at(station, t) {
        const self = ctx.spot(station);
        const end = ends[station];
        if (!end) throw new Error(`slide-left: no end for station "${station}"`);
        const x = params.beats <= 0 ? 1 : t / params.beats;
        const k = stepped(x, steps);
        return {
          p: [self.p[0] + (end.p[0] - self.p[0]) * k, self.p[1] + (end.p[1] - self.p[1]) * k],
          facing: self.facing,
          // The head leads and comes back, so the glance starts and ends on the
          // plain facing and no seam has to blend a turned head.
          look: self.facing - GLANCE_DEG * params.direction * Math.sin(Math.PI * clamp01(x)),
          hands: { L: "down", R: "down" },
          stepRate: 1,
          amp: 1,
        };
      },
    };
  },
});

/**
 * `[0, 1]` covered in `steps` equal eased steps rather than one.
 *
 * Each step is the same {@link smooth} the engine's own `walkStep` uses, so a
 * one-step slide is exactly what this figure did before, and an `n`-step slide
 * has the same top speed — `smooth`'s peak is `1.5 ×` the average either way —
 * but reaches it `n` times instead of once. The value is continuous, monotone,
 * and exactly `0` and `1` at the ends, so nothing about where the figure leaves
 * anybody changes.
 */
export function stepped(x: number, steps: number): number {
  const t = clamp01(x);
  const i = Math.min(steps - 1, Math.floor(t * steps));
  return mix(i / steps, (i + 1) / steps, smooth(t * steps - i));
}
