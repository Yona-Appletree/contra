// scratch: the canonical take, and the balance NaN. Deleted before commit.
import { drawnArms, dist, shouldersAt, solveArm3d, planarReach } from "@caller/core";
import type { Group, StationId } from "@caller/choreo";
import { createGroup, frame as makeFrame, withDefaults } from "@caller/choreo";
import { DUPLE_IMPROPER } from "./src/formation/dupleImproper.js";
import { CONTRA_FIGURES } from "./src/figures/registry.js";
import type { ContraFigure, ContraParams } from "./src/figures/ContraFigure.js";
import { holdWindow, takeAndRelease } from "./src/figures/ContraFigure.js";
import { handDown } from "./src/pair/PairFrame.js";

const STEP = 1 / 32;

function groupOf(n = 4): Group {
  const stations = DUPLE_IMPROPER.group(n);
  const members: Record<StationId, string> = {};
  for (const s of stations) members[s.id] = `d/${s.id}`;
  return createGroup(
    { id: "g", kind: "set", frame: makeFrame([0, 0], 90), stations, members, couples: [] },
    DUPLE_IMPROPER.roleSet,
  );
}
const group = groupOf();

// --------------------------------------------------------------- the balance NaN
console.log("=== balance, station 2R, around t=0.469 ===");
{
  const def = CONTRA_FIGURES.balance as unknown as ContraFigure<ContraParams>;
  const params = withDefaults(def, {}, def.beats);
  for (let i = 0; i <= 8; i++) {
    const t = i * STEP;
    const pose = def.sample(group, "2R", t, params);
    const d = drawnArms(pose, t);
    console.log(
      `t=${t.toFixed(3)} hands L=${JSON.stringify(pose.hands.L)} R=${JSON.stringify(pose.hands.R)}`,
    );
    console.log(
      `        elbowL=${JSON.stringify(d.arms[0]!.elbow)} zL=${d.arms[0]!.elbowZ} shortL=${d.arms[0]!.short}`,
    );
  }
}

// ------------------------------------------------- the registry's furthest take
console.log("\n=== the furthest hip → joined point any figure in the registry uses ===");
let longest = 0;
let best: { figure: string; station: string; side: "L" | "R"; t: number; drop: number } | undefined;
for (const [id, figure] of Object.entries(CONTRA_FIGURES)) {
  const def = figure as unknown as ContraFigure<ContraParams>;
  const params = withDefaults(def, {}, def.beats);
  const steps = Math.round(def.beats / STEP);
  for (const station of group.stations) {
    for (let i = 0; i <= steps; i++) {
      const t = i * STEP;
      const pose = def.sample(group, station.id, t, params);
      for (const side of ["L", "R"] as const) {
        const hand = pose.hands[side];
        if (hand === "down") continue;
        const hip = handDown(pose.p, pose.facing, side, t, pose.amp);
        const gap = dist(hand.p, hip.p);
        if (gap > longest) {
          longest = gap;
          best = { figure: id, station: station.id, side, t, drop: hand.drop };
        }
      }
    }
  }
}
console.log(`${longest.toFixed(3)} px on the floor — ${JSON.stringify(best)}`);

// ------------------------------------------- the canonical take at that geometry
console.log("\n=== the canonical one-beat take, dancer standing still ===");
function measureTake(floorPx: number, drop: number) {
  const self = { p: [0, 0] as const, facing: 0 };
  const hip = handDown([0, 0], 0, "R", 0, 0);
  // Put the joined point `floorPx` from the hip, straight out to the dancer's
  // right, so the whole of the distance is real travel.
  const joined = { p: [hip.p[0], hip.p[1] + floorPx] as const, drop };
  const window = holdWindow(8, 1, 1);
  let hand = 0;
  let elbow = 0;
  let height = 0;
  let prev: { p: readonly [number, number]; drop: number } | undefined;
  let prevElbow: readonly [number, number] | undefined;
  for (let i = 0; i <= Math.round(2 / STEP); i++) {
    const t = i * STEP;
    const h = takeAndRelease(self, "R", t, joined, window, 0);
    const d = drawnArms(
      {
        p: [0, 0],
        facing: 0,
        look: 0,
        lean: 0,
        hands: { L: "down", R: h },
        stepRate: 1,
        buzz: false,
        flare: 0,
        amp: 0,
      },
      t,
    );
    if (prev && prevElbow) {
      hand = Math.max(hand, dist(h.p, prev.p) / STEP);
      elbow = Math.max(elbow, dist(d.arms[1]!.elbow, prevElbow) / STEP);
      height = Math.max(height, Math.abs(h.drop - prev.drop) / STEP);
    }
    prev = h;
    prevElbow = d.arms[1]!.elbow;
  }
  const sh = shouldersAt([0, 0], 0);
  const reach = dist(sh.R, joined.p);
  return { hand, elbow, height, reach, planar: planarReach(drop) };
}
for (const [floorPx, drop] of [
  [longest, best!.drop],
  [longest, 0],
  [14, 6],
  [12, 6],
] as const) {
  const m = measureTake(floorPx, drop);
  console.log(
    `hip→joined ${floorPx.toFixed(3)} px, drop ${drop}: hand ${m.hand.toFixed(3)} elbow ${m.elbow.toFixed(3)} (${(m.elbow / m.hand).toFixed(3)}×) height ${m.height.toFixed(3)} — shoulder reach ${m.reach.toFixed(2)} vs planarReach ${m.planar.toFixed(2)}`,
  );
}

// ------------------------------------------ the largest drop a take ever changes
console.log("\n=== the largest drop change a take ever makes ===");
let minDrop = Infinity;
let minWhere = "";
for (const [id, figure] of Object.entries(CONTRA_FIGURES)) {
  const def = figure as unknown as ContraFigure<ContraParams>;
  const params = withDefaults(def, {}, def.beats);
  const steps = Math.round(def.beats / STEP);
  for (const station of group.stations) {
    for (let i = 0; i <= steps; i++) {
      const t = i * STEP;
      const pose = def.sample(group, station.id, t, params);
      for (const side of ["L", "R"] as const) {
        const hand = pose.hands[side];
        if (hand === "down") continue;
        if (hand.drop < minDrop) {
          minDrop = hand.drop;
          minWhere = `${id} ${station.id} ${side} t=${t.toFixed(3)}`;
        }
      }
    }
  }
}
console.log(`the smallest drop any figure holds a hand at: ${minDrop.toFixed(3)} px (${minWhere})`);
console.log(`so the largest drop change over a 1-beat take: 14.5 − ${minDrop.toFixed(3)} = ${(14.5 - minDrop).toFixed(3)} px`);
