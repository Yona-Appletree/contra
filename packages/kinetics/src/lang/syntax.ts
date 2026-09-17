/**
 * The syntax tree of a `.dance` file (P1 of the dance-language plan).
 *
 * One grammar, three kinds of module: a **formation** builds a tree of
 * groups, places and anchors in space; a **dance** sequences moves in time;
 * a **move** declares the `$` variables it needs and names the figure it is.
 * The user (2026-09-17): *"are there two languages? one for time-dependent
 * things, one for the structure?"* — no: one language, and what a module may
 * contain is decided by its keyword, which is what lets the parser say "a
 * formation cannot call a move" instead of finding out at run time.
 *
 * Every node carries a {@link Span}, so the debugger can light the statement
 * the bar is inside and an error can point at what caused it.
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

export type ModuleKind = "formation" | "move" | "dance";

/** `formation minor-set(form: Form = Becket) { … }` */
export interface ModuleItem {
  kind: ModuleKind;
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
  | NextStmt
  | LetStmt
  | TitleStmt
  | IrStmt
  | RepeatStmt
  | IfStmt
  | CallStmt;

/** `place robin role Robin at translate(y = 0.6m);` */
export interface PlaceStmt {
  kind: "place";
  name: string;
  role?: string;
  at: readonly Transform[];
  span: Span;
}

/** `anchor centre: Point = midpoint(lark, robin);` */
export interface AnchorStmt {
  kind: "anchor";
  name: string;
  type?: string;
  value: Expr;
  span: Span;
}

/** `group ones = couple() at translate(x = -0.5m);` — `name` is optional. */
export interface GroupStmt {
  kind: "group";
  name?: string;
  module: string;
  args: readonly Arg[];
  at: readonly Transform[];
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

/** `next = duple-progression(up = up, out-top = out-top, out-bottom = out-bottom);` */
export interface NextStmt {
  kind: "next";
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

/** `title "Butter";` — a dance's proper name is metadata, not its identifier. */
export interface TitleStmt {
  kind: "title";
  text: string;
  span: Span;
}

/** `ir "swing";` — which figure IR a move is. */
export interface IrStmt {
  kind: "ir";
  id: string;
  span: Span;
}

/** `repeat (7) { … }`, `repeat (i in minor-sets) group minor-set() at …;` */
export interface RepeatStmt {
  kind: "repeat";
  binder?: string;
  count: Expr;
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

/** `swing($partner, beats = 12);` */
export interface CallStmt {
  kind: "call";
  name: string;
  args: readonly Arg[];
  span: Span;
}

/** A positional or named argument; `dynamic` when written `$partner = …`. */
export interface Arg {
  name?: string;
  dynamic: boolean;
  value: Expr;
  span: Span;
}

/** `translate(x = 1m, y = 2m)`, `rotate(90)`, `mirror(x)` */
export interface Transform {
  op: "translate" | "rotate" | "mirror";
  args: readonly Arg[];
  span: Span;
}

export type Expr =
  | { kind: "number"; value: number; unit: string; span: Span }
  | { kind: "string"; value: string; span: Span }
  /** `Robin`, or `Role.Robin`. */
  | { kind: "member"; type?: string; member: string; span: Span }
  /** `$partner` */
  | { kind: "dyn"; name: string; span: Span }
  /** `lark`, `minor-sets`, `x` */
  | { kind: "name"; name: string; span: Span }
  | { kind: "me"; span: Span }
  | { kind: "nobody"; span: Span }
  | { kind: "call"; name: string; args: readonly Arg[]; span: Span }
  /** `$minor-set.centre` */
  | { kind: "path"; of: Expr; name: string; span: Span }
  | { kind: "unary"; op: "-" | "not"; of: Expr; span: Span }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr; span: Span }
  /** `if (c) a else b`, as an expression. */
  | { kind: "cond"; condition: Expr; then: Expr; else: Expr; span: Span };

export type BinaryOp =
  "or" | "and" | "is" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/";

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
