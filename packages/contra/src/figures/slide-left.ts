import { addScaled, dirOf, smooth } from "@caller/core";
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
 * Slide along the line to the next couple: everybody sashays to their own left,
 * facing the same way the whole time.
 *
 * This is becket's progression, and it is the only figure here whose `ends`
 * leave the group's own frame — which is exactly what a becket time through
 * does, and why M7 could not write a becket closure fixture with the engine's
 * placeholder figure. The two lines slide opposite ways because they face
 * opposite ways, so nobody crosses anybody's path.
 */
export const slideLeft = contraFigure<SlideLeftParams>({
  id: "slide-left",
  call: "SLIDE LEFT ALONG THE SET",
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

    return {
      ends,
      joinsAt: () => [],
      at(station, t) {
        const self = ctx.spot(station);
        const end = ends[station];
        if (!end) throw new Error(`slide-left: no end for station "${station}"`);
        const k = smooth(t / params.beats);
        return {
          p: [self.p[0] + (end.p[0] - self.p[0]) * k, self.p[1] + (end.p[1] - self.p[1]) * k],
          facing: self.facing,
          hands: { L: "down", R: "down" },
          stepRate: 1,
          amp: 1,
        };
      },
    };
  },
});
