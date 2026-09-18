/**
 * The one interpreter, shared by the two passes.
 *
 * `setup` runs **once, for nobody**, and builds the tree; the script runs
 * **once per dancer** against it (§5). Both read the same expressions, so
 * expression evaluation lives here and the two passes differ only in what
 * they hand the interpreter: `buildTree` supplies a {@link Builder} (where a
 * child invocation and a `dancer();` go), `runDance` supplies a
 * {@link ScriptCtx} (a cursor, a move emitter and an event queue). A
 * statement that asks for the wrong one is a diagnostic, which is how "a move
 * in `setup`" and "a group invocation outside `setup`" are caught at run time
 * even without the checker.
 *
 * Statements are a generator and expressions are not. Only a move takes
 * beats, and a move is only ever called in statement position, so the driver
 * can stop a dancer between statements — `yield` after a move is the whole of
 * the lock step — while an expression stays a plain function call.
 */
import type { Diagnostic, Fact, Stage } from "../diagnostics/Diagnostic.js";
import { diagnostic } from "../diagnostics/Diagnostic.js";
import type {
  Arg,
  CallExpr,
  Expr,
  ExprStmt,
  FnDecl,
  InvokeStmt,
  Param,
  Pattern,
  SelectExpr,
  Span,
  Stmt,
} from "../syntax/ast.js";
import type { Frame } from "./frame.js";
import { compose, frame, reflection, rotation, translation } from "./frame.js";
import type { Module, Program } from "./loadForEval.js";
import { findEnumMember, findFn, findGroup, groupsDeclaringMember } from "./loadForEval.js";
import type { MoveArg, MoveRef } from "./timeline.js";
import type { Dancer, Node, Tree } from "./tree.js";
import { ancestorOfKind, kindsOf, lineageOf, nodesOfKind, placesUnder } from "./tree.js";
import type { Env, Value } from "./value.js";
import {
  VOID,
  bool,
  enumValue,
  isTrue,
  itemsOf,
  lookupEnv,
  newEnv,
  num,
  sameValue,
  showValue,
  toInt,
  toMillimetres,
  typeName,
} from "./value.js";

// ---------------------------------------------------------------------------
// The context an expression is read in
// ---------------------------------------------------------------------------

export interface Ctx {
  program: Program;
  tree: Tree;
  /** The module the running text was written in. */
  module: Module;
  env: Env;
  /** The node whose declaration this text belongs to: a body, or a member. */
  self?: Node;
  /** The dancer reading, when there is one. A body has none, on purpose. */
  reader?: Dancer;
  /** Set while `setup` is running: where children and dancers go. */
  builder?: Builder;
  /** Set while a script is running: the cursor, the moves and the events. */
  script?: ScriptCtx;
  /** Members are pure, so a dancer reads each of them once per commit. */
  memo?: Map<string, Value>;
  /** True while inside an expression, where a move has no place to take beats. */
  inExpression?: boolean;
  trace: readonly Fact[];
}

/** What `setup` gives the interpreter: somewhere to put what a body builds. */
export interface Builder {
  /** The node being built, or nothing at the root of `setup`. */
  node?: Node;
  /** Where a child invoked here would stand. */
  frame: Frame;
  invoke: (stmt: InvokeStmt, childFrame: Frame, ctx: Ctx) => void;
  dancer: (span: Span, ctx: Ctx) => void;
  anchor: (name: string, value: Value, span: Span, ctx: Ctx) => void;
}

/** What the script pass gives the interpreter: a cursor and somewhere to emit. */
export interface ScriptCtx {
  dancer: Dancer;
  /** Beats since the top of this time through. */
  cursor: number;
  /** The beat the innermost dance `fn` began at; `beat` reads `cursor - origin`. */
  origin: number;
  time: number;
  firstTime: boolean;
  lastTime: boolean;
  /** False while running somebody else's `progress`, where nothing may take beats. */
  canMove: boolean;
  move: (ir: string, args: readonly MoveArg[], beats: number, span: Span, ctx: Ctx) => void;
  queue: (to: Node, span: Span, ctx: Ctx) => void;
  card: (text: string, span: Span, ctx: Ctx) => void;
  /** `progress()` is set-wide: one trigger per beat, for every dancer (D5). */
  progress: (span: Span, ctx: Ctx) => void;
  /** The floor a composed dance must agree on (§5). */
  floorCheck: (dance: FnDecl, module: Module, span: Span, ctx: Ctx) => void;
}

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

/** A diagnostic thrown from the middle of an evaluation; the runner catches it. */
export interface EvalFailure {
  evalFailure: true;
  diagnostic: Diagnostic;
}

export const isEvalFailure = (error: unknown): error is EvalFailure =>
  typeof error === "object" && error !== null && "evalFailure" in error;

