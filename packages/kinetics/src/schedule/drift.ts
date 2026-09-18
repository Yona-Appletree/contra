import type { Span } from "@caller/lang";
import { dist } from "@caller/core";
import type { DancerId } from "../dialect/Dialect.js";
import type { FigureIR } from "../ir/Figure.js";
import type { CompiledSequence } from "../sequence/CompiledSequence.js";
import type { Schedule } from "./schedule.js";

/**
 * **Drift**: a figure that ends somewhere other than the seat the dance says
 * it ends on (risk R1).
 *
 * The language and the kinematics each have a claim about where a dancer is
 * when a call is over. The language's is declared — the commit put this person
 * on that place — and the engine's is planned, from the figure's windows and
 * the caps. When the two disagree by more than a **place**, something in the
 * text is lying about the floor: a becket whose "shift left" walks up the hall
 * while its progression sends the couple down is exactly this, and it is
 * invisible to anything that does not animate.
 *
 * So it is a check before it is a fix (tool-building mode). It reports the
 * figure, the beat, the dancer, the place the commit named and the distance,
 * and it says nothing at all about figures that do not claim to end at a
 * seat — a do-si-do ends where it started and a circle ends on a ring, and
 * neither is a seat.
 */
export function driftOf(scheduled: Schedule, sequence: CompiledSequence): DriftWarning[] {
  const out: DriftWarning[] = [];
  for (const calls of Object.values(scheduled.calls)) {
    for (const sc of calls) {
      const { call } = sc;
      if (sc.bodyEnd === undefined || !endsAtSeat(call.figure)) continue;
      const away = dist(sc.bodyEnd.p, call.seatAfter.p);
      if (away <= PLACE_PX) continue;
      const place = sequence.memberships[call.membership]?.placeOf.get(sc.dancer) ?? "nowhere";
      out.push({
        kind: "Drift",
        dancer: sc.dancer,
        beat: call.end,
        message:
          `${call.figure.id} ends ${away.toFixed(1)} px from the seat the commit gave ` +
          `${sc.dancer} by beat ${String(call.end)} (${place})`,
        ...(call.span === undefined ? {} : { span: call.span }),
      });
    }
  }
  return out;
}

/**
 * One place: half a couple's 0.8 m spacing at 25 px to the metre. A dancer
 * further than this from their seat is not standing a little wide of it, they
 * are standing in somebody else's.
 */
export const PLACE_PX = 20;

/**
 * Does this figure claim to leave `self` on a seat? A `walk-to-seat` window
 * says so outright; a `post` that puts `self` beside somebody in the line (a
 * swing) says so as well.
 */
const endsAtSeat = (figure: FigureIR): boolean =>
  figure.windows.some((w) => w.kind === "walk-to-seat") ||
  figure.post.arrangement.some((a) => a.kind === "beside" && a.who === "self");

export interface DriftWarning {
  kind: "Drift";
  message: string;
  dancer: DancerId;
  beat: number;
  span?: Span;
}
