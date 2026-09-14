// The figure primitive language: a small closed expression calculus, a short
// list of motion segments and one hand primitive, plus the interpreter that
// turns a figure written as data into the `ContraFigure` a coded one already
// is. See `docs/adr/2026-09-14-figure-primitive-language.md`.

export type { AngleExpr, ExprEnv, NumberExpr, PointExpr, PoseExpr, StationExpr } from "./expr.js";
export { evalAngle, evalNumber, evalPoint, evalSpot, evalStation } from "./expr.js";

export type {
  CarriedHand,
  DownHand,
  FigureSpec,
  HandSpec,
  HoldWindowSpec,
  JoinedHand,
  RingWalkSegment,
  Segment,
  SpecParams,
} from "./figureSpec.js";
export { trackFor } from "./figureSpec.js";

export { compileFigureSpec } from "./compileFigureSpec.js";
