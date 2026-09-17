import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Beat, DancerId, Timeline } from "@caller/choreo";
import { poseAt } from "@caller/choreo";

/**
 * **Where the demo dances stand, frozen.**
 *
 * Every dancer of every demo dance, on every beat of two times through, at
 * every line length the dance is checked at, on the path the app actually
 * dances (`LAB_RUN`: the contra cycle planner over the data library). Written
 * once and compared against on every run.
 *
 * ## Why this and not AC1's own golden
 *
 * AC1 asked whether resolution against set state reproduced `chainCalls`, and
 * it answered yes: `planCycle.golden.test.ts` compared the ten threadable demo
 * dances through the contra planner **with every figure bridged** against the
 * decider's own planner over the **coded** registry, pose for pose at 1e-9, and
 * passed from M1 until this milestone.
 *
 * Both sides of that comparison were the coded layer. M11 deletes it, and the
 * data figures are *not* pose-identical to the coded ones — the honest end, the
 * planted gait and the cruise profile are deliberate differences the per-figure
 * goldens measure and the user approved at G1 and at M10's gate. So AC1's own
 * comparison cannot be turned into a fixture: there is nothing left to put on
 * either side of it, and a fixture of the old path checked against the data
 * path would fail at 1e-9 by construction rather than by regression.
 *
 * What is worth keeping is the **deletion's own proof that nothing moved**, and
 * that is this file: the shipped path's poses, sampled at the last commit that
 * still held the coded layer, asserted unchanged afterwards at AC1's own
 * tolerance. AC1's result is recorded in `docs/acceptance.md` with the sha it
 * last passed at.
 *
 * ## Regenerating it
 *
 * `UPDATE_DANCE_GOLDEN=1 pnpm --filter @caller/contra test` rewrites it. Like
 * the Playwright strips, it is a picture of what the code draws: a diff here is
 * a **look change**, and a look change is gate-governed (the director's E-look
 * rubric). Rewrite it when a gate approved the change, and say in the pull
 * request which dances moved and by how much.
 */
export interface DanceGolden {
  /** The commit the poses were sampled at, and the date. */
  sampledAt: string;
  /** How often a pose was taken, in beats. */
  step: Beat;
  /** How far each dance was danced, in beats. */
  until: Beat;
  /** One run per dance and line length, keyed by {@link danceGoldenKey}. */
  runs: Record<string, DanceGoldenRun>;
}

/** One dance at one line length. */
export interface DanceGoldenRun {
  dance: string;
  couples: number;
  /** `timeline.dancers()`, in its own insertion order — part of the claim. */
  dancers: readonly DancerId[];
  /** Per dancer, `[x, y, facing]` at t = 0, `step`, 2·`step`, … `until`. */
  poses: Record<DancerId, readonly (readonly number[])[]>;
}

/** Which run a dance and a line length name. */
export const danceGoldenKey = (slug: string, couples: number): string =>
  `${slug}|${String(couples)}`;

/** Every dancer's place and facing, sampled off a planned timeline. */
export function traceDance(timeline: Timeline, until: Beat, step: Beat): DanceGoldenRun["poses"] {
  const poses: Record<DancerId, (readonly number[])[]> = {};
  const steps = Math.round(until / step);
  for (const dancer of timeline.dancers()) {
    const rows: number[][] = [];
    for (let i = 0; i <= steps; i++) {
      const pose = poseAt(timeline, dancer, i * step);
      rows.push([pose.p[0], pose.p[1], pose.facing]);
    }
    poses[dancer] = rows;
  }
  return poses;
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), "goldens", "demoDances.json");

/** The committed golden. */
export const danceGolden = (): DanceGolden => JSON.parse(readFileSync(FILE, "utf8")) as DanceGolden;

/** Whether this run is rewriting the golden rather than checking it. */
export const updatingDanceGolden = (): boolean => process.env["UPDATE_DANCE_GOLDEN"] === "1";

/** Write the golden back out; see the note on regenerating it. */
export function writeDanceGolden(golden: DanceGolden): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(golden)}\n`);
}
