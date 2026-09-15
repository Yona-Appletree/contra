/** Scratch: what the re-based gallery tiles look like on each engine. */
import { poseAt } from "@caller/choreo";
import { figureTiles, seamTiles, tileDancers } from "../src/galleryTiles.ts";

const engine = process.argv[2] ?? "new";
const tiles = [...figureTiles({}, engine), ...seamTiles({}, engine)];
for (const tile of tiles) {
  let sum = 0;
  let n = 0;
  for (const dancer of tileDancers(tile)) {
    for (let t = 0; t <= tile.window.beats; t += 0.5) {
      const p = poseAt(tile.timeline, dancer, tile.window.start + Math.min(t, tile.window.beats));
      sum += Math.abs(p.p[0]) + Math.abs(p.p[1]) + Math.abs(p.facing);
      n++;
    }
  }
  console.log(
    `${tile.key}\t${tile.formation}\tworld=${tile.world.w}x${tile.world.h}\twin=${tile.window.start}+${tile.window.beats}\tchk=${(sum / n).toFixed(6)}\tdancers=${tileDancers(tile).join(",")}`,
  );
}
