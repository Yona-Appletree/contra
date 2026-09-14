// scratch: confirm the NaN reaches a real timeline. Deleted before commit.
import { poseAt } from "@caller/choreo";
import { DEMO_DANCES } from "./src/dances/index.js";
import { danceAlone } from "./src/dances/oracle.js";

for (const dance of DEMO_DANCES.slice(0, 3)) {
  const decider = danceAlone(dance, 4, 64);
  const timeline = decider.timeline();
  let bad = 0;
  let firstWhere = "";
  for (let i = 0; i <= 64 * 32; i++) {
    const beat = i / 32;
    for (const dancer of timeline.dancers()) {
      if (!timeline.figureAt(dancer, beat)) continue;
      const pose = poseAt(timeline, dancer, beat);
      for (const side of ["L", "R"] as const) {
        const h = pose.hands[side];
        if (h === "down") continue;
        if (!Number.isFinite(h.p[0]) || !Number.isFinite(h.p[1]) || !Number.isFinite(h.drop)) {
          bad++;
          if (!firstWhere) {
            const e = timeline.figureAt(dancer, beat)!;
            const p = timeline.figureBefore(dancer, e.start);
            firstWhere = `${dancer} ${side} at beat ${beat} — in "${e.figure}" (started ${e.start}), after "${p?.figure}"`;
          }
        }
      }
    }
  }
  console.log(`${dance.slug}: ${bad} non-finite hand samples over beats 0–64. first: ${firstWhere}`);
}