/** Stop, with the beat, the dancer and the trace the evaluator had. */
export function fail(
  ctx: Ctx,
  code: string,
  stage: Stage,
  message: string,
  span?: Span,
  extra: Partial<Diagnostic> = {},
): never {
  const failure: EvalFailure = {
    evalFailure: true,
    diagnostic: diagnostic(code, stage, message, {
      ...(span === undefined ? {} : { span }),
      dancers: ctx.reader === undefined ? [] : [ctx.reader.id],
      ...(ctx.script === undefined ? {} : { beat: ctx.script.cursor }),
      trace: ctx.trace,
      ...extra,
    }),
  };
  throw failure;
}

const stageOf = (ctx: Ctx): Stage => (ctx.script === undefined ? "setup" : "script");

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** Run a block; its value is its last expression written without a `;`. */
export function* execStmts(
  stmts: readonly Stmt[],
  ctx: Ctx,
): Generator<void, Value | undefined, void> {
  let tail: Value | undefined;
  for (const stmt of stmts) tail = yield* execStmt(stmt, ctx);
  return tail;
}

export function* execStmt(stmt: Stmt, ctx: Ctx): Generator<void, Value | undefined, void> {
  switch (stmt.kind) {
    case "setup":
      // The floor is laid before anybody dances; in a script this is the
      // header of a dance `fn`, and the script skips it.
      if (ctx.builder === undefined) return undefined;
      yield* execStmts(stmt.body, ctx);
      return undefined;

    case "anchor": {
      const builder = ctx.builder;
      if (builder === undefined)
        fail(ctx, "L100", "script", "an anchor is declared in a group's body", stmt.span);
      builder.anchor(stmt.name, evaluateExpr(stmt.value, ctx), stmt.span, ctx);
      return undefined;
    }

    case "ir":
      // Reached only when a move's body is run as a block, which `callFn`
      // never does: it reads the `ir` and emits instead.
      return undefined;

    case "card": {
      if (ctx.script === undefined)
        fail(ctx, "L100", "setup", "a card is something the caller says while dancing", stmt.span);
      ctx.script.card(stmt.text, stmt.span, ctx);
      return undefined;
    }

    case "for": {
      const values = rangeValues(stmt.range, ctx);
      for (const value of values) {
        const inner: Ctx = { ...ctx, env: newEnv(ctx.env) };
        inner.env.vars.set(stmt.name, value);
        yield* execStmts(stmt.body, inner);
      }
      return undefined;
    }

    case "if": {
      const test = evaluateExpr(stmt.test, ctx);
      if (test.t !== "bool")
        fail(
          ctx,
          "L100",
          stageOf(ctx),
          `an "if" wants a Bool, and got ${typeName(test)}`,
          stmt.test.span,
        );
      if (test.v) yield* execStmts(stmt.then, ctx);
      else if (stmt.else !== undefined) yield* execStmts(stmt.else, ctx);
      return undefined;
    }

    case "match": {
      const subject = evaluateExpr(stmt.subject, ctx);
      for (const arm of stmt.arms) {
        if (!matchPattern(arm.pattern, subject, ctx)) continue;
        yield* execStmts(arm.body, ctx);
        return undefined;
      }
      fail(
        ctx,
        "L100",
        stageOf(ctx),
        `no arm of this match covers ${showValue(subjectId(subject))}`,
        stmt.span,
        { suggestion: 'a match is exhaustive or it is an error; "_" says "the rest" out loud' },
      );
      return undefined;
    }

    case "modified": {
      const builder = ctx.builder;
      if (builder === undefined)
        fail(
          ctx,
          "L100",
          "script",
          "a transform places a node, and nothing is placed while dancing",
          stmt.span,
        );
      let local = frame();
      for (const modifier of stmt.modifiers) local = compose(local, modifierFrame(modifier, ctx));
      const moved: Ctx = { ...ctx, builder: { ...builder, frame: compose(builder.frame, local) } };
      yield* execStmt(stmt.stmt, moved);
      return undefined;
    }

    case "invoke": {
      const builder = ctx.builder;
      if (builder === undefined)
        fail(
          ctx,
          "L100",
          "script",
          `a group invocation belongs in "setup": the tree is built once, before anybody dances`,
          stmt.span,
        );
      builder.invoke(stmt, builder.frame, ctx);
      return undefined;
    }

    case "expr":
      return yield* execExprStmt(stmt, ctx);
  }
}

function* execExprStmt(stmt: ExprStmt, ctx: Ctx): Generator<void, Value | undefined, void> {
  let value: Value;
  if (stmt.expr.kind === "call") {
    value = yield* execCall(stmt.expr, stmt.block, ctx);
  } else {
    value = evaluateExpr(stmt.expr, { ...ctx, inExpression: true });
  }
  if (!stmt.tail && isUncaughtAssign(stmt.expr) && value.t === "bool" && !value.v)
    fail(
      ctx,
      "L105",
      "script",
      "this assign found no place to go to, and nothing caught it",
      stmt.expr.span,
      {
        suggestion:
          'an assign is a Bool: chain the fallback with "or", as a formation\'s progress does',
      },
    );
  return stmt.tail ? value : undefined;
}

