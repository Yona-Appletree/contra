// The four texts every move is written in, as data, and the one sentence that
// is generated rather than written. See `figureText.ts` and `landmark.ts`, and
// `docs/move-texts.md` for the voice they are written in.

export type {
  FigureCallText,
  FigureTextFile,
  FigureTexts,
  FigureWalkthrough,
  PartialFigureText,
  Register,
} from "./figureText.js";
export {
  FIGURE_TEXTS,
  LONG_CALL_WORDS,
  LONG_WORDS,
  SHORT_CALL_WORDS,
  SHORT_WORDS,
  SLOT_NAMES,
  WHERE,
  checkFigureTexts,
  figureDefOf,
  hasFigureText,
  mergeVariants,
  pairingName,
  renderSlot,
  resolveFigureText,
  slotsIn,
  textsOf,
  variantMatches,
  variantValue,
} from "./figureText.js";

export type { Place, Relation } from "./landmark.js";
export { facingClause, isHome, landmark, relationOf } from "./landmark.js";
