import type { Run } from "../../pipeline.js";
import type { Diagnostic } from "../Diagnostic.js";

/**
 * K105 — every dancer reaches the k-th `progress()` at the same beat, or
 * their threads have drifted: a branch on a role or a `$` consumed
 * different beats for different people. The lock-step driver still commits
 * each group when it arrives, so the seating moves in pieces; this names it.
 */
export function desync(run: Run): Diagnostic[] {
  const syncs = run.sequence?.syncs;
  if (!syncs) return [];
  const out: Diagnostic[] = [];
  const dancers = Object.keys(syncs);
  const longest = Math.max(0, ...dancers.map((d) => syncs[d]?.length ?? 0));
  for (let k = 0; k < longest; k += 1) {
    const beats = new Map<number, string[]>();
    for (const d of dancers) {
      const beat = syncs[d]?.[k];
      if (beat === undefined) continue;
      beats.set(beat, [...(beats.get(beat) ?? []), d]);
    }
    if (beats.size <= 1) continue;
    const groups = [...beats].sort((a, b) => a[0] - b[0]);
    const [firstBeat] = groups[0] as [number, string[]];
    out.push({
      code: "K105",
      severity: "error",
      stage: "compile",
      message: `progress ${String(k + 1)} is reached at different beats: ${groups.map(([b, ds]) => `beat ${String(b)} by ${ds.join(" ")}`).join("; ")}`,
      beat: firstBeat,
      dancers,
      trace: groups.map(([b, ds]) => ({
        layer: "compile" as const,
        what: `${ds.join(" ")} at beat ${String(b)}`,
        beat: b,
      })),
      suggestion:
        "the branches of a split on a role or a $ must consume the same beats; give each branch the same total",
    });
  }
  return out;
}
