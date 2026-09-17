import type { DancerId } from "../../dialect/Dialect.js";
import { METRE_PX } from "../../dialect/tree/TreeDialect.js";
import { beatOf } from "../../motion/Trajectory.js";
import type { Run } from "../../pipeline.js";
import type { Diagnostic } from "../Diagnostic.js";
import { traceAt } from "../collect.js";

/** K102 — two hands at one point (within 0.05 m) with no hold between the two dancers. */
export const HANDS_M = 0.05;

export function handsWithoutHold(run: Run): Diagnostic[] {
  const solved = run.solved;
  const input = run.executed?.input;
  if (!solved || !input) return [];
  const ids = run.dialect.dancers;
  const min = HANDS_M * METRE_PX;
  const out: Diagnostic[] = [];
  for (let a = 0; a < ids.length; a += 1) {
    for (let b = a + 1; b < ids.length; b += 1) {
      const da = ids[a] as DancerId;
      const db = ids[b] as DancerId;
      const ta = solved.trajectories[da];
      if (!ta) continue;
      const joined = (i: number): boolean =>
        (input.dancers[da]?.holds ?? []).some(
          (h) => h.with === db && i >= h.fromSample && i < h.toSample,
        ) ||
        (input.dancers[db]?.holds ?? []).some(
          (h) => h.with === da && i >= h.fromSample && i < h.toSample,
        );
      let from = -1;
      let worstAt = 0;
      let worst = Infinity;
      const flush = (to: number): void => {
        if (from < 0) return;
        const beat = beatOf(ta, worstAt);
        out.push({
          code: "K102",
          severity: "warning",
          stage: "floor",
          message: `${da}'s and ${db}'s hands meet with no hold at beat ${beat.toFixed(2)}, for ${((to - from) / ta.tempo.samplesPerBeat).toFixed(2)} beats`,
          beat,
          dancers: [da, db],
          trace: [...traceAt(run, da, beat), ...traceAt(run, db, beat)],
        });
        from = -1;
        worst = Infinity;
      };
      for (let i = 0; i < ta.length; i += 1) {
        let closest = Infinity;
        for (const ha of ["left", "right"] as const) {
          for (const hb of ["left", "right"] as const) {
            const pa = solved.hands[da]?.[ha]?.[i]?.p;
            const pb = solved.hands[db]?.[hb]?.[i]?.p;
            if (!pa || !pb) continue;
            closest = Math.min(closest, Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z));
          }
        }
        if (closest < min && !joined(i)) {
          if (from < 0) from = i;
          if (closest < worst) {
            worst = closest;
            worstAt = i;
          }
        } else flush(i);
      }
      flush(ta.length);
    }
  }
  return out;
}
