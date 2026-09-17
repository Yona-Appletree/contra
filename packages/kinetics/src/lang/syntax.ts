/**
 * The syntax tree of a `.dance` file (round 2 of the dance-language plan).
 *
 * One kind of module. What a statement emits decides which pass reads it:
 * the **space words** — `place`, `anchor`, `group`, `provide`, `dancers` —
 * are read once, for nobody, to build the tree; everything else is read
 * once per dancer, with a cursor, to build the timeline; `card` and `say`
 * are annotations either may carry. The user (2026-09-17): *"any module
 * can emit anything"*; the emissions are typed, the module is not.
 *
 * Every node carries a {@link Span}, so the debugger can light the
 * statement the bar is inside and a diagnostic can point at what caused it.
 */
export interface Span {
  start: number;
  end: number;
  /** 1-based. */
  line: number;
}

export interface File {
  items: readonly Item[];
  source: string;
}

export type Item = EnumItem | ModuleItem;

/** `enum Role { Lark, Robin }` */
export interface EnumItem {
  kind: "enum";
  name: string;
  members: readonly string[];
  span: Span;
}

/** `module minor-set(form: Form = Becket) { … }` */
export interface ModuleItem {
  kind: "module";
  name: string;
  params: readonly Param[];
  body: readonly Stmt[];
  span: Span;
}

/**
 * `$partner: Place`, `beats: Beats = 8`. A `dynamic` parameter is a `$`
 * variable: bound from the tree unless the caller passes it (the one-sigil
 * rule). A move's dynamic parameters are its contract.
 */
export interface Param {
  dynamic: boolean;
  name: string;
  type: string;
  default?: Expr;
  span: Span;
}

export type Stmt =
  | PlaceStmt
  | AnchorStmt
  | GroupStmt
  | ProvideStmt
  | ProvideFnStmt
  | DancersStmt
  | ChildrenStmt
  | NextStmt
  | SeatStmt
  | LetStmt
  | AssignStmt
  | AssertStmt
  | AnnotationStmt
  | IrStmt
  | RepeatStmt
  | ForStmt
  | IfStmt
  | MatchStmt
  | CallStmt;

/** The statements the tree builder reads, for nobody. */
export const SPACE_KINDS: readonly Stmt["kind"][] = [
  "place",
  "anchor",
  "group",
  "provide",
  "provide-fn",
  "dancers",
  "next",
  "seat",
];

/** `place robin role Robin at right(0.4m);` */
export interface PlaceStmt {
  kind: "place";
  name: string;
  role?: string;
  at: readonly Transform[];
  span: Span;
}

/** `anchor center: Point = midpoint(lark, robin);` */
export interface AnchorStmt {
  kind: "anchor";
  name: string;
  type?: string;
  value: Expr;
  span: Span;
}

/** `group ones = couple() at left(0.64m);` — `name` optional; `children` when a block follows. */
export interface GroupStmt {
  kind: "group";
  name?: string;
  module: string;
  args: readonly Arg[];
  at: readonly Transform[];
  children?: readonly Stmt[];
  span: Span;
}

/** `provide $partner: Place = other(me);` */
export interface ProvideStmt {
  kind: "provide";
  name: string;
  type: string;
  value: Expr;
  span: Span;
}

/** `provide progress() { … }` — a function evaluated in a dancer's context. */
export interface ProvideFnStmt {
  kind: "provide-fn";
  name: string;
  params: readonly Param[];
  body: readonly Stmt[];
  span: Span;
}

/** `dancers;` — fill the places of the group this sits in. */
export interface DancersStmt {
  kind: "dancers";
  span: Span;
}

/** `children();` — where a module's caller's block goes. */
export interface ChildrenStmt {
  kind: "children";
  span: Span;
}

/** `next = …;` — deprecated in round 2 (P2 removes it). */
export interface NextStmt {
  kind: "next";
  value: Expr;
  span: Span;
}

/** `seat = …;` — deprecated in round 2 (P2 removes it). */
export interface SeatStmt {
  kind: "seat";
  value: Expr;
  span: Span;
}

/** `let four = group(me, $partner, $neighbor, $n2);` */
export interface LetStmt {
  kind: "let";
  name: string;
  value: Expr;
  span: Span;
}

