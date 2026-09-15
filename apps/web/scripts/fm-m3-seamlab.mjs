/** Scratch: the two lab seams' numbers, old engine against new. */
import { poseAt } from "@caller/choreo";
import { labSection } from "../src/labTiles.ts";
import { tileDancers, tileMetrics } from "../src/galleryTiles.ts";

for (const key of ["hey--balance-and-swing", "allemande--swing"]) {
  for (const reach of ["seam", "figure"]) {
    const section = labSection(key, reach);
    const [a, b] = section.tiles;
    let worst = 0;
    let where = "";
    const ids = tileDancers(a);
    for (let i = 0; i < ids.length; i++) {
      for (let t = 0; t <= a.window.beats; t += 0.125) {
        const pa = poseAt(a.timeline, ids[i], a.window.start + Math.min(t, a.window.beats));
        const pb = poseAt(b.timeline, tileDancers(b)[i], b.window.start + Math.min(t, b.window.beats));
        const d = Math.hypot(pa.p[0] - pb.p[0], pa.p[1] - pb.p[1]);
        if (d > worst) {
          worst = d;
          where = `${ids[i]} @ ${(t - (a.seamAt ?? 0)).toFixed(2)}`;
        }
      }
    }
    console.log(
      `\n${key} (${section.dance}) reach=${reach} window=${a.window.beats} beats  worst A↔B ${worst.toFixed(3)} px  ${where}`,
    );
    for (const [label, tile] of [
      ["A old", a],
      ["B new", b],
    ]) {
      console.log(
        `  ${label}: ${tileMetrics(tile).map((m) => `${m.label} ${m.value}`).join(" · ")}`,
      );
    }
  }
}
