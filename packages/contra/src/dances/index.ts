import type { Dance } from "@caller/choreo";
import { afterTheSolstice } from "./afterTheSolstice.js";
import { airpants } from "./airpants.js";
import { contraCockaigne } from "./contraCockaigne.js";
import { jubilation } from "./jubilation.js";
import { kitchenStomp } from "./kitchenStomp.js";
import { neighborNeighborOnTheWall } from "./neighborNeighborOnTheWall.js";
import { thanksToTheGene } from "./thanksToTheGene.js";
import { theBabyRose } from "./theBabyRose.js";
import { theCarousel } from "./theCarousel.js";

/**
 * The dances the hall demo dances, in programme order.
 *
 * Every one is a real, published contra whose figures come from that dance's
 * own page on The Caller's Box, each of which states `Permission: full`; the
 * page and its id are named in the dance's own file. Nothing here is
 * reconstructed from memory, and this repository stores no other dance's
 * figures (see `docs/adr/2026-09-13-corpus-and-permission.md`).
 *
 * The order is a caller's order rather than the corpus's: a plain glossary
 * dance first, the figure-heavy ones in the middle, a second neighbour swing
 * near the end.
 */
export const DEMO_DANCES: readonly Dance[] = [
  airpants,
  theBabyRose,
  jubilation,
  contraCockaigne,
  theCarousel,
  kitchenStomp,
  afterTheSolstice,
  thanksToTheGene,
  neighborNeighborOnTheWall,
];

/** Every demo dance's slug, in programme order. */
export const DEMO_DANCE_SLUGS: readonly string[] = DEMO_DANCES.map((d) => d.slug);

/** The demo dance with this slug, or `undefined`. */
export const danceBySlug = (slug: string): Dance | undefined =>
  DEMO_DANCES.find((d) => d.slug === slug);

export { afterTheSolstice } from "./afterTheSolstice.js";
export { airpants } from "./airpants.js";
export { contraCockaigne } from "./contraCockaigne.js";
export { jubilation } from "./jubilation.js";
export { kitchenStomp } from "./kitchenStomp.js";
export { neighborNeighborOnTheWall } from "./neighborNeighborOnTheWall.js";
export { thanksToTheGene } from "./thanksToTheGene.js";
export { theBabyRose } from "./theBabyRose.js";
export { theCarousel } from "./theCarousel.js";
export { LARKS, ROBINS } from "./pairs.js";
export type { DanceOracles } from "./oracle.js";
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
