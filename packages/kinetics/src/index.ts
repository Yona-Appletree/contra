// @caller/kinetics — engine 3: a compiler from a dance program to proved
// motion. Nothing imports this package (D11); see README.md.
export const KINETICS = "engine 3" as const;

// the language: source text → a per-dancer compiled sequence
export type {
  Arg,
  CallStmt,
  DefineStmt,
  IfStmt,
  RepeatStmt,
  SelectStmt,
  SourceProgram,
  Span,
  Stmt,
} from "./lang/ast.js";
export type { ParseError } from "./lang/parse.js";
export { isParseError, parse } from "./lang/parse.js";
export type { CompileError, CompiledCall, CompiledSequence } from "./lang/compile.js";
export { compile } from "./lang/compile.js";
export { FIXTURE_PROGRAM } from "./lang/fixture.js";

// the IR: a figure as timed constraints
export type {
  Arrangement,
  CastRule,
  Choice,
  Contract,
  FigureBeats,
  FigureIR,
  HoldRef,
  IntrinsicLine,
  IntrinsicOp,
  LookRule,
  LookTarget,
  NumberValue,
  OrbitSense,
  ParamSpec,
  Params,
  Role,
  Window,
} from "./ir/Figure.js";
export { beatsOf, defaultParams, resolveChoice, resolveNumber } from "./ir/Figure.js";
export type { Hand, HoldId } from "./ir/Hold.js";
export { HANDS, HOLD_IDS } from "./ir/Hold.js";
export { printFigure } from "./ir/print.js";

// the figures, as data
export type { FigureRegistry } from "./figures/registry.js";
export { FIGURES, figureNamed } from "./figures/registry.js";
export { allemande } from "./figures/allemande.js";
export { bow } from "./figures/bow.js";
export { doSiDo } from "./figures/doSiDo.js";

// the dialect: who is on the floor, and what a selector word means
export type { DancerId, DancerState, Dialect, DialectId, SetState } from "./dialect/Dialect.js";
export { unknownSelector } from "./dialect/Dialect.js";
export { PAIR, PAIR_SOLO } from "./dialect/pair/Pair.js";

// units, the body, motion and the proof (P2)
export type { Tempo } from "./units/Tempo.js";
export {
  SAMPLES_PER_BEAT,
  cmToPx,
  degPerBeat,
  pxPerBeat,
  pxPerBeat2,
  secondsPerBeat,
  tempo,
} from "./units/Tempo.js";
export type { CapAtTempo, PointCap } from "./units/caps.js";
export { ANGULAR_CAPS, CAPS, capsAtTempo } from "./units/caps.js";
export {
  BUZZ_STEP_CM,
  MAX_PIVOT_STANDING_DEG,
  MAX_PIVOT_STEPPING_DEG,
  MAX_STEP_CM,
  PREFERRED_STEP_CM,
  TAKE_BEATS,
} from "./units/limits.js";
export type { Channel, Effector, Joint, PointName } from "./body/Body.js";
export { EFFECTORS, HEIGHTS, JOINTS, POINTS } from "./body/Body.js";
export type { Vec3 } from "./motion/Vec3.js";
export { vec3 } from "./motion/Vec3.js";
export type { Trajectory } from "./motion/Trajectory.js";
export { beatOf, sampleAt } from "./motion/Trajectory.js";
export type { Kinematics, Violation, ViolationKind } from "./motion/prove.js";
export { kinematicsOf, proveMotion } from "./motion/prove.js";

// the assembly and the scheduler (P4)
export type { Foot, Instr, Slot, WindowName } from "./asm/Instruction.js";
export type { LookAt as AsmLookAt } from "./asm/Instruction.js";
export type { Program } from "./asm/Program.js";
export { programEnd, slotAt, slotsOfBeat } from "./asm/Program.js";
export type { ListingLine } from "./asm/listing.js";
export { formatLine, listing } from "./asm/listing.js";
export type { ScheduleError, ScheduleErrorKind, ScheduleWarning } from "./schedule/errors.js";
export type { SeamKind } from "./schedule/seams.js";
export type { Schedule, ScheduledCall } from "./schedule/schedule.js";
export { schedule } from "./schedule/schedule.js";

// holds
export type { BodyFrame, Contact, HoldPosture } from "./holds/HoldPosture.js";
export {
  HANG_FORWARD_PX,
  HANG_LATERAL_PX,
  HANG_Z_PX,
  free,
  hangPoint,
  lateralOf,
} from "./holds/free.js";
export {
  ALLEMANDE_RISE_PX,
  ALLEMANDE_SWIVEL_DEG,
  allemandeL,
  allemandeR,
} from "./holds/allemande.js";
export { HOLDS, holdPosture } from "./holds/library.js";

// solver
export type { LookAt, SolveDancer, SolveHold, SolveInput } from "./solver/SolveInput.js";
export type { ReachOverrun, SolvedArm } from "./solver/arm.js";
export { BONES_PX, boneLengths, solveArm } from "./solver/arm.js";
export type { HandPull, LimitedSample, TorsoInput, TorsoSolution } from "./solver/torso.js";
export { COMFORT_YAW_DEG, comfortYawDeg, solveTorso } from "./solver/torso.js";
export type { HeadInput, HeadSolution } from "./solver/head.js";
export {
  LOOK_DISTANCE_PX,
  NECK_RISE_PX,
  headPoint,
  lookBearing,
  solveHead,
} from "./solver/head.js";
export type {
  BodyViolation,
  HandPlate,
  ProofViolation,
  SolveViolation,
  SolveViolationKind,
  SolvedBodies,
} from "./solver/solveBody.js";
export { TORSO_RISE_PX, shoulderPoint, solveBodies } from "./solver/solveBody.js";

// the executor (P5)
export type { Executed, ExecutionViolation } from "./executor/execute.js";
export { execute } from "./executor/execute.js";

// the whole stack as one call, and the page that shows it (P7)
export type { Run, RunError, RunOptions, RunWarning } from "./pipeline.js";
export { run } from "./pipeline.js";
