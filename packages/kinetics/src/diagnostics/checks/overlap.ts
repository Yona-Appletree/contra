import type { DancerId } from "../../dialect/Dialect.js";
import { METRE_PX } from "../../dialect/tree/TreeDialect.js";
import { beatOf } from "../../motion/Trajectory.js";
import type { Run } from "../../pipeline.js";
import type { Diagnostic } from "../Diagnostic.js";
import { traceAt } from "../collect.js";

/**
 * K101 — two bodies never overlap. The user (2026-09-17): *"they shouldn't
 * overlap. but a pass-by is close."* A hard minimum between hips outside a
 * hold, no per-move knowledge: 0.40 m, a pass-by sitting just outside it.
 * Two dancers joined by a hold at the sample are exempt, because the hold
 * put them there.
 */
export const OVERLAP_M = 0.4;

export function overlaps(run: Run): Diagnostic[] {
  const solved = run.solved;
  const input = run.executed?.input;
  if (!solved || !input) return [];
  const ids = run.dialect.dancers;
  const min = OVERLAP_M * METRE_PX;
  const out: Diagnostic[] = [];
  for (let a = 0; a < ids.length; a += 1) {
    for (let b = a + 1; b < ids.length; b += 1) {
      const da = ids[a] as DancerId;
      const db = ids[b] as DancerId;
      const ta = solved.trajectories[da];
      const tb = solved.trajectories[db];
      const hipA = ta?.points.hip;
      const hipB = tb?.points.hip;
      if (!ta || !hipA || !hipB) continue;
      const joined = (i: number): boolean =>
        (input.dancers[da]?.holds ?? []).some(
          (h) => h.with === db && i >= h.fromSample && i < h.toSample,
        ) ||
        (input.dancers[db]?.holds ?? []).some(
          (h) => h.with === da && i >= h.fromSample && i < h.toSample,
        );
      // Stretches of samples under the minimum, each reported once at its worst.
      let from = -1;
      let worst = Infinity;
      let worstAt = 0;
      const flush = (to: number): void => {
        if (from < 0) return;
        const beat = beatOf(ta, worstAt);
        out.push({
          code: "K101",
          severity: "error",
          stage: "floor",
          message: `${da} and ${db} overlap: hips ${(worst / METRE_PX).toFixed(2)} m apart at beat ${beat.toFixed(2)}, for ${((to - from) / ta.tempo.samplesPerBeat).toFixed(2)} beats`,
          beat,
          dancers: [da, db],
          trace: [
            ...traceAt(run, da, beat),
            ...traceAt(run, db, beat),
            {
              layer: "floor",
              what: `hips ${(worst / METRE_PX).toFixed(2)} m apart; the minimum is ${OVERLAP_M.toFixed(2)} m outside a hold`,
              beat,
            },
          ],
          suggestion:
            "the figure that brought them here needs more room or an earlier turn; a hold that means them to be this close must join them",
        });
        from = -1;
        worst = Infinity;
      };
      for (let i = 0; i < ta.length; i += 1) {
        const pa = hipA[i];
        const pb = hipB[i];
        if (!pa || !pb) continue;
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < min && !joined(i)) {
          if (from < 0) from = i;
          if (d < worst) {
            worst = d;
            worstAt = i;
          }
        } else flush(i);
      }
      flush(ta.length);
    }
  }
  return out;
}
