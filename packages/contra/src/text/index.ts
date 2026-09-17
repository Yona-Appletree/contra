// The seven texts every figure is written in, as data, and the vocabulary they
// are resolved through. See `figureText.ts` and `relationWords.ts`, and
// `docs/move-texts.md` for the voice they are written in.

export type {
  CallForm,
  CallToken,
  CallTokenKind,
  FigureTextFile,
  FigureTexts,
  FigureWalkthrough,
  PartialFigureText,
  Register,
  TextLevel,
  TextSlots,
} from "./figureText.js";
export {
  DESCRIPTION_WORDS,
  FIGURE_TEXTS,
  FORM_WORDS,
  LINE_WORDS,
  REQUIRED_FORM_BEATS,
  RETIRED_SLOTS,
  SHORT_FORM_WORDS,
  SLOT_NAMES,
  TEACH_WORDS,
  callWho,
  checkFigureTexts,
  figureDefOf,
  formFor,
  hasFigureText,
  mergeVariants,
  renderSlot,
  resolveFigureForms,
  resolveFigureText,
  slotsIn,
  textedFigureIds,
  textsOf,
  variantMatches,
  variantValue,
} from "./figureText.js";

export type { WhoWord } from "./relationWords.js";
export { relationWords, whoKey, whoOf } from "./relationWords.js";

// `placesOf` stays internal to `landmark.ts` (P7): its own name collides with
// `set/shape.ts`'s unrelated `placesOf` at the package root, so a public
// re-export here was already unreachable through `@caller/contra`'s own
// barrel, and `HOME_PX`/`isHome` had no caller left after P2 replaced the "you
// are back where you started" branch with the seam's own two sentences.
export { landmark } from "./landmark.js";

export type { Hint, Need, Place, SeamRelation, SeamSide } from "./seam.js";
export {
  NEXT_TO_PX,
  SAME_LINE_PX,
  SAME_ROW_PX,
  chainTarget,
  hintText,
  needOf,
  placeOf,
  relationTo,
  relationWordBetween,
  sayWhoIsWhere,
  seamHint,
  toOf,
} from "./seam.js";

export type { WalkthroughCard, WalkthroughEntry, WalkthroughLine } from "./walkthrough.js";
export { danceWalkthrough } from "./walkthrough.js";

export { DANCE_LEVEL_KEYS, applyTeach, checkDanceTeach, teachKey } from "./teach.js";

export type { CallPolicy, CallingCardCell, CallingCardRow, SpokenCall } from "./callScript.js";
export {
  DEFAULT_CALL_POLICY,
  FULL_CALL_BUDGET,
  LEAD_BEATS,
  WHILE,
  budgetFor,
  callScript,
  callTexts,
  callingCard,
  classifyCall,
  headingTokens,
} from "./callScript.js";

export { passListFor, scheduleSentences, scheduleTeach } from "./scheduleTeach.js";
