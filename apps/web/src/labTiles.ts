import type { Beat } from "@caller/core";
import { poseAt } from "@caller/choreo";
import type { FigureDefaultsOverride } from "@caller/contra";
import type { GalleryTile } from "./galleryTiles.js";
import { MIN_TILE_WORLD, seamByKey, seamTile, tileDancers } from "./galleryTiles.js";
import type { EngineChoice } from "./state/engineQuery.js";

/**
 * The **seam lab**'s data (M3, gate G1): one seam of one dance, danced through
 * both engines at once so the honest-ends treatment can be judged by watching
 * rather than by reading a number.
 *
 * Both treatments are the same two calls of the same dance, from the same
 * places, over the same beats, driven by one clock. The only difference is
 * which `CyclePlanner` and which registry planned them:
 *
 * - **A, today** — `defaultCyclePlanner` over the coded figures. Every figure
 *   puts its dancers down on the formation's own stations, whatever it was
 *   doing, because that is what the coded ends say.
 * - **B, honest ends** — the contra planner resolving against live set state,
 *   with M2's five gatherers read as `FigureDefinition`s. A swing opens out on
 *   to the places that suit the pair rather than on to the pair's own two
 *   slots; a balance closes up where the figure before it left people.
 *
 * Nothing in the lab is a parameter anybody typed here: the seam is the dance's
 * own two calls and the treatments are the two engines the app ships. That is
 * the whole point — what the gate is looking at is what the Stage does.
 */

/** How far before the boundary the lab loops, in beats (the brief's four). */
export const LAB_BEFORE: Beat = 4;

/** `after` for the two reaches the lab offers: the brief's eight, or the whole second figure. */
export const LAB_REACH = { seam: 8, figure: 64 } as const;
export type LabReach = keyof typeof LAB_REACH;

/** One treatment of a seam: which engine, and what to watch for. */
export interface LabTreatment {
  letter: string;
  engine: EngineChoice;
  name: string;
  thesis: string;
}

/** The two treatments, in the order the lab lays them out. */
export const LAB_TREATMENTS: readonly LabTreatment[] = [
  // **Treatment A is gone** (M11). It was "today": the coded figures on
  // `?engine=old`, every figure ending on the formation's own stations. The
  // user ruled the coded layer could go, so there is nothing to put beside B
  // any more and the lab shows the treatment that ships. What the page was for
  // — G1's "is the honest-ends treatment the right look?" — is closed: the user
  // answered yes at G1 on 2026-09-15.
  {
    letter: "B",
    engine: "new",
    name: "honest ends",
    thesis:
      "The five gatherers as data, resolved against live set state. A figure ends where it " +
      "honestly leaves people and the next one starts from there: the swing opens out on to the " +
      "places that suit the pair, and the balance closes up along the way they are already " +
      "standing.",
  },
];

/** One seam the lab ships a link to. */
export interface LabSeam {
  /** The seam key, the same one the Moves page files the tile under. */
  key: string;
  /** What the seam is, and what the gate is being asked about it. */
  hint: string;
}

/**
 * The seams shipped as links. The lab opens **any** seam key the corpus has —
 * `#/lab/seam/<a>--<b>` — so this list is a shortlist, not a limit.
 *
 * M3's brief names two: Butter's `hey → balance-and-swing` and "Jubilation's
 * `allemande → swing`". Both are here, and neither is the seam the gate needs.
 *
 * - Jubilation has **no** `allemande → swing` boundary. Its figures run
 *   `balance-and-swing → allemande → allemande → hey → swing → long-lines →
 *   robins-chain`. The seam by that name exists in Kitchen Stomp, which is the
 *   dance the Moves page already files `allemande--swing` under, so that is
 *   what is shipped — and there the two engines agree on every position and
 *   facing, differing only in the quiet motion of the two dancers the
 *   allemande leaves out.
 * - Butter's `hey → balance-and-swing` is danced **identically** by the two
 *   engines, to 0.000 px: Butter's hey hands the pair over square on their own
 *   places, so an honest end and the formation's place are the same point.
 * - **Jubilation's `hey → swing`** is the seam the brief was reaching for, and
 *   it leads the list: measured over every demo dance, two times through,
 *   every dancer at every 1/4 beat, it is the *only* place in the corpus where
 *   the two engines dance differently at all.
 */
