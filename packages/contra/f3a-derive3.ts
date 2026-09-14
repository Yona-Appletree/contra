// scratch: find the NaN, pin the canonical numbers. Deleted before commit.
import { drawnArms, dist, shouldersAt, solveArm3d } from "@caller/core";
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

console.log("=== hunting the NaN across the whole registry ===");
for (const [id, figure] of Object.entries(CONTRA_FIGURES)) {
  const def = figure as unknown as ContraFigure<ContraParams>;
  const params = withDefaults(def, {}, def.beats);
  const steps = Math.round(def.beats / STEP);
  for (const station of group.stations) {
    for (let i = 0; i <= steps; i++) {
      const t = i * STEP;
      const pose = def.sample(group, station.id, t, params);
      const d = drawnArms(pose, t);
      for (const k of [0, 1] as const) {
        const arm = d.arms[k]!;
        if (Number.isNaN(arm.elbow[0]) || Number.isNaN(arm.elbowZ) || Number.isNaN(arm.handZ)) {
          const side = k === 0 ? "L" : "R";
          console.log(
            `NaN: ${id} ${station.id} ${side} t=${t.toFixed(4)} hand=${JSON.stringify(d.hands[side])} shoulder=${JSON.stringify(d.shoulders[side])} facing=${pose.facing}`,
          );
          const sh = d.shoulders[side];
          const h = d.hands[side];
          console.log(
            `     planar=${Math.hypot(h.p[0] - sh[0], h.p[1] - sh[1])} drop=${h.drop} solved=${JSON.stringify(solveArm3d(sh, h, side, pose.facing))}`,
          );
          i = steps + 1;
          break;
        }
      }
    }
  }
}

console.log("\n=== canonical one-beat take, exact ===");
function take(floorPx: number, drop: number) {
  const self = { p: [0, 0] as const, facing: 0 };
  const hip = handDown([0, 0], 0, "R", 0, 0);
  const joined = { p: [hip.p[0], hip.p[1] + floorPx] as const, drop };
  const w = holdWindow(8, 1, 1);
  let hand = 0;
  let elbow = 0;
  let height = 0;
  let prev: { p: readonly [number, number]; drop: number } | undefined;
  let prevElbow: readonly [number, number] | undefined;
  for (let i = 0; i <= Math.round(2 / STEP); i++) {
    const t = i * STEP;
    const h = takeAndRelease(self, "R", t, joined, w, 0);
    const d = drawnArms(
      { p: [0, 0], facing: 0, look: 0, lean: 0, hands: { L: "down", R: h }, stepRate: 1, buzz: false, flare: 0, amp: 0 },
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
  return { hand, elbow, height };
}
const a = take(17.899, 6.5);
console.log(`floor 17.899, drop 6.5 : hand ${a.hand} elbow ${a.elbow} ratio ${a.elbow / a.hand} height ${a.height}`);
const b = take(17.899, 0);
console.log(`floor 17.899, drop 0   : hand ${b.hand} elbow ${b.elbow} ratio ${b.elbow / b.hand} height ${b.height}`);

console.log("\n=== a hanging hand's own out-and-back, per beat ===");
{
  let worst = 0;
  let prevLocal: readonly [number, number, number] | undefined;
  let dir: readonly [number, number, number] | undefined;
  let mark: { beat: number; local: readonly [number, number, number] } | undefined;
  for (let i = 0; i <= Math.round(8 / STEP); i++) {
    const t = i * STEP;
    const h = handDown([0, 0], 0, "R", t, 1);
    const local: readonly [number, number, number] = [h.p[0], h.p[1], -h.drop];
    if (prevLocal) {
      const m = [local[0] - prevLocal[0], local[1] - prevLocal[1], local[2] - prevLocal[2]] as const;
      const len = Math.hypot(m[0], m[1], m[2]);
      if (len > 1e-9) {
        const d2 = [m[0] / len, m[1] / len, m[2] / len] as const;
        const reversed = dir !== undefined && d2[0] * dir[0] + d2[1] * dir[1] + d2[2] * dir[2] < 0;
        if (reversed) {
          if (mark && t - mark.beat <= 1) {
            worst = Math.max(
              worst,
              Math.hypot(prevLocal[0] - mark.local[0], prevLocal[1] - mark.local[1], prevLocal[2] - mark.local[2]),
            );
          }
          mark = { beat: t, local: prevLocal };
        }
        dir = d2;
      }
    }
    prevLocal = local;
  }
  console.log(`a hanging hand's worst out-and-back inside one beat: ${worst.toFixed(6)} px (2 × HAND_HANG_SWING_PX = 1.2)`);
}
