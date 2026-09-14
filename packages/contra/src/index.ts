// @caller/contra — contra as one form on top of the form-neutral model in
// `@caller/choreo`: the role set, the formations, and (from M8) the figure
// library and the encoded dances. See README.md.

export { CONTRA_ROLES, LARK, ROBIN } from "./roles.js";

export {
  ACROSS_PX,
  DUPLE_IMPROPER,
  DUPLE_IMPROPER_LINE_UP_CALLS,
  DUPLE_IMPROPER_STATIONS,
  DUPLE_IMPROPER_WAIT_STATIONS,
  PLACE_PITCH_PX,
  partitionDupleImproper,
} from "./formation/dupleImproper.js";

export {
  BECKET,
  BECKET_LINE_UP_CALLS,
  BECKET_STATIONS,
  BECKET_WAIT_STATIONS,
  COUPLE_PITCH_PX,
  partitionBecket,
} from "./formation/becket.js";

export * from "./figures/index.js";
export * from "./pair/index.js";

export {
  DEMO_DANCES,
  DEMO_DANCE_SLUGS,
  danceBySlug,
  afterTheSolstice,
  airpants,
  contraCockaigne,
  jubilation,
  kitchenStomp,
  neighborNeighborOnTheWall,
  thanksToTheGene,
  theBabyRose,
  theCarousel,
  LARKS,
  ROBINS,
  BECKET_LINES,
  CLOSURE_PX,
  COLLISION_PX,
  DUPLE_LINES,
  danceAlone,
  formationFor,
  linesFor,
  oraclesFor,
  type DanceOracles,
} from "./dances/index.js";

export { normaliseTitle, titleKey } from "./corpus/normaliseTitle.js";

/** Package identity, kept from the M1 scaffold smoke test. */
export const packageName = "@caller/contra";
