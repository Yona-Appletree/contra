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
import afterTheSolsticeFile from "../../../../data/dances/after-the-solstice.json" with { type: "json" };
import airpantsFile from "../../../../data/dances/airpants.json" with { type: "json" };
import butterFile from "../../../../data/dances/butter.json" with { type: "json" };
import contraCockaigneFile from "../../../../data/dances/contra-cockaigne.json" with { type: "json" };
import jubilationFile from "../../../../data/dances/jubilation.json" with { type: "json" };
import kitchenStompFile from "../../../../data/dances/kitchen-stomp.json" with { type: "json" };
import neighborNeighborOnTheWallFile from "../../../../data/dances/neighbor-neighbor-on-the-wall.json" with { type: "json" };
import programmeFile from "../../../../data/dances/programme.json" with { type: "json" };
import thanksToTheGeneFile from "../../../../data/dances/thanks-to-the-gene.json" with { type: "json" };
import theBabyRoseFile from "../../../../data/dances/the-baby-rose.json" with { type: "json" };
import theCarouselFile from "../../../../data/dances/the-carousel.json" with { type: "json" };

/** Every dance file this package bundles, by its own slug. */
const DANCE_FILES: Record<string, DanceFile> = Object.fromEntries(
  (
    [
      afterTheSolsticeFile,
      airpantsFile,
      butterFile,
      contraCockaigneFile,
      jubilationFile,
      kitchenStompFile,
      neighborNeighborOnTheWallFile,
      thanksToTheGeneFile,
      theBabyRoseFile,
      theCarouselFile,
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
  return danceFromFile(file);
});

if (DEMO_DANCES.length !== Object.keys(DANCE_FILES).length) {
  throw new Error(
    `data/dances/ holds ${Object.keys(DANCE_FILES).length} dance files but ` +
      `programme.json names ${DEMO_DANCES.length}; every file must be in the programme`,
  );
}

/** Every demo dance's slug, in programme order. */
export const DEMO_DANCE_SLUGS: readonly string[] = DEMO_DANCES.map((d) => d.slug);

/** The demo dance with this slug, or `undefined`. */
export const danceBySlug = (slug: string): Dance | undefined =>
  DEMO_DANCES.find((d) => d.slug === slug);

export { LARKS, ROBINS } from "./pairs.js";
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