/** `$minor-set = along($minor-set, Up) or out-top;` — a reassignment event. */
export interface AssignStmt {
  kind: "assign";
  name: string;
  value: Expr;
  span: Span;
}

/** `assert($beat == 16, "A1 is sixteen beats");` */
export interface AssertStmt {
  kind: "assert";
  condition: Expr;
  message?: string;
  span: Span;
}

/** `card "Butter";`, `say "Circle left three quarters";` — annotations, no beats. */
export interface AnnotationStmt {
  kind: "card" | "say";
  text: string;
  span: Span;
}

/** `ir "swing";` — which figure IR a move is (until moves are in the language). */
export interface IrStmt {
  kind: "ir";
  id: string;
  span: Span;
}

/** `repeat (7) { … }` — sugar for a loop nobody indexes. */
export interface RepeatStmt {
  kind: "repeat";
  count: Expr;
  body: readonly Stmt[];
  span: Span;
}

/** `for i in 0..n { … }`, `0..=n` inclusive. */
export interface ForStmt {
  kind: "for";
  binder: string;
  from: Expr;
  to: Expr;
  inclusive: boolean;
  body: readonly Stmt[];
  span: Span;
}

/** `if (…) { … } else if (…) { … } else { … }` — the chain is nested `else`. */
export interface IfStmt {
  kind: "if";
  condition: Expr;
  then: readonly Stmt[];
  else: readonly Stmt[];
  span: Span;
}

/** `match (phrase) { A1 => …, _ => … }` */
export interface MatchStmt {
  kind: "match";
  subject: Expr;
  arms: readonly MatchArm[];
  span: Span;
}

export interface MatchArm {
  /** An enum member, or `undefined` for `_`. */
  pattern?: string;
  body: readonly Stmt[];
  span: Span;
}

/** `swing($partner, beats = 12);`, `contra-phrase(A1) { … }` */
export interface CallStmt {
  kind: "call";
  name: string;
  args: readonly Arg[];
  children?: readonly Stmt[];
  span: Span;
}

/** A positional or named argument; `dynamic` when written `$partner = …`. */
export interface Arg {
  name?: string;
  dynamic: boolean;
  value: Expr;
  span: Span;
}

/** `translate(x = 1m, y = 2m)`, `rotate(90)`, `mirror(X)`, `fwd(d)`, `back(d)`, `left(d)`, `right(d)` */
export interface Transform {
  op: TransformOp;
  args: readonly Arg[];
  span: Span;
}

export type TransformOp = "translate" | "rotate" | "mirror" | "fwd" | "back" | "left" | "right";
export const TRANSFORM_OPS: readonly TransformOp[] = [
  "translate",
  "rotate",
  "mirror",
  "fwd",
  "back",
  "left",
  "right",
];

export type Expr =
  | { kind: "number"; value: number; unit: string; span: Span }
  | { kind: "string"; value: string; span: Span }
  /** `Robin`, or `Role.Robin`. */
  | { kind: "member"; type?: string; member: string; span: Span }
  /** `$partner` */
  | { kind: "dyn"; name: string; span: Span }
  /** `lark`, `minor-sets` */
  | { kind: "name"; name: string; span: Span }
  | { kind: "me"; span: Span }
  | { kind: "nobody"; span: Span }
  | { kind: "call"; name: string; args: readonly Arg[]; span: Span }
  /** `$minor-set.center` */
  | { kind: "path"; of: Expr; name: string; span: Span }
  | { kind: "unary"; op: "-" | "not"; of: Expr; span: Span }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr; span: Span }
  /** `if (c) a else b`, as an expression. */
  | { kind: "cond"; condition: Expr; then: Expr; else: Expr; span: Span };

export type BinaryOp =
  "or" | "and" | "is" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%";

/** The type names the language has without an enum declaring them. */
export const BUILTIN_TYPES: readonly string[] = [
  "Int",
  "Number",
  "Bool",
  "String",
  "Length",
  "Beats",
  "Place",
  "Group",
  "Point",
  "Line",
  "Direction",
];

/** The units a number may carry, and their value in metres. */
export const UNITS: Readonly<Record<string, number>> = { m: 1, cm: 0.01 };
