import type { DancerId } from "../dialect/Dialect.js";
import type { Schedule } from "../schedule/schedule.js";
import { beatOf, type Trajectory } from "./Trajectory.js";

/**
 * **Clearance**: two bodies through one point.
 *
 * The scheduler plans every dancer's steps from their own figure, and a
 * figure danced by two at a time knows nothing about the other two: the two
 * robins of a chain each cross in their own pair's frame, and whether they
 * pass or collide is a fact about the whole set that only the executed
 * motion holds. So it is a check on the trajectories (tool-building mode):
 * every pair of hips, at every sample, no closer than a body's clearance —
 * reported once per stretch, at its closest sample, naming both dancers, the
 * beat, the distance and the figures each was dancing.
 */
export function clearanceOf(
  trajectories: Readonly<Record<DancerId, Trajectory>>,
  schedule?: Schedule,
): ClearanceViolation[] {
  const out: ClearanceViolation[] = [];
  const ids = Object.keys(trajectories);
  for (let a = 0; a < ids.length; a++) {
    const idA = ids[a] as DancerId;
    const hipsA = trajectories[idA]?.points.hip;
    if (hipsA === undefined) continue;
    for (let b = a + 1; b < ids.length; b++) {
      const idB = ids[b] as DancerId;
      const t = trajectories[idB] as Trajectory;
      const hipsB = t.points.hip;
      if (hipsB === undefined) continue;
      const n = Math.min(hipsA.length, hipsB.length);
      let open: { sample: number; value: number } | undefined;
      const close = (): void => {
        if (open === undefined) return;
        const beat = beatOf(t, open.sample);
        out.push({
          kind: "clearance",
          dancer: idA,
          with: idB,
          sample: open.sample,
          beat,
          value: open.value,
          cap: CLEARANCE_PX,
          figures: [figureAt(schedule, idA, beat), figureAt(schedule, idB, beat)],
        });
        open = undefined;
      };
      for (let i = 0; i < n; i++) {
        const pa = hipsA[i]!;
        const pb = hipsB[i]!;
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < CLEARANCE_PX) {
          if (open === undefined || d < open.value) open = { sample: i, value: d };
          continue;
        }
        close();
      }
      close();
    }
  }
  return out;
}

/**
 * The least two bodies may be apart, hip to hip, px: the old library's own
 * clearance, and the room every figure for two leaves the pair beside it —
 * the chain's two robins go by at exactly this.
 */
export const CLEARANCE_PX = 8.5;

/** Two dancers closer than a body's clearance, at the closest sample of one stretch. */
export interface ClearanceViolation {
  kind: "clearance";
  dancer: DancerId;
  with: DancerId;
  sample: number;
  beat: number;
  /** The distance, px. */
  value: number;
  cap: number;
  /** What each was dancing at that beat, for the trace. */
  figures: readonly [string, string];
}

const figureAt = (schedule: Schedule | undefined, dancer: DancerId, beat: number): string =>
  schedule?.calls[dancer]?.find((c) => beat >= c.call.start && beat < c.call.end)?.call.figure.id ??
  "?";
