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

export { HOME_PX, isHome, landmark, placesOf } from "./landmark.js";

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

export type { CallPolicy, CallingCardCell, CallingCardRow, SpokenCall } from "./callScript.js";
export {
  DEFAULT_CALL_POLICY,
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
