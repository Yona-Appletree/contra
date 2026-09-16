import type { Beat, Vec2 } from "@caller/core";
import { addScaled, clamp01, dirOf, mix, smooth } from "@caller/core";
import type { ContraParams, FigurePlan, PlanContext, Spots } from "./ContraFigure.js";
import { contraFigure } from "./ContraFigure.js";
import { PLACE_PITCH_PX } from "../formation/dupleImproper.js";

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
 * How far a couple crossing the set turns during the shift, degrees.
 *
 * Half a turn, and the sign matters: `+180` in this frame sweeps a becket
 * dancer's facing through "down the set", so the couple crossing over at the
 * top of an odd line looks *into* the set as it goes rather than out of the
 * hall. See {@link Station.crossedOver} for who does this and `becket.ts`'s
 * header for why an odd line has somebody doing it every time through.
 */
const TURN_DEG = 180;

/** One crossing dancer's path: the couple's centre, and their place in it. */
interface CrossPath {
  /** Where the couple's centre starts, frame-local px. */
  at0: Vec2;
  /** Where it finishes: the centre of the two stations they cross on to. */
  to: Vec2;
  /** This dancer's own place in the couple, from its centre, at the finish. */
  offset: Vec2;
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
 *
 * **It is a sidestep, not a walk round.** A becket couple stays square to the
 * couple across the set for the whole of it — that is the point of the figure:
 * you keep your place in the line and in the couple and simply find a new
 * couple in front of you. So the body never turns, unlike every other
 * travelling figure here, which turns toward its travel. What it does instead
 * is step, twice, and glance along the line it is travelling down.
 *
 * **One couple in an odd line does something else** (S2), and it is an end
 * effect rather than a second reading of the figure: an odd becket line has
 * only one waiting place, so at the end that has none the couple that runs out
 * of line crosses straight over — no time out — and this figure is what carries
 * them. They are marked with {@link Station.crossedOver}; everybody else in
 * their minor set slides pose for pose exactly as they always did. See
 * `becket.ts`'s header for the loop that makes an odd line work that way.
 */
export const slideLeft = contraFigure<SlideLeftParams>({
  id: "slide-left",
  call: "SLIDE LEFT ALONG THE SET",
  describe:
    "In a becket dance the whole line slides one couple's width along to its own left, so you find yourselves facing a new couple. It is a sidestep, not a walk round: you stay square to the couple across the set and to your own partner beside you, take two steps sideways along the line — one to the beat, one to the next — and glance the way you are going. The whole line moves together. This is the becket progression, and it is what the dance's last figure sets up.",
  lead: 4,
  beats: 4,
  defaults: { from: {}, alongPx: PLACE_PITCH_PX, direction: 1 },

  plan(ctx: PlanContext, params: SlideLeftParams): FigurePlan {
    // Who crosses the set instead of sliding along it. The two of them are one
    // couple, and they cross **as a couple**: the pair turns half way round
    // about its own centre while that centre walks straight across the set, so
    // they stay side by side a place apart the whole way and arrive with the
    // lark still on the robin's left — which is what puts them on the far
    // line's own two stations and not on each other's. Walking them straight to
    // those stations instead would send them through the same point at the same
    // instant, which AC6 catches and a hall would notice first.
    const crossing = new Map<string, CrossPath>();
    const crossers = ctx.stations.filter((s) => s.crossedOver === true);
    if (crossers.length > 0) {
      const to: Vec2 = [
        crossers.reduce((sum, s) => sum + s.p[0], 0) / crossers.length,
        crossers.reduce((sum, s) => sum + s.p[1], 0) / crossers.length,
      ];
      // Where the couple was for the whole of the last time through: the place
      // opposite, through the centre of the minor set. The same crossing
      // `wait-out`'s `'mirror'` walks an out couple through, for a couple that
      // never went out.
      const at0: Vec2 = [-to[0], -to[1]];
      for (const station of crossers) {
        crossing.set(station.id, { at0, to, offset: [station.p[0] - to[0], station.p[1] - to[1]] });
      }
    }

    const ends: Spots = {};
    for (const station of ctx.stations) {
      const id = station.id;
      // A crossing dancer's shift ends on their own station — that is what
      // crossing the set *is* — where a sliding one's ends a couple place
      // along the line from wherever the dance left them.
      ends[id] = crossing.has(id)
        ? { p: [station.p[0], station.p[1]], facing: station.facing }
        : {
            p: addScaled(
              ctx.spot(id).p,
              dirOf(ctx.spot(id).facing - 90 * params.direction),
              params.alongPx,
            ),
            facing: ctx.spot(id).facing,
          };
    }

    const steps = Math.max(1, Math.round(params.beats / STEP_BEATS));

    return {
      ends,
      joinsAt: () => [],
      at(station, t) {
        const x = params.beats <= 0 ? 1 : t / params.beats;
        const k = stepped(x, steps);
        const cross = crossing.get(station);
        if (cross) {
          // `TURN_DEG * (turned - 1)` runs from a half turn back to none, which
          // sweeps a becket dancer's facing through "down the set": a couple
          // crossing over at the end of a line looks into the set it is
          // crossing rather than out of the hall. The head goes with the body —
          // the turn is already showing them everything a glance would.
          //
          // The turn runs on its own single ease rather than on the steps: a
          // dancer turns through a step, not between steps, so the turn is
          // fastest exactly where the feet are slowest, and the two never add
          // their peaks together. Measured over Butter at seven couples, that
          // is the difference between the outside dancer touching 44.47 px/beat
          // and 40.78 — see this milestone's report for the whole table.
          const turn = TURN_DEG * (smooth(clamp01(x)) - 1);
          const home = ctx.stations.find((s) => s.id === station);
          if (!home) throw new Error(`slide-left: no station "${station}"`);
          const c = Math.cos((turn * Math.PI) / 180);
          const s = Math.sin((turn * Math.PI) / 180);
          const facing = home.facing + turn;
          return {
            p: [
              cross.at0[0] +
                (cross.to[0] - cross.at0[0]) * k +
                cross.offset[0] * c -
                cross.offset[1] * s,
              cross.at0[1] +
                (cross.to[1] - cross.at0[1]) * k +
                cross.offset[0] * s +
                cross.offset[1] * c,
            ],
            facing,
            look: facing,
            hands: { L: "down", R: "down" },
            stepRate: 1,
            amp: 1,
          };
        }
        const self = ctx.spot(station);
        const end = ends[station];
        if (!end) throw new Error(`slide-left: no end for station "${station}"`);
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