export const LAB_SEAMS: readonly LabSeam[] = [
  {
    key: "hey--swing",
    hint:
      "Jubilation, duple improper: B1 half hey, then partner swing. The one seam in the whole " +
      "demo corpus where the two engines dance differently: 12.20 px of position and a whole " +
      "turn of facing, four beats into the swing. The hey leaves the pair off square, the coded " +
      "swing walks them back to their two slots anyway, and the data swing opens out on to the " +
      "places that suit them from where the hey really left them. This is the seam gate G1's " +
      "second question is really about.",
  },
  {
    key: "hey--balance-and-swing",
    hint:
      "Butter, becket: B1 hey for four, B2 partner balance and swing — the seam the brief names. " +
      "The two treatments are identical here, to 0.000 px: Butter's hey leaves the pair " +
      "square on their own places, so the honest end and the formation's place are the same " +
      "point and there is nothing for a gatherer to gather. Worth watching to see that it is the " +
      "same dance, and worth knowing that this seam cannot answer the question on its own.",
  },
  {
    key: "allemande--swing",
    hint:
      "Kitchen Stomp, duple improper: A2 larks allemande left once and a half, B1 partner swing. " +
      "Every position and facing is identical; what changed is the two robins, who are not " +
      "in the allemande at all and now dance an explicit hold-place figure with the hall's quiet " +
      "motion instead of standing inside the allemande's own event with it switched off. The " +
      "allemande is also the gatherer that gathers least — it keeps the direction the turn " +
      "stopped on and takes only its end spacing off the formation — which is one of the two " +
      "look decisions M2 left for this gate.",
  },
];

/** One seam, danced both ways: the tiles, side by side, on one world. */
export interface LabSection {
  key: string;
  title: string;
  dance: string;
  hint: string;
  /** One tile per treatment, parallel to {@link LAB_TREATMENTS}. */
  tiles: GalleryTile[];
  /** How long the looping window is, in beats. */
  beats: Beat;
  /** How far the two treatments are apart at their worst, over this window. */
  divergence: LabDivergence;
}

/**
 * The worst the two treatments disagree over the looping window, measured
 * rather than asserted.
 *
 * It is the first thing a reviewer needs and the hardest thing to see: two
 * tiles that look alike may be alike to the pixel or may differ by a step
 * somewhere the eye was not on. The lab says the number before it asks the
 * question.
 */
export interface LabDivergence {
  /** Worst distance between one dancer's two positions, px. */
  px: number;
  /** Worst difference in one dancer's facing, degrees. */
  degrees: number;
  /** Beats from the boundary where the worst position difference was. */
  at: Beat;
  /** Whose it was, or `""` when the two are identical. */
  dancer: string;
}

/**
 * One seam's section: a tile per treatment, all drawn on one world so the two
 * stand at the same scale and the strips' columns line up.
 */
export function labSection(
  key: string,
  reach: LabReach = "seam",
  overrides: FigureDefaultsOverride = {},
): LabSection {
  const seam = seamByKey(key);
  if (seam === undefined) throw new Error(`the seam lab has no seam "${key}"`);
  const window = { before: LAB_BEFORE, after: LAB_REACH[reach] };
  const tiles = LAB_TREATMENTS.map((treatment) =>
    seamTile(seam, overrides, treatment.engine, window, `lab/${key}/${treatment.letter}`),
  );
  const world = {
    w: Math.max(MIN_TILE_WORLD.w, ...tiles.map((t) => t.world.w)),
    h: Math.max(MIN_TILE_WORLD.h, ...tiles.map((t) => t.world.h)),
  };
  const sized = tiles.map((t) => ({ ...t, world }));
  return {
    key,
    title: `${seam.a.figure} → ${seam.b.figure}`,
    dance: seam.dance.slug,
    hint: LAB_SEAMS.find((s) => s.key === key)?.hint ?? "",
    tiles: sized,
    beats: sized[0]?.window.beats ?? 0,
    divergence: divergenceOf(sized[0]!, sized[1]!),
  };
}

/** How far apart two treatments of one seam get, sampled at {@link LAB_STEP}. */
export function divergenceOf(a: GalleryTile, b: GalleryTile): LabDivergence {
  const here = tileDancers(a);
  const there = tileDancers(b);
  const seamAt = a.seamAt ?? 0;
  let px = 0;
  let degrees = 0;
  let at: Beat = 0;
  let dancer = "";
  for (let i = 0; i < here.length; i++) {
    const them = there[i];
    if (them === undefined) continue;
    for (let t = 0; t <= a.window.beats; t += LAB_STEP) {
      const into = Math.min(t, a.window.beats);
      const p = poseAt(a.timeline, here[i]!, a.window.start + into);
      const q = poseAt(b.timeline, them, b.window.start + into);
      degrees = Math.max(degrees, Math.abs(((p.facing - q.facing + 540) % 360) - 180));
      const d = Math.hypot(p.p[0] - q.p[0], p.p[1] - q.p[1]);
      if (d > px) {
        px = d;
        at = into - seamAt;
        dancer = here[i]!;
      }
    }
  }
  return { px, degrees, at, dancer };
}

/** How often the divergence is sampled, in beats. */
const LAB_STEP = 0.125;

/** Every seam key the lab can open, in the Moves page's own order. */
export const labSeamKeys = (): string[] => LAB_SEAMS.map((s) => s.key);
