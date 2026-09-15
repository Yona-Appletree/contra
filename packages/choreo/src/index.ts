// @caller/choreo — the form-neutral choreography model and the decider that
// turns a program into a timeline. Knows nothing about contra; `@caller/contra`
// supplies the formations, and `src/testing/square.ts` proves it by supplying
// one that is not a contra at all. See README.md.

// formations, groups and the set state
export type {
  CoupleId,
  CoupleState,
  DancerId,
  Formation,
  GroupId,
  GroupKind,
  GroupPlan,
  GroupSelector,
  HallState,
  Progression,
  RoleName,
  RoleSet,
  SetId,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "./formation/Formation.js";
export {
  HANDS_FOUR_GROUP,
  createHall,
  hallDancers,
  stationById,
  stationPose,
} from "./formation/Formation.js";
export type { Frame } from "./formation/Frame.js";
export {
  frame,
  frameAngle,
  framePoint,
  frameVector,
  localAngle,
  localPoint,
  reverseFrame,
} from "./formation/Frame.js";
export type { Group } from "./group/Group.js";
export {
  createGroup,
  groupStation,
  groupStationPose,
  stationOf,
  stationRole,
} from "./group/Group.js";

// figures
export type {
  AnyFigureDef,
  EndPose,
  FigureDef,
  FigureParams,
  FigureRegistry,
} from "./figure/FigureDef.js";
export { createFigureRegistry, withDefaults } from "./figure/FigureDef.js";
export type { ApplaudParams } from "./figure/applaud.js";
export { APPLAUD, clapPhase } from "./figure/applaud.js";
export { joinHands, joinedOrder } from "./figure/joinHands.js";
export type { Ring, RingJoin, RingPlaces, RingWalk } from "./figure/ring.js";
export {
  RING_ARM_EXTENSION,
  RING_FOOTPRINT_MARGIN_PX,
  RING_NEIGHBOR_SPACING_PX,
  bearing,
  centreOf,
  joinPoint,
  mustPlace,
  polar,
  ringHands,
  ringOf,
  ringOrder,
  ringShift,
  ringWalk,
  wrap360,
} from "./figure/ring.js";
export { standing, walking } from "./figure/standing.js";
export type { WalkStep } from "./figure/walkPath.js";
export { DEFAULT_BOW_PX, walkStep } from "./figure/walkPath.js";
export type { CrossOver, WaitOutParams } from "./figure/waitOut.js";
export { WAIT_OUT, waitOutStart } from "./figure/waitOut.js";
export type { TakeHandsParams } from "./figure/takeHands.js";
export { TAKE_HANDS, lineUpPlaces } from "./figure/takeHands.js";
export type { LineUpShift } from "./formation/lineUpShift.js";
export { lineUpShiftOf, shiftPlaces } from "./formation/lineUpShift.js";
export type { WalkToStationParams } from "./figure/walkToStation.js";
export { WALK_TO_STATION } from "./figure/walkToStation.js";

// dances and programs, as data
export type {
  CommonSelector,
  Dance,
  DancePhrase,
  FigureCall,
  PhraseName,
  Program,
  ProgramItem,
  Selector,
} from "./dance/Dance.js";
export { danceBeats, danceSchedule, phraseBeats, validateDance } from "./dance/Dance.js";

// the seam
export type { FigureEvent, Timeline, TimelineEvent, UtteranceEvent } from "./timeline/Timeline.js";
export { createTimeline } from "./timeline/Timeline.js";
export { bindingOf, poseAt, sampleEvent } from "./timeline/poseAt.js";

// the decider
export type {
  ChoreoLibrary,
  Decider,
  ScriptDeciderOptions,
  ScriptPosition,
} from "./decider/Decider.js";
export {
  APPLAUSE_CALLS,
  HANDS_FOUR,
  HANDS_FOUR_CALLS,
  HERE_WE_GO,
  SCRIPT_DECIDER_DEFAULTS,
  betweenDancesBeats,
  createLibrary,
  danceOf,
  formationOf,
} from "./decider/Decider.js";
export { createScriptDecider, nextDanceCall } from "./decider/createScriptDecider.js";
export { complementOf, resolveSelector } from "./decider/resolveSelector.js";

// oracles and the neutrality fixture
export type { ClosureReport, CollisionReport, ReachReport } from "./testing/oracles.js";
export type {
  MotionBounds,
  MotionOptions,
  MotionReport,
  MotionStats,
  MotionWorst,
} from "./testing/oracles.js";
export {
  DEFAULT_MOTION_BOUNDS,
  MOTION_STEP,
  ORACLE_STEP,
  STILL_HAND_PX,
  closureReport,
  collisionReport,
  coverageProblems,
  formatMotionReport,
  motionReport,
  reachReport,
} from "./testing/oracles.js";
export type {
  BeatWindow,
  HandJoinAt,
  PassesOptions,
  Track,
  TrajectoryResult,
} from "./testing/trajectory.js";
export {
  endsOn,
  handsJoined,
  handsStill,
  joinWindow,
  passes,
  sampleTrack,
  shoulderOf,
  staysOnPlace,
  velocity,
  walksBackward,
} from "./testing/trajectory.js";
export { assertPartition, partitionProblems } from "./testing/assertPartition.js";
export {
  SQUARE,
  SQUARE_HALF_COUPLE_PX,
  SQUARE_HEADS,
  SQUARE_PLACES,
  SQUARE_RADIUS_PX,
  SQUARE_ROLES,
  SQUARE_SIDES,
  SQUARE_WAIT_HALF_PX,
  SQUARE_WAIT_STATIONS,
  squareStations,
  squareWaitKind,
} from "./testing/square.js";

// traces: where the feet went, as data
export type {
  Trace,
  TraceCell,
  TraceOptions,
  TracePen,
  TraceSample,
  TraceSpan,
} from "./trace/sampleTrace.js";
export { TRACE_FILLER_FIGURES, TRACE_STEP, sampleTrace, stationRank } from "./trace/sampleTrace.js";

// The slice of `@caller/core` a formation or figure needs, re-exported so that
// `@caller/contra` can stay on its one allowed edge (`contra → choreo`) and
// still speak the same geometry as the renderer.
export type { Angle, Beat, Hand, PoseSample, Side, Style, Vec2 } from "@caller/core";
export {
  ARM_REACH_PX,
  CM_PER_PX,
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  NEUTRAL_STYLE,
  RENDERING_CONTRACT,
  SEAM_BEATS,
  add,
  angleDiff,
  angleLerp,
  angleOf,
  angleOfVec,
  dirOf,
  dist,
  leftOf,
  rightOf,
  smooth,
  sub,
} from "@caller/core";

/** Package identity, kept from the M1 scaffold smoke test. */
export const packageName = "@caller/choreo";
