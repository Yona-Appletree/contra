/** Scratch: the pre-M3 seam tile, rebuilt inline, against the re-based one. */
import {
  HANDS_FOUR_GROUP,
  WALK_TO_STATION,
  complementOf,
  createTimeline,
  poseAt,
  resolveSelector,
  withDefaults,
} from "@caller/choreo";
import { createContraRegistry, formationFor } from "@caller/contra";
import { corpusSeams, galleryGroup, seamTile, tileDancers } from "../src/galleryTiles.ts";

function oldSeamTimeline(dance, calls) {
  const formation = formationFor(dance);
  const group = galleryGroup(formation, 4);
  const registry = createContraRegistry();
  const timeline = createTimeline(registry);
  timeline.addGroup(group);
  let at = 0;
  for (const call of calls) {
    const def = registry.get(call.figure);
    const selected = resolveSelector(
      call.who,
      formation,
      call.group ?? HANDS_FOUR_GROUP,
      group.stations,
    );
    add(timeline, group, def, withDefaults(def, call.params, call.beats), selected, at);
    const resting = complementOf(group.stations, selected);
    if (resting.length > 0) {
      const from = call.params?.from ?? {};
      const here = {};
      for (const id of resting) if (from[id] !== undefined) here[id] = from[id];
      add(
        timeline,
        group,
        WALK_TO_STATION,
        withDefaults(WALK_TO_STATION, { startPlaces: here, endPlaces: here }, call.beats),
        resting,
        at,
      );
    }
    at += call.beats;
  }
  return { timeline, group };
}

function add(timeline, group, def, params, stations, start) {
  if (stations.length === 0) return;
  const bindings = {};
  for (const id of stations) bindings[id] = group.members[id];
  timeline.add({
    kind: "figure",
    group: group.id,
    figure: def.id,
    params,
    bindings,
    start,
    end: start + params.beats,
  });
}

const seen = new Set();
for (const seam of corpusSeams()) {
  if (seen.has(seam.key)) continue;
  seen.add(seam.key);
  const tile = seamTile(seam, {}, "old");
  const old = oldSeamTimeline(seam.dance, [seam.a, seam.b]);
  let worst = 0;
  let where = "";
  const oldIds = old.group.stations.map((s) => old.group.members[s.id]);
  const newIds = tileDancers(tile);
  for (let i = 0; i < oldIds.length; i++) {
    for (let t = 0; t <= seam.a.beats + seam.b.beats; t += 0.25) {
      const p = poseAt(old.timeline, oldIds[i], Math.min(t, seam.a.beats + seam.b.beats));
      const q = poseAt(
        tile.timeline,
        newIds[i],
        tile.window.start + Math.min(t, tile.window.beats),
      );
      const d = Math.hypot(p.p[0] - q.p[0], p.p[1] - q.p[1]);
      const f = Math.abs(((p.facing - q.facing + 540) % 360) - 180);
      if (Math.max(d, f) > worst) {
        worst = Math.max(d, f);
        where = `${oldIds[i]}@${t} pos ${d.toFixed(4)} facing ${f.toFixed(4)}`;
      }
    }
  }
  if (worst > 1e-6) console.log(`${seam.key}\t${seam.dance.slug}\tworst=${worst.toFixed(4)}\t${where}`);
}
console.log("done");
