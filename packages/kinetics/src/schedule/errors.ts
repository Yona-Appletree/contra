import type { DancerId } from "../dialect/Dialect.js";
import type { Span } from "@caller/lang";

/**
 * What the scheduler says when the beats do not suffice (D3): a compile
 * error, never a fast dancer. Errors are data; `schedule` returns them and
 * the debugger prints them.
 */
export type ScheduleErrorKind =
  | "TimingViolation"
  | "RateTooHigh"
  | "StepTooLong"
  | "PivotTooLarge"
  | "TakeOutOfReach"
  | "Unplannable"
  /** A hand this take wants is already in a third dancer's hold (M3, `K107`). */
  | "HandTaken";

export interface ScheduleError {
  kind: ScheduleErrorKind;
  message: string;
  call: number;
  dancer?: DancerId;
  beat?: number;
  span?: Span;
}

export interface ScheduleWarning {
  kind: "LongStride" | "IntrinsicTruncated";
  message: string;
  call: number;
  dancer?: DancerId;
  beat?: number;
}