/** `assign(…)`, or an `or` chain whose last link is one: nothing caught it. */
function isUncaughtAssign(expr: Expr): boolean {
  if (expr.kind === "assign") return true;
  if (expr.kind === "binary" && expr.op === "or") return isUncaughtAssign(expr.right);
  return false;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/**
 * A call in statement position, where a move may take beats. A trailing block
 * arrives as the call's last argument, which is what `phrase(A1) { … }` is.
 */
export function* execCall(
  call: CallExpr,
  block: readonly Stmt[] | undefined,
  ctx: Ctx,
): Generator<void, Value, void> {
  const builtIn = callBuiltIn(call, ctx);
  if (builtIn !== undefined) return builtIn;

  const callee = resolveCallee(call, ctx);
  guardMove(callee, call, ctx);
  if (
    ctx.script !== undefined &&
    callee.t === "fn" &&
    callee.self !== undefined &&
    "name" in callee.decl &&
    callee.decl.name === PROGRESS
  ) {
    // `progress()` is set-wide (§6, D5): the call evaluates the formation's
    // progression for every dancer at this beat, in or out, so the couple
    // coming in takes its place in the same commit as the couple leaving it.
    ctx.script.progress(call.span, ctx);
    return VOID;
  }
  const args = evaluateArgs(call.args, ctx);
  if (block !== undefined)
    args.push({
      value: {
        t: "fn",
        decl: { kind: "fn-expr", params: [], body: block, span: call.span },
        env: ctx.env,
        module: ctx.module.name,
        ...(ctx.self === undefined ? {} : { self: ctx.self }),
      },
    });
  return yield* callFn(callee, args, call.span, ctx);
}

export interface EvaluatedArg {
  name?: string;
  value: Value;
}

function evaluateArgs(args: readonly Arg[], ctx: Ctx): EvaluatedArg[] {
  return args.map((arg) => ({
    ...(arg.name === undefined ? {} : { name: arg.name }),
    value: evaluateExpr(arg.value, { ...ctx, inExpression: true }),
  }));
}

/** Call a `fn` value: a move emits, a dance re-bases the beat, the rest runs. */
export function* callFn(
  callee: Value,
  args: readonly EvaluatedArg[],
  span: Span,
  ctx: Ctx,
): Generator<void, Value, void> {
  if (callee.t !== "fn")
    fail(ctx, "L100", stageOf(ctx), `${typeName(callee)} is not something to call`, span);
  const module = ctx.program.modules.get(callee.module) ?? ctx.module;
  const inner: Ctx = {
    ...ctx,
    module,
    env: newEnv(callee.env),
    inExpression: false,
    trace: [
      ...ctx.trace,
      {
        layer: stageOf(ctx),
        what: `${"name" in callee.decl ? callee.decl.name : "a block"}(…)`,
        span,
        ...(ctx.script === undefined ? {} : { beat: ctx.script.cursor }),
      },
    ],
  };
  if (callee.self === undefined) delete inner.self;
  else inner.self = callee.self;
  bindParams(callee.decl.params, args, inner, span);

  const decl = callee.decl;
  if (decl.kind === "fn") {
    const ir = decl.body.find((stmt) => stmt.kind === "ir");
    if (ir !== undefined && ir.kind === "ir") {
      emitMove(decl, ir.name, inner, span);
      yield;
      return VOID;
    }
    const setup = decl.body.find((stmt) => stmt.kind === "setup");
    if (setup !== undefined && ctx.script !== undefined) {
      // A dance composed into another dance: the floors must agree, and the
      // inner dance counts its own beats from where it starts (a medley's
      // second Butter opens its A1 at beat 64, and `phrase(A1)` is right).
      ctx.script.floorCheck(decl, module, span, inner);
      const origin = ctx.script.origin;
      ctx.script.origin = ctx.script.cursor;
      const tail = yield* execStmts(decl.body, inner);
      ctx.script.origin = origin;
      return tail ?? VOID;
    }
  }
  const tail = yield* execStmts(decl.body, inner);
  return tail ?? VOID;
}

/**
 * A move where nothing can take beats, caught **before** its arguments are
 * read: a move in `setup` is a move in `setup`, and complaining first about
 * the `partner` it was passed would be answering a question nobody asked.
 */
function guardMove(callee: Value, call: CallExpr, ctx: Ctx): void {
  if (callee.t !== "fn" || callee.decl.kind !== "fn" || !isMove(callee.decl)) return;
  if (ctx.script !== undefined && ctx.inExpression !== true && ctx.script.canMove) return;
  fail(
    ctx,
    "L109",
    ctx.script === undefined ? "setup" : "script",
    `"${call.callee}" is a move, and there is nobody dancing here`,
    call.span,
    {
      suggestion:
        "a move is a thing a dancer does: it belongs in a dance's script, not in setup, a body or an expression",
    },
  );
}

function emitMove(decl: FnDecl, ir: string, ctx: Ctx, span: Span): void {
  const script = ctx.script;
  if (script === undefined || ctx.inExpression === true || !script.canMove)
    fail(
      ctx,
      "L109",
      ctx.script === undefined ? "setup" : "script",
      `"${ir}" is a move, and there is nobody dancing here`,
      span,
      {
        suggestion:
          "a move is a thing a dancer does: it belongs in a dance's script, not in setup, a body or an expression",
      },
    );
  const args: MoveArg[] = [];
  let beats = 0;
  for (const param of decl.params) {
    const value = lookupEnv(ctx.env, param.name);
    if (value === undefined) continue;
    if (param.name === "beats") beats = toInt(value);
    const ref = refOf(value);
    args.push({ name: param.name, value: showValue(value), ...(ref === undefined ? {} : { ref }) });
  }
  script.move(ir, args, beats, span, ctx);
}

/**
 * What an argument points at (notes D3): a person, the place they stand in, or
 * nothing at all. A place with somebody in it points at the somebody — a move
 * that says `swing(neighbor)` means the person, and who stands there is
 * settled by the last commit before the move. A selection of exactly one is
 * that one; a selection of none or several names nobody in particular, and the
 * consumer's own rule decides what to do about it (D10).
 */
function refOf(value: Value): MoveRef | undefined {
  switch (value.t) {
    case "dancer":
      return { t: "dancer", id: value.dancer.id };
    case "node":
      return value.node.occupant === undefined
        ? { t: "node", path: value.node.path }
        : { t: "dancer", id: value.node.occupant.id };
    case "selection":
      return value.items.length === 1 ? refOf(value.items[0] as Value) : undefined;
    default:
      return undefined;
  }
}

function bindParams(
  params: readonly Param[],
  args: readonly EvaluatedArg[],
  ctx: Ctx,
  span: Span,
): void {
  const positional = args.filter((arg) => arg.name === undefined);
  const named = new Map(
    args.filter((arg) => arg.name !== undefined).map((arg) => [arg.name ?? "", arg.value]),
  );
  params.forEach((param, index) => {
    const given = named.get(param.name) ?? positional[index]?.value;
    if (given !== undefined) {
      ctx.env.vars.set(param.name, given);
      return;
    }
    if (param.default !== undefined) {
      ctx.env.vars.set(param.name, evaluateExpr(param.default, ctx));
      return;
    }
    fail(ctx, "L100", stageOf(ctx), `"${param.name}" was not given and has no default`, span);
  });
  const extra = positional.length - params.length;
  if (extra > 0)
    fail(
      ctx,
      "L100",
      stageOf(ctx),
      `${String(positional.length)} arguments for ${String(params.length)} parameters`,
      span,
    );
}

/** Which `fn` a call names: a local, a member of a group above the reader, a module's. */
function resolveCallee(call: CallExpr, ctx: Ctx): Value {
  if (call.module === undefined) {
    const local = lookupEnv(ctx.env, call.callee);
    if (local !== undefined && local.t === "fn") return local;
    const member = findMemberFn(call.callee, ctx);
    if (member !== undefined) return member;
  }
  const found = findFn(ctx.program, ctx.module, call.callee, call.module);
  if (found === undefined)
    fail(ctx, "L100", stageOf(ctx), `there is no "${call.callee}" here`, call.span);
  return {
    t: "fn",
    decl: found.decl,
    env: newEnv(),
    module: found.module.name,
  };
}

/** A `fn` member of a group on the reader's path (or of the group being read). */
function findMemberFn(name: string, ctx: Ctx): (Value & { t: "fn" }) | undefined {
  const start = ctx.reader?.at ?? ctx.self;
  for (let at = start; at !== undefined; at = at.parent) {
    const member = at.decl.members.find((m) => m.kind === "fn" && m.name === name);
    if (member !== undefined && member.kind === "fn")
      return { t: "fn", decl: member, env: nodeEnv(at), module: at.module, self: at };
  }
  return undefined;
}

/** A node's own lexical scope: its `id` and its parameters (§3). */
export function nodeEnv(node: Node): Env {
  const env = newEnv();
  env.vars.set("id", node.id);
  for (const [name, value] of Object.entries(node.params)) env.vars.set(name, value);
  return env;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export function evaluateExpr(expr: Expr, ctx: Ctx): Value {
  switch (expr.kind) {
    case "int":
      return num(expr.value);
    case "float":
      return num(expr.value, expr.unit);
    case "string":
      return { t: "string", v: expr.value };
    case "bool":
      return bool(expr.value);
    case "name":
      return evaluateName(expr.name, expr.title, undefined, expr.span, ctx);
    case "qualified":
      return evaluateName(expr.name, expr.title, expr.module, expr.span, ctx);
    case "call": {
      const builtIn = callBuiltIn(expr, ctx);
      if (builtIn !== undefined) return builtIn;
      const callee = resolveCallee(expr, ctx);
      guardMove(callee, expr, { ...ctx, inExpression: true });
      return drain(
        callFn(callee, evaluateArgs(expr.args, ctx), expr.span, { ...ctx, inExpression: true }),
      );
    }
    case "one": {
      const inner = evaluateExpr(expr.arg, ctx);
      const items = itemsOf(inner);
      if (items.length === 1) return items[0] ?? VOID;
      fail(
        ctx,
        "L104",
        stageOf(ctx),
        `one! wanted exactly one and got ${String(items.length)}${
          items.length === 0 ? "" : `: ${items.map(showValue).join(", ")}`
        }`,
        expr.span,
        {
          suggestion:
            "name the kind outright, or take the selection and say what to do with all of it",
        },
      );
      return VOID;
    }
    case "select":
    case "assign":
      return evaluateSelect(expr, ctx);
    case "unary": {
      const operand = evaluateExpr(expr.operand, ctx);
      if (expr.op === "-") return num(-asNumber(operand, ctx, expr.span), unitOf(operand));
      if (operand.t !== "bool")
        fail(
          ctx,
          "L100",
          stageOf(ctx),
          `"not" wants a Bool, and got ${typeName(operand)}`,
          expr.span,
        );
      return bool(!operand.v);
    }
    case "binary":
      return evaluateBinary(expr.op, expr.left, expr.right, expr.span, ctx);
    case "is":
      return bool(matchPattern(expr.pattern, evaluateExpr(expr.subject, ctx), ctx));
    case "if-expr": {
      const test = evaluateExpr(expr.test, ctx);
      if (test.t !== "bool")
        fail(
          ctx,
          "L100",
          stageOf(ctx),
          `an "if" wants a Bool, and got ${typeName(test)}`,
          expr.span,
        );
      return evaluateExpr(test.v ? expr.then : expr.else, ctx);
    }
    case "match-expr": {
      const subject = evaluateExpr(expr.subject, ctx);
      for (const arm of expr.arms)
        if (matchPattern(arm.pattern, subject, ctx)) return evaluateExpr(arm.value, ctx);
      fail(
        ctx,
        "L100",
        stageOf(ctx),
        `no arm of this match covers ${showValue(subjectId(subject))}`,
        expr.span,
      );
      return VOID;
    }
    case "range":
      return { t: "selection", items: rangeValues(expr, ctx) };
    case "fn-expr":
      return {
        t: "fn",
        decl: expr,
        env: ctx.env,
        module: ctx.module.name,
        ...(ctx.self === undefined ? {} : { self: ctx.self }),
      };
  }
}

/** Run a generator that is not allowed to take beats, and take its value. */
export function drain<T>(gen: Generator<void, T, void>): T {
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

const CURSOR_READS = new Set(["beat", "time", "first-time", "last-time"]);

function evaluateName(
  name: string,
  title: boolean,
  qualifier: string | undefined,
  span: Span,
  ctx: Ctx,
): Value {
  if (title) {
    const group = findGroup(ctx.program, ctx.module, name, qualifier);
    if (group !== undefined) {
      const mine = ancestorOfKind(ctx.reader?.at ?? ctx.self, name);
      if (mine !== undefined) return { t: "node", node: mine };
    }
    const member = findEnumMember(ctx.program, ctx.module, name);
    if (member !== undefined) return enumValue(name, member.enumName);
    if (group !== undefined)
      fail(
        ctx,
        "L100",
        stageOf(ctx),
        `there is no ${name} above ${ctx.reader === undefined ? "here" : ctx.reader.id}`,
        span,
        { suggestion: `a group's name in an expression means mine, and this path has no ${name}` },
      );
    fail(ctx, "L100", stageOf(ctx), `there is no "${name}" here`, span);
  }

  const local = lookupEnv(ctx.env, name);
  if (local !== undefined) return local;

  if (ctx.script !== undefined && CURSOR_READS.has(name)) {
    const script = ctx.script;
    if (name === "beat") return num(script.cursor - script.origin);
    if (name === "time") return num(script.time);
    if (name === "first-time") return bool(script.firstTime);
    return bool(script.lastTime);
  }

  if (name === "center" && ctx.self !== undefined)
    return { t: "point", x: ctx.self.frame.x, y: ctx.self.frame.y };

  const member = readMember(name, span, ctx);
  if (member !== undefined) return member;

  const fn = findFn(ctx.program, ctx.module, name, qualifier);
  if (fn !== undefined) return { t: "fn", decl: fn.decl, env: newEnv(), module: fn.module.name };

  fail(ctx, "L100", stageOf(ctx), `there is no "${name}" here`, span);
}

/**
 * A relation, read bare by a dancer under the group that declares it (§4). A
 * body has no reader, so reading one there is "no dancer here" — the same
 * error as a move in `setup`.
 */
function readMember(name: string, span: Span, ctx: Ctx): Value | undefined {
  const reader = ctx.reader;
  const declaring = groupsDeclaringMember(ctx.program, name);
  if (reader === undefined) {
    if (declaring.length > 0)
      fail(ctx, "L100", "setup", `"${name}" is a relation, and a body runs for nobody`, span, {
        suggestion:
          "a body lays the children of the node it is building; a member is read later, by a dancer",
      });
    return undefined;
  }
  for (let at: Node | undefined = reader.at; at !== undefined; at = at.parent) {
    const member = at.decl.members.find((m) => m.kind === "member" && m.name === name);
    if (member === undefined || member.kind !== "member") continue;
    const key = `${reader.id}|${at.path}|${name}`;
    const cached = ctx.memo?.get(key);
    if (cached !== undefined) return cached;
    const inner: Ctx = {
      ...ctx,
      module: ctx.program.modules.get(at.module) ?? ctx.module,
      env: nodeEnv(at),
      self: at,
      inExpression: true,
      trace: [
        ...ctx.trace,
        { layer: stageOf(ctx), what: `${name} of ${at.label}`, span: member.span },
      ],
    };
    const value = evaluateExpr(member.value, inner);
    ctx.memo?.set(key, value);
    return value;
  }
  if (declaring.length > 0)
    fail(
      ctx,
      "L100",
      stageOf(ctx),
      `"${name}" is a member of ${declaring.map((decl) => decl.name).join(" and ")}, and ${reader.id} has none above it`,
      span,
      {
        suggestion: `${reader.id} stands at ${reader.at.path}; a dance that reads "${name}" cannot address it`,
      },
    );
  return undefined;
}

function evaluateBinary(op: string, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: Ctx): Value {
  if (op === "and" || op === "or") {
    const left = evaluateExpr(leftExpr, ctx);
    if (left.t !== "bool")
      fail(ctx, "L100", stageOf(ctx), `"${op}" wants a Bool, and got ${typeName(left)}`, span);
    if (op === "and" && !left.v) return bool(false);
    if (op === "or" && left.v) return bool(true);
    const right = evaluateExpr(rightExpr, ctx);
    if (right.t !== "bool")
      fail(ctx, "L100", stageOf(ctx), `"${op}" wants a Bool, and got ${typeName(right)}`, span);
    return bool(right.v);
  }
  const left = evaluateExpr(leftExpr, ctx);
  const right = evaluateExpr(rightExpr, ctx);
  if (op === "==") return bool(sameValue(subjectId(left), subjectId(right)));
  if (op === "!=") return bool(!sameValue(subjectId(left), subjectId(right)));
  const a = asNumber(left, ctx, leftExpr.span);
  const b = asNumber(right, ctx, rightExpr.span);
  switch (op) {
    case "<":
      return bool(a < b);
    case "<=":
      return bool(a <= b);
    case ">":
      return bool(a > b);
    case ">=":
      return bool(a >= b);
    case "+":
      return num(a + b, unitOf(left) === "" ? unitOf(right) : unitOf(left));
    case "-":
      return num(a - b, unitOf(left) === "" ? unitOf(right) : unitOf(left));
    case "*":
      return num(a * b, unitOf(left) === "" ? unitOf(right) : unitOf(left));
    case "/":
      if (b === 0) fail(ctx, "L100", stageOf(ctx), "a division by zero", span);
      return num(a / b, unitOf(left) === "" ? unitOf(right) : unitOf(left));
    case "%":
      if (b === 0) fail(ctx, "L100", stageOf(ctx), "a remainder by zero", span);
      return num(a % b, unitOf(left));
    default:
      fail(ctx, "L100", stageOf(ctx), `"${op}" is not an operator here`, span);
  }
}

const unitOf = (value: Value): "" | "m" | "deg" => (value.t === "num" ? value.unit : "");

function asNumber(value: Value, ctx: Ctx, span: Span): number {
  if (value.t === "num") return value.v;
  fail(ctx, "L100", stageOf(ctx), `arithmetic wants a number, and got ${typeName(value)}`, span);
}

/** A node in a comparison or a pattern stands for its id (§10). */
export const subjectId = (value: Value): Value => (value.t === "node" ? value.node.id : value);

function rangeValues(expr: Expr, ctx: Ctx): Value[] {
  if (expr.kind !== "range") {
    const value = evaluateExpr(expr, ctx);
    return [...itemsOf(value)];
  }
  const from = toInt(evaluateExpr(expr.from, ctx));
  const to = toInt(evaluateExpr(expr.to, ctx));
  const out: Value[] = [];
  for (let i = from; expr.inclusive ? i <= to : i < to; i += 1) out.push(num(i));
  return out;
}

// ---------------------------------------------------------------------------
// The built-ins: everything the language reaches without a dot
// ---------------------------------------------------------------------------

/** The one member fn the call site reads differently: it is set-wide (D5). */
const PROGRESS = "progress";

const TRANSFORMS = new Set(["translate", "rotate", "mirror", "left", "right", "fwd", "back"]);

function callBuiltIn(call: CallExpr, ctx: Ctx): Value | undefined {
  switch (call.callee) {
    case "id": {
      const node = asNode(call.args[0]?.value, ctx, call.span, "id");
      return node.id;
    }
    case "other": {
      const node = asNode(call.args[0]?.value, ctx, call.span, "other");
      const siblings = (node.parent?.children ?? ctx.tree.roots).filter(
        (child) => child.kind === node.kind && child !== node,
      );
      if (siblings.length === 1) return { t: "node", node: siblings[0] as Node };
      return {
        t: "selection",
        items: siblings.map((child) => ({ t: "node", node: child }) as Value),
      };
    }
    case "dancers": {
      const node = asNode(call.args[0]?.value, ctx, call.span, "dancers");
      return {
        t: "selection",
        items: placesUnder(node)
          .filter((place) => place.occupant !== undefined)
          .map((place) => ({ t: "dancer", dancer: place.occupant as Dancer }) as Value),
      };
    }
    case "anchor": {
      const node = asNode(call.args[0]?.value, ctx, call.span, "anchor");
      const nameExpr = call.args[1]?.value;
      const name = nameExpr?.kind === "name" ? nameExpr.name : "";
      if (name === "center") return { t: "point", x: node.frame.x, y: node.frame.y };
      const found = node.anchors[name];
      if (found === undefined)
        fail(ctx, "L100", stageOf(ctx), `${node.label} has no anchor called "${name}"`, call.span);
      return found;
    }
    case "count":
      return num(itemsOf(evaluateExpr(argExpr(call, 0, ctx), ctx)).length);
    case "assert": {
      const condition = evaluateExpr(argExpr(call, 0, ctx), ctx);
      if (isTrue(condition)) return VOID;
      const message =
        call.args[1] === undefined ? undefined : evaluateExpr(call.args[1].value, ctx);
      fail(
        ctx,
        "L101",
        "script",
        message !== undefined && message.t === "string"
          ? message.v
          : "this assert is false where it stands",
        call.span,
        {
          suggestion:
            "a phrase asserts where it starts; the beats before it do not add up to what it expects",
        },
      );
      return VOID;
    }
    case "dancer": {
      const builder = ctx.builder;
      if (builder === undefined)
        fail(ctx, "L100", "script", "a dancer is placed in a group's body, once", call.span);
      builder.dancer(call.span, ctx);
      return VOID;
    }
    case "line":
    case "direction":
    case "point":
      return {
        t: "anchor",
        form: call.callee,
        args: call.args.map((arg) => ({
          name: arg.name ?? "",
          value: evaluateExpr(arg.value, ctx),
        })),
      };
    default:
      if (TRANSFORMS.has(call.callee) && ctx.builder !== undefined) return VOID;
      return undefined;
  }
}

const argExpr = (call: CallExpr, index: number, ctx: Ctx): Expr => {
  const arg = call.args[index];
  if (arg === undefined)
    fail(ctx, "L100", stageOf(ctx), `"${call.callee}" wants another argument`, call.span);
  return arg.value;
};

function asNode(expr: Expr | undefined, ctx: Ctx, span: Span, callee: string): Node {
  if (expr === undefined) fail(ctx, "L100", stageOf(ctx), `"${callee}" wants a group`, span);
  const value = evaluateExpr(expr, ctx);
  if (value.t === "node") return value.node;
  if (value.t === "dancer") return value.dancer.at;
  fail(ctx, "L100", stageOf(ctx), `"${callee}" wants a group, and got ${typeName(value)}`, span);
}

/** The local frame one prefix modifier stands for. */
function modifierFrame(call: CallExpr, ctx: Ctx): Frame {
  const named = new Map<string, Value>();
  const positional: Value[] = [];
  for (const arg of call.args) {
    const value = evaluateExpr(arg.value, ctx);
    if (arg.name === undefined) positional.push(value);
    else named.set(arg.name, value);
  }
  const first = named.size === 0 ? positional[0] : undefined;
  const length = (value: Value | undefined): number =>
    value === undefined ? 0 : toMillimetres(value);
  switch (call.callee) {
    case "translate":
      return translation(
        length(named.get("x") ?? positional[0]),
        length(named.get("y") ?? positional[1]),
      );
    case "rotate":
      return rotation(first === undefined ? 0 : toInt(first));
    case "mirror": {
      const axis = first !== undefined && first.t === "enum" ? first.member : "X";
      return reflection(axis === "Y" ? "Y" : "X");
    }
    case "left":
      return translation(-length(first), 0);
    case "right":
      return translation(length(first), 0);
    case "fwd":
      return translation(0, length(first));
    case "back":
      return translation(0, -length(first));
    default:
      fail(ctx, "L100", stageOf(ctx), `"${call.callee}" is not a transform`, call.span);
  }
}

// ---------------------------------------------------------------------------
// Patterns, selection and the event
// ---------------------------------------------------------------------------

export interface Relative {
  /** The reader's own id for the kind being matched: what `other` is other than. */
  mine?: Value;
  /** Every id of that kind, in tree order: what `first` and `last` mean. */
  ordered?: readonly Value[];
}

export function matchPattern(
  pattern: Pattern,
  subject: Value,
  ctx: Ctx,
  relative: Relative = {},
): boolean {
  const id = subjectId(subject);
  switch (pattern.kind) {
    case "wildcard":
      return true;
    case "relative": {
      if (pattern.which === "other") {
        if (relative.mine === undefined)
          fail(
            ctx,
            "L100",
            stageOf(ctx),
            `"other" compares a candidate against the reader, and there is none here`,
            pattern.span,
            { suggestion: '"other", "first" and "last" belong in select and assign (§4)' },
          );
        return !sameValue(id, relative.mine);
      }
      const ordered = relative.ordered ?? [];
      const wanted = pattern.which === "first" ? ordered[0] : ordered[ordered.length - 1];
      return wanted !== undefined && sameValue(id, wanted);
    }
    case "alt":
      return pattern.options.some((option) => matchPattern(option, subject, ctx, relative));
    case "range-pattern": {
      const value = toInt(id);
      const from = toInt(evaluateExpr(pattern.from, ctx));
      const to = toInt(evaluateExpr(pattern.to, ctx));
      return value >= from && (pattern.inclusive ? value <= to : value < to);
    }
    case "expr-pattern":
      return sameValue(id, subjectId(evaluateExpr(pattern.expr, ctx)));
  }
}

/**
 * `select(K = pat, …)` and `assign(K = pat, …)` share one reading (§4):
 *
 * - a kind that is named must be there, and its id must match the pattern;
 * - a kind that is not named is **mine**, by id;
 * - naming a kind on another branch **drops** the kinds that branch lacks, so
 *   the couple going out does not have to say it is leaving its minor set;
 * - a candidate on a branch the reader has no name for is not a candidate.
 *
 * In a body there is no reader, so the candidates are the node's own
 * descendants and an unnamed kind constrains nothing (§3).
 */
export function candidatePlaces(expr: SelectExpr, ctx: Ctx): Node[] {
  const named = new Map<string, Pattern>();
  for (const arg of expr.args) named.set(arg.group, arg.pattern);
  const reader = ctx.reader;
  const scope =
    reader !== undefined
      ? ctx.tree.places
      : ctx.builder?.node === undefined
        ? ctx.tree.places
        : placesUnder(ctx.builder.node);
  const readerKinds = reader === undefined ? undefined : new Set(kindsOf(reader.at));

  const out: Node[] = [];
  for (const place of scope) {
    let ok = true;
    for (const [kind, pattern] of named) {
      const node = ancestorOfKind(place, kind);
      if (node === undefined) {
        ok = false;
        break;
      }
      const mineNode = reader === undefined ? undefined : ancestorOfKind(reader.at, kind);
      const relative: Relative = {
        ...(mineNode === undefined ? {} : { mine: mineNode.id }),
        ordered: nodesOfKind(ctx.tree, kind).map((n) => n.id),
      };
      if (!matchPattern(pattern, node.id, ctx, relative)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (reader !== undefined && readerKinds !== undefined) {
      for (const node of lineageOf(place)) {
        if (named.has(node.kind)) continue;
        if (!readerKinds.has(node.kind)) {
          ok = false;
          break;
        }
        const mineNode = ancestorOfKind(reader.at, node.kind);
        if (mineNode === undefined || !sameValue(node.id, mineNode.id)) {
          ok = false;
          break;
        }
      }
    }
    if (ok) out.push(place);
  }
  return out;
}

function evaluateSelect(expr: SelectExpr, ctx: Ctx): Value {
  const places = candidatePlaces(expr, ctx);
  if (expr.kind === "select")
    return {
      t: "selection",
      items: places
        .filter((place) => place.occupant !== undefined)
        .map((place) => ({ t: "node", node: place }) as Value),
    };

  const script = ctx.script;
  if (script === undefined)
    fail(ctx, "L100", "setup", "an assign is an event, and nothing moves during setup", expr.span);
  if (places.length === 0) return bool(false);
  if (places.length > 1)
    fail(
      ctx,
      "L106",
      "script",
      `this assign names ${String(places.length)} places: ${places
        .map((place) => place.path)
        .join(", ")}`,
      expr.span,
      { suggestion: "an event goes to exactly one place; name another kind to narrow it" },
    );
  script.queue(places[0] as Node, expr.span, ctx);
  return bool(true);
}

// ---------------------------------------------------------------------------
// Bits the two passes share
// ---------------------------------------------------------------------------

/** The `setup` block of a dance `fn`, when it has one (§5). */
export const setupOf = (decl: FnDecl): Stmt | undefined =>
  decl.body.find((stmt) => stmt.kind === "setup");

/** The group a dance lays its floor with: the first invocation in its `setup`. */
export function floorOf(decl: FnDecl): InvokeStmt | undefined {
  const setup = setupOf(decl);
  if (setup === undefined || setup.kind !== "setup") return undefined;
  const find = (stmts: readonly Stmt[]): InvokeStmt | undefined => {
    for (const stmt of stmts) {
      if (stmt.kind === "invoke") return stmt;
      if (stmt.kind === "modified") {
        const inner = find([stmt.stmt]);
        if (inner !== undefined) return inner;
      }
    }
    return undefined;
  };
  return find(setup.body);
}

/** Is this `fn` a move — a leaf the kinematics can play (§5)? */
export const isMove = (decl: FnDecl): boolean => decl.body.some((stmt) => stmt.kind === "ir");

/** Is this `fn` a dance — something with a floor an evening can run (§5)? */
export const isDance = (decl: FnDecl): boolean => decl.body.some((stmt) => stmt.kind === "setup");
