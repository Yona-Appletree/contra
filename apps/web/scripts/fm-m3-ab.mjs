/** Scratch: every seam tile, old engine against new. */
import { poseAt } from "@caller/choreo";
import { corpusSeams, seamTile, tileDancers } from "../src/galleryTiles.ts";

const seen = new Set();
for (const seam of corpusSeams()) {
  if (seen.has(seam.key)) continue;
  seen.add(seam.key);
  const a = seamTile(seam, {}, "old");
  const b = seamTile(seam, {}, "new");
  const ia = tileDancers(a);
  const ib = tileDancers(b);
  let worst = 0;
  let where = "";
  for (let i = 0; i < ia.length; i++) {
    for (let t = 0; t <= a.window.beats; t += 0.125) {
      const pa = poseAt(a.timeline, ia[i], a.window.start + Math.min(t, a.window.beats));
      const pb = poseAt(b.timeline, ib[i], b.window.start + Math.min(t, b.window.beats));
      let d = Math.hypot(pa.p[0] - pb.p[0], pa.p[1] - pb.p[1]);
      d = Math.max(d, Math.abs(((pa.facing - pb.facing + 540) % 360) - 180));
      for (const side of ["L", "R"]) {
        const ha = pa.hands?.[side];
        const hb = pb.hands?.[side];
        if ((ha === undefined) !== (hb === undefined)) d = Math.max(d, 999);
        else if (ha && hb) {
          if ((ha === "down") !== (hb === "down")) d = Math.max(d, 888);
          else if (ha !== "down" && hb !== "down")
            d = Math.max(d, Math.hypot(ha.p[0] - hb.p[0], ha.p[1] - hb.p[1]));
        }
      }
      for (const key of ["look", "lean", "stepRate", "flare", "amp"]) {
        d = Math.max(d, Math.abs((pa[key] ?? 0) - (pb[key] ?? 0)));
      }
      if (pa.buzz !== pb.buzz) d = Math.max(d, 777);
      if ((pa.feet === undefined) !== (pb.feet === undefined)) d = Math.max(d, 666);
      if (d > worst) {
        worst = d;
        where = `${ia[i]} @ ${(t - (a.seamAt ?? 0)).toFixed(2)}`;
      }
    }
  }
  if (worst > 1e-6) {
    console.log(`${seam.key}\t${seam.dance.slug}\tworst ${worst.toFixed(3)} px\t${where}`);
  }
}
console.log("done");
