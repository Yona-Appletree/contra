import { METRE_PX } from "../../dialect/tree/TreeDialect.js";
import { sampleAt } from "../../motion/Trajectory.js";
import type { Run } from "../../pipeline.js";
import type { Diagnostic } from "../Diagnostic.js";
import { traceAt } from "../collect.js";

/**
 * K103 — a figure whose `post` says "facing home" should end the dancer at
 * their place; when the hip is farther than this from it, the seams that
 * follow will be walking that distance. That is the drift the user saw as
 * overlap's cousin: the swing landing off the line.
 */
export const DRIFT_M = 0.25;

export function drift(run: Run): Diagnostic[] {
  const solved = run.solved;
  if (!solved || !run.schedule) return [];
  const out: Diagnostic[] = [];
  for (const dancer of run.dialect.dancers) {
    const t = solved.trajectories[dancer];
    const hip = t?.points.hip;
    if (!t || !hip) continue;
    for (const c of run.schedule.calls[dancer] ?? []) {
      const home = c.call.figure.post.arrangement.some(
        (a) => a.kind === "facing" && a.toward === "home",
      );
      if (!home) continue;
      const p = hip[sampleAt(t, c.call.end)];
      if (!p) continue;
      const [sx, sy] = c.call.seatAfter.p;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d <= DRIFT_M * METRE_PX) continue;
      out.push({
        code: "K103",
        severity: "warning",
        stage: "floor",
        message: `ends ${c.call.figure.id} ${(d / METRE_PX).toFixed(2)} m from home at beat ${String(c.call.end)}`,
        beat: c.call.end,
        dancers: [dancer],
        trace: traceAt(run, dancer, Math.max(c.call.start, c.call.end - 1), {
          layer: "floor",
          what: `hip at (${(p.x / METRE_PX).toFixed(2)}, ${(p.y / METRE_PX).toFixed(2)}) m, home at (${(sx / METRE_PX).toFixed(2)}, ${(sy / METRE_PX).toFixed(2)}) m`,
        }),
        suggestion:
          "the figure's exit should land on the place its post names; the next figure's entry is walking the difference",
      });
    }
  }
  return out;
}
