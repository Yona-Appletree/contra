import type { Dance } from "@caller/choreo";
import type { DanceFile } from "./loadDances.js";
import { danceFromFile } from "./loadDances.js";

// The ten demo dances, as data. Every file is `ContraDanceSpec` as written —
// title, author, formation id, phrases with figure calls and params, notes,
// `startPlaces`/`waitOut` where a dance has them — plus a `source` block with
// the Caller's Box id, URL, permission and the quoted transcript. Nothing here
// is reconstructed from memory (see
// `docs/adr/2026-09-13-corpus-and-permission.md`); the threaded `from` and
// `carried` places are derived by {@link danceFromFile} at load, never stored.
import aRareBirdFile from "../../../../data/dances/a-rare-bird.json" with { type: "json" };
import afterTheSolsticeFile from "../../../../data/dances/after-the-solstice.json" with { type: "json" };
import airpantsFile from "../../../../data/dances/airpants.json" with { type: "json" };
import butterFile from "../../../../data/dances/butter.json" with { type: "json" };
import contraCockaigneFile from "../../../../data/dances/contra-cockaigne.json" with { type: "json" };
import contrablendFile from "../../../../data/dances/contrablend.json" with { type: "json" };
import jubilationFile from "../../../../data/dances/jubilation.json" with { type: "json" };
import kitchenStompFile from "../../../../data/dances/kitchen-stomp.json" with { type: "json" };
import neighborNeighborOnTheWallFile from "../../../../data/dances/neighbor-neighbor-on-the-wall.json" with { type: "json" };
import programmeFile from "../../../../data/dances/programme.json" with { type: "json" };
import thanksToTheGeneFile from "../../../../data/dances/thanks-to-the-gene.json" with { type: "json" };
import theBabyRoseFile from "../../../../data/dances/the-baby-rose.json" with { type: "json" };
import theCarouselFile from "../../../../data/dances/the-carousel.json" with { type: "json" };
import whooshFile from "../../../../data/dances/whoosh.json" with { type: "json" };

/** Every dance file this package bundles, by its own slug. */
const DANCE_FILES: Record<string, DanceFile> = Object.fromEntries(
  (
    [
      aRareBirdFile,
      afterTheSolsticeFile,
      airpantsFile,
      butterFile,
      contraCockaigneFile,
      contrablendFile,
      jubilationFile,
      kitchenStompFile,
      neighborNeighborOnTheWallFile,
      thanksToTheGeneFile,
      theBabyRoseFile,
      theCarouselFile,
      whooshFile,
    ] as DanceFile[]
  ).map((file) => [file.slug, file]),
);

/** `data/dances/programme.json`: the demo's own dance order. */
const PROGRAMME = programmeFile as { slugs: readonly string[] };

/**
 * The dances the hall demo dances, in programme order.
 *
 * Every one is a real, published contra whose figures come from that dance's
 * own page on The Caller's Box, each of which states `Permission: full`; the
 * page and its id are named in the dance's own `data/dances/<slug>.json`
 * file. Nothing here is reconstructed from memory, and this repository stores
 * no other dance's figures (see
 * `docs/adr/2026-09-13-corpus-and-permission.md`).
 *
 * The order is a caller's order rather than the corpus's: a plain glossary
 * dance first, the figure-heavy ones in the middle, a second neighbour swing
 * near the end. It lives in `data/dances/programme.json`, not here.
 */
export const DEMO_DANCES: readonly Dance[] = PROGRAMME.slugs.map((slug) => {
  const file = DANCE_FILES[slug];
  if (!file) {
    throw new Error(
      `data/dances/programme.json names "${slug}", which has no data/dances/${slug}.json`,
    );
  }
  if (file.status === "lab") {
    throw new Error(
      `data/dances/programme.json names "${slug}", which is \`status: "lab"\`; ` +
        `a lab dance is not shippable, so take it out of the programme or out of the lab`,
    );
  }
  return danceFromFile(file);
});

/**
 * The dances that load but are not shipped: `DanceFile.status === "lab"`.
 *
 * Reachable by `pnpm dance <slug>` and by {@link danceBySlug}, and by nothing
 * the demo shows. M6 brings the first three — Whoosh, Contrablend and A Rare
 * Bird — and the rest of the acceptance set's twelve arrive the same way.
 */
export const LAB_DANCES: readonly Dance[] = Object.values(DANCE_FILES)
  .filter((file) => file.status === "lab")
  .map((file) => danceFromFile(file));

const SHIPPED_FILES = Object.keys(DANCE_FILES).filter(
  (slug) => DANCE_FILES[slug]!.status !== "lab",
);
if (DEMO_DANCES.length !== SHIPPED_FILES.length) {
  throw new Error(
    `data/dances/ holds ${SHIPPED_FILES.length} shippable dance files but ` +
      `programme.json names ${DEMO_DANCES.length}; every file that is not ` +
      `\`status: "lab"\` must be in the programme`,
  );
}

/** Every demo dance's slug, in programme order. */
export const DEMO_DANCE_SLUGS: readonly string[] = DEMO_DANCES.map((d) => d.slug);

/** Every dance this package loads, shipped and lab alike. */
export const ALL_DANCES: readonly Dance[] = [...DEMO_DANCES, ...LAB_DANCES];

/** The dance with this slug — a demo dance or a lab one — or `undefined`. */
export const danceBySlug = (slug: string): Dance | undefined =>
  ALL_DANCES.find((d) => d.slug === slug);

export { LARKS, ROBINS } from "./pairs.js";
export type { MotionAllowance, MotionMetric } from "./motionAllowlist.js";
export { MOTION_ALLOWLIST, motionAllowance } from "./motionAllowlist.js";
export type { DanceLabReport, EndEffectRow, ResolutionRow } from "./danceLab.js";
export { danceLabReport, danceOwes, danceResolution, endEffects, labCouples } from "./danceLab.js";
export type { AcceptanceDance } from "./acceptance.js";
export { ACCEPTANCE_SET, UNSUPPORTED_FIGURES, UNSUPPORTED_RELATIONS } from "./acceptance.js";
export type { DanceFile, DanceFileSource } from "./loadDances.js";
export { danceFromFile } from "./loadDances.js";
export { CONTRA_FORMATIONS, formationById } from "./formations.js";
export type { DanceOracles, DanceRunOptions } from "./oracle.js";
export {
  BECKET_LINES,
  CLOSURE_PX,
  COLLISION_PX,
  DUPLE_LINES,
  danceAlone,
  formationFor,
  linesFor,
  oraclesFor,
} from "./oracle.js";
