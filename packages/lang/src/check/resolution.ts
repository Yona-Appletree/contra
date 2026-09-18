import type {
  CallExpr,
  EnumDecl,
  FnDecl,
  ForStmt,
  GroupDecl,
  InvokeStmt,
  KindArg,
  Member,
  NameExpr,
  Param,
  QualifiedExpr,
  Span,
} from "../syntax/ast.js";

/**
 * What the checker worked out, for the passes that come after it.
 *
 * The parser leaves every word unresolved on purpose: a TitleCase word is a
 * group, an enum member or a type, and only the scopes say which. This table
 * is the answer, keyed by the very AST nodes the parser produced, so the
 * evaluator (P3) and the playground (P4) never repeat the work or guess
 * differently. Nothing here is evaluated: it is who-is-who, not what-happens.
 */
export interface Resolution {
  /** What every bare or qualified word in an expression binds to. */
  names: ReadonlyMap<NameExpr | QualifiedExpr, Binding>;
  /** What every call and every group invocation calls. */
  calls: ReadonlyMap<CallExpr | InvokeStmt, CalleeBinding>;
  /** The group each `select`/`assign` argument names, and how many it can match. */
  kinds: ReadonlyMap<KindArg, KindBinding>;
  /** Every function: what it is, and what it needs (a dance's contract). */
  fns: ReadonlyMap<FnDecl, FnInfo>;
  /** Every group: its ids, its members, and the paths below it. */
  groups: ReadonlyMap<GroupDecl, GroupInfo>;
  /** The dances of the run — a `fn` with a `setup` — entry module first. */
  dances: readonly FnInfo[];
}

/** What a name in an expression turned out to be. */
export type Binding =
  | { kind: "param"; param: Param }
  | { kind: "local"; name: string; loop: ForStmt }
  | { kind: "member"; member: Member; group: GroupInfo }
  | { kind: "group"; group: GroupInfo }
  | { kind: "enum-member"; enum: EnumInfo; member: string }
  | { kind: "fn"; fn: FnInfo }
  | { kind: "cursor"; name: CursorRead }
  | { kind: "anchor"; name: string; group?: GroupInfo }
  | { kind: "id"; group: GroupInfo }
  | { kind: "builtin"; name: string };

/** What a call turned out to call. */
export type CalleeBinding =
  | { kind: "fn"; fn: FnInfo }
  | { kind: "group"; group: GroupInfo }
  | { kind: "builtin"; name: string }
  | { kind: "modifier"; name: string }
  | { kind: "param"; param: Param };

/** A `select`/`assign` argument: the group it names, and what its pattern admits. */
export interface KindBinding {
  group?: GroupInfo;
  /** How many ids the pattern admits, when the checker can count them. */
  admits?: number;
}

/** The cursor a dancer reads while it dances (§6). */
export type CursorRead = "beat" | "time" | "first-time" | "last-time";

/** An enum: a declared one, or the ids of a group. */
export interface EnumInfo {
  /** `Phrase`, or `Station` for a group's ids. */
  name: string;
  module: string;
  members: readonly string[];
  decl?: EnumDecl;
  /** Set when this is a group's id type rather than an `enum` declaration. */
  group?: GroupDecl;
  span: Span;
}

/** A group declaration, with what the checker read off it. */
export interface GroupInfo {
  decl: GroupDecl;
  module: string;
  name: string;
  /** The ids, when they are an enum; `undefined` when they are `i32`. */
  ids?: EnumInfo;
  /** Members by name — relations and functions alike, since both are read bare. */
  members: ReadonlyMap<string, Member>;
  /** Every path of kinds from this group down to a leaf (§3). */
  shapes: readonly PathShape[];
}

/** One path from a group to a leaf: the kinds below it, outermost first. */
export type PathShape = readonly PathStep[];

/** One step of a path: the group invoked, with the id it was invoked with. */
export interface PathStep {
  group: GroupInfo;
  id: IdValue;
  site: InvokeStmt;
}

/** What a node's id is, as far as the text says. */
export type IdValue =
  { kind: "enum"; name: string } | { kind: "int"; value: number } | { kind: "unknown" };

/**
 * What one `fn` is. The design has one keyword for a move, a compound, a dance
 * and a medley, and **the checker tells them apart by what is inside** (§5):
 * an `ir` makes a leaf move, a `setup` makes a dance with a floor, and
 * everything between is composition.
 */
export interface FnInfo {
  decl: FnDecl;
  module: string;
  name: string;
  role: "move" | "dance" | "composition";
  /** The name of the figure the kinematics play, for a move. */
  ir?: string;
  /** The group this function is a member of, when it is one (`progress`, `out`). */
  owner?: GroupInfo;
  /** The group a dance's `setup` invokes: its floor. */
  floor?: GroupInfo;
  /**
   * The kinds a dance reads, transitively through the functions it calls: its
   * **contract** (§5). A dancer whose path lacks one of them is out for this
   * dance and runs the floor's `out` instead.
   */
  contract: readonly GroupInfo[];
  /** The floor's `progress` and `out`, for a dance. */
  progress?: FnInfo;
  out?: FnInfo;
  /** How many beats one time through takes, when the checker can count them. */
  beats?: number;
}
