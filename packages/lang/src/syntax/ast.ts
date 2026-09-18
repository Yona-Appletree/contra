/**
 * The syntax tree of a `.dance` file, draft 3 of the design
 * (`Planning/contra/dance-language-design.md`).
 *
 * The one first-class idea is the **group**: declared once with the type of
 * its ids, its parameters, a body and its members; invoked as a statement to
 * build a node of the tree; named in an expression to mean *mine*. Everything
 * that scripts time — a move, a compound, a dance, a medley — is one keyword,
 * `fn`, and the checker tells them apart by what is inside (`ir` makes a
 * move, `setup` makes a dance).
 *
 * Every node carries a {@link Span}, so a diagnostic can point at the text
 * that caused it and the playground can light the statement the bar is in.
 * Nothing here is resolved: a TitleCase word is a {@link NameExpr} until the
 * checker (P2) says whether it is a group, an enum member or a type, and a
 * bare kebab word is a {@link NameExpr} until the checker finds the member,
 * parameter or cursor read it names.
 */
export interface Span {
  /** The file the offsets are into, as the loader named it (`becket.dance`). */
  file: string;
  /** Byte-equals-character offset of the first character. */
  start: number;
  /** Offset one past the last character. */
  end: number;
}

/** A whole file: its imports and its declarations, in source order. */
export interface FileNode {
  kind: "file";
  /** The module's own name — the file's stem (`becket`). */
  module: string;
  uses: readonly UseDecl[];
  decls: readonly Decl[];
  span: Span;
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

export type Decl = EnumDecl | GroupDecl | FnDecl;

/**
 * `use contra::{Role, Couple, wait-out};` · `use becket::MajorSet;` ·
 * `use contra::*;`
 *
 * Rust's shape. A qualified name (`improper::MajorSet`) needs no `use` at
 * all; an import is a convenience that lets the bare name stand.
 */
export interface UseDecl {
  kind: "use";
  module: string;
  /** `undefined` for `use m::*;` — the writer owns the consequences (§5). */
  names?: readonly UseName[];
  span: Span;
}

export interface UseName {
  name: string;
  span: Span;
}

/** `enum Phrase { A1, A2, B1, B2 }` */
export interface EnumDecl {
  kind: "enum";
  name: string;
  members: readonly EnumMember[];
  span: Span;
}

export interface EnumMember {
  name: string;
  span: Span;
}

/**
 * ```text
 * group Couple {
 *   id: enum { Ones, Twos }
 *   seated: Bool = true
 *   body { … }                 // once, for nobody, for the node being built
 *   partner = other(Role);     // read by any dancer under the node
 * }
 * ```
 *
 * `params`, `body` and `members` are kept apart rather than in source order:
 * the three are read by different passes and never by position. Source order
 * survives inside each of them.
 */
export interface GroupDecl {
  kind: "group";
  name: string;
  /** `id: i32` or `id: enum { … }` — the type of this group's ids. */
  idType: IdType;
  params: readonly Param[];
  /** The statements of `body { … }`; empty when the group declares none. */
  body: readonly Stmt[];
  bodySpan?: Span;
  members: readonly Member[];
  span: Span;
}

/** `id: i32` · `id: enum { OutTop, In, OutBottom }` */
export type IdType =
  { kind: "i32"; span: Span } | { kind: "enum"; members: readonly EnumMember[]; span: Span };

/** A member of a group: a relation (`partner = other(Role);`) or a function. */
export type Member = ValueMember | FnDecl;

export interface ValueMember {
  kind: "member";
  name: string;
  value: Expr;
  span: Span;
}

/**
 * `fn swing(with: Role, beats: i32 = 8) { ir "swing"; }`
 *
 * One keyword for a move, a compound, a dance and a medley. Declared at the
 * top of a file, or as a member of a group (`fn progress()`, `fn out(…)`).
 */
export interface FnDecl {
  kind: "fn";
  name: string;
  params: readonly Param[];
  body: readonly Stmt[];
  span: Span;
}

/** `seated: Bool = true` · `beats: i32 = 8` · `body: fn` */
export interface Param {
  kind: "param";
  name: string;
  type: TypeRef;
  default?: Expr;
  span: Span;
}

/**
 * `i32` · `Bool` · `Length` · `fn` · `group` · `Role` (a group or an enum) ·
 * `enum Role` (that group's id type, as a value).
 */
export type TypeRef =
  | {
      kind: "primitive";
      name: "i32" | "f64" | "Bool" | "Length" | "Angle" | "fn" | "group";
      span: Span;
    }
  | { kind: "named"; name: string; span: Span }
  | { kind: "enum-of"; name: string; span: Span };

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type Stmt =
  | SetupStmt
  | AnchorStmt
  | IrStmt
  | CardStmt
  | ForStmt
  | IfStmt
  | MatchStmt
  | ModifiedStmt
  | InvokeStmt
  | ExprStmt;

/** `setup { MajorSet(1, minor-sets = minor-sets); }` — a `fn` with one has a floor. */
export interface SetupStmt {
  kind: "setup";
  body: readonly Stmt[];
  span: Span;
}

/** `anchor across = line(through = center, along = Y);` — in a body only. */
export interface AnchorStmt {
  kind: "anchor";
  name: string;
  value: Expr;
  span: Span;
}

/** `ir "swing";` — a `fn` with one is a leaf move the kinematics can play. */
export interface IrStmt {
  kind: "ir";
  name: string;
  span: Span;
}

/** `card "Butter";` — what the caller's card says. */
export interface CardStmt {
  kind: "card";
  text: string;
  span: Span;
}

/** `for i in 0..minor-sets { … }` */
export interface ForStmt {
  kind: "for";
  name: string;
  range: Expr;
  body: readonly Stmt[];
  span: Span;
}

/** `if (first-time) { … } else { … }` — the branches are statements or blocks. */
export interface IfStmt {
  kind: "if";
  test: Expr;
  then: readonly Stmt[];
  else?: readonly Stmt[];
  span: Span;
}

/** `match Station { OutTop => …; In => { … } }` — arms are statements or blocks. */
export interface MatchStmt {
  kind: "match";
  subject: Expr;
  arms: readonly MatchStmtArm[];
  span: Span;
}

export interface MatchStmtArm {
  pattern: Pattern;
  body: readonly Stmt[];
  span: Span;
}

/**
 * `translate(x = -0.64m) rotate(180) Couple(Ones);`
 *
 * OpenSCAD's shape: prefix transforms, then the statement they apply to,
 * right to left. Which order the evaluator applies them in is its business.
 */
export interface ModifiedStmt {
  kind: "modified";
  modifiers: readonly CallExpr[];
  stmt: Stmt;
  span: Span;
}

/**
 * `Couple(Ones);` · `Station(In) { … }` · `Station(OutTop) Couple(Ones);` ·
 * `improper::MajorSet(1, minor-sets = minor-sets);`
 *
 * A group invocation builds a node. `;` gives it no children, a block gives
 * it many, and a single trailing statement gives it that one — OpenSCAD's
 * `translate(…) cube();` again, one level up.
 */
export interface InvokeStmt {
  kind: "invoke";
  /** The module the group came from, when the callee was written qualified. */
  module?: string;
  name: string;
  args: readonly Arg[];
  children: readonly Stmt[];
  span: Span;
}

/**
 * An expression as a statement: a call (`swing(partner, beats = 8);`), an
 * event chain (`assign(…) or assign(…);`), a trailing block
 * (`phrase(A1) { … }`), or a block's **tail** — the last expression of a
 * `fn` body written without a `;`, which is its value.
 */
export interface ExprStmt {
  kind: "expr";
  expr: Expr;
  /** The trailing block of `phrase(A1) { … }`, as the call's last argument. */
  block?: readonly Stmt[];
  /** `true` when this is the block's value, written without a `;`. */
  tail: boolean;
  span: Span;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type Expr =
  | IntExpr
  | FloatExpr
  | StringExpr
  | BoolExpr
  | NameExpr
  | QualifiedExpr
  | CallExpr
  | OneExpr
  | SelectExpr
  | UnaryExpr
  | BinaryExpr
  | IsExpr
  | IfExpr
  | MatchExpr
  | RangeExpr
  | FnExpr;

/** `3` · `180` */
export interface IntExpr {
  kind: "int";
  value: number;
  span: Span;
}

/** `0.64m` · `90deg` · `1.6` — `unit` is `"m"`, `"deg"` or `""`. */
export interface FloatExpr {
  kind: "float";
  value: number;
  unit: "m" | "deg" | "";
  span: Span;
}

/** `"Butter"` */
export interface StringExpr {
  kind: "string";
  value: string;
  span: Span;
}

export interface BoolExpr {
  kind: "bool";
  value: boolean;
  span: Span;
}

/**
 * A bare word, unresolved. `title` says which casing it was written in, which
 * is the grammar's own distinction: a TitleCase word is a group ("mine"), an
 * enum member or a type; a kebab word is a member, a parameter, a `fn` or a
 * cursor read (`beat`, `time`, `first-time`, `last-time`, `center`).
 */
export interface NameExpr {
  kind: "name";
  name: string;
  title: boolean;
  span: Span;
}

/** `improper::MajorSet` · `contra::Ones` */
export interface QualifiedExpr {
  kind: "qualified";
  module: string;
  name: string;
  title: boolean;
  span: Span;
}

/**
 * `swing(partner, beats = 8)` · `id(MinorSet)` · `other(Role)` ·
 * `translate(x = -0.64m)` — one node for every call, including the prefix
 * transforms and the built-ins. The checker knows which names are built in.
 */
export interface CallExpr {
  kind: "call";
  /** The module, when the callee was written qualified (`butter::butter(…)`). */
  module?: string;
  callee: string;
  /** `true` when the callee was TitleCase — a group used as a function. */
  title: boolean;
  args: readonly Arg[];
  span: Span;
}

/** `one!(select(Couple = other, Role = other))` — a diagnostic unless exactly one matched. */
export interface OneExpr {
  kind: "one";
  arg: Expr;
  span: Span;
}

/**
 * `select(Couple = other, Role = other)` · `assign(MinorSet = id(MinorSet) + travel)`
 *
 * The two share one argument shape: a kind, then a pattern. A kind not named
 * is mine. `assign` is the event and is a `Bool`, so `or` chains fallbacks.
 */
export interface SelectExpr {
  kind: "select" | "assign";
  args: readonly KindArg[];
  span: Span;
}

/** `Couple = other` inside a `select` or an `assign`. */
export interface KindArg {
  /** The group's name, TitleCase. */
  group: string;
  pattern: Pattern;
  span: Span;
}

/** `-1` · `not seated` */
export interface UnaryExpr {
  kind: "unary";
  op: "-" | "not";
  operand: Expr;
  span: Span;
}

export type BinaryOp =
  "or" | "and" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%";

export interface BinaryExpr {
  kind: "binary";
  op: BinaryOp;
  left: Expr;
  right: Expr;
  span: Span;
}

/** `Station is OutTop | OutBottom` — a `Bool`; the right side is a pattern. */
export interface IsExpr {
  kind: "is";
  subject: Expr;
  pattern: Pattern;
  span: Span;
}

/** `if (first-time) a else b` — an expression; the statement form is {@link IfStmt}. */
export interface IfExpr {
  kind: "if-expr";
  test: Expr;
  then: Expr;
  else: Expr;
  span: Span;
}

/** `match which { A1 => 0, A2 => 16 }` — exhaustive or a check error. */
export interface MatchExpr {
  kind: "match-expr";
  subject: Expr;
  arms: readonly MatchExprArm[];
  span: Span;
}

export interface MatchExprArm {
  pattern: Pattern;
  value: Expr;
  span: Span;
}

/** `0..minor-sets` · `0..=3` — in a `for`, and inside a pattern. */
export interface RangeExpr {
  kind: "range";
  from: Expr;
  to: Expr;
  inclusive: boolean;
  span: Span;
}

/** `fn (x) { … }` — first-class; a trailing block is the sugar for one. */
export interface FnExpr {
  kind: "fn-expr";
  params: readonly Param[];
  body: readonly Stmt[];
  span: Span;
}

/** A call's argument: positional, or `name = expr`. */
export interface Arg {
  kind: "arg";
  /** `undefined` for a positional argument. */
  name?: string;
  value: Expr;
  span: Span;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/**
 * One pattern grammar (Rust's) in four places: `is`, `match`, `select` and
 * `assign` (§4). `other`, `first` and `last` compare a candidate against the
 * reader, so they mean something only in `select` and `assign` — the parser
 * accepts them everywhere and the checker says where they are wrong.
 *
 * The design writes a computed pattern in parentheses (`(id + travel)`). This
 * tree keeps no parentheses: any expression is an {@link ExprPattern}, which
 * is what lets §8's `select(MinorSet = id + travel, …)` stand as written.
 */
export type Pattern = WildcardPattern | RelativePattern | AltPattern | RangePattern | ExprPattern;

/** `_` */
export interface WildcardPattern {
  kind: "wildcard";
  span: Span;
}

/** `other` · `first` · `last` */
export interface RelativePattern {
  kind: "relative";
  which: "other" | "first" | "last";
  span: Span;
}

/** `OutTop | OutBottom` */
export interface AltPattern {
  kind: "alt";
  options: readonly Pattern[];
  span: Span;
}

/** `0..3` · `0..=3` */
export interface RangePattern {
  kind: "range-pattern";
  from: Expr;
  to: Expr;
  inclusive: boolean;
  span: Span;
}

/** `Ones` · `3` · `id + travel` · `(wrap(id(Couple) + side))` */
export interface ExprPattern {
  kind: "expr-pattern";
  expr: Expr;
  span: Span;
}

// ---------------------------------------------------------------------------
// Vocabulary the parser enforces
// ---------------------------------------------------------------------------

/** The prefix transforms: the hall's frame, then the dancer's own. */
export const MODIFIERS: readonly string[] = [
  "translate",
  "rotate",
  "mirror",
  "left",
  "right",
  "fwd",
  "back",
];

/** The two units a number may carry. Beats are a plain count (notes D1). */
export const UNITS: readonly string[] = ["m", "deg"];

/** The primitive type names. */
export const PRIMITIVE_TYPES: readonly string[] = [
  "i32",
  "f64",
  "Bool",
  "Length",
  "Angle",
  "fn",
  "group",
];

/** The span covering two spans of the same file. */
export const spanning = (from: Span, to: Span): Span => ({
  file: from.file,
  start: from.start,
  end: to.end,
});
