/**
 * The source language's syntax tree (DA6).
 *
 * A program is what a caller would write down: bind the people you dance with,
 * then call figures on them. Five statements, no expressions, no values beyond
 * words and numbers — everything a dance needs and nothing a dance does not.
 *
 * Every node carries a {@link Span} so the debugger can light the statement
 * the cursor is inside and a compile error can point at the call that caused
 * it.
 */
export type Stmt = SelectStmt | CallStmt | RepeatStmt | IfStmt | DefineStmt;

/**
 * `partner = select(across)` — the user at 00:26: *"a first command in our
 * example is `opposite = select(...)`… then moves work relative to that"*. The
 * dialect resolves the selector from each dancer's own point of view, so one
 * program is every dancer's script.
 */
export interface SelectStmt {
  kind: "select";
  name: string;
  selector: string;
  span: Span;
}

/** `bow(partner)`, `allemande(partner, right)`. Parentheses are required. */
export interface CallStmt {
  kind: "call";
  name: string;
  args: readonly Arg[];
  span: Span;
}

/** `repeat(2) { … }`, unrolled at compile time. */
export interface RepeatStmt {
  kind: "repeat";
  times: number;
  body: readonly Stmt[];
  span: Span;
}

/**
 * `if (partner) { … } else { … }` — the condition is a binding being somebody.
 * End effects are these (the user: *"end effects are just conditionals on
 * selects. huh"*).
 */
export interface IfStmt {
  kind: "if";
  name: string;
  then: readonly Stmt[];
  else: readonly Stmt[];
  span: Span;
}

/** `dance { … }` — a name for a run of statements, inlined where it is called. */
export interface DefineStmt {
  kind: "define";
  name: string;
  body: readonly Stmt[];
  span: Span;
}

/** A positional argument: a bare word (a choice or a binding), or a number. */
export type Arg =
  { kind: "word"; value: string; span: Span } | { kind: "number"; value: number; span: Span };

/** Where a node sits in the source: character offsets, and the 1-based line. */
export interface Span {
  start: number;
  end: number;
  line: number;
}

/** A parsed program, with the text it came from so spans can be sliced. */
export interface SourceProgram {
  statements: readonly Stmt[];
  source: string;
}
