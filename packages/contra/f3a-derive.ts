// scratch: derive the motion bound. Deleted before commit.
import { drawnArms, dist, SEAM_BEATS } from "@caller/core";
import type { Group, StationId } from "@caller/choreo";
import { createGroup, frame as makeFrame, withDefaults } from "@caller/choreo";
import { DUPLE_IMPROPER } from "./src/formation/dupleImproper.js";
import { CONTRA_FIGURES, CONTRA_FIGURE_IDS } from "./src/figures/registry.js";
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

// ---------------------------------------------------------------- per figure
const group = groupOf();
const rows: Array<[string, number, number, number, string]> = [];
for (const id of CONTRA_FIGURE_IDS) {
  const def = CONTRA_FIGURES[id] as unknown as ContraFigure<ContraParams>;
  const params = withDefaults(def, {}, def.beats);
  let worstHand = 0;
  let worstElbow = 0;
  let worstHeight = 0;
  let where = "";
  const steps = Math.round(def.beats / STEP);
  for (const station of group.stations) {
    let prev: ReturnType<typeof drawnArms> | undefined;
    let prevPose: ReturnType<typeof def.sample> | undefined;
    for (let i = 0; i <= steps; i++) {
      const t = i * STEP;
      const pose = def.sample(group, station.id, t, params);
      const drawn = drawnArms(pose, t);
      if (prev && prevPose) {
        for (const [k, side] of ([0, 1] as const).map((k) => [k, k === 0 ? "L" : "R"] as const)) {
          const h = dist(drawn.hands[side].p, prev.hands[side].p) / STEP;
          const e = dist(drawn.arms[k]!.elbow, prev.arms[k]!.elbow) / STEP;
          const dh = Math.abs(drawn.hands[side].drop - prev.hands[side].drop) / STEP;
          if (h > worstHand) {
            worstHand = h;
            where = `${station.id} ${side} t=${t.toFixed(3)}`;
          }
          worstElbow = Math.max(worstElbow, e);
          worstHeight = Math.max(worstHeight, dh);
        }
      }
      prev = drawn;
      prevPose = pose;
    }
  }
  rows.push([id, worstHand, worstElbow, worstHeight, where]);
}
rows.sort((a, b) => b[1] - a[1]);
console.log("=== per figure alone, worst hand / elbow / height (px per beat) ===");
for (const [id, h, e, dh, w] of rows) {
  console.log(`${id.padEnd(24)} hand ${h.toFixed(2).padStart(7)}  elbow ${e.toFixed(2).padStart(7)}  height ${dh.toFixed(2).padStart(7)}  ${w}`);
}

// ------------------------------------------------- the canonical one-beat take
// A dancer standing still takes one hand from the hip to a joined point `d` px
// away on the floor, over one beat, with `takeAndRelease`'s own ramp.
console.log("\n=== the canonical one-beat take, standing still ===");
const self = { p: [0, 0] as const, facing: 0 };
for (const d of [6, 8, 10, 12, 14, 16]) {
  const window = holdWindow(8, 1, 1);
  const joined = { p: [d, 0] as const, drop: 5 };
  let worstHand = 0;
  let worstElbow = 0;
  let worstHeight = 0;
  let prevHand: { p: readonly [number, number]; drop: number } | undefined;
  let prevElbow: readonly [number, number] | undefined;
  for (let i = 0; i <= Math.round(2 / STEP); i++) {
    const t = i * STEP;
    const hand = takeAndRelease(self, "R", t, joined, window, 0);
    const drawn = drawnArms(
      {
        p: [0, 0],
        facing: 0,
        look: 0,
        lean: 0,
        hands: { L: "down", R: hand },
        stepRate: 1,
        buzz: false,
        flare: 0,
        amp: 0,
      },
      t,
    );
    if (prevHand && prevElbow) {
      worstHand = Math.max(worstHand, dist(hand.p, prevHand.p) / STEP);
      worstElbow = Math.max(worstElbow, dist(drawn.arms[1]!.elbow, prevElbow) / STEP);
      worstHeight = Math.max(worstHeight, Math.abs(hand.drop - prevHand.drop) / STEP);
    }
    prevHand = hand;
    prevElbow = drawn.arms[1]!.elbow;
  }
  const hipToJoined = dist(handDown([0, 0], 0, "R", 0, 0).p, joined.p);
  console.log(
    `hip→joined ${hipToJoined.toFixed(2)} px: hand ${worstHand.toFixed(2)} px/beat, elbow ${worstElbow.toFixed(2)} px/beat (${(worstElbow / worstHand).toFixed(3)}×), height ${worstHeight.toFixed(2)} px/beat`,
  );
}

// ---------------------------- how far a take actually reaches, over the registry
console.log("\n=== how far a take actually reaches, over the registry ===");
let longest = 0;
let longestWhere = "";
for (const id of CONTRA_FIGURE_IDS) {
  const def = CONTRA_FIGURES[id] as unknown as ContraFigure<ContraParams>;
  const params = withDefaults(def, {}, def.beats);
  for (const station of group.stations) {
    const steps = Math.round(def.beats / STEP);
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
          longestWhere = `${id} ${station.id} ${side} t=${t.toFixed(3)}`;
        }
      }
    }
  }
}
console.log(`the furthest a placed hand ever is from its own hip: ${longest.toFixed(3)} px (${longestWhere})`);
console.log(`SEAM_BEATS = ${SEAM_BEATS}`);
