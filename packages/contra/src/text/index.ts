// The seven texts every figure is written in, as data, and the vocabulary they
// are resolved through. See `figureText.ts` and `relationWords.ts`, and
// `docs/move-texts.md` for the voice they are written in.

export type {
  CallForm,
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

export type { Place, Relation } from "./landmark.js";
export { facingClause, isHome, landmark, relationOf } from "./landmark.js";
